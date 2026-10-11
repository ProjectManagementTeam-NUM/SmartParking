import { EventEmitter } from "node:events";
import type { ParkingUpdated } from "@smart-parking/shared";

/** Domain events. Transport adapters (Socket.IO, device WS) subscribe; domain code only emits. */
export interface DomainEvents {
  "parking.updated": [ParkingUpdated];
}

export type EventBus = EventEmitter<DomainEvents>;

export function createEventBus(): EventBus {
  return new EventEmitter<DomainEvents>();
}
