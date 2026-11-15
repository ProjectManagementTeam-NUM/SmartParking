import type {
  Device as DbDevice,
  Event as DbEvent,
  Gate as DbGate,
  Parking as DbParking,
  PilotRequest as DbPilotRequest,
  Slot as DbSlot,
} from "@prisma/client";
import {
  computeAvailability,
  isDeviceOnline,
  type Device,
  EventType,
  type EventRecord,
  type Gate,
  type ParkingDetail,
  type ParkingSummary,
  type PilotRequest,
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

export function toDevice(device: DbDevice, now: Date): Device {
  return {
    id: device.id,
    parkingId: device.parkingId,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    firmwareVersion: device.firmwareVersion,
    online: isDeviceOnline(device.lastSeenAt, now),
  };
}

export function toEventRecord(row: DbEvent): EventRecord {
  return {
    id: row.id,
    type: EventType.parse(row.type),
    parkingId: row.parkingId,
    slotId: row.slotId,
    deviceId: row.deviceId,
    payload: isJsonObject(row.payload) ? row.payload : {},
    createdAt: row.createdAt.toISOString(),
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toPilotRequest(row: DbPilotRequest): PilotRequest {
  return {
    id: row.id,
    name: row.name,
    organization: row.organization,
    email: row.email,
    phone: row.phone,
    siteCount: row.siteCount,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}
