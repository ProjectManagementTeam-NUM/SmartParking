import type { PrismaClient } from "@prisma/client";
import { ParkingDetail, ParkingSummary } from "@smart-parking/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app";
import { seed } from "../src/db/seed-data";
import { createTestPrisma, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/parkings", () => {
  it("returns both sites with derived availability (UNKNOWN is not free)", async () => {
    const res = await request(createApp({ prisma })).get("/api/parkings").expect(200);
    const parkings = z.array(ParkingSummary).parse(res.body);
    expect(parkings.map((p) => [p.id, p.freeCount, p.totalCount, p.status])).toEqual([
      ["A", 4, 6, "AVAILABLE"],
      ["B", 5, 6, "AVAILABLE"],
    ]);
  });

  it("reports FULL when every slot is occupied or unknown", async () => {
    await prisma.slot.updateMany({
      where: { parkingId: "B", source: "SIMULATED" },
      data: { state: "OCCUPIED" },
    });
    const res = await request(createApp({ prisma })).get("/api/parkings").expect(200);
    const b = z
      .array(ParkingSummary)
      .parse(res.body)
      .find((p) => p.id === "B");
    expect(b).toMatchObject({ freeCount: 0, status: "FULL" });
  });
});

describe("GET /api/parkings/:id", () => {
  it("returns slots in label order and the gate", async () => {
    const res = await request(createApp({ prisma })).get("/api/parkings/B").expect(200);
    const detail = ParkingDetail.parse(res.body);
    expect(detail.slots.map((s) => s.id)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(detail.slots[0]).toMatchObject({
      source: "LIVE",
      state: "UNKNOWN",
      deviceId: "esp32-b",
    });
    expect(detail.gate).toMatchObject({ parkingId: "B", position: "CLOSED", lastDecision: null });
  });

  it("returns a JSON 404 for an unknown id", async () => {
    const res = await request(createApp({ prisma })).get("/api/parkings/Z").expect(404);
    expect(res.body).toEqual({ error: "not_found", message: "Parking Z not found" });
  });

  it("treats ids as case-sensitive", async () => {
    await request(createApp({ prisma })).get("/api/parkings/b").expect(404);
  });
});

describe("other routes", () => {
  it("answers health checks", async () => {
    await request(createApp({ prisma })).get("/api/health").expect(200, { ok: true });
  });

  it("returns a JSON 404 for unknown API paths", async () => {
    const res = await request(createApp({ prisma })).get("/api/nope").expect(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
