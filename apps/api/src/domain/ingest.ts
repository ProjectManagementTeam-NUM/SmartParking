import type { Device as DbDevice, PrismaClient } from "@prisma/client";
import type { EventRecord, IngestBody } from "@smart-parking/shared";
import type { EventBus } from "../realtime/bus";
import { recordEvent } from "./events";
import { applySlotChanges, publish } from "./slots";
import { withWriteLock } from "./write-lock";

export interface IngestDeps {
  prisma: PrismaClient;
  bus: EventBus;
  now: () => Date;
}

export type IngestResult = { ok: true } | { ok: false; message: string };

/**
 * Handles one authenticated device POST: heartbeat, slot reports and gate decision.
 * All or nothing: if any reported slot isn't owned by the device, nothing is written.
 */
export function ingest(
  deps: IngestDeps,
  device: DbDevice,
  body: IngestBody,
): Promise<IngestResult> {
  return withWriteLock(() => ingestLocked(deps, device, body));
}

async function ingestLocked(
  deps: IngestDeps,
  device: DbDevice,
  body: IngestBody,
): Promise<IngestResult> {
  const { prisma, bus } = deps;
  const at = deps.now();

  // Last report per slot id wins.
  const changes = [...new Map((body.slots ?? []).map((s) => [s.id, s.state])).entries()].map(
    ([slotId, state]) => ({ slotId, state }),
  );

  const owned = await prisma.slot.findMany({
    where: { id: { in: changes.map((c) => c.slotId) }, deviceId: device.id },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((s) => s.id));
  const notOwned = changes.find((c) => !ownedIds.has(c.slotId));
  if (notOwned)
    return { ok: false, message: `Device ${device.id} does not own slot ${notOwned.slotId}` };
  if (body.gate && !device.parkingId)
    return { ok: false, message: `Device ${device.id} has no gate` };

  const result = await prisma.$transaction(async (tx) => {
    const seen = {
      lastSeenAt: at,
      ...(body.firmwareVersion ? { firmwareVersion: body.firmwareVersion } : {}),
    };
    // Claiming `announcedOnline` makes the offline → online transition atomic: the row lock
    // serializes this with other heartbeats and the offline monitor, so each outage records
    // `device.online` once.
    const cameOnline =
      (
        await tx.device.updateMany({
          where: { id: device.id, announcedOnline: false },
          data: { ...seen, announcedOnline: true },
        })
      ).count === 1;
    if (!cameOnline) await tx.device.update({ where: { id: device.id }, data: seen });

    const extraEvents: EventRecord[] = [];
    if (cameOnline) {
      extraEvents.push(
        await recordEvent(tx, {
          type: "device.online",
          parkingId: device.parkingId,
          deviceId: device.id,
          at,
        }),
      );
    }

    const slotResult = await applySlotChanges(tx, changes, {
      at,
      eventType: "slot.changed",
      deviceId: device.id,
    });

    if (body.gate && device.parkingId) {
      await tx.gate.update({
        where: { parkingId: device.parkingId },
        data: { lastDecision: body.gate.event, lastDecisionAt: at },
      });
      extraEvents.push(
        await recordEvent(tx, {
          type: body.gate.event === "OPENED" ? "gate.opened" : "gate.denied",
          parkingId: device.parkingId,
          deviceId: device.id,
          at,
        }),
      );
    }

    return { cameOnline, slotResult, extraEvents };
  });

  if (result.cameOnline) {
    bus.emit("device.updated", { id: device.id, online: true, lastSeenAt: at.toISOString() });
  }
  publish(bus, result.slotResult);
  for (const event of result.extraEvents) bus.emit("event.created", event);
  return { ok: true };
}
