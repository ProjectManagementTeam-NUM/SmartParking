import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seed } from "../src/db/seed-data";
import { markOfflineDevices } from "../src/domain/offline";
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

const post = (app: Parameters<typeof request>[0], deviceId: keyof typeof TEST_KEYS, body: object) =>
  request(app)
    .post("/api/ingest")
    .set("X-Device-Key", TEST_KEYS[deviceId])
    .send({ deviceId, ...body });

describe("concurrent writers", () => {
  it("publishes the true freeCount last when two devices fill one parking at once", async () => {
    for (let run = 0; run < 10; run++) {
      await seed(prisma, TEST_KEYS);
      const { app, bus } = createTestApp(prisma);
      await prisma.slot.updateMany({
        where: { id: { in: ["B3", "B4", "B5", "B6"] } },
        data: { state: "OCCUPIED" },
      });
      await post(app, "esp32-b", { slots: [{ id: "B1", state: "FREE" }] }).expect(204); // B1, B2 free
      const emissions = recordBus(bus);

      const results = await Promise.all([
        post(app, "esp32-b", { slots: [{ id: "B1", state: "OCCUPIED" }] }),
        post(app, "simulator", { slots: [{ id: "B2", state: "OCCUPIED" }] }),
      ]);

      expect(results.map((r) => r.status)).toEqual([204, 204]);
      const parkingUpdates = emissions
        .filter((e) => e.event === "parking.updated")
        .map((e) => e.payload);
      expect(parkingUpdates.at(-1)).toEqual({ id: "B", freeCount: 0, status: "FULL" });
    }
  });

  it("publishes the true freeCount last when an override races a device report", async () => {
    for (let run = 0; run < 10; run++) {
      await seed(prisma, TEST_KEYS);
      const { app, bus } = createTestApp(prisma);
      await prisma.slot.updateMany({
        where: { id: { in: ["B3", "B4", "B5", "B6"] } },
        data: { state: "OCCUPIED" },
      });
      await post(app, "esp32-b", { slots: [{ id: "B1", state: "FREE" }] }).expect(204);
      const emissions = recordBus(bus);

      await Promise.all([
        request(app)
          .patch("/api/slots/B2")
          .set("Authorization", OPERATOR_AUTH)
          .send({ state: "OCCUPIED" })
          .expect(200),
        post(app, "esp32-b", { slots: [{ id: "B1", state: "OCCUPIED" }] }).expect(204),
      ]);

      const parkingUpdates = emissions
        .filter((e) => e.event === "parking.updated")
        .map((e) => e.payload);
      expect(parkingUpdates.at(-1)).toEqual({ id: "B", freeCount: 0, status: "FULL" });
    }
  });

  it("never leaves an online device's slots UNKNOWN when a heartbeat races the offline monitor", async () => {
    for (let run = 0; run < 10; run++) {
      await seed(prisma, TEST_KEYS);
      const { app, bus, clock } = createTestApp(prisma);
      await post(app, "esp32-a", { slots: [{ id: "A1", state: "FREE" }] }).expect(204);
      clock.advance(16_000);
      const emissions = recordBus(bus);

      await Promise.all([
        markOfflineDevices({ prisma, bus, now: clock.now }),
        post(app, "esp32-a", { slots: [{ id: "A1", state: "FREE" }] }).expect(204),
      ]);

      // The heartbeat is the latest word: the device is online and A1 is FREE.
      expect((await prisma.slot.findUniqueOrThrow({ where: { id: "A1" } })).state).toBe("FREE");
      const deviceUpdates = emissions.filter((e) => e.event === "device.updated");
      if (deviceUpdates.length > 0)
        expect(deviceUpdates.at(-1)!.payload).toMatchObject({ online: true });
    }
  });
});
