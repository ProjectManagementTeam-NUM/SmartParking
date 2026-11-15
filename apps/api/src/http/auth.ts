import { timingSafeEqual } from "node:crypto";
import type { Device as DbDevice, PrismaClient } from "@prisma/client";
import type { RequestHandler } from "express";
import { hashDeviceKey } from "../domain/device-keys";

/**
 * Guards operator-only endpoints (PATCH /slots/:id, GET /events, GET /pilot-requests).
 *
 * Contract (see test/auth.test.ts):
 * - Accept only `Authorization: Bearer <token>` where <token> equals `token` exactly.
 * - Anything else → `401 { error: "unauthorized" }`.
 * - If `token` is undefined or "", reject every request (fail closed).
 */
export function requireOperator(token: string | undefined): RequestHandler {
  return (req, res, next) => {
    if (tokensMatch(token, bearerToken(req.get("Authorization")))) {
      next();
      return;
    }
    res.status(401).json({ error: "unauthorized" });
  };
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length);
}

/** Constant-time comparison. An unset or empty expected token never matches (fail closed). */
export function tokensMatch(expected: string | undefined, given: string | undefined): boolean {
  if (!expected || given === undefined) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Device ids are short codes ("esp32-a"). Anything else can't exist, so skip the query.
const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Returns the device if `key` is its key, otherwise null (unknown device, missing or wrong key).
 * Used by POST /ingest and the device WebSocket.
 */
export async function authenticateDevice(
  prisma: PrismaClient,
  deviceId: string,
  key: string | undefined,
): Promise<DbDevice | null> {
  if (!key || !DEVICE_ID.test(deviceId)) return null;
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) return null;
  return tokensMatch(device.apiKeyHash, hashDeviceKey(key)) ? device : null;
}
