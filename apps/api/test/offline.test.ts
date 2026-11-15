import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed } from "../src/db/seed-data";
import { markOfflineDevices, startOfflineMonitor } from "../src/domain/offline";
import { recordBus } from "./bus-recorder";
import { createTestApp, createTestPrisma, OPERATOR_AUTH, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function setup() {
  const t = createTestApp(prisma);
  const deps = { prisma, bus: t.bus, now: t.clock.now };
  const post = (deviceId: keyof typeof TEST_KEYS, body: object = {}) =>
    request(t.app)
      .post("/api/ingest")
      .set("X-Device-Key", TEST_KEYS[deviceId])
      .send({ deviceId, ...body })
      .expect(204);
  return { ...t, deps, post };
}

const slotState = async (id: string) =>
  (await prisma.slot.findUniqueOrThrow({ where: { id } })).state;
const countEvents = (type: string) => prisma.event.count({ where: { type } });

describe("markOfflineDevices", () => {
  it("marks a device offline at 15 s of silence and turns its slots UNKNOWN", async () => {
    const { deps, bus, clock, post } = setup();
    await post("esp32-b", { slots: [{ id: "B1", state: "FREE" }] });
    const emissions = recordBus(bus);

    clock.advance(14_000);
    expect(await markOfflineDevices(deps)).toEqual([]);

    clock.advance(1_000);
    expect(await markOfflineDevices(deps)).toEqual(["esp32-b"]);

    expect(await slotState("B1")).toBe("UNKNOWN");
    expect(emissions.find((e) => e.event === "device.updated")?.payload).toMatchObject({
      id: "esp32-b",
      online: false,
    });
    expect(emissions.find((e) => e.event === "parking.updated")?.payload).toEqual({
      id: "B",
      freeCount: 5,
      status: "AVAILABLE",
    });
    expect(await countEvents("device.offline")).toBe(1);
  });

  it("records only one offline event per outage", async () => {
    const { deps, clock, post } = setup();
    await post("esp32-b", { slots: [{ id: "B1", state: "FREE" }] });
    clock.advance(20_000);
    await markOfflineDevices(deps);
    clock.advance(5_000);
    expect(await markOfflineDevices(deps)).toEqual([]);
    expect(await countEvents("device.offline")).toBe(1);
  });

  it("announces offline even when the device never reported a slot", async () => {
    const { deps, clock, post } = setup();
    await post("esp32-a");
    clock.advance(15_000);
    expect(await markOfflineDevices(deps)).toEqual(["esp32-a"]);
  });

  it("ignores devices that were never seen", async () => {
    const { deps } = setup();
    expect(await markOfflineDevices(deps)).toEqual([]);
  });

  it("keeps an operator override on an offline device's slot", async () => {
    const { app, deps, clock, post } = setup();
    await post("esp32-b", { slots: [{ id: "B1", state: "FREE" }] });
    clock.advance(15_000);
    await markOfflineDevices(deps);

    await request(app)
      .patch("/api/slots/B1")
      .set("Authorization", OPERATOR_AUTH)
      .send({ state: "OCCUPIED" })
      .expect(200);
    clock.advance(5_000);
    await markOfflineDevices(deps);

    expect(await slotState("B1")).toBe("OCCUPIED");
  });

  it("restores real states when the device comes back (one online event per outage)", async () => {
    const { deps, clock, post } = setup();
    await post("esp32-a", { slots: [{ id: "A1", state: "FREE" }] });
    clock.advance(16_000);
    await markOfflineDevices(deps);
    expect(await slotState("A1")).toBe("UNKNOWN");

    await post("esp32-a", {
      slots: [
        { id: "A1", state: "FREE" },
        { id: "A2", state: "OCCUPIED" },
      ],
    });

    expect(await slotState("A1")).toBe("FREE");
    expect(await slotState("A2")).toBe("OCCUPIED");
    const sequence = await prisma.event.findMany({
      where: { type: { in: ["device.online", "device.offline"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(sequence.map((e) => e.type)).toEqual([
      "device.online",
      "device.offline",
      "device.online",
    ]);
  });
});

describe("startOfflineMonitor", () => {
  it("runs once per interval until stopped", async () => {
    vi.useFakeTimers();
    const { deps } = setup();
    const spy = vi.spyOn(deps.prisma.device, "findMany").mockResolvedValue([]);

    const stop = startOfflineMonitor(deps, 5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    const calls = spy.mock.calls.length;
    expect(calls).toBe(2);

    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(spy.mock.calls.length).toBe(calls);
    spy.mockRestore();
  });
});
