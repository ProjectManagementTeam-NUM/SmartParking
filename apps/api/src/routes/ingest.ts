import { IngestBody } from "@smart-parking/shared";
import { Router } from "express";
import { ingest, type IngestDeps } from "../domain/ingest";
import { authenticateDevice } from "../http/auth";
import { parseOr400 } from "../http/validate";

export function ingestRouter(deps: IngestDeps): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = parseOr400(IngestBody, req.body, res);
    if (!body) return;
    const device = await authenticateDevice(deps.prisma, body.deviceId, req.get("X-Device-Key"));
    if (!device) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const result = await ingest(deps, device, body);
    if (!result.ok) {
      res.status(403).json({ error: "forbidden", message: result.message });
      return;
    }
    res.status(204).end();
  });

  return router;
}
