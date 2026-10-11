import type { PrismaClient } from "@prisma/client";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { parkingsRouter } from "./routes/parkings";

export interface AppDeps {
  prisma: PrismaClient;
}

export function createApp({ prisma }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/parkings", parkingsRouter(prisma));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Express 5 forwards rejected async handlers here. Client errors (bad JSON, oversized
  // body, malformed URL) carry a 4xx status from Express/body-parser; only 5xx are logged.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = httpStatusOf(err);
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: status === 413 ? "payload_too_large" : "bad_request" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

function httpStatusOf(err: unknown): number {
  if (typeof err === "object" && err !== null) {
    const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
    if (typeof status === "number") return status;
    if (typeof statusCode === "number") return statusCode;
  }
  return 500;
}
