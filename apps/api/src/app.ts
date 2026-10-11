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

  // Express 5 forwards rejected async handlers here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
