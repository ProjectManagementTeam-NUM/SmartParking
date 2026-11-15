import type { Server as HttpServer } from "node:http";
import {
  rooms,
  SOCKET_CLIENT_EVENTS,
  SOCKET_EVENTS,
  SubscribeMessage,
  type DeviceUpdated,
  type EventRecord,
  type ParkingUpdated,
  type Slot,
} from "@smart-parking/shared";
import { Server } from "socket.io";
import { tokensMatch } from "../http/auth";
import type { EventBus } from "./bus";

const PARKING_ROOM_PREFIX = rooms.parking("");

/**
 * Browser transport. Drivers join one `parking:<id>` room via `subscribe`; clients that connect
 * with `auth.token` equal to the operator token join `dashboard`.
 */
export function attachSocketIO(
  httpServer: HttpServer,
  bus: EventBus,
  opts: { operatorToken: string | undefined },
): Server {
  // destroyUpgrade: false leaves non-Socket.IO upgrades (/ws/device) to other handlers.
  const io = new Server(httpServer, { serveClient: false, destroyUpgrade: false });

  io.on("connection", (socket) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token === "string" && tokensMatch(opts.operatorToken, token)) {
      void socket.join(rooms.dashboard);
    }

    socket.on(SOCKET_CLIENT_EVENTS.subscribe, (message: unknown) => {
      const parsed = SubscribeMessage.safeParse(message);
      if (!parsed.success) return;
      for (const room of socket.rooms) {
        if (room.startsWith(PARKING_ROOM_PREFIX)) void socket.leave(room);
      }
      void socket.join(rooms.parking(parsed.data.parkingId));
    });
  });

  const listeners = {
    "parking.updated": (payload: ParkingUpdated) => {
      io.emit(SOCKET_EVENTS.parkingUpdated, payload);
    },
    "slot.updated": (slot: Slot) => {
      io.to([rooms.parking(slot.parkingId), rooms.dashboard]).emit(SOCKET_EVENTS.slotUpdated, slot);
    },
    "device.updated": (payload: DeviceUpdated) => {
      io.to(rooms.dashboard).emit(SOCKET_EVENTS.deviceUpdated, payload);
    },
    "event.created": (event: EventRecord) => {
      io.to(rooms.dashboard).emit(SOCKET_EVENTS.eventCreated, event);
    },
  };
  bus.on("parking.updated", listeners["parking.updated"]);
  bus.on("slot.updated", listeners["slot.updated"]);
  bus.on("device.updated", listeners["device.updated"]);
  bus.on("event.created", listeners["event.created"]);

  httpServer.once("close", () => {
    bus.off("parking.updated", listeners["parking.updated"]);
    bus.off("slot.updated", listeners["slot.updated"]);
    bus.off("device.updated", listeners["device.updated"]);
    bus.off("event.created", listeners["event.created"]);
  });

  return io;
}
