import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app";
import { createEventBus } from "./realtime/bus";
import { attachSocketIO } from "./realtime/socket";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const port = Number(process.env.PORT ?? 3000);
const prisma = new PrismaClient();
const bus = createEventBus();
const httpServer = createServer(createApp({ prisma }));
const io = attachSocketIO(httpServer, bus);

httpServer.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

async function shutdown() {
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
