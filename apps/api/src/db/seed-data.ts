import type { Prisma, PrismaClient } from "@prisma/client";
import { hashDeviceKey } from "../domain/device-keys";

export const DEVICE_IDS = ["esp32-a", "esp32-b", "simulator"] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

const PARKINGS: Prisma.ParkingCreateManyInput[] = [
  { id: "A", name: "Parking A", address: "Sukhbaatar Square, Ulaanbaatar", lat: 47.9186, lng: 106.9177 },
  { id: "B", name: "Parking B", address: "Peace Avenue, Ulaanbaatar", lat: 47.9135, lng: 106.9156 },
];

function slotsFor(
  parkingId: "A" | "B",
  liveCount: number,
  liveDevice: DeviceId,
): Prisma.SlotCreateManyInput[] {
  return Array.from({ length: 6 }, (_, index) => {
    const id = `${parkingId}${index + 1}`;
    const live = index < liveCount;
    return {
      id,
      parkingId,
      label: id,
      source: live ? "LIVE" : "SIMULATED",
      // Live slots stay UNKNOWN until their ESP32 reports; simulated slots start FREE.
      state: live ? "UNKNOWN" : "FREE",
      deviceId: live ? liveDevice : "simulator",
    };
  });
}

/** Resets the database to the demo baseline. Deletes all existing data. */
export async function seed(prisma: PrismaClient, keys: Record<DeviceId, string>): Promise<void> {
  await prisma.$transaction([
    prisma.event.deleteMany(),
    prisma.pilotRequest.deleteMany(),
    prisma.gate.deleteMany(),
    prisma.slot.deleteMany(),
    prisma.device.deleteMany(),
    prisma.parking.deleteMany(),
    prisma.parking.createMany({ data: PARKINGS }),
    prisma.device.createMany({
      data: [
        { id: "esp32-a", parkingId: "A", apiKeyHash: hashDeviceKey(keys["esp32-a"]) },
        { id: "esp32-b", parkingId: "B", apiKeyHash: hashDeviceKey(keys["esp32-b"]) },
        { id: "simulator", parkingId: null, apiKeyHash: hashDeviceKey(keys.simulator) },
      ],
    }),
    prisma.slot.createMany({ data: [...slotsFor("A", 2, "esp32-a"), ...slotsFor("B", 1, "esp32-b")] }),
    prisma.gate.createMany({ data: [{ parkingId: "A" }, { parkingId: "B" }] }),
  ]);
}
