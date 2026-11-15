import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { DeviceUpdated, EventRecord, ParkingUpdated, Slot } from "@smart-parking/shared";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { createEventBus, type EventBus } from "../src/realtime/bus";
import { attachSocketIO } from "../src/realtime/socket";
import { TEST_OPERATOR_TOKEN } from "./helpers";

let httpServer: HttpServer;
let io: Server | undefined;
let clients: Socket[] = [];

afterEach(async () => {
  for (const c of clients) c.close();
  clients = [];
  await io?.close(); // also closes httpServer
  io = undefined;
});

let port: number;

async function start(): Promise<EventBus> {
  const bus = createEventBus();
  httpServer = createServer();
  io = attachSocketIO(httpServer, bus, { operatorToken: TEST_OPERATOR_TOKEN });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
  return bus;
}

async function client(auth?: {
  token: string;
}): Promise<{ socket: Socket; received: Map<string, unknown[]> }> {
  const socket = connect(`http://localhost:${port}`, { transports: ["websocket"], auth });
  clients.push(socket);
  const received = new Map<string, unknown[]>();
  socket.onAny((event: string, payload: unknown) => {
    received.set(event, [...(received.get(event) ?? []), payload]);
  });
  await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
  return { socket, received };
}

/** Gives the server and clients time to deliver in-flight messages over localhost. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

const slot = (id: string): Slot => ({
  id,
  parkingId: id[0]!,
  label: id,
  state: "OCCUPIED",
  source: "SIMULATED",
  deviceId: "simulator",
  updatedAt: "2026-11-15T12:00:00.000Z",
});
const device: DeviceUpdated = {
  id: "esp32-a",
  online: true,
  lastSeenAt: "2026-11-15T12:00:00.000Z",
};
const event: EventRecord = {
  id: "e1",
  type: "device.online",
  parkingId: "A",
  slotId: null,
  deviceId: "esp32-a",
  payload: {},
  createdAt: "2026-11-15T12:00:00.000Z",
};

describe("Socket.IO adapter", () => {
  it("broadcasts parking.updated to every client, even one in no room", async () => {
    const bus = await start();
    const { received } = await client();
    const payload: ParkingUpdated = { id: "B", freeCount: 0, status: "FULL" };

    bus.emit("parking.updated", payload);
    await settle();

    expect(received.get("parking.updated")).toEqual([payload]);
  });

  it("sends slot.updated only to the parking a driver subscribed to, and follows a switch", async () => {
    const bus = await start();
    const { socket, received } = await client();
    socket.emit("subscribe", { parkingId: "B" });
    await settle();

    bus.emit("slot.updated", slot("B2"));
    bus.emit("slot.updated", slot("A3"));
    await settle();
    expect(received.get("slot.updated")).toEqual([slot("B2")]);

    socket.emit("subscribe", { parkingId: "A" });
    await settle();
    bus.emit("slot.updated", slot("B2"));
    bus.emit("slot.updated", slot("A3"));
    await settle();
    expect(received.get("slot.updated")).toEqual([slot("B2"), slot("A3")]);
  });

  it("ignores an invalid subscribe message", async () => {
    const bus = await start();
    const { socket, received } = await client();
    socket.emit("subscribe", { parkingId: "B\u0000" });
    socket.emit("subscribe", "B");
    await settle();
    bus.emit("slot.updated", slot("B2"));
    await settle();
    expect(received.get("slot.updated")).toBeUndefined();
  });

  it("sends dashboard events only to clients with the operator token", async () => {
    const bus = await start();
    const dashboard = await client({ token: TEST_OPERATOR_TOKEN });
    const intruder = await client({ token: "wrong" });
    const driver = await client();

    bus.emit("slot.updated", slot("A3"));
    bus.emit("device.updated", device);
    bus.emit("event.created", event);
    await settle();

    expect(dashboard.received.get("slot.updated")).toEqual([slot("A3")]);
    expect(dashboard.received.get("device.updated")).toEqual([device]);
    expect(dashboard.received.get("event.created")).toEqual([event]);
    for (const other of [intruder, driver]) {
      expect(other.received.get("slot.updated")).toBeUndefined();
      expect(other.received.get("device.updated")).toBeUndefined();
      expect(other.received.get("event.created")).toBeUndefined();
    }
  });

  it("stops listening to the bus when the server closes", async () => {
    const bus = await start();
    const events = ["parking.updated", "slot.updated", "device.updated", "event.created"] as const;
    for (const e of events) expect(bus.listenerCount(e)).toBe(1);
    await io!.close();
    io = undefined;
    for (const e of events) expect(bus.listenerCount(e)).toBe(0);
  });
});
