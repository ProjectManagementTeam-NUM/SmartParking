import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../src/db/seed-data";
import { recordBus } from "./bus-recorder";
import { createTestApp, createTestPrisma, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

type App = Parameters<typeof request>[0];

function ingest(app: App, body: object, key: string | undefined) {
  const req = request(app).post("/api/ingest");
  if (key !== undefined) req.set("X-Device-Key", key);
  return req.send(body);
}

const slotState = async (id: string) =>
  (await prisma.slot.findUniqueOrThrow({ where: { id } })).state;
const device = (id: string) => prisma.device.findUniqueOrThrow({ where: { id } });

describe("POST /api/ingest — heartbeat", () => {
  it("marks the device seen and announces it online once", async () => {
    const { app, bus, clock } = createTestApp(prisma);
    const emissions = recordBus(bus);

    await ingest(
      app,
      { deviceId: "esp32-a", firmwareVersion: "0.1.0" },
      TEST_KEYS["esp32-a"],
    ).expect(204);

    const row = await device("esp32-a");
    expect(row.lastSeenAt?.toISOString()).toBe(clock.now().toISOString());
    expect(row.firmwareVersion).toBe("0.1.0");
    expect(emissions.map((e) => e.event)).toEqual(["device.updated", "event.created"]);
    expect(emissions[0]!.payload).toEqual({
      id: "esp32-a",
      online: true,
      lastSeenAt: clock.now().toISOString(),
    });
    expect(emissions[1]!.payload).toMatchObject({ type: "device.online", deviceId: "esp32-a" });
  });

  it("emits nothing for a heartbeat from a device that is already online", async () => {
    const { app, bus, clock } = createTestApp(prisma);
    await ingest(app, { deviceId: "esp32-a" }, TEST_KEYS["esp32-a"]).expect(204);
    const emissions = recordBus(bus);

    clock.advance(5_000);
    await ingest(app, { deviceId: "esp32-a" }, TEST_KEYS["esp32-a"]).expect(204);

    expect(emissions).toEqual([]);
    expect((await device("esp32-a")).lastSeenAt?.toISOString()).toBe(clock.now().toISOString());
    expect(await prisma.event.count({ where: { type: "device.online" } })).toBe(1);
  });
});

describe("POST /api/ingest — slots and gate", () => {
  it("fills parking B, then records the gate denial without moving the barrier", async () => {
    const { app, bus } = createTestApp(prisma);
    await prisma.slot.updateMany({
      where: { id: { in: ["B2", "B3", "B4", "B5", "B6"] } },
      data: { state: "OCCUPIED" },
    });
    const key = TEST_KEYS["esp32-b"];
    await ingest(app, { deviceId: "esp32-b", slots: [{ id: "B1", state: "FREE" }] }, key).expect(
      204,
    );
    const emissions = recordBus(bus);

    await ingest(
      app,
      { deviceId: "esp32-b", slots: [{ id: "B1", state: "OCCUPIED" }] },
      key,
    ).expect(204);

    expect(emissions.find((e) => e.event === "parking.updated")?.payload).toEqual({
      id: "B",
      freeCount: 0,
      status: "FULL",
    });
    expect(emissions.find((e) => e.event === "event.created")?.payload).toMatchObject({
      type: "slot.changed",
      slotId: "B1",
      deviceId: "esp32-b",
      payload: { from: "FREE", to: "OCCUPIED" },
    });

    await ingest(app, { deviceId: "esp32-b", gate: { event: "DENIED" } }, key).expect(204);

    const gate = await prisma.gate.findUniqueOrThrow({ where: { parkingId: "B" } });
    expect(gate).toMatchObject({ lastDecision: "DENIED", position: "CLOSED" });
    expect(gate.lastDecisionAt).not.toBeNull();
    expect(emissions.at(-1)!.payload).toMatchObject({
      type: "gate.denied",
      parkingId: "B",
      deviceId: "esp32-b",
    });
  });

  it("records an opened gate", async () => {
    const { app } = createTestApp(prisma);
    await ingest(
      app,
      { deviceId: "esp32-a", gate: { event: "OPENED" } },
      TEST_KEYS["esp32-a"],
    ).expect(204);
    expect(await prisma.event.count({ where: { type: "gate.opened", parkingId: "A" } })).toBe(1);
  });

  it("does not record events for a repeated identical report", async () => {
    const { app, bus, clock } = createTestApp(prisma);
    const body = { deviceId: "esp32-b", slots: [{ id: "B1", state: "OCCUPIED" }] };
    await ingest(app, body, TEST_KEYS["esp32-b"]).expect(204);
    const emissions = recordBus(bus);
    const events = await prisma.event.count();

    clock.advance(5_000);
    await ingest(app, body, TEST_KEYS["esp32-b"]).expect(204);

    expect(emissions).toEqual([]);
    expect(await prisma.event.count()).toBe(events);
  });

  it("lets the simulator write simulated slots", async () => {
    const { app } = createTestApp(prisma);
    await ingest(
      app,
      { deviceId: "simulator", slots: [{ id: "B2", state: "OCCUPIED" }] },
      TEST_KEYS.simulator,
    ).expect(204);
    expect(await slotState("B2")).toBe("OCCUPIED");
  });
});

describe("POST /api/ingest — rejections", () => {
  it("rejects the whole batch with 403 when one slot is not owned, writing nothing", async () => {
    const { app, bus } = createTestApp(prisma);
    const emissions = recordBus(bus);
    const res = await ingest(
      app,
      {
        deviceId: "esp32-b",
        slots: [
          { id: "B1", state: "OCCUPIED" },
          { id: "A1", state: "FREE" },
        ],
      },
      TEST_KEYS["esp32-b"],
    ).expect(403);

    expect(res.body).toEqual({
      error: "forbidden",
      message: "Device esp32-b does not own slot A1",
    });
    expect(await slotState("B1")).toBe("UNKNOWN");
    expect((await device("esp32-b")).lastSeenAt).toBeNull();
    expect(await prisma.event.count()).toBe(0);
    expect(emissions).toEqual([]);
  });

  it("rejects a slot that does not exist with 403", async () => {
    const { app } = createTestApp(prisma);
    await ingest(
      app,
      { deviceId: "esp32-b", slots: [{ id: "Z9", state: "FREE" }] },
      TEST_KEYS["esp32-b"],
    ).expect(403);
  });

  it("rejects a gate event from a device without a parking with 403", async () => {
    const { app } = createTestApp(prisma);
    await ingest(
      app,
      { deviceId: "simulator", gate: { event: "OPENED" } },
      TEST_KEYS.simulator,
    ).expect(403);
    expect(await prisma.event.count()).toBe(0);
  });

  it("does not let one device's key act as another device", async () => {
    const { app } = createTestApp(prisma);
    await ingest(app, { deviceId: "esp32-b" }, TEST_KEYS["esp32-a"]).expect(401, {
      error: "unauthorized",
    });
    expect((await device("esp32-b")).lastSeenAt).toBeNull();
  });

  it.each([
    ["no key", { deviceId: "esp32-a" }, undefined],
    ["unknown device", { deviceId: "ghost" }, "anything"],
    ["odd device id", { deviceId: "esp32-a\u0000" }, TEST_KEYS["esp32-a"]],
  ])("rejects %s with 401", async (_name, body, key) => {
    await ingest(createTestApp(prisma).app, body, key).expect(401);
  });

  it("rejects a misspelled key with 400", async () => {
    const res = await ingest(
      createTestApp(prisma).app,
      { deviceId: "esp32-a", slot: [] },
      TEST_KEYS["esp32-a"],
    ).expect(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("rejects a device reporting UNKNOWN with 400", async () => {
    await ingest(
      createTestApp(prisma).app,
      { deviceId: "esp32-a", slots: [{ id: "A1", state: "UNKNOWN" }] },
      TEST_KEYS["esp32-a"],
    ).expect(400);
  });
});
