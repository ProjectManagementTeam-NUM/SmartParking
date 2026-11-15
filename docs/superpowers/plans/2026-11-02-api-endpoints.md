# API Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every endpoint in spec §5 works end to end. A device `POST /api/ingest` changes slot state, writes an `Event`, and fans out over the domain bus to browsers (Socket.IO rooms) and gates (`/ws/device`). Silent devices go offline and their slots become `UNKNOWN`.

**Architecture:** Routes stay thin: they validate with `packages/shared` Zod schemas, then call domain services in `apps/api/src/domain/`. Services write to Postgres through Prisma, record an `Event` row, and emit on the in-process `EventBus`. They never touch transports. Two adapters subscribe to the bus: `realtime/socket.ts` (browsers) and `realtime/device-ws.ts` (ESP32/simulator). `createApp` receives its dependencies (`prisma`, `bus`, `operatorToken`, `now`), so every test runs against the real test database with a fake clock.

**Tech Stack:** Node 22, TypeScript strict ESM, Express 5, Zod 4, Prisma 6 + PostgreSQL 16, Socket.IO 4, `ws` 8 (new dependency), Vitest 3, supertest, socket.io-client.

**Spec:** `docs/superpowers/specs/2026-10-07-smart-parking-platform-design.md` (§4 data model, §5 API, §6 realtime, §7 gate, §11 error handling). Device wire format: `firmware/PROTOCOL.md`.

## Global Constraints

- Base path `/api`. Every request and response body is defined by a Zod schema in `packages/shared`. Change the contract there first.
- Slot state is `FREE | OCCUPIED | UNKNOWN`. UNKNOWN is never free. Devices may report only `FREE | OCCUPIED`.
- `freeCount`, `status` and `device.online` are derived, never stored. Use `computeAvailability` and `isDeviceOnline` from `@smart-parking/shared`.
- Device heartbeat is `DEVICE_HEARTBEAT_MS` (5 s). Offline after `DEVICE_TIMEOUT_MS` (15 s). The offline check runs every 5 s.
- Status codes: invalid input → `400` + Zod field errors; missing or wrong device key → `401`; device writes a slot it doesn't own → `403`; operator endpoints without a valid `Authorization: Bearer <OPERATOR_TOKEN>` → `401`.
- Error body shape: `{ error: string, message?: string, issues?: ... }`, matching the existing `not_found` / `bad_request` / `internal_error` codes in `app.ts`.
- Operator endpoints: `PATCH /slots/:id`, `GET /events`, `GET /pilot-requests`. If `OPERATOR_TOKEN` is unset or empty, they always return 401 (fail closed).
- Socket.IO events (names from `SOCKET_EVENTS`): `slot.updated` → rooms `parking:<id>` + `dashboard`; `parking.updated` → broadcast; `device.updated` → `dashboard`; `event.created` → `dashboard`.
- Device WS message is exactly `DeviceAvailabilityMessage`. The `simulator` device (parkingId `null`) receives messages for every parking.
- Integration tests use the shared test DB (`apps/api/test/helpers.ts`, reseeded `beforeEach`). Test files run serially.
- Git commits: one short imperative line, no attribution trailer (project convention, see git log).

## Calls made in this plan (not in the spec) — approved 2026-11-15

Change any of these before execution starts:

1. **Devices send their full slot list on every heartbeat.** Without it, a device that comes back after going offline leaves its slots `UNKNOWN` until a sensor changes. The server writes only slots whose state actually changed. `PROTOCOL.md` is updated to say this. An empty heartbeat stays valid.
2. **Gate decisions don't move `Gate.position`.** The barrier closes itself after the car passes, and the protocol has no "closed" event. `OPENED`/`DENIED` update `lastDecision` and `lastDecisionAt` only, so `position` stays `CLOSED`.
3. **Event `type` values:** `slot.changed` (device), `slot.overridden` (operator), `gate.opened`, `gate.denied`, `device.online`, `device.offline`.
4. **`parking.updated` is emitted only when `freeCount` changes.** Status follows from `freeCount`, so gates and browsers aren't spammed on no-op reports.
5. **Socket rooms:** a browser joins `parking:<id>` by emitting `subscribe` with `{ parkingId }`, which replaces its previous parking room. It joins `dashboard` only if it connects with `auth: { token: OPERATOR_TOKEN }`.
6. **Pilot requests:** `POST` returns `201` with the stored record. Field limits: name 1–100, organization 1–200, valid email, phone ≤ 40, siteCount integer 1–10 000, message ≤ 2000.
7. **`GET /events?limit=`:** an integer from 1 to 200, default 50.
8. **Operator override of an offline device's slot reverts to `UNKNOWN`** on the next offline check (spec §11: an offline device's slots are UNKNOWN). Known limitation, not handled. Approved for now; revisit in Task 6 (option: keep operator overrides by tracking `overriddenAt` on `Slot`).

## Review Focus

1. **A device reconnects after being offline.** Its next heartbeat (with the full slot list) must restore real states and emit `device.online` exactly once. Test in Task 6.
2. **One bad slot in an ingest batch.** `{ slots: [B1 ok, A1 not owned] }` must return 403 and write nothing (no partial update, no `lastSeenAt` bump). Test in Task 5.
3. **Key belongs to a different device.** esp32-a's key with `deviceId: "esp32-b"` must return 401, not act as esp32-b. Test in Task 5.
4. **Non-socket.io WebSocket upgrades.** Socket.IO destroys foreign upgrade requests by default, which would silently kill `/ws/device`. Test in Task 8 with both adapters attached to one server.
5. **Repeated identical reports.** A device re-sending `B1 OCCUPIED` every 5 s must not create Events or `parking.updated` emissions. Test in Task 4.

---

## File structure

| File | Responsibility |
| ---- | -------------- |
| `packages/shared/src/models.ts` | + `EventType`, `EventRecord`, `PilotRequest`, `PilotRequestInput`, `SlotOverrideBody` |
| `packages/shared/src/realtime.ts` | + `DeviceUpdated`, `SOCKET_CLIENT_EVENTS`, `SubscribeMessage`, `rooms` |
| `apps/api/src/http/validate.ts` | `parseOr400` helper |
| `apps/api/src/http/auth.ts` | `requireOperator`, `authenticateDevice` |
| `apps/api/src/domain/serialize.ts` | + `toDevice`, `toEventRecord`, `toPilotRequest` |
| `apps/api/src/domain/events.ts` | `recordEvent` |
| `apps/api/src/domain/slots.ts` | `applySlotChanges`, the one place that changes slot state |
| `apps/api/src/domain/ingest.ts` | `ingest`: heartbeat, slots and gate for one device POST |
| `apps/api/src/domain/offline.ts` | `markOfflineDevices`, `startOfflineMonitor` |
| `apps/api/src/routes/{slots,devices,events,pilot-requests,ingest}.ts` | thin routers |
| `apps/api/src/realtime/bus.ts` | + new domain events |
| `apps/api/src/realtime/socket.ts` | rooms and the new events |
| `apps/api/src/realtime/device-ws.ts` | `/ws/device` adapter |
| `apps/api/src/app.ts`, `src/server.ts` | wiring |
| `apps/api/test/*.test.ts` | one file per route or adapter |

---

### Task 1: Shared contract additions

**Files:**
- Modify: `packages/shared/src/models.ts`, `packages/shared/src/realtime.ts`
- Test: `packages/shared/test/schemas.test.ts`

**Interfaces:**
- Produces (all exported from `@smart-parking/shared`):
  - `EventType = z.enum(["slot.changed","slot.overridden","gate.opened","gate.denied","device.online","device.offline"])`
  - `EventRecord = z.object({ id: z.string(), type: EventType, parkingId: z.string().nullable(), slotId: z.string().nullable(), deviceId: z.string().nullable(), payload: z.record(z.string(), z.unknown()), createdAt: z.iso.datetime() })`
  - `PilotRequestInput = z.strictObject({ name, organization, email, phone?, siteCount?, message? })` with the limits from Call 6 (strings trimmed)
  - `PilotRequest = PilotRequestInput.extend({ id: z.string(), phone/siteCount/message nullable, createdAt: z.iso.datetime() })`
  - `SlotOverrideBody = z.strictObject({ state: SlotState })`
  - `DeviceUpdated = z.object({ id: z.string(), online: z.boolean(), lastSeenAt: z.iso.datetime().nullable() })`
  - `SOCKET_CLIENT_EVENTS = { subscribe: "subscribe" } as const`
  - `SubscribeMessage = z.strictObject({ parkingId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/) })`
  - `rooms = { parking: (id: string) => \`parking:${id}\`, dashboard: "dashboard" } as const`

- [ ] **Step 1: Write failing tests** in `schemas.test.ts`:

```ts
describe("PilotRequestInput", () => {
  it("accepts the minimum form and trims", () => {
    expect(PilotRequestInput.parse({ name: " Bat ", organization: "OPL", email: "a@b.mn" }))
      .toEqual({ name: "Bat", organization: "OPL", email: "a@b.mn" });
  });
  it("rejects a bad email, empty name and unknown keys", () => {
    expect(PilotRequestInput.safeParse({ name: "", organization: "O", email: "x" }).success).toBe(false);
    expect(PilotRequestInput.safeParse({ name: "a", organization: "O", email: "a@b.mn", extra: 1 }).success).toBe(false);
  });
  it("rejects siteCount 0 and 1.5", () => { /* both fail */ });
});
describe("SlotOverrideBody", () => {
  it("accepts UNKNOWN (operators may mark a slot unknown)", () => { /* success */ });
});
describe("SubscribeMessage", () => {
  it("rejects parking ids with odd characters", () => {
    expect(SubscribeMessage.safeParse({ parkingId: "A\u0000" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npm test -w @smart-parking/shared`. Expected: FAIL (exports missing).
- [ ] **Step 3: Add the schemas** listed in Interfaces.
- [ ] **Step 4: Run** `npm test -w @smart-parking/shared && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `Add event, pilot request and socket room contracts`

---

### Task 2: App dependencies, validation, operator auth, GET /slots, GET /devices

**Files:**
- Create: `apps/api/src/http/validate.ts`, `apps/api/src/http/auth.ts`, `apps/api/src/routes/slots.ts`, `apps/api/src/routes/devices.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/domain/serialize.ts`, `apps/api/test/helpers.ts`, `apps/api/test/parkings.test.ts` (new `createApp` signature)
- Test: `apps/api/test/slots.test.ts`, `apps/api/test/devices.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas.
- Produces:
  - `interface AppDeps { prisma: PrismaClient; bus: EventBus; operatorToken: string | undefined; now?: () => Date }`. `now` defaults to `() => new Date()`.
  - `parseOr400<T>(schema: z.ZodType<T>, input: unknown, res: Response): T | undefined`. On failure it sends `400 { error: "bad_request", issues: z.flattenError(err) }` and returns `undefined`.
  - `requireOperator(token: string | undefined): RequestHandler`. Checks `Authorization: Bearer <token>` with `crypto.timingSafeEqual` on equal-length buffers. On failure: `401 { error: "unauthorized" }`.
  - `toDevice(device: DbDevice, now: Date): Device`
  - test helper `createTestApp(prisma, overrides?: Partial<AppDeps>) → { app, bus, clock }`, where `clock.set(date)` controls `now`. `TEST_OPERATOR_TOKEN = "test-operator"`.

- [ ] **Step 1: Write failing tests**

`slots.test.ts`:
- `GET /api/slots` → 200, 12 slots, parsed by `z.array(Slot)`, ordered by id (A1…B6).
- `GET /api/slots?parkingId=B` → ids `B1..B6`.
- `GET /api/slots?parkingId=Z` → 200 `[]`.
- `GET /api/slots?parkingId=A%00` → 400 with `error: "bad_request"`.

`devices.test.ts`:
- `GET /api/devices` → 3 devices, all `online: false`, `lastSeenAt: null` on a fresh seed.
- With `lastSeenAt = clock − 14 s` on `esp32-a` → `online: true`. With `− 15 s` → `online: false` (boundary: `< DEVICE_TIMEOUT_MS`).

`auth.test.ts` (operator, via a dummy route mounted in the test):
- no header → 401; `Bearer wrong` → 401; `Bearer test-operator` → 200; app with `operatorToken: ""` → 401 even for `Bearer `.

- [ ] **Step 2: Run** `npm test -w @smart-parking/api`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the Interfaces. Mount `/api/slots` and `/api/devices` in `createApp`. Query schema for slots: `z.strictObject({ parkingId: <same regex as SubscribeMessage>.optional() })`.
- [ ] **Step 4: Run** `npm test -w @smart-parking/api && npm run typecheck`. Expected: PASS, including the existing parkings and realtime tests.
- [ ] **Step 5: Commit** `Add slots and devices endpoints with operator auth`

---

### Task 3: Event log and GET /events

**Files:**
- Create: `apps/api/src/domain/events.ts`, `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/realtime/bus.ts`, `apps/api/src/domain/serialize.ts`, `apps/api/src/app.ts`
- Test: `apps/api/test/events.test.ts`

**Interfaces:**
- Produces:
  - `DomainEvents` gains `"slot.updated": [Slot]`, `"device.updated": [DeviceUpdated]`, `"event.created": [EventRecord]`.
  - `type Tx = Prisma.TransactionClient | PrismaClient`
  - `recordEvent(tx: Tx, input: { type: EventType; parkingId?: string; slotId?: string; deviceId?: string; payload?: Record<string, unknown>; at: Date }): Promise<EventRecord>`. Inserts with `createdAt: at`. It does **not** emit. Callers emit `event.created` after their transaction commits.
  - `toEventRecord(row: DbEvent): EventRecord`

- [ ] **Step 1: Write failing tests**
  - Insert 3 events through `recordEvent` with increasing `at`. `GET /api/events` with the operator header → newest first, each parsed by `EventRecord`.
  - `?limit=2` → 2 items. `?limit=0`, `?limit=201`, `?limit=abc` → 400.
  - No token → 401.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.** Query schema: `z.strictObject({ limit: z.coerce.number().int().min(1).max(200).default(50) })`.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `Add event log and events endpoint`

---

### Task 4: Slot change service and PATCH /slots/:id

**Files:**
- Create: `apps/api/src/domain/slots.ts`
- Modify: `apps/api/src/routes/slots.ts`
- Test: `apps/api/test/slot-override.test.ts`

**Interfaces:**
- Consumes: `recordEvent`, `EventBus`, `toSlot`, `computeAvailability`.
- Produces:
  - `applySlotChanges(tx: Tx, changes: ReadonlyArray<{ slotId: string; state: SlotState }>, ctx: { at: Date; eventType: "slot.changed" | "slot.overridden"; deviceId?: string }): Promise<SlotChangeResult>`
  - `interface SlotChangeResult { slots: Slot[]; events: EventRecord[]; parkings: ParkingUpdated[] }`. `slots` holds only the slots whose state actually changed. `parkings` holds only parkings whose `freeCount` changed (Call 4). Event payload: `{ from, to }`.
  - `publish(bus: EventBus, result: SlotChangeResult): void` emits `slot.updated` for each slot, `parking.updated` for each parking, and `event.created` for each event, in that order. Call it **after** the transaction commits.

- [ ] **Step 1: Write failing tests** (collect bus emissions into an array):
  - `PATCH /api/slots/B2 {state:"OCCUPIED"}` with operator → 200 body `Slot` with `state: "OCCUPIED"`. Emissions: `slot.updated(B2)`, `parking.updated {id:"B", freeCount:4, status:"AVAILABLE"}`, `event.created {type:"slot.overridden", slotId:"B2", payload:{from:"FREE",to:"OCCUPIED"}}`.
  - Same PATCH twice → the second returns 200 and emits **nothing**, and the Event count is unchanged (Review Focus 5).
  - Set B2…B6 OCCUPIED one by one → the last emission has `{freeCount:0, status:"FULL"}`.
  - `PATCH /api/slots/Z9` → 404 `not_found`. Body `{state:"MAYBE"}` → 400. Body `{}` → 400. No token → 401.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.** Inside `prisma.$transaction(async tx => …)`: read the affected parkings' slots before and after the change, and compare `freeCount`.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `Add slot change service and operator override`

---

### Task 5: POST /ingest

**Files:**
- Create: `apps/api/src/domain/ingest.ts`, `apps/api/src/routes/ingest.ts`
- Modify: `apps/api/src/http/auth.ts`, `apps/api/src/app.ts`, `firmware/PROTOCOL.md` (Call 1: add one bullet under §1, "Include every slot you own in every POST, heartbeats included.")
- Test: `apps/api/test/ingest.test.ts`

**Interfaces:**
- Consumes: `applySlotChanges`, `publish`, `recordEvent`, `hashDeviceKey`, `isDeviceOnline`, `IngestBody`.
- Produces:
  - `authenticateDevice(prisma, deviceId: string, key: string | undefined): Promise<DbDevice | null>`. Compares `hashDeviceKey(key)` with `apiKeyHash` using `timingSafeEqual`. Returns null for an unknown device, a missing key or a wrong key. The device WS (Task 8) reuses it.
  - `ingest(deps: { prisma; bus; now }, device: DbDevice, body: IngestBody): Promise<{ ok: true } | { ok: false; forbiddenSlotIds: string[] }>`

Order inside `ingest` (all-or-nothing):
1. Load the reported slots. Any id that is missing or has `deviceId !== device.id` → return `forbiddenSlotIds`. **Nothing is written.**
2. Transaction: update `lastSeenAt = now` and `firmwareVersion` (if given). Run `applySlotChanges(..., { eventType: "slot.changed", deviceId })`. For `gate`: update `Gate.lastDecision` and `lastDecisionAt` for `device.parkingId` (Call 2) and record a `gate.opened`/`gate.denied` event. If the device was offline before (`!isDeviceOnline(prevLastSeenAt, now)`), record a `device.online` event.
3. After commit: `publish(...)`, and on an online transition also emit `device.updated {online:true}` and `event.created`.

Route: `parseOr400(IngestBody)` → `authenticateDevice(body.deviceId, req.get("X-Device-Key"))` → 401 `{error:"unauthorized"}` → `ingest` → 403 `{error:"forbidden", message:"Device esp32-b does not own slot A1"}` or `204`.

- [ ] **Step 1: Write failing tests**
  - Heartbeat `{deviceId:"esp32-a"}` with the right key → 204. `lastSeenAt` equals the clock time. Emits `device.updated {id:"esp32-a", online:true}` and an `event.created` of type `device.online`.
  - A second heartbeat 5 s later → 204, emits nothing (already online).
  - `esp32-b` reports `B1 OCCUPIED` while B2–B6 are OCCUPIED → emits `parking.updated {id:"B", freeCount:0, status:"FULL"}`. Then `{gate:{event:"DENIED"}}` → Gate B `lastDecision: "DENIED"`, `position: "CLOSED"`, and an event of type `gate.denied`.
  - **Review Focus 2:** `esp32-b` with `slots:[{B1 OCCUPIED},{A1 FREE}]` → 403. B1 is still `UNKNOWN` and `lastSeenAt` is still `null`.
  - **Review Focus 3:** `deviceId:"esp32-b"` with header `test-key-a` → 401. No header → 401. `deviceId:"ghost"` → 401.
  - Body `{deviceId:"esp32-a", slot:[]}` (misspelled key) → 400.
  - Simulator key writing `B2` → 204 (owns simulated slots).
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** the Interfaces and the order above. Update `PROTOCOL.md`.
- [ ] **Step 4: Run** `npm test` (the root run includes the shared protocol contract test) and expect PASS.
- [ ] **Step 5: Commit** `Add device ingest endpoint`

---

### Task 6: Offline detection

**Files:**
- Create: `apps/api/src/domain/offline.ts`
- Test: `apps/api/test/offline.test.ts`

**Interfaces:**
- Produces:
  - `markOfflineDevices(deps: { prisma; bus; now }): Promise<string[]>` returns the ids of devices marked offline in this pass. A device goes offline when `lastSeenAt` is not null, `!isDeviceOnline(lastSeenAt, now)`, **and** it owns at least one slot that isn't `UNKNOWN`. In one transaction: `applySlotChanges` to set its slots `UNKNOWN` (`eventType: "slot.changed"`) and record a `device.offline` event. After commit: `publish` and emit `device.updated {online:false}`.
  - `startOfflineMonitor(deps, intervalMs = 5_000): () => void` runs `setInterval`, logs and swallows errors, and returns `stop`.

- [ ] **Step 1: Write failing tests**
  - esp32-b reports `B1 FREE` at t0. `markOfflineDevices` at t0+14 s → `[]`. At t0+15 s → `["esp32-b"]`: B1 `UNKNOWN`, emits `device.updated {online:false}`, `parking.updated {id:"B", freeCount:5}` (6 → 5), and a `device.offline` event.
  - Running it again → `[]` (only one offline event per outage).
  - A fresh seed (lastSeenAt null) → `[]`.
  - **Review Focus 1:** esp32-a heartbeat with `A1 FREE` → clock +16 s → `markOfflineDevices` → heartbeat with `slots:[A1 FREE, A2 OCCUPIED]` → A1 `FREE`, A2 `OCCUPIED`, and exactly two `device.online` events in total (one per outage), with one `device.offline` between them.
  - `startOfflineMonitor` with `vi.useFakeTimers()` calls through once per interval, and `stop()` halts it.
- [ ] **Step 2: Run** and expect FAIL. **Step 3: Implement.** **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `Mark silent devices offline`

---

### Task 7: Socket.IO rooms and new events

**Files:**
- Modify: `apps/api/src/realtime/socket.ts`
- Test: `apps/api/test/realtime.test.ts`

**Interfaces:**
- Produces: `attachSocketIO(httpServer, bus, opts: { operatorToken: string | undefined }): Server`, created with `destroyUpgrade: false` (Review Focus 4).
  - On connection: if `socket.handshake.auth.token` equals the operator token (timing-safe, non-empty), join `rooms.dashboard`.
  - `subscribe`: validate with `SubscribeMessage` (ignore invalid input), leave any `parking:*` room, join `rooms.parking(id)`.
  - Routing as in Global Constraints. Remove every bus listener on `httpServer` close.

- [ ] **Step 1: Write failing tests** (extend the existing `start()` helper with `auth` and a second client):
  - A driver subscribed to `B` receives `slot.updated` for B2 and not for A3. After `subscribe {parkingId:"A"}` it receives A3 and no longer B2.
  - A dashboard client (correct token) receives `slot.updated` A3, `device.updated` and `event.created`. A client with a wrong token receives neither `device.updated` nor `event.created`.
  - `parking.updated` still reaches a client in no room.
  - After close, `bus.listenerCount(e)` is 0 for all four events.
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS).
- [ ] **Step 5: Commit** `Route realtime events to parking and dashboard rooms`

---

### Task 8: Device WebSocket /ws/device

**Files:**
- Create: `apps/api/src/realtime/device-ws.ts`
- Modify: `apps/api/package.json` (add `ws@^8`, dev `@types/ws@^8`)
- Test: `apps/api/test/device-ws.test.ts`

**Interfaces:**
- Consumes: `authenticateDevice`, `computeAvailability`, `DeviceAvailabilityMessage`.
- Produces: `attachDeviceWs(httpServer, deps: { prisma; bus }): WebSocketServer`, using `new WebSocketServer({ noServer: true })` and an `httpServer.on("upgrade")` handler that handles only `pathname === "/ws/device"`.
  - Bad or missing `deviceId`/`key` → write `HTTP/1.1 401 Unauthorized\r\n\r\n` and destroy the socket.
  - On connect, send one `availability` message per relevant parking (the device's own parking, or every parking for `parkingId === null`), read from the DB.
  - On `parking.updated`, send to every open client whose parking matches (or whose parking is null). Validate outgoing messages with `DeviceAvailabilityMessage.parse`.
  - Remove the bus listener on server close.

- [ ] **Step 1: Write failing tests**, with Socket.IO **and** device WS attached to one `http.Server` (Review Focus 4):
  - `esp32-b` with the right key connects and immediately receives `{type:"availability", parkingId:"B", status:"AVAILABLE", freeCount:5}`.
  - `simulator` receives two messages, A and B.
  - `bus.emit("parking.updated", {id:"B", freeCount:0, status:"FULL"})` → esp32-b receives it, and an esp32-a client does not.
  - Wrong key → the connection fails with `unexpected-response` status 401.
  - A Socket.IO client still connects and receives `parking.updated` on the same server.
- [ ] **Step 2–4:** `npm install`, run (FAIL) → implement → run (PASS).
- [ ] **Step 5: Commit** `Add device WebSocket for gate availability`

---

### Task 9: Wire the server and smoke test

**Files:**
- Modify: `apps/api/src/server.ts`, `README.md` (an "API endpoints" table listing all 9 endpoints and their auth)

- [ ] **Step 1: Wire `server.ts`:** a single `bus`; `createApp({ prisma, bus, operatorToken: process.env.OPERATOR_TOKEN })`; `attachSocketIO(..., { operatorToken })`; `attachDeviceWs`; `startOfflineMonitor`. Shutdown stops the monitor and closes the WS server, then `io`, then Prisma.
- [ ] **Step 2: Smoke test** (`npm run db:up && npm run db:seed && npm run dev -w @smart-parking/api`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/ingest \
  -H 'Content-Type: application/json' -H 'X-Device-Key: dev-esp32-b' \
  -d '{"deviceId":"esp32-b","slots":[{"id":"B1","state":"OCCUPIED"}]}'      # 204
curl -s localhost:3000/api/devices | jq '.[] | select(.id=="esp32-b").online'  # true
curl -s -H 'Authorization: Bearer dev-operator' 'localhost:3000/api/events?limit=5' | jq '.[].type'
# after ~20 s of silence:
curl -s 'localhost:3000/api/slots?parkingId=B' | jq '.[0].state'                # "UNKNOWN"
```

- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run lint`. Expected: all green.
- [ ] **Step 4: Commit** `Wire ingest, device socket and offline monitor into server`
