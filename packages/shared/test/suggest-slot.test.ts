import { describe, expect, it } from "vitest";
import { suggestSlot } from "../src";

describe("suggestSlot", () => {
  it("returns null when nothing is free", () => {
    expect(
      suggestSlot([
        { id: "B1", label: "B1", state: "OCCUPIED" },
        { id: "B2", label: "B2", state: "UNKNOWN" },
      ]),
    ).toBeNull();
  });

  it("picks the lowest-numbered free slot, ordering labels numerically", () => {
    expect(
      suggestSlot([
        { id: "A10", label: "A10", state: "FREE" },
        { id: "A3", label: "A3", state: "FREE" },
        { id: "A1", label: "A1", state: "OCCUPIED" },
      ]),
    ).toBe("A3");
  });
});
