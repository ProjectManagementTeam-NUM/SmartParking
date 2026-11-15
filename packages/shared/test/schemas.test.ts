import { describe, expect, it } from "vitest";
import {
  DeviceAvailabilityMessage,
  EventRecord,
  IngestBody,
  ParkingSummary,
  PilotRequestInput,
  rooms,
  SlotOverrideBody,
  SubscribeMessage,
} from "../src";

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

describe("PilotRequestInput", () => {
  it("accepts the minimum form and trims", () => {
    expect(
      PilotRequestInput.parse({ name: " Bat ", organization: "OPL", email: "a@b.mn" }),
    ).toEqual({
      name: "Bat",
      organization: "OPL",
      email: "a@b.mn",
    });
  });

  it("rejects a bad email, empty name and unknown keys", () => {
    expect(PilotRequestInput.safeParse({ name: "", organization: "O", email: "x" }).success).toBe(
      false,
    );
    expect(
      PilotRequestInput.safeParse({ name: "a", organization: "O", email: "a@b.mn", extra: 1 })
        .success,
    ).toBe(false);
  });

  it("rejects siteCount 0 and 1.5", () => {
    const base = { name: "a", organization: "O", email: "a@b.mn" };
    expect(PilotRequestInput.safeParse({ ...base, siteCount: 0 }).success).toBe(false);
    expect(PilotRequestInput.safeParse({ ...base, siteCount: 1.5 }).success).toBe(false);
  });
});

describe("SlotOverrideBody", () => {
  it("accepts UNKNOWN (operators may mark a slot unknown)", () => {
    expect(SlotOverrideBody.safeParse({ state: "UNKNOWN" }).success).toBe(true);
  });
});

describe("SubscribeMessage", () => {
  it("rejects parking ids with odd characters", () => {
    expect(SubscribeMessage.safeParse({ parkingId: "A\u0000" }).success).toBe(false);
  });

  it("accepts a plain parking id", () => {
    expect(SubscribeMessage.safeParse({ parkingId: "B" }).success).toBe(true);
  });
});

describe("EventRecord", () => {
  it("rejects an unknown event type", () => {
    const result = EventRecord.safeParse({
      id: "e1",
      type: "slot.exploded",
      parkingId: null,
      slotId: null,
      deviceId: null,
      payload: {},
      createdAt: "2026-11-15T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("rooms", () => {
  it("names parking and dashboard rooms", () => {
    expect(rooms.parking("B")).toBe("parking:B");
    expect(rooms.dashboard).toBe("dashboard");
  });
});
