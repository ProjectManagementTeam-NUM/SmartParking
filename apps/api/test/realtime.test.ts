import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { ParkingUpdated } from "@smart-parking/shared";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createEventBus } from "../src/realtime/bus";
import { attachSocketIO } from "../src/realtime/socket";

let httpServer: HttpServer;
let io: Server | undefined;
let client: Socket | undefined;

afterEach(async () => {
  client?.close();
  await io?.close(); // also closes httpServer
  io = undefined;
});

async function start() {
  const bus = createEventBus();
  httpServer = createServer();
  io = attachSocketIO(httpServer, bus);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  const socket = connect(`http://localhost:${port}`, { transports: ["websocket"] });
  client = socket;
  await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
  return { bus, socket };
}

describe("Socket.IO adapter", () => {
  it("broadcasts parking.updated from the domain bus to browsers", async () => {
    const { bus, socket } = await start();
    const payload: ParkingUpdated = { id: "B", freeCount: 0, status: "FULL" };
    const received = new Promise<unknown>((resolve) => socket.on("parking.updated", resolve));

    bus.emit("parking.updated", payload);

    expect(await received).toEqual(payload);
  });

  it("stops listening to the bus when the server closes", async () => {
    const { bus } = await start();
    expect(bus.listenerCount("parking.updated")).toBe(1);
    await io!.close();
    io = undefined;
    expect(bus.listenerCount("parking.updated")).toBe(0);
  });
});
