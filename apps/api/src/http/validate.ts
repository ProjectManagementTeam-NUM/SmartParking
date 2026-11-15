import type { Response } from "express";
import { z } from "zod";

/** Parses `input` with `schema`. On failure, sends `400 bad_request` with field errors and returns undefined. */
export function parseOr400<T>(schema: z.ZodType<T>, input: unknown, res: Response): T | undefined {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  res.status(400).json({ error: "bad_request", issues: z.flattenError(result.error) });
  return undefined;
}
