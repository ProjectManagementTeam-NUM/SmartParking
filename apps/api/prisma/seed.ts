import { PrismaClient } from "@prisma/client";
import { seed } from "../src/db/seed-data";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const prisma = new PrismaClient();
await seed(prisma, {
  "esp32-a": process.env.DEVICE_KEY_ESP32_A ?? "dev-esp32-a",
  "esp32-b": process.env.DEVICE_KEY_ESP32_B ?? "dev-esp32-b",
  simulator: process.env.DEVICE_KEY_SIMULATOR ?? "dev-simulator",
});
await prisma.$disconnect();
console.log("Seeded 2 parkings, 12 slots, 3 devices, 2 gates");
