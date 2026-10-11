import { describe, expect, it } from "vitest";
import { computeAvailability, isDeviceOnline, DEVICE_TIMEOUT_MS } from "../src";

describe("computeAvailability", () => {
  it("counts only FREE slots as free", () => {
    const result = computeAvailability([
      { state: "FREE" },
      { state: "OCCUPIED" },
      { state: "UNKNOWN" },
      { state: "FREE" },
    ]);
    expect(result).toEqual({ freeCount: 2, totalCount: 4, status: "AVAILABLE" });
  });

  it("is FULL when no slot is FREE, even if some are UNKNOWN", () => {
    const result = computeAvailability([{ state: "OCCUPIED" }, { state: "UNKNOWN" }]);
    expect(result).toEqual({ freeCount: 0, totalCount: 2, status: "FULL" });
  });

  it("treats a parking with no slots as FULL", () => {
    expect(computeAvailability([])).toEqual({ freeCount: 0, totalCount: 0, status: "FULL" });
  });
});

describe("isDeviceOnline", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");

  it("is offline when never seen", () => {
    expect(isDeviceOnline(null, now)).toBe(false);
  });

  it("is online just inside the timeout", () => {
    const seen = new Date(now.getTime() - (DEVICE_TIMEOUT_MS - 1));
    expect(isDeviceOnline(seen, now)).toBe(true);
  });

  it("is offline exactly at the timeout", () => {
    const seen = new Date(now.getTime() - DEVICE_TIMEOUT_MS);
    expect(isDeviceOnline(seen, now)).toBe(false);
  });

  it("uses the 15 second default", () => {
    expect(DEVICE_TIMEOUT_MS).toBe(15_000);
  });
});
