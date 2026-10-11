import { z } from "zod";
import { ParkingStatus } from "./enums";

export const SOCKET_EVENTS = {
  parkingUpdated: "parking.updated",
  slotUpdated: "slot.updated",
  deviceUpdated: "device.updated",
  eventCreated: "event.created",
} as const;

export const ParkingUpdated = z.object({
  id: z.string(),
  freeCount: z.number().int().nonnegative(),
  status: ParkingStatus,
});
export type ParkingUpdated = z.infer<typeof ParkingUpdated>;
