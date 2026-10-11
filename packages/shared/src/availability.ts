import type { ParkingStatus, SlotState } from "./enums";
import { DEVICE_TIMEOUT_MS } from "./protocol";

export interface Availability {
  freeCount: number;
  totalCount: number;
  status: ParkingStatus;
}

/** The single availability rule. UNKNOWN slots are never counted as free. */
export function computeAvailability(slots: ReadonlyArray<{ state: SlotState }>): Availability {
  const freeCount = slots.filter((slot) => slot.state === "FREE").length;
  return {
    freeCount,
    totalCount: slots.length,
    status: freeCount > 0 ? "AVAILABLE" : "FULL",
  };
}

export function isDeviceOnline(
  lastSeenAt: Date | null,
  now: Date,
  timeoutMs: number = DEVICE_TIMEOUT_MS,
): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < timeoutMs;
}
