import type { Gate as DbGate, Parking as DbParking, Slot as DbSlot } from "@prisma/client";
import {
  computeAvailability,
  type Gate,
  type ParkingDetail,
  type ParkingSummary,
  type Slot,
} from "@smart-parking/shared";

export function toSlot(slot: DbSlot): Slot {
  return {
    id: slot.id,
    parkingId: slot.parkingId,
    label: slot.label,
    state: slot.state,
    source: slot.source,
    deviceId: slot.deviceId,
    updatedAt: slot.updatedAt.toISOString(),
  };
}

export function toGate(gate: DbGate): Gate {
  return {
    parkingId: gate.parkingId,
    position: gate.position,
    lastDecision: gate.lastDecision,
    lastDecisionAt: gate.lastDecisionAt?.toISOString() ?? null,
  };
}

export function toParkingSummary(parking: DbParking & { slots: DbSlot[] }): ParkingSummary {
  return {
    id: parking.id,
    name: parking.name,
    address: parking.address,
    lat: parking.lat,
    lng: parking.lng,
    ...computeAvailability(parking.slots),
  };
}

export function toParkingDetail(
  parking: DbParking & { slots: DbSlot[]; gate: DbGate | null },
): ParkingDetail {
  return {
    ...toParkingSummary(parking),
    slots: parking.slots.map(toSlot),
    gate: parking.gate ? toGate(parking.gate) : null,
  };
}
