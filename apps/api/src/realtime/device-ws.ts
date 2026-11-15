import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import {
  computeAvailability,
  DeviceAvailabilityMessage,
  type ParkingUpdated,
} from "@smart-parking/shared";
import { WebSocket, WebSocketServer } from "ws";
import { authenticateDevice } from "../http/auth";
import type { EventBus } from "./bus";

export const DEVICE_WS_PATH = "/ws/device";

/**
 * Gate transport: `/ws/device?deviceId=…` with the key in the `X-Device-Key` header
 * (or, for older firmware, `&key=…`). Sends `availability` for the device's parking
 * (every parking for a device without one, i.e. the simulator) on connect and on every
 * `parking.updated`. Other upgrade paths are left to Socket.IO.
 */
export function attachDeviceWs(
  httpServer: HttpServer,
  deps: { prisma: PrismaClient; bus: EventBus },
): WebSocketServer {
  const { prisma, bus } = deps;
  const wss = new WebSocketServer({ noServer: true });
  /** Parking each connected device listens to; null = all parkings. */
  const parkingOf = new Map<WebSocket, string | null>();

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== DEVICE_WS_PATH) return;
    socket.on("error", () => socket.destroy());

    void (async () => {
      const deviceId = url.searchParams.get("deviceId") ?? "";
      // Prefer the header: query strings end up in proxy and access logs.
      const key =
        headerValue(req.headers["x-device-key"]) ?? url.searchParams.get("key") ?? undefined;
      const device = await authenticateDevice(prisma, deviceId, key).catch(() => null);
      if (!device) {
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        parkingOf.set(ws, device.parkingId);
        ws.on("close", () => parkingOf.delete(ws));
        ws.on("error", () => ws.terminate());
        void sendCurrent(ws, device.parkingId);
      });
    })();
  };

  async function sendCurrent(ws: WebSocket, parkingId: string | null) {
    try {
      const parkings = await prisma.parking.findMany({
        where: parkingId ? { id: parkingId } : {},
        include: { slots: true },
        orderBy: { id: "asc" },
      });
      for (const parking of parkings) {
        const { freeCount, status } = computeAvailability(parking.slots);
        send(ws, { id: parking.id, freeCount, status });
      }
    } catch (err) {
      console.error("device ws: initial availability failed", err);
    }
  }

  function send(ws: WebSocket, update: ParkingUpdated) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const message = DeviceAvailabilityMessage.parse({
      type: "availability",
      parkingId: update.id,
      status: update.status,
      freeCount: update.freeCount,
    });
    ws.send(JSON.stringify(message));
  }

  const onParkingUpdated = (update: ParkingUpdated) => {
    for (const [ws, parkingId] of parkingOf) {
      if (parkingId === null || parkingId === update.id) send(ws, update);
    }
  };

  httpServer.on("upgrade", onUpgrade);
  bus.on("parking.updated", onParkingUpdated);
  httpServer.once("close", () => {
    httpServer.off("upgrade", onUpgrade);
    bus.off("parking.updated", onParkingUpdated);
    for (const ws of parkingOf.keys()) ws.terminate();
    wss.close();
  });

  return wss;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
