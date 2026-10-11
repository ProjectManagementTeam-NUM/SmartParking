import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { toParkingDetail, toParkingSummary } from "../domain/serialize";

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
    const parking = await prisma.parking.findUnique({
      where: { id: req.params.id },
      include: { slots: { orderBy: { label: "asc" } }, gate: true },
    });
    if (!parking) {
      res.status(404).json({ error: "not_found", message: `Parking ${req.params.id} not found` });
      return;
    }
    res.json(toParkingDetail(parking));
  });

  return router;
}
