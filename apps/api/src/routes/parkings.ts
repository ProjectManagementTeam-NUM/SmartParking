import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { toParkingDetail, toParkingSummary } from "../domain/serialize";

// Parking ids are short codes ("A", "B"). Anything else can't exist, so skip the query
// (Postgres rejects some bytes, e.g. NUL, with an error instead of "no rows").
const PARKING_ID = /^[A-Za-z0-9_-]{1,32}$/;

export function parkingsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const parkings = await prisma.parking.findMany({
      include: { slots: true },
      orderBy: { id: "asc" },
    });
    res.json(parkings.map(toParkingSummary));
  });

  router.get("/:id", async (req, res) => {
    const parking =
      PARKING_ID.test(req.params.id) &&
      (await prisma.parking.findUnique({
        where: { id: req.params.id },
        include: { slots: { orderBy: { label: "asc" } }, gate: true },
      }));
    if (!parking) {
      res.status(404).json({ error: "not_found", message: `Parking ${req.params.id} not found` });
      return;
    }
    res.json(toParkingDetail(parking));
  });

  return router;
}
