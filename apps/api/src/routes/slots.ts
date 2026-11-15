import type { PrismaClient } from "@prisma/client";
import { ParkingId } from "@smart-parking/shared";
import { Router } from "express";
import { z } from "zod";
import { toSlot } from "../domain/serialize";
import { parseOr400 } from "../http/validate";

const SlotsQuery = z.strictObject({ parkingId: ParkingId.optional() });

export function slotsRouter(prisma: PrismaClient): Router {
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

  return router;
}
