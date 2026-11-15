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

export const DeviceUpdated = z.object({
  id: z.string(),
  online: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(),
});
export type DeviceUpdated = z.infer<typeof DeviceUpdated>;

/** Events a browser sends to the server. */
export const SOCKET_CLIENT_EVENTS = { subscribe: "subscribe" } as const;

export const ParkingId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

export const SubscribeMessage = z.strictObject({ parkingId: ParkingId });
export type SubscribeMessage = z.infer<typeof SubscribeMessage>;

export const rooms = {
  parking: (id: string) => `parking:${id}`,
  dashboard: "dashboard",
} as const;
