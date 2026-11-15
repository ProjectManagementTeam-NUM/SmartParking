import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

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
