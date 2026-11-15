import type { PrismaClient } from "@prisma/client";
import { EventRecord } from "@smart-parking/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { seed } from "../src/db/seed-data";
import { recordEvent } from "../src/domain/events";
import { createTestApp, createTestPrisma, OPERATOR_AUTH, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function insertThree() {
  const t0 = new Date("2026-11-15T12:00:00.000Z").getTime();
  await recordEvent(prisma, { type: "device.online", deviceId: "esp32-a", at: new Date(t0) });
  await recordEvent(prisma, {
    type: "slot.changed",
    parkingId: "A",
    slotId: "A1",
    deviceId: "esp32-a",
    payload: { from: "UNKNOWN", to: "FREE" },
    at: new Date(t0 + 1_000),
  });
  await recordEvent(prisma, {
    type: "gate.denied",
    parkingId: "B",
    deviceId: "esp32-b",
    at: new Date(t0 + 2_000),
  });
}

describe("recordEvent", () => {
  it("stores the event and returns it in contract shape", async () => {
    const at = new Date("2026-11-15T12:00:00.000Z");
    const event = await recordEvent(prisma, { type: "device.offline", deviceId: "esp32-b", at });
    expect(EventRecord.parse(event)).toMatchObject({
      type: "device.offline",
      deviceId: "esp32-b",
      parkingId: null,
      slotId: null,
      payload: {},
      createdAt: at.toISOString(),
    });
    expect(await prisma.event.count()).toBe(1);
  });
});

describe("GET /api/events", () => {
  it("returns the newest events first", async () => {
    await insertThree();
    const res = await request(createTestApp(prisma).app)
      .get("/api/events")
      .set("Authorization", OPERATOR_AUTH)
      .expect(200);
    const events = z.array(EventRecord).parse(res.body);
    expect(events.map((e) => e.type)).toEqual(["gate.denied", "slot.changed", "device.online"]);
    expect(events[1]!.payload).toEqual({ from: "UNKNOWN", to: "FREE" });
  });

  it("honours limit", async () => {
    await insertThree();
    const res = await request(createTestApp(prisma).app)
      .get("/api/events?limit=2")
      .set("Authorization", OPERATOR_AUTH)
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  it.each(["0", "201", "abc", "1.5"])("rejects limit=%s with 400", async (limit) => {
    const res = await request(createTestApp(prisma).app)
      .get(`/api/events?limit=${limit}`)
      .set("Authorization", OPERATOR_AUTH)
      .expect(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("requires the operator token", async () => {
    await request(createTestApp(prisma).app).get("/api/events").expect(401);
  });
});
