import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { DeviceAvailabilityMessage } from "@smart-parking/shared";
import type { Server } from "socket.io";
import { io as connectSocketIO, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket, { type WebSocketServer } from "ws";
import { seed } from "../src/db/seed-data";
import { createEventBus, type EventBus } from "../src/realtime/bus";
import { attachDeviceWs } from "../src/realtime/device-ws";
import { attachSocketIO } from "../src/realtime/socket";
import { createTestPrisma, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;
let httpServer: HttpServer;
let io: Server | undefined;
let wss: WebSocketServer | undefined;
let sockets: WebSocket[] = [];
let browsers: Socket[] = [];
let bus: EventBus;
let port: number;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
  bus = createEventBus();
  httpServer = createServer();
  // Both adapters on one server, like production (Review Focus 4).
  io = attachSocketIO(httpServer, bus, { operatorToken: undefined });
  wss = attachDeviceWs(httpServer, { prisma, bus });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const s of sockets) s.terminate();
  for (const b of browsers) b.close();
  sockets = [];
  browsers = [];
  await io?.close(); // closes httpServer
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface DeviceClient {
  ws: WebSocket;
  messages: DeviceAvailabilityMessage[];
  waitFor: (count: number) => Promise<DeviceAvailabilityMessage[]>;
}

function connectDevice(deviceId: string, key: string): Promise<DeviceClient> {
  const ws = new WebSocket(
    `ws://localhost:${port}/ws/device?deviceId=${encodeURIComponent(deviceId)}&key=${encodeURIComponent(key)}`,
  );
  sockets.push(ws);
  const messages: DeviceAvailabilityMessage[] = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (data) => {
    messages.push(DeviceAvailabilityMessage.parse(JSON.parse(String(data))));
    for (const w of waiters) w();
  });
  const waitFor = (count: number) =>
    new Promise<DeviceAvailabilityMessage[]>((resolve) => {
      const check = () => messages.length >= count && resolve(messages);
      waiters.push(check);
      check();
    });
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve({ ws, messages, waitFor }));
    ws.once("error", reject);
  });
}

function rejectedStatus(deviceId: string, key: string): Promise<number> {
  const ws = new WebSocket(`ws://localhost:${port}/ws/device?deviceId=${deviceId}&key=${key}`);
  sockets.push(ws);
  return new Promise((resolve, reject) => {
    ws.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.once("open", () => reject(new Error("connection should have been refused")));
    ws.once("error", () => undefined);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("/ws/device", () => {
  it("sends the device's parking availability on connect", async () => {
    const device = await connectDevice("esp32-b", TEST_KEYS["esp32-b"]);
    expect(await device.waitFor(1)).toEqual([
      { type: "availability", parkingId: "B", status: "AVAILABLE", freeCount: 5 },
    ]);
  });

  it("sends every parking to the simulator", async () => {
    const sim = await connectDevice("simulator", TEST_KEYS.simulator);
    const messages = await sim.waitFor(2);
    expect(messages.map((m) => [m.parkingId, m.freeCount])).toEqual([
      ["A", 4],
      ["B", 5],
    ]);
  });

  it("forwards parking.updated only to devices of that parking", async () => {
    const b = await connectDevice("esp32-b", TEST_KEYS["esp32-b"]);
    const a = await connectDevice("esp32-a", TEST_KEYS["esp32-a"]);
    await b.waitFor(1);
    await a.waitFor(1);

    bus.emit("parking.updated", { id: "B", freeCount: 0, status: "FULL" });

    expect((await b.waitFor(2))[1]).toEqual({
      type: "availability",
      parkingId: "B",
      status: "FULL",
      freeCount: 0,
    });
    await sleep(50);
    expect(a.messages).toHaveLength(1);
  });

  it.each([
    ["a wrong key", "esp32-b", "nope"],
    ["another device's key", "esp32-b", TEST_KEYS["esp32-a"]],
    ["an unknown device", "ghost", "x"],
  ])("refuses %s with 401", async (_name, deviceId, key) => {
    expect(await rejectedStatus(deviceId, key)).toBe(401);
  });

  it("accepts the key in the X-Device-Key header (keeps it out of URLs and logs)", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/device?deviceId=esp32-a`, {
      headers: { "X-Device-Key": TEST_KEYS["esp32-a"] },
    });
    sockets.push(ws);
    const first = await new Promise((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(String(data))));
      ws.once("error", reject);
    });
    expect(first).toMatchObject({ parkingId: "A", freeCount: 4 });
  });

  it("refuses a connection without credentials", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/device`);
    sockets.push(ws);
    const status = await new Promise<number>((resolve) => {
      ws.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.once("error", () => undefined);
    });
    expect(status).toBe(401);
  });

  it("leaves Socket.IO working on the same server", async () => {
    const browser = connectSocketIO(`http://localhost:${port}`, { transports: ["websocket"] });
    browsers.push(browser);
    await new Promise<void>((resolve) => browser.on("connect", () => resolve()));
    const received = new Promise((resolve) => browser.on("parking.updated", resolve));

    bus.emit("parking.updated", { id: "A", freeCount: 3, status: "AVAILABLE" });

    expect(await received).toEqual({ id: "A", freeCount: 3, status: "AVAILABLE" });
  });

  it("removes its bus listener when the server closes", async () => {
    expect(bus.listenerCount("parking.updated")).toBe(2); // Socket.IO + device WS
    await io!.close();
    io = undefined;
    expect(bus.listenerCount("parking.updated")).toBe(0);
    expect(wss).toBeDefined();
  });
});

describe("/ws/device hardening", () => {
  it("survives an upgrade request with an unparseable URL", async () => {
    const { connect } = await import("node:net");
    const raw = connect(port, "127.0.0.1");
    raw.on("error", () => undefined);
    await new Promise<void>((resolve) => raw.once("connect", () => resolve()));
    raw.write(
      "GET http://[ HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
    );
    await new Promise<void>((resolve) => raw.once("close", () => resolve()));

    // The server is still up and still serves devices.
    const device = await connectDevice("esp32-b", TEST_KEYS["esp32-b"]);
    expect(await device.waitFor(1)).toHaveLength(1);
  });
});
