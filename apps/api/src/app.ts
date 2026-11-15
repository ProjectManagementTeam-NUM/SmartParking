import type { PrismaClient } from "@prisma/client";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { EventBus } from "./realtime/bus";
import { devicesRouter } from "./routes/devices";
import { eventsRouter } from "./routes/events";
import { parkingsRouter } from "./routes/parkings";
import { slotsRouter } from "./routes/slots";

export interface AppDeps {
  prisma: PrismaClient;
  bus: EventBus;
  /** Bearer token for operator endpoints. Unset or empty → operator endpoints always 401. */
  operatorToken: string | undefined;
  /** Clock. Tests inject a fake one. */
  now?: () => Date;
}

export function createApp({ prisma, operatorToken, now = () => new Date() }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/parkings", parkingsRouter(prisma));
  app.use("/api/slots", slotsRouter(prisma));
  app.use("/api/devices", devicesRouter(prisma, now));
  app.use("/api/events", eventsRouter(prisma, operatorToken));

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
