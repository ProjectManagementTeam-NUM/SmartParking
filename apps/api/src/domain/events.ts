import type { Prisma, PrismaClient } from "@prisma/client";
import type { EventRecord, EventType } from "@smart-parking/shared";
import { toEventRecord } from "./serialize";

/** A Prisma client or an interactive-transaction client. */
export type Tx = Prisma.TransactionClient | PrismaClient;

export interface EventInput {
  type: EventType;
  parkingId?: string | null;
  slotId?: string;
  deviceId?: string;
  payload?: Record<string, unknown>;
  at: Date;
}

/** Inserts an Event row. Does not emit: callers emit `event.created` after their transaction commits. */
export async function recordEvent(tx: Tx, input: EventInput): Promise<EventRecord> {
  const row = await tx.event.create({
    data: {
      type: input.type,
      parkingId: input.parkingId ?? null,
      slotId: input.slotId ?? null,
      deviceId: input.deviceId ?? null,
      payload: (input.payload ?? {}) as Prisma.InputJsonObject,
      createdAt: input.at,
    },
  });
  return toEventRecord(row);
}
