import { describe, expect, it } from "vitest";
import { DeviceAvailabilityMessage, IngestBody, ParkingSummary } from "../src";

describe("IngestBody", () => {
  it("accepts a heartbeat with only deviceId", () => {
    expect(IngestBody.safeParse({ deviceId: "esp32-a" }).success).toBe(true);
  });

  it("rejects devices reporting UNKNOWN (only the server sets UNKNOWN)", () => {
    const result = IngestBody.safeParse({
      deviceId: "esp32-a",
      slots: [{ id: "A1", state: "UNKNOWN" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown gate event", () => {
    const result = IngestBody.safeParse({ deviceId: "esp32-b", gate: { event: "BROKEN" } });
    expect(result.success).toBe(false);
  });
});

describe("ParkingSummary", () => {
  it("rejects a negative freeCount", () => {
    const result = ParkingSummary.safeParse({
      id: "A",
      name: "Parking A",
      address: "x",
      lat: 0,
      lng: 0,
      freeCount: -1,
      totalCount: 6,
      status: "AVAILABLE",
    });
    expect(result.success).toBe(false);
  });
});

describe("protocol schemas are strict", () => {
  it("rejects a misspelled top-level key instead of treating it as a heartbeat", () => {
    const result = IngestBody.safeParse({ deviceId: "esp32-b", gates: { event: "DENIED" } });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys inside slot reports", () => {
    const result = IngestBody.safeParse({
      deviceId: "esp32-b",
      slots: [{ id: "B1", state: "OCCUPIED", status: "x" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys in availability messages", () => {
    const result = DeviceAvailabilityMessage.safeParse({
      type: "availability",
      parkingId: "B",
      status: "FULL",
      freeCount: 0,
      free: 0,
    });
    expect(result.success).toBe(false);
  });
});
