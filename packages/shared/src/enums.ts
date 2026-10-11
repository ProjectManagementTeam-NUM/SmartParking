import { z } from "zod";

export const SlotState = z.enum(["FREE", "OCCUPIED", "UNKNOWN"]);
export type SlotState = z.infer<typeof SlotState>;

/** States a device may report. UNKNOWN is assigned only by the server (device offline). */
export const ReportedSlotState = z.enum(["FREE", "OCCUPIED"]);
export type ReportedSlotState = z.infer<typeof ReportedSlotState>;

export const SlotSource = z.enum(["LIVE", "SIMULATED"]);
export type SlotSource = z.infer<typeof SlotSource>;

export const ParkingStatus = z.enum(["AVAILABLE", "FULL"]);
export type ParkingStatus = z.infer<typeof ParkingStatus>;

export const GatePosition = z.enum(["OPEN", "CLOSED"]);
export type GatePosition = z.infer<typeof GatePosition>;

export const GateDecision = z.enum(["OPENED", "DENIED"]);
export type GateDecision = z.infer<typeof GateDecision>;
