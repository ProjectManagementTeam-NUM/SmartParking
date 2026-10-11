import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../src/db/seed-data";
import { hashDeviceKey } from "../src/domain/device-keys";
import { createTestPrisma, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("creates 2 parkings, 12 slots, 3 devices and 2 closed gates", async () => {
    expect(await prisma.parking.count()).toBe(2);
    expect(await prisma.slot.count()).toBe(12);
    expect(await prisma.device.count()).toBe(3);
    const gates = await prisma.gate.findMany({ orderBy: { parkingId: "asc" } });
    expect(gates.map((g) => [g.parkingId, g.position])).toEqual([
      ["A", "CLOSED"],
      ["B", "CLOSED"],
    ]);
  });

  it("matches the proposal's live/simulated split", async () => {
    const live = await prisma.slot.findMany({ where: { source: "LIVE" }, orderBy: { id: "asc" } });
    expect(live.map((s) => [s.id, s.deviceId, s.state])).toEqual([
      ["A1", "esp32-a", "UNKNOWN"],
      ["A2", "esp32-a", "UNKNOWN"],
      ["B1", "esp32-b", "UNKNOWN"],
    ]);
    const simulated = await prisma.slot.findMany({ where: { source: "SIMULATED" } });
    expect(simulated).toHaveLength(9);
    expect(simulated.every((s) => s.deviceId === "simulator" && s.state === "FREE")).toBe(true);
  });

  it("stores hashed device keys, never plain text", async () => {
    const device = await prisma.device.findUniqueOrThrow({ where: { id: "esp32-a" } });
    expect(device.apiKeyHash).toBe(hashDeviceKey(TEST_KEYS["esp32-a"]));
    expect(device.apiKeyHash).not.toContain(TEST_KEYS["esp32-a"]);
  });

  it("is idempotent when run again on a seeded database", async () => {
    await seed(prisma, TEST_KEYS);
    expect(await prisma.slot.count()).toBe(12);
    expect(await prisma.parking.count()).toBe(2);
  });
});
