import { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import { createApp, type AppDeps } from "../src/app";
import { seed, type DeviceId } from "../src/db/seed-data";
import { createEventBus, type EventBus } from "../src/realtime/bus";
import { TEST_DATABASE_URL } from "./test-db";

export const TEST_KEYS: Record<DeviceId, string> = {
  "esp32-a": "test-key-a",
  "esp32-b": "test-key-b",
  simulator: "test-key-sim",
};

export const TEST_OPERATOR_TOKEN = "test-operator";
export const OPERATOR_AUTH = `Bearer ${TEST_OPERATOR_TOKEN}`;

export async function createTestPrisma(): Promise<PrismaClient> {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  await seed(prisma, TEST_KEYS);
  return prisma;
}

export interface TestClock {
  now: () => Date;
  set: (date: Date) => void;
  advance: (ms: number) => void;
}

export function createTestClock(start = new Date("2026-11-15T12:00:00.000Z")): TestClock {
  let current = start;
  return {
    now: () => current,
    set: (date) => {
      current = date;
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

export function createTestApp(
  prisma: PrismaClient,
  overrides: Partial<AppDeps> = {},
): { app: Express; bus: EventBus; clock: TestClock } {
  const clock = createTestClock();
  const bus = overrides.bus ?? createEventBus();
  const app = createApp({
    prisma,
    bus,
    operatorToken: TEST_OPERATOR_TOKEN,
    now: clock.now,
    ...overrides,
  });
  return { app, bus, clock };
}
