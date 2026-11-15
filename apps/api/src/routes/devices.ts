import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { toDevice } from "../domain/serialize";

export function devicesRouter(prisma: PrismaClient, now: () => Date): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const devices = await prisma.device.findMany({ orderBy: { id: "asc" } });
    const at = now();
    res.json(devices.map((device) => toDevice(device, at)));
  });

  return router;
}
