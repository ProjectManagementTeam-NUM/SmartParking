import type { PrismaClient } from "@prisma/client";
import { Device } from "@smart-parking/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { seed } from "../src/db/seed-data";
import { createTestApp, createTestPrisma, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getDevices(app: Parameters<typeof request>[0]) {
  const res = await request(app).get("/api/devices").expect(200);
  return z.array(Device).parse(res.body);
}

describe("GET /api/devices", () => {
  it("lists 3 offline devices on a fresh seed", async () => {
    const devices = await getDevices(createTestApp(prisma).app);
    expect(devices.map((d) => [d.id, d.online, d.lastSeenAt])).toEqual([
      ["esp32-a", false, null],
      ["esp32-b", false, null],
      ["simulator", false, null],
    ]);
  });

  it("is online when last seen 14 s ago and offline at 15 s", async () => {
    const { app, clock } = createTestApp(prisma);
    await prisma.device.update({
      where: { id: "esp32-a" },
      data: { lastSeenAt: new Date(clock.now().getTime() - 14_000) },
    });
    expect((await getDevices(app)).find((d) => d.id === "esp32-a")?.online).toBe(true);

    clock.advance(1_000);
    expect((await getDevices(app)).find((d) => d.id === "esp32-a")?.online).toBe(false);
  });
});
