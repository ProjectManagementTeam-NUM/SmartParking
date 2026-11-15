import { DEVICE_HEARTBEAT_MS, DEVICE_TIMEOUT_MS } from "@smart-parking/shared";
import type { IngestDeps } from "./ingest";
import { recordEvent } from "./events";
import { applySlotChanges, publish } from "./slots";
import { withWriteLock } from "./write-lock";

/**
 * Marks silent devices offline: their slots become UNKNOWN and a `device.offline` event is
 * recorded, once per outage (only devices with `announcedOnline` are considered, and the flag
 * is claimed atomically). Slots an operator overrides during an outage are left alone.
 * Returns the ids marked offline in this pass.
 */
export function markOfflineDevices(deps: IngestDeps): Promise<string[]> {
  return withWriteLock(() => markOfflineLocked(deps));
}

async function markOfflineLocked(deps: IngestDeps): Promise<string[]> {
  const { prisma, bus } = deps;
  const at = deps.now();
  const cutoff = new Date(at.getTime() - DEVICE_TIMEOUT_MS);
  const silent = await prisma.device.findMany({
    where: { announcedOnline: true, lastSeenAt: { lte: cutoff } },
    orderBy: { id: "asc" },
  });

  const marked: string[] = [];
  for (const device of silent) {
    const result = await prisma.$transaction(async (tx) => {
      // Claim the outage. Blocks on a concurrent heartbeat's row lock and re-checks after it.
      const claimed = await tx.device.updateMany({
        where: { id: device.id, announcedOnline: true, lastSeenAt: { lte: cutoff } },
        data: { announcedOnline: false },
      });
      if (claimed.count === 0) return null;
      const slots = await tx.slot.findMany({
        where: { deviceId: device.id, state: { not: "UNKNOWN" } },
        select: { id: true },
      });
      const slotResult = await applySlotChanges(
        tx,
        slots.map((s) => ({ slotId: s.id, state: "UNKNOWN" as const })),
        { at, eventType: "slot.changed", deviceId: device.id },
      );
      const event = await recordEvent(tx, {
        type: "device.offline",
        parkingId: device.parkingId,
        deviceId: device.id,
        at,
      });
      return { slotResult, event };
    });
    if (!result) continue;

    publish(bus, result.slotResult);
    bus.emit("device.updated", {
      id: device.id,
      online: false,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    });
    bus.emit("event.created", result.event);
    marked.push(device.id);
  }
  return marked;
}

/** Runs `markOfflineDevices` every `intervalMs`. Errors are logged, not thrown. Returns `stop`. */
export function startOfflineMonitor(
  deps: IngestDeps,
  intervalMs = DEVICE_HEARTBEAT_MS,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // skip a tick rather than overlap a slow pass
    running = true;
    markOfflineDevices(deps)
      .catch((err: unknown) => console.error("offline monitor failed", err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}
