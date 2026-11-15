import type { PrismaClient } from "@prisma/client";
import { PilotRequestInput } from "@smart-parking/shared";
import { Router } from "express";
import { toPilotRequest } from "../domain/serialize";
import { requireOperator } from "../http/auth";
import { parseOr400 } from "../http/validate";

export function pilotRequestsRouter(
  prisma: PrismaClient,
  operatorToken: string | undefined,
  now: () => Date,
): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const input = parseOr400(PilotRequestInput, req.body, res);
    if (!input) return;
    const row = await prisma.pilotRequest.create({ data: { ...input, createdAt: now() } });
    res.status(201).json(toPilotRequest(row));
  });

  router.get("/", requireOperator(operatorToken), async (_req, res) => {
    const rows = await prisma.pilotRequest.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    res.json(rows.map(toPilotRequest));
  });

  return router;
}
