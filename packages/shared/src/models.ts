import { z } from "zod";
import { GateDecision, GatePosition, ParkingStatus, SlotSource, SlotState } from "./enums";

export const Slot = z.object({
  id: z.string(),
  parkingId: z.string(),
  label: z.string(),
  state: SlotState,
  source: SlotSource,
  deviceId: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type Slot = z.infer<typeof Slot>;

export const Gate = z.object({
  parkingId: z.string(),
  position: GatePosition,
  lastDecision: GateDecision.nullable(),
  lastDecisionAt: z.iso.datetime().nullable(),
});
export type Gate = z.infer<typeof Gate>;

export const ParkingSummary = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  freeCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  status: ParkingStatus,
});
export type ParkingSummary = z.infer<typeof ParkingSummary>;

export const ParkingDetail = ParkingSummary.extend({
  slots: z.array(Slot),
  gate: Gate.nullable(),
});
export type ParkingDetail = z.infer<typeof ParkingDetail>;

export const Device = z.object({
  id: z.string(),
  parkingId: z.string().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  firmwareVersion: z.string().nullable(),
  online: z.boolean(),
});
export type Device = z.infer<typeof Device>;
