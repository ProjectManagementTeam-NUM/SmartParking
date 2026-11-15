import type { PrismaClient } from "@prisma/client";
import { ParkingId, SlotOverrideBody } from "@smart-parking/shared";
import { Router } from "express";
import { z } from "zod";
import { toSlot } from "../domain/serialize";
import { applySlotChanges, publish } from "../domain/slots";
import { withWriteLock } from "../domain/write-lock";
import { requireOperator } from "../http/auth";
import { parseOr400 } from "../http/validate";
import type { EventBus } from "../realtime/bus";

const SlotsQuery = z.strictObject({ parkingId: ParkingId.optional() });
// Slot ids are short codes ("A1"). Anything else can't exist, so skip the query.
const SLOT_ID = /^[A-Za-z0-9_-]{1,32}$/;

export function slotsRouter(deps: {
  prisma: PrismaClient;
  bus: EventBus;
  operatorToken: string | undefined;
  now: () => Date;
}): Router {
  const { prisma, bus, operatorToken, now } = deps;
  const router = Router();

  router.get("/", async (req, res) => {
    const query = parseOr400(SlotsQuery, req.query, res);
    if (!query) return;
    const slots = await prisma.slot.findMany({
      where: query.parkingId ? { parkingId: query.parkingId } : {},
      orderBy: { id: "asc" },
    });
    res.json(slots.map(toSlot));
  });

  router.patch("/:id", requireOperator(operatorToken), async (req, res) => {
    const slotId = String(req.params.id);
    const exists =
      SLOT_ID.test(slotId) && (await prisma.slot.findUnique({ where: { id: slotId } }));
    if (!exists) {
      res.status(404).json({ error: "not_found", message: `Slot ${slotId} not found` });
      return;
    }
    const body = parseOr400(SlotOverrideBody, req.body, res);
    if (!body) return;

    await withWriteLock(async () => {
      const result = await prisma.$transaction((tx) =>
        applySlotChanges(tx, [{ slotId, state: body.state }], {
          at: now(),
          eventType: "slot.overridden",
        }),
      );
      publish(bus, result);
    });

    const slot = await prisma.slot.findUniqueOrThrow({ where: { id: slotId } });
    res.json(toSlot(slot));
  });

  return router;
}
