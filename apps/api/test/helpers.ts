import { PrismaClient } from "@prisma/client";
import { seed, type DeviceId } from "../src/db/seed-data";
import { TEST_DATABASE_URL } from "./test-db";

export const TEST_KEYS: Record<DeviceId, string> = {
  "esp32-a": "test-key-a",
  "esp32-b": "test-key-b",
  simulator: "test-key-sim",
};

export async function createTestPrisma(): Promise<PrismaClient> {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  await seed(prisma, TEST_KEYS);
  return prisma;
}
