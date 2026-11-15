import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { toEventRecord } from "../domain/serialize";
import { requireOperator } from "../http/auth";
import { parseOr400 } from "../http/validate";

const EventsQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function eventsRouter(prisma: PrismaClient, operatorToken: string | undefined): Router {
  const router = Router();

  router.get("/", requireOperator(operatorToken), async (req, res) => {
    const query = parseOr400(EventsQuery, req.query, res);
    if (!query) return;
    const rows = await prisma.event.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit,
    });
    res.json(rows.map(toEventRecord));
  });

  return router;
}
