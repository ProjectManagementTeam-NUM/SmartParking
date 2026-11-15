import {
  computeAvailability,
  type EventRecord,
  type ParkingUpdated,
  type Slot,
  type SlotState,
} from "@smart-parking/shared";
import type { EventBus } from "../realtime/bus";
import { recordEvent, type Tx } from "./events";
import { toSlot } from "./serialize";

export interface SlotChange {
  slotId: string;
  state: SlotState;
}

export interface SlotChangeContext {
  at: Date;
  eventType: "slot.changed" | "slot.overridden";
  deviceId?: string;
}

export interface SlotChangeResult {
  /** Only slots whose state actually changed. */
  slots: Slot[];
  events: EventRecord[];
  /** Only parkings whose freeCount changed. */
  parkings: ParkingUpdated[];
}

export const EMPTY_RESULT: SlotChangeResult = { slots: [], events: [], parkings: [] };

/**
 * The one place that changes slot state. Writes only slots whose state differs, records one
 * event per changed slot, and reports parkings whose freeCount moved. Run it inside a
 * transaction, then call `publish` after the commit. Unknown slot ids are ignored; callers
 * validate ownership and existence first.
 */
export async function applySlotChanges(
  tx: Tx,
  changes: ReadonlyArray<SlotChange>,
  ctx: SlotChangeContext,
): Promise<SlotChangeResult> {
  const wanted = new Map(changes.map((c) => [c.slotId, c.state]));
  if (wanted.size === 0) return EMPTY_RESULT;

  // Lock the affected parkings (sorted, so concurrent writers can't deadlock) before reading
  // anything, so `freeBefore` and the after-state can't be interleaved with another writer.
  const targets = await tx.slot.findMany({
    where: { id: { in: [...wanted.keys()] } },
    select: { parkingId: true },
    distinct: ["parkingId"],
  });
  await lockParkings(
    tx,
    targets.map((t) => t.parkingId),
  );

  const current = await tx.slot.findMany({
    where: { id: { in: [...wanted.keys()] } },
    orderBy: { id: "asc" },
  });
  const changed = current.filter((slot) => slot.state !== wanted.get(slot.id));
  if (changed.length === 0) return EMPTY_RESULT;

  const parkingIds = [...new Set(changed.map((slot) => slot.parkingId))].sort();
  const freeBefore = await freeCounts(tx, parkingIds);

  const slots: Slot[] = [];
  const events: EventRecord[] = [];
  for (const slot of changed) {
    const to = wanted.get(slot.id)!;
    const updated = await tx.slot.update({
      where: { id: slot.id },
      data: { state: to, updatedAt: ctx.at },
    });
    slots.push(toSlot(updated));
    events.push(
      await recordEvent(tx, {
        type: ctx.eventType,
        parkingId: slot.parkingId,
        slotId: slot.id,
        deviceId: ctx.deviceId,
        payload: { from: slot.state, to },
        at: ctx.at,
      }),
    );
  }

  const parkingsAfter = await tx.parking.findMany({
    where: { id: { in: parkingIds } },
    include: { slots: true },
    orderBy: { id: "asc" },
  });
  const parkings = parkingsAfter
    .map((p) => ({ id: p.id, ...computeAvailability(p.slots) }))
    .filter((p) => p.freeCount !== freeBefore.get(p.id))
    .map(({ id, freeCount, status }) => ({ id, freeCount, status }));

  return { slots, events, parkings };
}

async function lockParkings(tx: Tx, parkingIds: string[]): Promise<void> {
  const ids = [...new Set(parkingIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "Parking" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
}

async function freeCounts(tx: Tx, parkingIds: string[]): Promise<Map<string, number>> {
  const rows = await tx.slot.groupBy({
    by: ["parkingId"],
    where: { parkingId: { in: parkingIds }, state: "FREE" },
    _count: { _all: true },
  });
  return new Map(
    parkingIds.map((id) => [id, rows.find((r) => r.parkingId === id)?._count._all ?? 0]),
  );
}

/** Emits a committed change on the bus: slots, then parkings, then events. */
export function publish(bus: EventBus, result: SlotChangeResult): void {
  for (const slot of result.slots) bus.emit("slot.updated", slot);
  for (const parking of result.parkings) bus.emit("parking.updated", parking);
  for (const event of result.events) bus.emit("event.created", event);
}
