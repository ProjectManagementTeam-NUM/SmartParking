import type { PrismaClient } from "@prisma/client";
import { PilotRequest } from "@smart-parking/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { seed } from "../src/db/seed-data";
import { createTestApp, createTestPrisma, OPERATOR_AUTH, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const form = {
  name: " Bat ",
  organization: "OPL",
  email: "bat@example.mn",
  siteCount: 3,
  message: "Two malls",
};

describe("POST /api/pilot-requests", () => {
  it("stores a request and returns 201 with the record", async () => {
    const { app, clock } = createTestApp(prisma);
    const res = await request(app).post("/api/pilot-requests").send(form).expect(201);
    expect(PilotRequest.parse(res.body)).toMatchObject({
      name: "Bat",
      organization: "OPL",
      email: "bat@example.mn",
      phone: null,
      siteCount: 3,
      message: "Two malls",
      createdAt: clock.now().toISOString(),
    });
    expect(await prisma.pilotRequest.count()).toBe(1);
  });

  it("rejects an invalid form with 400 and field errors, storing nothing", async () => {
    const res = await request(createTestApp(prisma).app)
      .post("/api/pilot-requests")
      .send({ ...form, email: "nope" })
      .expect(400);
    expect(res.body.error).toBe("bad_request");
    expect(res.body.issues.fieldErrors.email).toBeDefined();
    expect(await prisma.pilotRequest.count()).toBe(0);
  });

  it("needs no token (public form)", async () => {
    await request(createTestApp(prisma).app).post("/api/pilot-requests").send(form).expect(201);
  });
});

describe("GET /api/pilot-requests", () => {
  it("lists submissions newest first for the operator", async () => {
    const { app, clock } = createTestApp(prisma);
    await request(app)
      .post("/api/pilot-requests")
      .send({ ...form, name: "First" });
    clock.advance(1_000);
    await request(app)
      .post("/api/pilot-requests")
      .send({ ...form, name: "Second" });
    const res = await request(app)
      .get("/api/pilot-requests")
      .set("Authorization", OPERATOR_AUTH)
      .expect(200);
    expect(
      z
        .array(PilotRequest)
        .parse(res.body)
        .map((r) => r.name),
    ).toEqual(["Second", "First"]);
  });

  it("requires the operator token", async () => {
    await request(createTestApp(prisma).app).get("/api/pilot-requests").expect(401);
  });
});
