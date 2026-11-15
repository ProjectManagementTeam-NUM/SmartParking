import type { DomainEvents, EventBus } from "../src/realtime/bus";

export type Emission = {
  [K in keyof DomainEvents]: { event: K; payload: DomainEvents[K][0] };
}[keyof DomainEvents];

/** Records every domain event emitted on `bus`, in order. */
export function recordBus(bus: EventBus): Emission[] {
  const emissions: Emission[] = [];
  for (const event of [
    "slot.updated",
    "parking.updated",
    "device.updated",
    "event.created",
  ] as const) {
    bus.on(event, ((payload: unknown) => {
      emissions.push({ event, payload } as Emission);
    }) as never);
  }
  return emissions;
}
