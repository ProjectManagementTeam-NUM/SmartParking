import type { ParkingSummary } from "@smart-parking/shared";
import { describe, expect, it } from "vitest";
import { formatStatus } from "../src/format";

const base = { address: "x", lat: 0, lng: 0, totalCount: 6 };

describe("formatStatus", () => {
  it("prints one aligned line per parking", () => {
    const parkings: ParkingSummary[] = [
      { ...base, id: "A", name: "Parking A", freeCount: 4, status: "AVAILABLE" },
      { ...base, id: "B", name: "Parking B", freeCount: 0, status: "FULL" },
    ];
    expect(formatStatus(parkings)).toBe(
      ["A  Parking A   4/6    AVAILABLE", "B  Parking B   0/6    FULL"].join("\n"),
    );
  });

  it("says so when there are no parkings", () => {
    expect(formatStatus([])).toBe("No parkings found (did you run npm run db:seed?)");
  });
});
