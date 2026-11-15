import { EventEmitter } from "node:events";
import type { DeviceUpdated, EventRecord, ParkingUpdated, Slot } from "@smart-parking/shared";

/** Domain events. Transport adapters (Socket.IO, device WS) subscribe; domain code only emits. */
export interface DomainEvents {
  "parking.updated": [ParkingUpdated];
  "slot.updated": [Slot];
  "device.updated": [DeviceUpdated];
  "event.created": [EventRecord];
}

export type EventBus = EventEmitter<DomainEvents>;

export function createEventBus(): EventBus {
  return new EventEmitter<DomainEvents>();
}
