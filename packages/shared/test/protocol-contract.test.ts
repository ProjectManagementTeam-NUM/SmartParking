import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { DeviceAvailabilityMessage, IngestBody } from "../src";

const protocolPath = fileURLToPath(new URL("../../../firmware/PROTOCOL.md", import.meta.url));
const schemas: Record<string, z.ZodType> = {
  ingest: IngestBody,
  availability: DeviceAvailabilityMessage,
};

function examples(): Array<{ tag: string; json: unknown }> {
  const markdown = readFileSync(protocolPath, "utf8");
  const blocks = [...markdown.matchAll(/```json (\w+)\n([\s\S]*?)```/g)];
  return blocks.map(([, tag, body]) => ({ tag: tag!, json: JSON.parse(body!) }));
}

describe("firmware/PROTOCOL.md examples", () => {
  it("contains at least one example of each message type", () => {
    const tags = new Set(examples().map((example) => example.tag));
    expect(tags).toEqual(new Set(Object.keys(schemas)));
  });

  it("every example matches the shared schema", () => {
    for (const { tag, json } of examples()) {
      const schema = schemas[tag];
      expect(schema, `unknown example tag "${tag}"`).toBeDefined();
      const result = schema!.safeParse(json);
      expect(result.success, `${tag}: ${JSON.stringify(json)}`).toBe(true);
    }
  });
});
