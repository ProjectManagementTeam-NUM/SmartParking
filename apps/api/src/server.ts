import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app";
import { startOfflineMonitor } from "./domain/offline";
import { createEventBus } from "./realtime/bus";
import { attachDeviceWs } from "./realtime/device-ws";
import { attachSocketIO } from "./realtime/socket";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const port = Number(process.env.PORT ?? 3000);
const operatorToken = process.env.OPERATOR_TOKEN;
if (!operatorToken) console.warn("OPERATOR_TOKEN is not set: operator endpoints will answer 401.");

const prisma = new PrismaClient();
const bus = createEventBus();
const httpServer = createServer(createApp({ prisma, bus, operatorToken }));
const io = attachSocketIO(httpServer, bus, { operatorToken });
const wss = attachDeviceWs(httpServer, { prisma, bus });
const stopOfflineMonitor = startOfflineMonitor({ prisma, bus, now: () => new Date() });

httpServer.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

async function shutdown() {
  stopOfflineMonitor();
  for (const client of wss.clients) client.terminate();
  wss.close();
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
