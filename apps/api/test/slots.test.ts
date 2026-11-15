import type { PrismaClient } from "@prisma/client";
import { Slot } from "@smart-parking/shared";
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

describe("GET /api/slots", () => {
  it("lists all 12 slots ordered by id", async () => {
    const res = await request(createTestApp(prisma).app).get("/api/slots").expect(200);
    const slots = z.array(Slot).parse(res.body);
    expect(slots.map((s) => s.id)).toEqual([
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
      "B6",
    ]);
  });

  it("filters by parkingId", async () => {
    const res = await request(createTestApp(prisma).app).get("/api/slots?parkingId=B").expect(200);
    expect(res.body.map((s: Slot) => s.id)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
  });

  it("returns an empty list for an unknown parking", async () => {
    await request(createTestApp(prisma).app).get("/api/slots?parkingId=Z").expect(200, []);
  });

  it("rejects a malformed parkingId with 400", async () => {
    const res = await request(createTestApp(prisma).app)
      .get("/api/slots?parkingId=A%00")
      .expect(400);
    expect(res.body.error).toBe("bad_request");
  });
});
