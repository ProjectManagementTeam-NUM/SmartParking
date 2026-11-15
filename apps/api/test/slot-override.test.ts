import type { PrismaClient } from "@prisma/client";
import { Slot } from "@smart-parking/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../src/db/seed-data";
import { recordBus } from "./bus-recorder";
import { createTestApp, createTestPrisma, OPERATOR_AUTH, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function override(app: Parameters<typeof request>[0], slotId: string, body: object) {
  return request(app).patch(`/api/slots/${slotId}`).set("Authorization", OPERATOR_AUTH).send(body);
}

describe("PATCH /api/slots/:id", () => {
  it("changes the slot, records an event and emits slot, parking and event updates", async () => {
    const { app, bus, clock } = createTestApp(prisma);
    const emissions = recordBus(bus);

    const res = await override(app, "B2", { state: "OCCUPIED" }).expect(200);

    expect(Slot.parse(res.body)).toMatchObject({
      id: "B2",
      state: "OCCUPIED",
      updatedAt: clock.now().toISOString(),
    });
    expect(emissions.map((e) => e.event)).toEqual([
      "slot.updated",
      "parking.updated",
      "event.created",
    ]);
    expect(emissions[0]!.payload).toMatchObject({ id: "B2", state: "OCCUPIED" });
    expect(emissions[1]!.payload).toEqual({ id: "B", freeCount: 4, status: "AVAILABLE" });
    expect(emissions[2]!.payload).toMatchObject({
      type: "slot.overridden",
      parkingId: "B",
      slotId: "B2",
      deviceId: null,
      payload: { from: "FREE", to: "OCCUPIED" },
    });
  });

  it("is a no-op when the state does not change (no event, no emission)", async () => {
    const { app, bus } = createTestApp(prisma);
    await override(app, "B2", { state: "OCCUPIED" }).expect(200);
    const emissions = recordBus(bus);

    const res = await override(app, "B2", { state: "OCCUPIED" }).expect(200);

    expect(res.body.state).toBe("OCCUPIED");
    expect(emissions).toEqual([]);
    expect(await prisma.event.count()).toBe(1);
  });

  it("does not emit parking.updated when freeCount stays the same", async () => {
    const { app, bus } = createTestApp(prisma);
    const emissions = recordBus(bus);
    // B1 is UNKNOWN on a fresh seed; UNKNOWN → OCCUPIED leaves freeCount at 5.
    await override(app, "B1", { state: "OCCUPIED" }).expect(200);
    expect(emissions.map((e) => e.event)).toEqual(["slot.updated", "event.created"]);
  });

  it("reports FULL once the last free slot is taken", async () => {
    const { app, bus } = createTestApp(prisma);
    const emissions = recordBus(bus);
    for (const id of ["B2", "B3", "B4", "B5", "B6"]) {
      await override(app, id, { state: "OCCUPIED" }).expect(200);
    }
    const parkingUpdates = emissions.filter((e) => e.event === "parking.updated");
    expect(parkingUpdates).toHaveLength(5);
    expect(parkingUpdates.at(-1)!.payload).toEqual({ id: "B", freeCount: 0, status: "FULL" });
  });

  it("lets operators mark a slot UNKNOWN", async () => {
    const { app } = createTestApp(prisma);
    await override(app, "A3", { state: "UNKNOWN" }).expect(200);
  });

  it("returns 404 for an unknown slot", async () => {
    const res = await override(createTestApp(prisma).app, "Z9", { state: "FREE" }).expect(404);
    expect(res.body.error).toBe("not_found");
  });

  it("returns 404 for a slot id with odd characters", async () => {
    await override(createTestApp(prisma).app, "A%00", { state: "FREE" }).expect(404);
  });

  it.each([{ state: "MAYBE" }, {}, { state: "FREE", extra: 1 }])(
    "rejects body %j with 400",
    async (body) => {
      const res = await override(createTestApp(prisma).app, "B2", body).expect(400);
      expect(res.body.error).toBe("bad_request");
    },
  );

  it("requires the operator token", async () => {
    await request(createTestApp(prisma).app)
      .patch("/api/slots/B2")
      .send({ state: "FREE" })
      .expect(401);
  });
});
