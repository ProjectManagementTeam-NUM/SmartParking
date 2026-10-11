import { z } from "zod";
import { GateDecision, ParkingStatus, ReportedSlotState } from "./enums";

/** Devices must POST at least this often; every POST is a heartbeat. */
export const DEVICE_HEARTBEAT_MS = 5_000;
/** A device silent for this long is offline and its slots become UNKNOWN. */
export const DEVICE_TIMEOUT_MS = 15_000;

/**
 * Body of POST /api/ingest (ESP32 and simulator). See firmware/PROTOCOL.md.
 * Strict: a misspelled key must fail validation, not be dropped silently.
 */
export const IngestBody = z.strictObject({
  deviceId: z.string().min(1),
  firmwareVersion: z.string().optional(),
  slots: z.array(z.strictObject({ id: z.string().min(1), state: ReportedSlotState })).optional(),
  gate: z.strictObject({ event: GateDecision }).optional(),
});
export type IngestBody = z.infer<typeof IngestBody>;

/** Server → device message on /ws/device. */
export const DeviceAvailabilityMessage = z.strictObject({
  type: z.literal("availability"),
  parkingId: z.string(),
  status: ParkingStatus,
  freeCount: z.number().int().nonnegative(),
});
export type DeviceAvailabilityMessage = z.infer<typeof DeviceAvailabilityMessage>;
