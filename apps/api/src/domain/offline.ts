import { DEVICE_HEARTBEAT_MS, DEVICE_TIMEOUT_MS, isDeviceOnline } from "@smart-parking/shared";
import type { IngestDeps } from "./ingest";
import { recordEvent } from "./events";
import { applySlotChanges, publish } from "./slots";

/**
 * Marks silent devices offline: their slots become UNKNOWN and a `device.offline` event is
 * recorded, once per outage. A device counts as announced-online while its latest
 * online/offline event is `device.online`, so slots an operator overrides during an outage
 * are left alone. Returns the ids marked offline in this pass.
 */
export async function markOfflineDevices(deps: IngestDeps): Promise<string[]> {
  const { prisma, bus } = deps;
  const at = deps.now();
  const silent = await prisma.device.findMany({
    where: { lastSeenAt: { not: null, lte: new Date(at.getTime() - DEVICE_TIMEOUT_MS) } },
    orderBy: { id: "asc" },
  });

  const marked: string[] = [];
  for (const device of silent) {
    const latest = await prisma.event.findFirst({
      where: { deviceId: device.id, type: { in: ["device.online", "device.offline"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (latest?.type !== "device.online") continue;

    const result = await prisma.$transaction(async (tx) => {
      // A heartbeat may have arrived since the scan.
      const fresh = await tx.device.findUniqueOrThrow({ where: { id: device.id } });
      if (isDeviceOnline(fresh.lastSeenAt, at)) return null;
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
      return { slotResult, event, lastSeenAt: fresh.lastSeenAt };
    });
    if (!result) continue;

    publish(bus, result.slotResult);
    bus.emit("device.updated", {
      id: device.id,
      online: false,
      lastSeenAt: result.lastSeenAt?.toISOString() ?? null,
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
