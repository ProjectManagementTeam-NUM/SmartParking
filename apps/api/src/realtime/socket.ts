import type { Server as HttpServer } from "node:http";
import { SOCKET_EVENTS, type ParkingUpdated } from "@smart-parking/shared";
import { Server } from "socket.io";
import type { EventBus } from "./bus";

export function attachSocketIO(httpServer: HttpServer, bus: EventBus): Server {
  const io = new Server(httpServer, { serveClient: false });

  const onParkingUpdated = (payload: ParkingUpdated) => {
    io.emit(SOCKET_EVENTS.parkingUpdated, payload);
  };
  bus.on("parking.updated", onParkingUpdated);
  httpServer.once("close", () => bus.off("parking.updated", onParkingUpdated));

  return io;
}
