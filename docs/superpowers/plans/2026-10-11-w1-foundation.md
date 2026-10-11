# W1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable monorepo skeleton: `npm install && npm run db:up && npm run db:migrate && npm run dev` starts the API (seeded with parkings A/B and 12 slots) plus three Vite apps that show live parking availability in Mongolian or English.

**Architecture:** npm workspaces monorepo. `packages/shared` holds the Zod contract and pure domain rules. `apps/api` (Express + Socket.IO + Prisma/Postgres) is the only data owner. `packages/api-client`, `packages/ui` and `packages/i18n` are shared by three Vite + React apps, which talk to the API same-origin through the Vite dev proxy. Firmware, hardware and docs get their folders and the device protocol contract.

**Tech Stack:** Node 22, npm workspaces, TypeScript 5, Zod 4, Express 5, Socket.IO 4, Prisma 6 + PostgreSQL 16 (Docker), Vite 7, React 19, TanStack Query 5, Tailwind 4, i18next + react-i18next, vite-plugin-pwa, Vitest 3, Testing Library, supertest, ESLint 9, Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-smart-parking-platform-design.md`

## Global Constraints

- Node.js 22 LTS. Package manager is **npm workspaces only** (no Bun, pnpm or yarn).
- All JS/TS packages are ESM (`"type": "module"`), TypeScript, strict mode. Workspace packages export their `src/*.ts` directly (no build step).
- Database: PostgreSQL 16 via Prisma 6 (`prisma-client-js` generator), the same engine in every environment. The dev DB container is published on **host port 5433**.
- Slot state is `FREE | OCCUPIED | UNKNOWN`. **UNKNOWN never counts as free.** `status = freeCount > 0 ? "AVAILABLE" : "FULL"`.
- Devices: heartbeat every **5 s**, considered offline after **15 s** of silence.
- Seed: A1–A2 LIVE on `esp32-a`, A3–A6 SIMULATED; B1 LIVE on `esp32-b`, B2–B6 SIMULATED (owner `simulator`). LIVE slots start `UNKNOWN`, SIMULATED slots start `FREE`.
- Ports: API **3000**, driver **5173**, dashboard **5174**, partners **5175** (`strictPort`). Frontends call same-origin `/api` and `/socket.io`. In dev the Vite proxy forwards them.
- UI default language `mn`, plus `en`, persisted in localStorage key **`sp.lang`**.
- Git commits: one short line, no co-author/attribution trailer.
- Not in this plan (later weeks): `/api/ingest`, `/ws/device`, slot PATCH, devices/events/pilot endpoints, dashboard features, full Docker stack + Caddy, real firmware logic.

Deliberate small deviations from the spec's tree:

- The env example lives at `apps/api/.env.example`, because the API is the only consumer.
- The i18n dictionaries are TS objects (`mn.ts`, `en.ts`) instead of JSON, so key parity is checked at compile time.
- The protocol contract test lives in `packages/shared` (the schema owner).

## Review Focus

1. **A teammate already runs Postgres on 5432.** The dev DB uses host port 5433, so `npm run db:up` must not clash. Verified in Task 1 Step 5.
2. **Unknown or lowercase parking id** (`/api/parkings/Z`, `/api/parkings/b`). Expect a JSON `404 {error:"not_found"}`, never an HTML page or a 500. Tested in Task 6.
3. **API down or Vite proxy returns an HTML 502.** The client throws `ApiError` and the UI shows the error alert instead of a blank screen. Tested in Tasks 8 and 10.
4. **Browser storage blocked** (private mode, `localStorage` throws). i18n falls back to `mn` and the toggle still switches language. Tested in Task 4.
5. **Seed re-run on an already-seeded DB.** It must be idempotent, with no duplicate-key crash. Tested in Task 5.

---

### Task 1: Root workspace, tooling and dev database

**Files:**

- Create: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.gitignore`, `.nvmrc`
- Create: `docker-compose.dev.yml`, `infra/postgres/init/01-test-db.sql`

**Interfaces:**

- Produces: root scripts `db:up`, `db:down`, `lint`, `format`, `typecheck`, `test` (`dev`, `db:migrate`, `db:seed`, `sim` are added in Task 14). Dev DB `postgresql://parking:parking@localhost:5433/smart_parking` and test DB `.../smart_parking_test`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "smart-parking",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*", "tools/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "db:up": "docker compose -f docker-compose.dev.yml up -d --wait",
    "db:down": "docker compose -f docker-compose.dev.yml down",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": {
    "@eslint/js": "^9.35.0",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22.18.0",
    "@types/react": "^19.1.12",
    "@types/react-dom": "^19.1.9",
    "concurrently": "^9.2.1",
    "eslint": "^9.35.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "globals": "^16.4.0",
    "jsdom": "^26.1.0",
    "prettier": "^3.6.2",
    "typescript": "^5.9.2",
    "typescript-eslint": "^8.43.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create TypeScript, lint and format config**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "types": ["node"]
  }
}
```

`eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dev-dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "firmware/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
```

`.prettierrc`:

```json
{ "printWidth": 100 }
```

`.prettierignore`:

```
node_modules
dist
dev-dist
coverage
firmware
package-lock.json
apps/api/prisma/migrations
```

`.gitignore`:

```
node_modules/
dist/
dev-dist/
coverage/
.env
*.log
.DS_Store
firmware/.pio/
firmware/include/config.h
```

`.nvmrc`:

```
22
```

- [ ] **Step 3: Create the dev database compose file**

`docker-compose.dev.yml`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: parking
      POSTGRES_PASSWORD: parking
      POSTGRES_DB: smart_parking
    ports:
      - "5433:5432" # 5433 on the host so a locally installed Postgres on 5432 doesn't clash
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U parking -d smart_parking"]
      interval: 3s
      timeout: 3s
      retries: 20

volumes:
  db-data:
```

`infra/postgres/init/01-test-db.sql`:

```sql
CREATE DATABASE smart_parking_test;
```

- [ ] **Step 4: Install**

Run: `npm install`
Expected: completes and creates `package-lock.json` (no workspaces exist yet, which is fine).

- [ ] **Step 5: Verify the database comes up on 5433 with both databases**

Run: `npm run db:up && docker compose -f docker-compose.dev.yml exec db psql -U parking -lqt | cut -d '|' -f1 | grep smart_parking`
Expected: two lines, `smart_parking` and `smart_parking_test`. `lsof -iTCP:5433 -sTCP:LISTEN` shows the Docker process.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Set up npm workspaces, tooling and dev database"
```

---

### Task 2: `packages/shared` contract and domain rules

**Files:**

- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/enums.ts`, `src/models.ts`, `src/protocol.ts`, `src/realtime.ts`, `src/availability.ts`, `src/suggest-slot.ts`, `src/index.ts`
- Test: `packages/shared/test/availability.test.ts`, `test/suggest-slot.test.ts`, `test/schemas.test.ts`

**Interfaces:**

- Produces (all exported from `@smart-parking/shared`; each schema has a same-named inferred type):
  - Enums: `SlotState`, `ReportedSlotState` (`FREE|OCCUPIED`), `SlotSource`, `ParkingStatus`, `GatePosition`, `GateDecision`
  - Models: `Slot`, `Gate`, `ParkingSummary`, `ParkingDetail`, `Device`
  - Protocol: `IngestBody`, `DeviceAvailabilityMessage`, `DEVICE_HEARTBEAT_MS = 5000`, `DEVICE_TIMEOUT_MS = 15000`
  - Realtime: `ParkingUpdated`, `SOCKET_EVENTS`
  - `computeAvailability(slots: ReadonlyArray<{ state: SlotState }>): Availability` where `Availability = { freeCount: number; totalCount: number; status: ParkingStatus }`
  - `isDeviceOnline(lastSeenAt: Date | null, now: Date, timeoutMs?: number): boolean`
  - `suggestSlot(slots: ReadonlyArray<Pick<Slot, "id" | "label" | "state">>): string | null`

- [ ] **Step 1: Create the package files**

`packages/shared/package.json`:

```json
{
  "name": "@smart-parking/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^4.1.5"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run: `npm install`

- [ ] **Step 2: Write the failing tests**

`packages/shared/test/availability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeAvailability, isDeviceOnline, DEVICE_TIMEOUT_MS } from "../src";

describe("computeAvailability", () => {
  it("counts only FREE slots as free", () => {
    const result = computeAvailability([
      { state: "FREE" },
      { state: "OCCUPIED" },
      { state: "UNKNOWN" },
      { state: "FREE" },
    ]);
    expect(result).toEqual({ freeCount: 2, totalCount: 4, status: "AVAILABLE" });
  });

  it("is FULL when no slot is FREE, even if some are UNKNOWN", () => {
    const result = computeAvailability([{ state: "OCCUPIED" }, { state: "UNKNOWN" }]);
    expect(result).toEqual({ freeCount: 0, totalCount: 2, status: "FULL" });
  });

  it("treats a parking with no slots as FULL", () => {
    expect(computeAvailability([])).toEqual({ freeCount: 0, totalCount: 0, status: "FULL" });
  });
});

describe("isDeviceOnline", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");

  it("is offline when never seen", () => {
    expect(isDeviceOnline(null, now)).toBe(false);
  });

  it("is online just inside the timeout", () => {
    const seen = new Date(now.getTime() - (DEVICE_TIMEOUT_MS - 1));
    expect(isDeviceOnline(seen, now)).toBe(true);
  });

  it("is offline exactly at the timeout", () => {
    const seen = new Date(now.getTime() - DEVICE_TIMEOUT_MS);
    expect(isDeviceOnline(seen, now)).toBe(false);
  });

  it("uses the 15 second default", () => {
    expect(DEVICE_TIMEOUT_MS).toBe(15_000);
  });
});
```

`packages/shared/test/suggest-slot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestSlot } from "../src";

describe("suggestSlot", () => {
  it("returns null when nothing is free", () => {
    expect(
      suggestSlot([
        { id: "B1", label: "B1", state: "OCCUPIED" },
        { id: "B2", label: "B2", state: "UNKNOWN" },
      ]),
    ).toBeNull();
  });

  it("picks the lowest-numbered free slot, ordering labels numerically", () => {
    expect(
      suggestSlot([
        { id: "A10", label: "A10", state: "FREE" },
        { id: "A3", label: "A3", state: "FREE" },
        { id: "A1", label: "A1", state: "OCCUPIED" },
      ]),
    ).toBe("A3");
  });
});
```

`packages/shared/test/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IngestBody, ParkingSummary } from "../src";

describe("IngestBody", () => {
  it("accepts a heartbeat with only deviceId", () => {
    expect(IngestBody.safeParse({ deviceId: "esp32-a" }).success).toBe(true);
  });

  it("rejects devices reporting UNKNOWN (only the server sets UNKNOWN)", () => {
    const result = IngestBody.safeParse({
      deviceId: "esp32-a",
      slots: [{ id: "A1", state: "UNKNOWN" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown gate event", () => {
    const result = IngestBody.safeParse({ deviceId: "esp32-b", gate: { event: "BROKEN" } });
    expect(result.success).toBe(false);
  });
});

describe("ParkingSummary", () => {
  it("rejects a negative freeCount", () => {
    const result = ParkingSummary.safeParse({
      id: "A",
      name: "Parking A",
      address: "x",
      lat: 0,
      lng: 0,
      freeCount: -1,
      totalCount: 6,
      status: "AVAILABLE",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @smart-parking/shared`
Expected: FAIL. The suites can't resolve `../src` (no `index.ts` yet).

- [ ] **Step 4: Implement the package source**

`packages/shared/src/enums.ts`:

```ts
import { z } from "zod";

export const SlotState = z.enum(["FREE", "OCCUPIED", "UNKNOWN"]);
export type SlotState = z.infer<typeof SlotState>;

/** States a device may report. UNKNOWN is assigned only by the server (device offline). */
export const ReportedSlotState = z.enum(["FREE", "OCCUPIED"]);
export type ReportedSlotState = z.infer<typeof ReportedSlotState>;

export const SlotSource = z.enum(["LIVE", "SIMULATED"]);
export type SlotSource = z.infer<typeof SlotSource>;

export const ParkingStatus = z.enum(["AVAILABLE", "FULL"]);
export type ParkingStatus = z.infer<typeof ParkingStatus>;

export const GatePosition = z.enum(["OPEN", "CLOSED"]);
export type GatePosition = z.infer<typeof GatePosition>;

export const GateDecision = z.enum(["OPENED", "DENIED"]);
export type GateDecision = z.infer<typeof GateDecision>;
```

`packages/shared/src/models.ts`:

```ts
import { z } from "zod";
import { GateDecision, GatePosition, ParkingStatus, SlotSource, SlotState } from "./enums";

export const Slot = z.object({
  id: z.string(),
  parkingId: z.string(),
  label: z.string(),
  state: SlotState,
  source: SlotSource,
  deviceId: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type Slot = z.infer<typeof Slot>;

export const Gate = z.object({
  parkingId: z.string(),
  position: GatePosition,
  lastDecision: GateDecision.nullable(),
  lastDecisionAt: z.iso.datetime().nullable(),
});
export type Gate = z.infer<typeof Gate>;

export const ParkingSummary = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  freeCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  status: ParkingStatus,
});
export type ParkingSummary = z.infer<typeof ParkingSummary>;

export const ParkingDetail = ParkingSummary.extend({
  slots: z.array(Slot),
  gate: Gate.nullable(),
});
export type ParkingDetail = z.infer<typeof ParkingDetail>;

export const Device = z.object({
  id: z.string(),
  parkingId: z.string().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  firmwareVersion: z.string().nullable(),
  online: z.boolean(),
});
export type Device = z.infer<typeof Device>;
```

`packages/shared/src/protocol.ts`:

```ts
import { z } from "zod";
import { GateDecision, ParkingStatus, ReportedSlotState } from "./enums";

/** Devices must POST at least this often; every POST is a heartbeat. */
export const DEVICE_HEARTBEAT_MS = 5_000;
/** A device silent for this long is offline and its slots become UNKNOWN. */
export const DEVICE_TIMEOUT_MS = 15_000;

/** Body of POST /api/ingest (ESP32 and simulator). See firmware/PROTOCOL.md. */
export const IngestBody = z.object({
  deviceId: z.string().min(1),
  firmwareVersion: z.string().optional(),
  slots: z.array(z.object({ id: z.string().min(1), state: ReportedSlotState })).optional(),
  gate: z.object({ event: GateDecision }).optional(),
});
export type IngestBody = z.infer<typeof IngestBody>;

/** Server → device message on /ws/device. */
export const DeviceAvailabilityMessage = z.object({
  type: z.literal("availability"),
  parkingId: z.string(),
  status: ParkingStatus,
  freeCount: z.number().int().nonnegative(),
});
export type DeviceAvailabilityMessage = z.infer<typeof DeviceAvailabilityMessage>;
```

`packages/shared/src/realtime.ts`:

```ts
import { z } from "zod";
import { ParkingStatus } from "./enums";

export const SOCKET_EVENTS = {
  parkingUpdated: "parking.updated",
  slotUpdated: "slot.updated",
  deviceUpdated: "device.updated",
  eventCreated: "event.created",
} as const;

export const ParkingUpdated = z.object({
  id: z.string(),
  freeCount: z.number().int().nonnegative(),
  status: ParkingStatus,
});
export type ParkingUpdated = z.infer<typeof ParkingUpdated>;
```

`packages/shared/src/availability.ts`:

```ts
import type { ParkingStatus, SlotState } from "./enums";
import { DEVICE_TIMEOUT_MS } from "./protocol";

export interface Availability {
  freeCount: number;
  totalCount: number;
  status: ParkingStatus;
}

/** The single availability rule. UNKNOWN slots are never counted as free. */
export function computeAvailability(slots: ReadonlyArray<{ state: SlotState }>): Availability {
  const freeCount = slots.filter((slot) => slot.state === "FREE").length;
  return {
    freeCount,
    totalCount: slots.length,
    status: freeCount > 0 ? "AVAILABLE" : "FULL",
  };
}

export function isDeviceOnline(
  lastSeenAt: Date | null,
  now: Date,
  timeoutMs: number = DEVICE_TIMEOUT_MS,
): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < timeoutMs;
}
```

`packages/shared/src/suggest-slot.ts`:

```ts
import type { Slot } from "./models";

/**
 * Which free slot the driver app highlights (journey step 4, "Guidance").
 * Current rule: the lowest-numbered free slot. Change the rule here only.
 */
export function suggestSlot(
  slots: ReadonlyArray<Pick<Slot, "id" | "label" | "state">>,
): string | null {
  const free = slots
    .filter((slot) => slot.state === "FREE")
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return free[0]?.id ?? null;
}
```

`packages/shared/src/index.ts`:

```ts
export * from "./enums";
export * from "./models";
export * from "./protocol";
export * from "./realtime";
export * from "./availability";
export * from "./suggest-slot";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @smart-parking/shared && npm run typecheck -w @smart-parking/shared`
Expected: PASS (13 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add shared contract schemas and availability rules"
```

---

### Task 3: Device protocol, firmware skeleton, hardware and docs folders

**Files:**

- Create: `firmware/PROTOCOL.md`, `firmware/platformio.ini`, `firmware/src/main.cpp`, `firmware/include/config.example.h`, `firmware/README.md`
- Create: `hardware/README.md`, `hardware/BOM.csv`, `docs/README.md`
- Test: `packages/shared/test/protocol-contract.test.ts`

**Interfaces:**

- Consumes: `IngestBody`, `DeviceAvailabilityMessage` from Task 2.
- Produces: `firmware/PROTOCOL.md` with fenced blocks tagged ` ```json ingest ` and ` ```json availability `. The contract test parses every such block.

- [ ] **Step 1: Write the failing contract test**

`packages/shared/test/protocol-contract.test.ts`:

````ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { DeviceAvailabilityMessage, IngestBody } from "../src";

const protocolPath = fileURLToPath(new URL("../../../firmware/PROTOCOL.md", import.meta.url));
const schemas: Record<string, z.ZodType> = {
  ingest: IngestBody,
  availability: DeviceAvailabilityMessage,
};

function examples(): Array<{ tag: string; json: unknown }> {
  const markdown = readFileSync(protocolPath, "utf8");
  const blocks = [...markdown.matchAll(/```json (\w+)\n([\s\S]*?)```/g)];
  return blocks.map(([, tag, body]) => ({ tag: tag!, json: JSON.parse(body!) }));
}

describe("firmware/PROTOCOL.md examples", () => {
  it("contains at least one example of each message type", () => {
    const tags = new Set(examples().map((example) => example.tag));
    expect(tags).toEqual(new Set(Object.keys(schemas)));
  });

  it("every example matches the shared schema", () => {
    for (const { tag, json } of examples()) {
      const schema = schemas[tag];
      expect(schema, `unknown example tag "${tag}"`).toBeDefined();
      const result = schema!.safeParse(json);
      expect(result.success, `${tag}: ${JSON.stringify(json)}`).toBe(true);
    }
  });
});
````

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @smart-parking/shared -- protocol-contract`
Expected: FAIL with `ENOENT ... firmware/PROTOCOL.md`.

- [ ] **Step 3: Write `firmware/PROTOCOL.md`**

````markdown
# Device ↔ API Protocol

Contract between the ESP32 site controllers (and `tools/simulator`) and `apps/api`.
The Zod schemas in `packages/shared/src/protocol.ts` are the source of truth.
Every ` ```json <tag> ` block below is checked against them in CI (`protocol-contract.test.ts`).

## 1. Device → API: `POST /api/ingest`

- Header: `X-Device-Key: <device key>`, `Content-Type: application/json`
- Send on **every state change** and at least **every 5 s** (heartbeat).
- A device silent for **15 s** is offline. Its slots become `UNKNOWN`.
- Report only `FREE` or `OCCUPIED`. Filter sensor noise on the device and report a change only after N consistent readings.
- A device may write only the slots it owns, otherwise `403`.

Heartbeat:

```json ingest
{ "deviceId": "esp32-a", "firmwareVersion": "0.1.0" }
```

Slot change:

```json ingest
{
  "deviceId": "esp32-b",
  "firmwareVersion": "0.1.0",
  "slots": [{ "id": "B1", "state": "OCCUPIED" }]
}
```

Gate decision (car detected at gate, barrier kept closed):

```json ingest
{ "deviceId": "esp32-b", "gate": { "event": "DENIED" } }
```

Responses: `204` ok · `400` invalid body · `401` bad key · `403` slot not owned.

## 2. API → Device: WebSocket `/ws/device?deviceId=<id>&key=<key>`

Sent on connect and on every availability change for the device's parking:

```json availability
{ "type": "availability", "parkingId": "B", "status": "FULL", "freeCount": 0 }
```

```json availability
{ "type": "availability", "parkingId": "A", "status": "AVAILABLE", "freeCount": 4 }
```

## 3. Gate behaviour on the device

1. Cache the latest `availability` message.
2. Gate IR sensor detects a car → `AVAILABLE`: open servo, then close after the car passes. `FULL`: keep closed.
3. Report `OPENED` / `DENIED` via `/api/ingest`.
4. WebSocket disconnected → keep using the cached status, show `OFFLINE` on the OLED, reconnect with backoff.
````

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `npm test -w @smart-parking/shared -- protocol-contract`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the firmware skeleton**

`firmware/platformio.ini`:

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
lib_deps =
  bblanchon/ArduinoJson@^7
  links2004/WebSockets@^2.6
  madhephaestus/ESP32Servo@^3
  adafruit/Adafruit SSD1306@^2.5
```

`firmware/include/config.example.h`:

```cpp
// Copy to config.h (git-ignored) and fill in per device.
#pragma once

#define WIFI_SSID "smart-parking-demo"
#define WIFI_PASSWORD "change-me"

// Dev laptop / demo laptop LAN IP. Plain HTTP + WS on the local network.
#define API_HOST "192.168.1.10"
#define API_PORT 3000

#define DEVICE_ID "esp32-a"      // "esp32-a" or "esp32-b"
#define DEVICE_KEY "dev-esp32-a" // must match DEVICE_KEY_ESP32_A / _B in apps/api/.env
#define FIRMWARE_VERSION "0.1.0"
```

`firmware/src/main.cpp`:

```cpp
// W1 skeleton: proves the toolchain builds and flashes.
// Sensor, gate, OLED and networking logic arrive in W2 (see PROTOCOL.md).
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.println("smart-parking firmware 0.1.0 booted");
}

void loop() {
  digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
  delay(500);
}
```

`firmware/README.md`:

```markdown
# Firmware (Role 3)

PlatformIO project for ESP32 site controllers A and B. Not part of the npm workspace.

1. Install PlatformIO (VS Code extension or `pip install platformio`).
2. `cp include/config.example.h include/config.h` and fill in Wi-Fi, API host and device key.
3. `pio run -t upload && pio device monitor`

The message format is defined in [PROTOCOL.md](PROTOCOL.md). Changing it means changing `packages/shared/src/protocol.ts` in the same PR.
```

- [ ] **Step 6: Create the hardware and docs folders**

`hardware/BOM.csv` (from the proposal's "What we have / what we need"):

```csv
item,qty,status,purpose
ESP32,2,have,site controllers A and B
HC-SR04 ultrasonic sensor,3,have,live slot sensors (A1 A2 B1)
OLED display,1,have,entrance display
LED pair,3,have,slot-status indicators
PIR sensor,1,have,spare
Buzzer,1,have,spare
SG90 servo,2,need,entrance gate barriers
IR proximity sensor,2,need,car detection at gates
OLED display,1,need,second entrance display
5V ~2A power supply,1,need,power for servos and boards
Breadboard / perfboard,1,need,wiring
Jumper wires,1,need,wiring
Resistors for HC-SR04 ECHO divider,3,need,5V to 3.3V level shift for ESP32 input
```

`hardware/README.md`:

```markdown
# Hardware (Role 2)

Physical models, wiring diagrams, photos and the parts list.

- `BOM.csv`: parts we have and need (keep cost columns here when known)
- Add wiring diagrams as `wiring-<site>.png` and photos under `photos/`

Note: the HC-SR04 ECHO pin outputs 5 V. Use a resistor divider before the ESP32 GPIO (3.3 V).
```

`docs/README.md`:

```markdown
# Docs (Roles 1 + 7)

| Document                                   | Owner       |
| ------------------------------------------ | ----------- |
| `superpowers/specs/`: design specs         | all         |
| `superpowers/plans/`: implementation plans | all         |
| `wbs.md`: WBS + schedule                   | Role 1      |
| `test-plan.md` / `test-results.md`         | Role 7      |
| `survey.md`, `requirements.md`, `risks.md` | Role 7      |
| `demo-script.md`: final-day 2-car scenario | Roles 1 + 7 |
```

- [ ] **Step 7: Optional firmware build check**

If PlatformIO is installed, run `cd firmware && cp include/config.example.h include/config.h && pio run`.
Expected: `SUCCESS`. Skip this if PlatformIO isn't installed; CI doesn't build firmware.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add device protocol contract, firmware skeleton and hardware docs"
```

---

### Task 4: `packages/i18n` (MN default + EN)

**Files:**

- Create: `packages/i18n/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/test-setup.ts`
- Create: `packages/i18n/src/locales/mn.ts`, `src/locales/en.ts`, `src/index.ts`
- Test: `packages/i18n/test/i18n.test.ts`

**Interfaces:**

- Produces: `initI18n(): i18n` (a new i18next instance, already wired to react-i18next), `setLanguage(instance: i18n, lng: Language): Promise<void>`, `SUPPORTED_LANGUAGES = ["mn","en"] as const`, `type Language`, `LANGUAGE_STORAGE_KEY = "sp.lang"`.
- Translation keys used by later tasks: `app.driverTitle`, `app.dashboardTitle`, `app.partnersTitle`, `common.loading`, `common.error`, `parking.free` (`{{free}}`, `{{total}}`), `parking.status.AVAILABLE`, `parking.status.FULL`, `language.label`, `language.mn`, `language.en`, `dashboard.sites`, `partners.heroTitle`, `partners.heroBody`, `partners.cta`, `partners.liveTitle`.

- [ ] **Step 1: Create the package files**

`packages/i18n/package.json`:

```json
{
  "name": "@smart-parking/i18n",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "i18next": "^25.5.2",
    "react-i18next": "^15.7.3"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

`packages/i18n/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/i18n/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
```

`packages/i18n/src/test-setup.ts`:

```ts
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
```

Run: `npm install`

- [ ] **Step 2: Write the failing tests**

`packages/i18n/test/i18n.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { initI18n, LANGUAGE_STORAGE_KEY, setLanguage } from "../src";

describe("initI18n", () => {
  it("defaults to Mongolian", () => {
    const i18n = initI18n();
    expect(i18n.language).toBe("mn");
    expect(i18n.t("parking.status.FULL")).toBe("Дүүрсэн");
  });

  it("interpolates the free count", () => {
    expect(initI18n().t("parking.free", { free: 4, total: 6 })).toBe("4/6 сул");
  });

  it("restores a stored language", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    expect(initI18n().t("parking.status.FULL")).toBe("Full");
  });

  it("ignores an unsupported stored language", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(initI18n().language).toBe("mn");
  });

  it("falls back to Mongolian when storage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(initI18n().language).toBe("mn");
  });
});

describe("setLanguage", () => {
  it("switches language and persists it", async () => {
    const i18n = initI18n();
    await setLanguage(i18n, "en");
    expect(i18n.t("parking.free", { free: 4, total: 6 })).toBe("4/6 free");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("still switches language when storage writes throw", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const i18n = initI18n();
    await setLanguage(i18n, "en");
    expect(i18n.language).toBe("en");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @smart-parking/i18n`
Expected: FAIL, cannot resolve `../src`.

- [ ] **Step 4: Implement the dictionaries and setup**

`packages/i18n/src/locales/mn.ts`:

```ts
export const mn = {
  app: {
    driverTitle: "Сул зогсоол хайх",
    dashboardTitle: "Операторын самбар",
    partnersTitle: "Ухаалаг зогсоол",
  },
  common: {
    loading: "Ачаалж байна…",
    error: "Мэдээлэл ачаалж чадсангүй",
  },
  parking: {
    free: "{{free}}/{{total}} сул",
    status: {
      AVAILABLE: "Сул байртай",
      FULL: "Дүүрсэн",
    },
  },
  language: {
    label: "Хэл",
    mn: "МН",
    en: "EN",
  },
  dashboard: {
    sites: "Зогсоолууд",
  },
  partners: {
    heroTitle: "Зогсоолоо ухаалаг болгоё",
    heroBody: "Сул зогсоолын мэдээллийг жолооч нарт бодит цагаар хүргэнэ.",
    cta: "Pilot хүсэлт илгээх",
    liveTitle: "Яг одоо",
  },
};
```

`packages/i18n/src/locales/en.ts`:

```ts
import type { mn } from "./mn";

// Typed as `typeof mn`, so a missing or extra key is a compile error.
export const en: typeof mn = {
  app: {
    driverTitle: "Find free parking",
    dashboardTitle: "Operator dashboard",
    partnersTitle: "Smart Parking",
  },
  common: {
    loading: "Loading…",
    error: "Could not load data",
  },
  parking: {
    free: "{{free}}/{{total}} free",
    status: {
      AVAILABLE: "Available",
      FULL: "Full",
    },
  },
  language: {
    label: "Language",
    mn: "МН",
    en: "EN",
  },
  dashboard: {
    sites: "Sites",
  },
  partners: {
    heroTitle: "Make your parking smart",
    heroBody: "Deliver real-time free-space information to drivers.",
    cta: "Request a pilot",
    liveTitle: "Right now",
  },
};
```

`packages/i18n/src/index.ts`:

```ts
import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { mn } from "./locales/mn";

export const SUPPORTED_LANGUAGES = ["mn", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "sp.lang";

function isLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language);
}

function readStoredLanguage(): Language {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : "mn";
  } catch {
    return "mn";
  }
}

export function initI18n(): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: { mn: { translation: mn }, en: { translation: en } },
    lng: readStoredLanguage(),
    fallbackLng: "mn",
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

export async function setLanguage(instance: i18n, lng: Language): Promise<void> {
  await instance.changeLanguage(lng);
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // Storage blocked (private mode): language still switches for this session.
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @smart-parking/i18n && npm run typecheck -w @smart-parking/i18n`
Expected: PASS (7 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add MN/EN i18n package"
```

---

### Task 5: `apps/api` database schema and seed

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/.env.example`
- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`, `apps/api/prisma/migrations/**` (generated)
- Create: `apps/api/src/domain/device-keys.ts`, `apps/api/src/db/seed-data.ts`
- Test: `apps/api/test/test-db.ts`, `apps/api/test/global-setup.ts`, `apps/api/test/helpers.ts`, `apps/api/test/seed.test.ts`

**Interfaces:**

- Produces:
  - `hashDeviceKey(key: string): string` (sha256 hex)
  - `DEVICE_IDS = ["esp32-a","esp32-b","simulator"] as const`, `type DeviceId`
  - `seed(prisma: PrismaClient, keys: Record<DeviceId, string>): Promise<void>` (wipes and re-creates all tables)
  - Test helpers: `TEST_DATABASE_URL`, `TEST_KEYS`, `createTestPrisma(): Promise<PrismaClient>` (seeded)
  - Prisma models `Parking`, `Slot`, `Device`, `Gate`, `Event`, `PilotRequest` per spec §4

- [ ] **Step 1: Create the package files**

`apps/api/package.json`:

```json
{
  "name": "@smart-parking/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "postinstall": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.16.0",
    "@smart-parking/shared": "*",
    "express": "^5.1.0",
    "socket.io": "^4.8.1",
    "zod": "^4.1.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.3",
    "@types/supertest": "^6.0.3",
    "prisma": "^6.16.0",
    "socket.io-client": "^4.8.1",
    "supertest": "^7.1.4",
    "tsx": "^4.20.5"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "prisma", "vitest.config.ts"]
}
```

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false, // test files share one database
    hookTimeout: 30_000,
  },
});
```

`apps/api/.env.example`:

```bash
# Copy to apps/api/.env
DATABASE_URL=postgresql://parking:parking@localhost:5433/smart_parking
PORT=3000

# Device keys (ESP32 firmware config.h must use the same values)
DEVICE_KEY_ESP32_A=dev-esp32-a
DEVICE_KEY_ESP32_B=dev-esp32-b
DEVICE_KEY_SIMULATOR=dev-simulator

# Operator dashboard token (used from W3)
OPERATOR_TOKEN=dev-operator
```

Run: `cp apps/api/.env.example apps/api/.env`

- [ ] **Step 2: Write the Prisma schema**

`apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SlotState {
  FREE
  OCCUPIED
  UNKNOWN
}

enum SlotSource {
  LIVE
  SIMULATED
}

enum GatePosition {
  OPEN
  CLOSED
}

enum GateDecision {
  OPENED
  DENIED
}

model Parking {
  id      String   @id
  name    String
  address String
  lat     Float
  lng     Float
  slots   Slot[]
  devices Device[]
  gate    Gate?
}

model Slot {
  id        String     @id
  parkingId String
  parking   Parking    @relation(fields: [parkingId], references: [id], onDelete: Cascade)
  label     String
  state     SlotState  @default(UNKNOWN)
  source    SlotSource
  deviceId  String?
  device    Device?    @relation(fields: [deviceId], references: [id], onDelete: SetNull)
  updatedAt DateTime   @updatedAt

  @@index([parkingId])
}

model Device {
  id              String    @id
  parkingId       String?
  parking         Parking?  @relation(fields: [parkingId], references: [id], onDelete: SetNull)
  apiKeyHash      String
  lastSeenAt      DateTime?
  firmwareVersion String?
  slots           Slot[]
}

model Gate {
  parkingId      String        @id
  parking        Parking       @relation(fields: [parkingId], references: [id], onDelete: Cascade)
  position       GatePosition  @default(CLOSED)
  lastDecision   GateDecision?
  lastDecisionAt DateTime?
}

model Event {
  id        String   @id @default(cuid())
  type      String
  parkingId String?
  slotId    String?
  deviceId  String?
  payload   Json     @default("{}")
  createdAt DateTime @default(now())

  @@index([createdAt])
}

model PilotRequest {
  id           String   @id @default(cuid())
  name         String
  organization String
  email        String
  phone        String?
  siteCount    Int?
  message      String?
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 3: Install and create the first migration**

Run: `npm install && npm run db:up && npm run db:migrate -w @smart-parking/api -- --name init --skip-seed`
Expected: `apps/api/prisma/migrations/<timestamp>_init/migration.sql` is created and "Your database is now in sync with your schema."

- [ ] **Step 4: Write the test DB helpers and the failing seed test**

`apps/api/test/test-db.ts`:

```ts
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://parking:parking@localhost:5433/smart_parking_test";
```

`apps/api/test/global-setup.ts`:

```ts
import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./test-db";

// Applies migrations to the test database (non-destructive; seed() wipes data per test).
export default function setup(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
```

`apps/api/test/helpers.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { seed, type DeviceId } from "../src/db/seed-data";
import { TEST_DATABASE_URL } from "./test-db";

export const TEST_KEYS: Record<DeviceId, string> = {
  "esp32-a": "test-key-a",
  "esp32-b": "test-key-b",
  simulator: "test-key-sim",
};

export async function createTestPrisma(): Promise<PrismaClient> {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  await seed(prisma, TEST_KEYS);
  return prisma;
}
```

`apps/api/test/seed.test.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seed } from "../src/db/seed-data";
import { hashDeviceKey } from "../src/domain/device-keys";
import { createTestPrisma, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("creates 2 parkings, 12 slots, 3 devices and 2 closed gates", async () => {
    expect(await prisma.parking.count()).toBe(2);
    expect(await prisma.slot.count()).toBe(12);
    expect(await prisma.device.count()).toBe(3);
    const gates = await prisma.gate.findMany({ orderBy: { parkingId: "asc" } });
    expect(gates.map((g) => [g.parkingId, g.position])).toEqual([
      ["A", "CLOSED"],
      ["B", "CLOSED"],
    ]);
  });

  it("matches the proposal's live/simulated split", async () => {
    const live = await prisma.slot.findMany({ where: { source: "LIVE" }, orderBy: { id: "asc" } });
    expect(live.map((s) => [s.id, s.deviceId, s.state])).toEqual([
      ["A1", "esp32-a", "UNKNOWN"],
      ["A2", "esp32-a", "UNKNOWN"],
      ["B1", "esp32-b", "UNKNOWN"],
    ]);
    const simulated = await prisma.slot.findMany({ where: { source: "SIMULATED" } });
    expect(simulated).toHaveLength(9);
    expect(simulated.every((s) => s.deviceId === "simulator" && s.state === "FREE")).toBe(true);
  });

  it("stores hashed device keys, never plain text", async () => {
    const device = await prisma.device.findUniqueOrThrow({ where: { id: "esp32-a" } });
    expect(device.apiKeyHash).toBe(hashDeviceKey(TEST_KEYS["esp32-a"]));
    expect(device.apiKeyHash).not.toContain(TEST_KEYS["esp32-a"]);
  });

  it("is idempotent when run again on a seeded database", async () => {
    await seed(prisma, TEST_KEYS);
    expect(await prisma.slot.count()).toBe(12);
    expect(await prisma.parking.count()).toBe(2);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test -w @smart-parking/api`
Expected: global setup applies the migration, then FAIL, cannot resolve `../src/db/seed-data`.

- [ ] **Step 6: Implement the key hashing and seed**

`apps/api/src/domain/device-keys.ts`:

```ts
import { createHash } from "node:crypto";

export function hashDeviceKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
```

`apps/api/src/db/seed-data.ts`:

```ts
import type { Prisma, PrismaClient } from "@prisma/client";
import { hashDeviceKey } from "../domain/device-keys";

export const DEVICE_IDS = ["esp32-a", "esp32-b", "simulator"] as const;
export type DeviceId = (typeof DEVICE_IDS)[number];

const PARKINGS: Prisma.ParkingCreateManyInput[] = [
  {
    id: "A",
    name: "Parking A",
    address: "Sukhbaatar Square, Ulaanbaatar",
    lat: 47.9186,
    lng: 106.9177,
  },
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
    prisma.slot.createMany({
      data: [...slotsFor("A", 2, "esp32-a"), ...slotsFor("B", 1, "esp32-b")],
    }),
    prisma.gate.createMany({ data: [{ parkingId: "A" }, { parkingId: "B" }] }),
  ]);
}
```

`apps/api/prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { seed } from "../src/db/seed-data";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const prisma = new PrismaClient();
await seed(prisma, {
  "esp32-a": process.env.DEVICE_KEY_ESP32_A ?? "dev-esp32-a",
  "esp32-b": process.env.DEVICE_KEY_ESP32_B ?? "dev-esp32-b",
  simulator: process.env.DEVICE_KEY_SIMULATOR ?? "dev-simulator",
});
await prisma.$disconnect();
console.log("Seeded 2 parkings, 12 slots, 3 devices, 2 gates");
```

- [ ] **Step 7: Run the tests to verify they pass, then seed the dev DB**

Run: `npm test -w @smart-parking/api && npm run db:seed -w @smart-parking/api`
Expected: PASS (4 tests), then `Seeded 2 parkings, 12 slots, 3 devices, 2 gates`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Prisma schema, migration and demo seed"
```

---

### Task 6: `apps/api` HTTP app and parking endpoints

**Files:**

- Create: `apps/api/src/domain/serialize.ts`, `apps/api/src/routes/parkings.ts`, `apps/api/src/app.ts`
- Test: `apps/api/test/parkings.test.ts`

**Interfaces:**

- Consumes: `createTestPrisma`, `computeAvailability`, `ParkingSummary`, `ParkingDetail`.
- Produces:
  - `createApp(deps: { prisma: PrismaClient }): Express`
  - `toSlot(s)`, `toGate(g)`, `toParkingSummary(p)`, `toParkingDetail(p)` in `serialize.ts`
  - HTTP: `GET /api/health → {ok:true}`, `GET /api/parkings → ParkingSummary[]`, `GET /api/parkings/:id → ParkingDetail | 404 {error:"not_found", message}`, any other `/api/*` → `404 {error:"not_found"}`, unhandled error → `500 {error:"internal_error"}`

- [ ] **Step 1: Write the failing tests**

`apps/api/test/parkings.test.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { ParkingDetail, ParkingSummary } from "@smart-parking/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app";
import { seed } from "../src/db/seed-data";
import { createTestPrisma, TEST_KEYS } from "./helpers";

let prisma: PrismaClient;

beforeEach(async () => {
  if (prisma) await seed(prisma, TEST_KEYS);
  else prisma = await createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/parkings", () => {
  it("returns both sites with derived availability (UNKNOWN is not free)", async () => {
    const res = await request(createApp({ prisma })).get("/api/parkings").expect(200);
    const parkings = z.array(ParkingSummary).parse(res.body);
    expect(parkings.map((p) => [p.id, p.freeCount, p.totalCount, p.status])).toEqual([
      ["A", 4, 6, "AVAILABLE"],
      ["B", 5, 6, "AVAILABLE"],
    ]);
  });

  it("reports FULL when every slot is occupied or unknown", async () => {
    await prisma.slot.updateMany({
      where: { parkingId: "B", source: "SIMULATED" },
      data: { state: "OCCUPIED" },
    });
    const res = await request(createApp({ prisma })).get("/api/parkings").expect(200);
    const b = z
      .array(ParkingSummary)
      .parse(res.body)
      .find((p) => p.id === "B");
    expect(b).toMatchObject({ freeCount: 0, status: "FULL" });
  });
});

describe("GET /api/parkings/:id", () => {
  it("returns slots in label order and the gate", async () => {
    const res = await request(createApp({ prisma })).get("/api/parkings/B").expect(200);
    const detail = ParkingDetail.parse(res.body);
    expect(detail.slots.map((s) => s.id)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(detail.slots[0]).toMatchObject({
      source: "LIVE",
      state: "UNKNOWN",
      deviceId: "esp32-b",
    });
    expect(detail.gate).toMatchObject({ parkingId: "B", position: "CLOSED", lastDecision: null });
  });

  it("returns a JSON 404 for an unknown id", async () => {
    const res = await request(createApp({ prisma })).get("/api/parkings/Z").expect(404);
    expect(res.body).toEqual({ error: "not_found", message: "Parking Z not found" });
  });

  it("treats ids as case-sensitive", async () => {
    await request(createApp({ prisma })).get("/api/parkings/b").expect(404);
  });
});

describe("other routes", () => {
  it("answers health checks", async () => {
    await request(createApp({ prisma })).get("/api/health").expect(200, { ok: true });
  });

  it("returns a JSON 404 for unknown API paths", async () => {
    const res = await request(createApp({ prisma })).get("/api/nope").expect(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @smart-parking/api -- parkings`
Expected: FAIL, cannot resolve `../src/app`.

- [ ] **Step 3: Implement the serializers, router and app**

`apps/api/src/domain/serialize.ts`:

```ts
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
```

`apps/api/src/routes/parkings.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { toParkingDetail, toParkingSummary } from "../domain/serialize";

export function parkingsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const parkings = await prisma.parking.findMany({
      include: { slots: true },
      orderBy: { id: "asc" },
    });
    res.json(parkings.map(toParkingSummary));
  });

  router.get("/:id", async (req, res) => {
    const parking = await prisma.parking.findUnique({
      where: { id: req.params.id },
      include: { slots: { orderBy: { label: "asc" } }, gate: true },
    });
    if (!parking) {
      res.status(404).json({ error: "not_found", message: `Parking ${req.params.id} not found` });
      return;
    }
    res.json(toParkingDetail(parking));
  });

  return router;
}
```

`apps/api/src/app.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { parkingsRouter } from "./routes/parkings";

export interface AppDeps {
  prisma: PrismaClient;
}

export function createApp({ prisma }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/parkings", parkingsRouter(prisma));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Express 5 forwards rejected async handlers here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @smart-parking/api && npm run typecheck -w @smart-parking/api`
Expected: PASS (11 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add parkings API endpoints"
```

---

### Task 7: `apps/api` realtime bus, Socket.IO and server entry

**Files:**

- Create: `apps/api/src/realtime/bus.ts`, `apps/api/src/realtime/socket.ts`, `apps/api/src/server.ts`
- Test: `apps/api/test/realtime.test.ts`

**Interfaces:**

- Consumes: `ParkingUpdated`, `SOCKET_EVENTS`, `createApp`.
- Produces:
  - `createEventBus(): EventBus`, where `EventBus = EventEmitter<DomainEvents>` and `DomainEvents = { "parking.updated": [ParkingUpdated] }`. Later weeks add `slot.updated` etc. here.
  - `attachSocketIO(httpServer: http.Server, bus: EventBus): socket.io Server`, which re-broadcasts `parking.updated` to all browsers.
  - `npm run dev -w @smart-parking/api` listens on `PORT` (3000).

- [ ] **Step 1: Write the failing test**

`apps/api/test/realtime.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @smart-parking/api -- realtime`
Expected: FAIL, cannot resolve `../src/realtime/bus`.

- [ ] **Step 3: Implement the bus, the adapter and the server entry**

`apps/api/src/realtime/bus.ts`:

```ts
import { EventEmitter } from "node:events";
import type { ParkingUpdated } from "@smart-parking/shared";

/** Domain events. Transport adapters (Socket.IO, device WS) subscribe; domain code only emits. */
export interface DomainEvents {
  "parking.updated": [ParkingUpdated];
}

export type EventBus = EventEmitter<DomainEvents>;

export function createEventBus(): EventBus {
  return new EventEmitter<DomainEvents>();
}
```

`apps/api/src/realtime/socket.ts`:

```ts
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
```

`apps/api/src/server.ts`:

```ts
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app";
import { createEventBus } from "./realtime/bus";
import { attachSocketIO } from "./realtime/socket";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const port = Number(process.env.PORT ?? 3000);
const prisma = new PrismaClient();
const bus = createEventBus();
const httpServer = createServer(createApp({ prisma }));
const io = attachSocketIO(httpServer, bus);

httpServer.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

async function shutdown() {
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @smart-parking/api && npm run typecheck -w @smart-parking/api`
Expected: PASS (13 tests), typecheck clean.

- [ ] **Step 5: Smoke-test the real server**

Run: `npm run dev -w @smart-parking/api` in one terminal, then `curl -s localhost:3000/api/parkings` in another.
Expected: JSON array with A (`freeCount` 4) and B (`freeCount` 5). Stop the server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add realtime event bus, Socket.IO adapter and server entry"
```

---

### Task 8: `packages/api-client` (typed client and React bindings)

**Files:**

- Create: `packages/api-client/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/test-setup.ts`
- Create: `packages/api-client/src/client.ts`, `src/realtime.ts`, `src/index.ts`, `src/react.tsx`
- Test: `packages/api-client/test/client.test.ts`, `test/react.test.tsx`

**Interfaces:**

- Consumes: `ParkingSummary`, `ParkingDetail`, `SOCKET_EVENTS` from shared.
- Produces:
  - `@smart-parking/api-client` (Node-safe, no React): `createApiClient(opts?: { baseUrl?: string; fetchFn?: typeof fetch }): ApiClient`, `interface ApiClient { getParkings(): Promise<ParkingSummary[]>; getParking(id: string): Promise<ParkingDetail> }`, `class ApiError extends Error { status: number }` (status `0` = network error), `createRealtime(url?: string): Socket`, `type RealtimeSocket = Pick<Socket, "on" | "off">`
  - `@smart-parking/api-client/react`: `ApiProvider({ client, queryClient, socket?, children })`, `useApiClient(): ApiClient`, `useParkings()` (TanStack `useQuery` result of `ParkingSummary[]`), `queryKeys`

- [ ] **Step 1: Create the package files**

`packages/api-client/package.json`:

```json
{
  "name": "@smart-parking/api-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./react": "./src/react.tsx"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smart-parking/shared": "*",
    "@tanstack/react-query": "^5.87.1",
    "socket.io-client": "^4.8.1",
    "zod": "^4.1.5"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "react": "^19.1.1",
    "react-dom": "^19.1.1"
  }
}
```

`packages/api-client/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/api-client/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
```

`packages/api-client/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

Run: `npm install`

- [ ] **Step 2: Write the failing tests**

`packages/api-client/test/client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "../src";

const parkingA = {
  id: "A",
  name: "Parking A",
  address: "x",
  lat: 0,
  lng: 0,
  freeCount: 4,
  totalCount: 6,
  status: "AVAILABLE",
};

function fetchReturning(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe("createApiClient", () => {
  it("parses a valid parkings response", async () => {
    const fetchFn = fetchReturning(Response.json([parkingA]));
    const client = createApiClient({ baseUrl: "http://api", fetchFn });
    await expect(client.getParkings()).resolves.toEqual([parkingA]);
    expect(fetchFn).toHaveBeenCalledWith("http://api/api/parkings", expect.anything());
  });

  it("URL-encodes the parking id", async () => {
    const fetchFn = fetchReturning(Response.json({ ...parkingA, slots: [], gate: null }));
    await createApiClient({ fetchFn }).getParking("A/../x");
    expect(fetchFn).toHaveBeenCalledWith("/api/parkings/A%2F..%2Fx", expect.anything());
  });

  it("throws ApiError with the status for an HTML 502 from a proxy", async () => {
    const fetchFn = fetchReturning(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await createApiClient({ fetchFn })
      .getParkings()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it("throws ApiError when a 200 response is not JSON", async () => {
    const fetchFn = fetchReturning(new Response("<html></html>", { status: 200 }));
    await expect(createApiClient({ fetchFn }).getParkings()).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError when the response shape is wrong", async () => {
    const fetchFn = fetchReturning(Response.json([{ id: "A" }]));
    await expect(createApiClient({ fetchFn }).getParkings()).rejects.toThrow(
      "Unexpected response shape",
    );
  });

  it("throws ApiError with status 0 when the network fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await createApiClient({ fetchFn })
      .getParkings()
      .catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(0);
  });
});
```

`packages/api-client/test/react.test.tsx`:

```tsx
import type { ParkingSummary } from "@smart-parking/shared";
import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient, RealtimeSocket } from "../src";
import { ApiProvider, useParkings } from "../src/react";

const parkingB: ParkingSummary = {
  id: "B",
  name: "Parking B",
  address: "x",
  lat: 0,
  lng: 0,
  freeCount: 1,
  totalCount: 6,
  status: "AVAILABLE",
};

function fakeSocket() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const socket = {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return socket;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    fire(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((handler) => handler(...args));
    },
  };
  return socket;
}

function setup() {
  const client: ApiClient = {
    getParkings: vi.fn().mockResolvedValue([parkingB]),
    getParking: vi.fn(),
  };
  const socket = fakeSocket();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider
      client={client}
      queryClient={queryClient}
      socket={socket as unknown as RealtimeSocket}
    >
      {children}
    </ApiProvider>
  );
  return { client, socket, wrapper };
}

describe("useParkings", () => {
  it("loads parkings through the client", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useParkings(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([parkingB]));
  });

  it("refetches when the server pushes parking.updated", async () => {
    const { client, socket, wrapper } = setup();
    const { result } = renderHook(() => useParkings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    socket.fire("parking.updated", { id: "B", freeCount: 0, status: "FULL" });

    await waitFor(() => expect(client.getParkings).toHaveBeenCalledTimes(2));
  });

  it("refetches after the socket reconnects", async () => {
    const { client, socket, wrapper } = setup();
    const { result } = renderHook(() => useParkings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    socket.fire("connect");

    await waitFor(() => expect(client.getParkings).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @smart-parking/api-client`
Expected: FAIL, cannot resolve `../src` / `../src/react`.

- [ ] **Step 4: Implement the client**

`packages/api-client/src/client.ts`:

```ts
import { ParkingDetail, ParkingSummary } from "@smart-parking/shared";
import { z } from "zod";

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiClient {
  getParkings(): Promise<ParkingSummary[]>;
  getParking(id: string): Promise<ParkingDetail>;
}

export interface ApiClientOptions {
  /** "" (default) = same origin, which is what the Vite proxy and Caddy expect. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export function createApiClient({
  baseUrl = "",
  fetchFn = globalThis.fetch.bind(globalThis),
}: ApiClientOptions = {}): ApiClient {
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}${path}`, { headers: { Accept: "application/json" } });
    } catch (error) {
      throw new ApiError(0, `Network error: ${(error as Error).message}`);
    }
    if (!response.ok) throw new ApiError(response.status, `Request failed: ${response.status}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(response.status, "Invalid JSON response");
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(response.status, "Unexpected response shape");
    return parsed.data;
  }

  return {
    getParkings: () => get("/api/parkings", z.array(ParkingSummary)),
    getParking: (id) => get(`/api/parkings/${encodeURIComponent(id)}`, ParkingDetail),
  };
}
```

`packages/api-client/src/realtime.ts`:

```ts
import { io, type Socket } from "socket.io-client";

/** The subset of a Socket.IO socket the React bindings need (easy to fake in tests). */
export type RealtimeSocket = Pick<Socket, "on" | "off">;

/** No url = same origin (/socket.io via the Vite proxy in dev, Caddy in production). */
export function createRealtime(url?: string): Socket {
  return url ? io(url) : io();
}
```

`packages/api-client/src/index.ts`:

```ts
export * from "./client";
export * from "./realtime";
```

`packages/api-client/src/react.tsx`:

```tsx
import { SOCKET_EVENTS } from "@smart-parking/shared";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { ApiClient } from "./client";
import type { RealtimeSocket } from "./realtime";

export const queryKeys = {
  parkings: ["parkings"] as const,
  parking: (id: string) => ["parkings", id] as const,
};

const ApiClientContext = createContext<ApiClient | null>(null);

export interface ApiProviderProps {
  client: ApiClient;
  queryClient: QueryClient;
  socket?: RealtimeSocket;
  children: ReactNode;
}

export function ApiProvider({ client, queryClient, socket, children }: ApiProviderProps) {
  useEffect(() => {
    if (!socket) return;
    // Server push = "something changed": refetch instead of patching caches by hand.
    // On (re)connect we may have missed events, so refetch too.
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.parkings });
    };
    socket.on(SOCKET_EVENTS.parkingUpdated, refresh);
    socket.on("connect", refresh);
    return () => {
      socket.off(SOCKET_EVENTS.parkingUpdated, refresh);
      socket.off("connect", refresh);
    };
  }, [socket, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error("useApiClient must be used inside <ApiProvider>");
  return client;
}

export function useParkings() {
  const client = useApiClient();
  return useQuery({ queryKey: queryKeys.parkings, queryFn: () => client.getParkings() });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @smart-parking/api-client && npm run typecheck -w @smart-parking/api-client`
Expected: PASS (9 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add typed API client with realtime React bindings"
```

---

### Task 9: `packages/ui` shared components and theme

**Files:**

- Create: `packages/ui/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/test-setup.ts`
- Create: `packages/ui/src/theme.css`, `src/StatusPill.tsx`, `src/ParkingCard.tsx`, `src/LanguageToggle.tsx`, `src/index.ts`
- Test: `packages/ui/test/components.test.tsx`

**Interfaces:**

- Consumes: `ParkingSummary`, `ParkingStatus` (shared); `initI18n`, `setLanguage`, `SUPPORTED_LANGUAGES` (i18n).
- Produces: `StatusPill({ status })`, `ParkingCard({ parking })` (renders `<article aria-label={parking.name}>`), `LanguageToggle()`, and the CSS export `@smart-parking/ui/theme.css`, which defines Tailwind colors `brand`, `free`, `occupied`, `unknown`.

- [ ] **Step 1: Create the package files**

`packages/ui/package.json`:

```json
{
  "name": "@smart-parking/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./theme.css": "./src/theme.css"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smart-parking/i18n": "*",
    "@smart-parking/shared": "*",
    "react-i18next": "^15.7.3"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "react": "^19.1.1",
    "react-dom": "^19.1.1"
  }
}
```

`packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/ui/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
```

`packages/ui/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

`packages/ui/src/theme.css`:

```css
/* Shared design tokens. Apps import this after `@import "tailwindcss";` */
@theme {
  --color-brand: #0f766e;
  --color-free: #16a34a;
  --color-occupied: #dc2626;
  --color-unknown: #9ca3af;
}
```

Run: `npm install`

- [ ] **Step 2: Write the failing tests**

`packages/ui/test/components.test.tsx`:

```tsx
import { initI18n } from "@smart-parking/i18n";
import type { ParkingSummary } from "@smart-parking/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { LanguageToggle, ParkingCard, StatusPill } from "../src";

const parkingA: ParkingSummary = {
  id: "A",
  name: "Parking A",
  address: "Sukhbaatar Square",
  lat: 0,
  lng: 0,
  freeCount: 4,
  totalCount: 6,
  status: "AVAILABLE",
};

function withI18n(ui: ReactNode) {
  return render(<I18nextProvider i18n={initI18n()}>{ui}</I18nextProvider>);
}

describe("StatusPill", () => {
  it("labels FULL in Mongolian and exposes the status", () => {
    withI18n(<StatusPill status="FULL" />);
    expect(screen.getByText("Дүүрсэн")).toHaveAttribute("data-status", "FULL");
  });
});

describe("ParkingCard", () => {
  it("shows name, address, free count and status", () => {
    withI18n(<ParkingCard parking={parkingA} />);
    const card = screen.getByRole("article", { name: "Parking A" });
    expect(card).toHaveTextContent("Sukhbaatar Square");
    expect(card).toHaveTextContent("4/6 сул");
    expect(card).toHaveTextContent("Сул байртай");
  });
});

describe("LanguageToggle", () => {
  it("switches every label to English and marks EN as pressed", async () => {
    withI18n(
      <>
        <LanguageToggle />
        <ParkingCard parking={parkingA} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(await screen.findByText("4/6 free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "МН" })).toHaveAttribute("aria-pressed", "false");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @smart-parking/ui`
Expected: FAIL, cannot resolve `../src`.

- [ ] **Step 4: Implement the components**

`packages/ui/src/StatusPill.tsx`:

```tsx
import type { ParkingStatus } from "@smart-parking/shared";
import { useTranslation } from "react-i18next";

const styles: Record<ParkingStatus, string> = {
  AVAILABLE: "bg-free/15 text-free",
  FULL: "bg-occupied/15 text-occupied",
};

export function StatusPill({ status }: { status: ParkingStatus }) {
  const { t } = useTranslation();
  return (
    <span
      data-status={status}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${styles[status]}`}
    >
      {t(`parking.status.${status}`)}
    </span>
  );
}
```

`packages/ui/src/ParkingCard.tsx`:

```tsx
import type { ParkingSummary } from "@smart-parking/shared";
import { useTranslation } from "react-i18next";
import { StatusPill } from "./StatusPill";

export function ParkingCard({ parking }: { parking: ParkingSummary }) {
  const { t } = useTranslation();
  return (
    <article
      aria-label={parking.name}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{parking.name}</h2>
          <p className="text-sm text-slate-500">{parking.address}</p>
        </div>
        <StatusPill status={parking.status} />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">
        {t("parking.free", { free: parking.freeCount, total: parking.totalCount })}
      </p>
    </article>
  );
}
```

`packages/ui/src/LanguageToggle.tsx`:

```tsx
import { setLanguage, SUPPORTED_LANGUAGES } from "@smart-parking/i18n";
import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="inline-flex rounded-lg bg-white/15 p-0.5"
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = i18n.language === lng;
        return (
          <button
            key={lng}
            type="button"
            aria-pressed={active}
            onClick={() => void setLanguage(i18n, lng)}
            className={`rounded-md px-2 py-1 text-xs font-semibold ${active ? "bg-white text-brand" : "text-current"}`}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}
```

`packages/ui/src/index.ts`:

```ts
export { StatusPill } from "./StatusPill";
export { ParkingCard } from "./ParkingCard";
export { LanguageToggle } from "./LanguageToggle";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @smart-parking/ui && npm run typecheck -w @smart-parking/ui`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add shared UI components and theme tokens"
```

---

### Task 10: `apps/driver` PWA

**Files:**

- Create: `apps/driver/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/icon.svg`
- Create: `apps/driver/src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test-setup.ts`
- Test: `apps/driver/src/App.test.tsx`

**Interfaces:**

- Consumes: `createApiClient`, `createRealtime`, `ApiError`, `ApiClient` (api-client); `ApiProvider`, `useParkings` (api-client/react); `initI18n` (i18n); `ParkingCard`, `LanguageToggle`, `theme.css` (ui).
- Produces: `npm run dev -w @smart-parking/driver` on port 5173, proxying `/api` and `/socket.io` to `API_URL` (default `http://localhost:3000`).

- [ ] **Step 1: Create the app files**

`apps/driver/package.json`:

```json
{
  "name": "@smart-parking/driver",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smart-parking/api-client": "*",
    "@smart-parking/i18n": "*",
    "@smart-parking/shared": "*",
    "@smart-parking/ui": "*",
    "@tanstack/react-query": "^5.87.1",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "react-i18next": "^15.7.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.13",
    "@vitejs/plugin-react": "^5.0.2",
    "tailwindcss": "^4.1.13",
    "vite": "^7.1.5",
    "vite-plugin-pwa": "^1.0.3"
  }
}
```

`apps/driver/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node", "vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

`apps/driver/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Smart Parking",
        short_name: "Parking",
        description: "Find free parking in real time",
        theme_color: "#0f766e",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      // Precache the app shell only. Live data must never come from the service worker.
      workbox: { navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/] },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/socket.io": { target: apiTarget, ws: true },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
```

`apps/driver/index.html`:

```html
<!doctype html>
<html lang="mn">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f766e" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <title>Smart Parking</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/driver/public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f766e"/>
  <text x="256" y="350" font-family="Arial, sans-serif" font-size="300" font-weight="700" fill="#ffffff" text-anchor="middle">P</text>
</svg>
```

`apps/driver/src/index.css`:

```css
@import "tailwindcss";
@import "@smart-parking/ui/theme.css";
@source "../../../packages/ui/src";
```

`apps/driver/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

`apps/driver/src/App.test.tsx`:

```tsx
import { ApiError, type ApiClient } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import type { ParkingSummary } from "@smart-parking/shared";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

const parkings: ParkingSummary[] = [
  {
    id: "A",
    name: "Parking A",
    address: "x",
    lat: 0,
    lng: 0,
    freeCount: 4,
    totalCount: 6,
    status: "AVAILABLE",
  },
  {
    id: "B",
    name: "Parking B",
    address: "y",
    lat: 0,
    lng: 0,
    freeCount: 0,
    totalCount: 6,
    status: "FULL",
  },
];

function renderApp(getParkings: ApiClient["getParkings"]) {
  const client: ApiClient = { getParkings, getParking: vi.fn() };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={initI18n()}>
      <ApiProvider client={client} queryClient={queryClient}>
        <App />
      </ApiProvider>
    </I18nextProvider>,
  );
}

describe("Driver App", () => {
  it("lists both parkings with live availability in Mongolian", async () => {
    renderApp(vi.fn().mockResolvedValue(parkings));
    expect(screen.getByRole("heading", { name: "Сул зогсоол хайх" })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Parking A" })).toHaveTextContent("4/6 сул");
    expect(screen.getByRole("article", { name: "Parking B" })).toHaveTextContent("Дүүрсэн");
  });

  it("shows an error alert instead of a blank screen when the API is down", async () => {
    renderApp(vi.fn().mockRejectedValue(new ApiError(502, "Request failed: 502")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Мэдээлэл ачаалж чадсангүй");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @smart-parking/driver`
Expected: FAIL, cannot resolve `./App`.

- [ ] **Step 4: Implement the app**

`apps/driver/src/App.tsx`:

```tsx
import { useParkings } from "@smart-parking/api-client/react";
import { LanguageToggle, ParkingCard } from "@smart-parking/ui";
import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  const parkings = useParkings();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">{t("app.driverTitle")}</h1>
        <LanguageToggle />
      </header>
      <main className="mx-auto max-w-md space-y-3 p-4">
        {parkings.isPending && <p className="text-slate-500">{t("common.loading")}</p>}
        {parkings.isError && (
          <p role="alert" className="rounded-lg bg-occupied/10 p-3 text-occupied">
            {t("common.error")}
          </p>
        )}
        {parkings.data?.map((parking) => (
          <ParkingCard key={parking.id} parking={parking} />
        ))}
      </main>
    </div>
  );
}
```

`apps/driver/src/main.tsx`:

```tsx
import { createApiClient, createRealtime } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
import "./index.css";

const i18n = initI18n();
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ApiProvider client={createApiClient()} queryClient={queryClient} socket={createRealtime()}>
        <App />
      </ApiProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Run the tests, typecheck and build**

Run: `npm test -w @smart-parking/driver && npm run typecheck -w @smart-parking/driver && npm run build -w @smart-parking/driver`
Expected: PASS (2 tests), typecheck clean, build output includes `dist/sw.js` and `dist/manifest.webmanifest`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add driver PWA showing live parking availability"
```

---

### Task 11: `apps/dashboard`

**Files:**

- Create: `apps/dashboard/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `apps/dashboard/src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test-setup.ts`
- Test: `apps/dashboard/src/App.test.tsx`

**Interfaces:**

- Consumes: the same as Task 10.
- Produces: `npm run dev -w @smart-parking/dashboard` on port 5174. W1 shows site cards. Slot grid, devices, events and pilot requests arrive in W5.

- [ ] **Step 1: Create the app files**

`apps/dashboard/package.json`:

```json
{
  "name": "@smart-parking/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smart-parking/api-client": "*",
    "@smart-parking/i18n": "*",
    "@smart-parking/shared": "*",
    "@smart-parking/ui": "*",
    "@tanstack/react-query": "^5.87.1",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "react-i18next": "^15.7.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.13",
    "@vitejs/plugin-react": "^5.0.2",
    "tailwindcss": "^4.1.13",
    "vite": "^7.1.5"
  }
}
```

`apps/dashboard/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node", "vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

`apps/dashboard/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/socket.io": { target: apiTarget, ws: true },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
```

`apps/dashboard/index.html`:

```html
<!doctype html>
<html lang="mn">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Smart Parking — Operator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/dashboard/src/index.css`:

```css
@import "tailwindcss";
@import "@smart-parking/ui/theme.css";
@source "../../../packages/ui/src";
```

`apps/dashboard/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

`apps/dashboard/src/App.test.tsx`:

```tsx
import { ApiError, type ApiClient } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import type { ParkingSummary } from "@smart-parking/shared";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

const parkings: ParkingSummary[] = [
  {
    id: "A",
    name: "Parking A",
    address: "x",
    lat: 0,
    lng: 0,
    freeCount: 4,
    totalCount: 6,
    status: "AVAILABLE",
  },
  {
    id: "B",
    name: "Parking B",
    address: "y",
    lat: 0,
    lng: 0,
    freeCount: 0,
    totalCount: 6,
    status: "FULL",
  },
];

function renderApp(getParkings: ApiClient["getParkings"]) {
  const client: ApiClient = { getParkings, getParking: vi.fn() };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={initI18n()}>
      <ApiProvider client={client} queryClient={queryClient}>
        <App />
      </ApiProvider>
    </I18nextProvider>,
  );
}

describe("Dashboard App", () => {
  it("shows the operator title and a card per site", async () => {
    renderApp(vi.fn().mockResolvedValue(parkings));
    expect(screen.getByRole("heading", { name: "Операторын самбар" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Зогсоолууд" })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Parking B" })).toHaveTextContent("0/6 сул");
  });

  it("shows an error alert when the API is down", async () => {
    renderApp(vi.fn().mockRejectedValue(new ApiError(0, "Network error")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Мэдээлэл ачаалж чадсангүй");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @smart-parking/dashboard`
Expected: FAIL, cannot resolve `./App`.

- [ ] **Step 4: Implement the app**

`apps/dashboard/src/App.tsx`:

```tsx
import { useParkings } from "@smart-parking/api-client/react";
import { LanguageToggle, ParkingCard } from "@smart-parking/ui";
import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  const parkings = useParkings();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between bg-brand px-6 py-3 text-white">
        <h1 className="text-lg font-semibold">{t("app.dashboardTitle")}</h1>
        <LanguageToggle />
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {t("dashboard.sites")}
        </h2>
        {parkings.isPending && <p className="text-slate-500">{t("common.loading")}</p>}
        {parkings.isError && (
          <p role="alert" className="rounded-lg bg-occupied/10 p-3 text-occupied">
            {t("common.error")}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {parkings.data?.map((parking) => (
            <ParkingCard key={parking.id} parking={parking} />
          ))}
        </div>
      </main>
    </div>
  );
}
```

`apps/dashboard/src/main.tsx`:

```tsx
import { createApiClient, createRealtime } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
import "./index.css";

const i18n = initI18n();
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ApiProvider client={createApiClient()} queryClient={queryClient} socket={createRealtime()}>
        <App />
      </ApiProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Run the tests, typecheck and build**

Run: `npm test -w @smart-parking/dashboard && npm run typecheck -w @smart-parking/dashboard && npm run build -w @smart-parking/dashboard`
Expected: PASS (2 tests), typecheck clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add operator dashboard skeleton"
```

---

### Task 12: `apps/partners`

**Files:**

- Create: `apps/partners/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `apps/partners/src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test-setup.ts`
- Test: `apps/partners/src/App.test.tsx`

**Interfaces:**

- Consumes: the same as Task 10.
- Produces: `npm run dev -w @smart-parking/partners` on port 5175. W1 has a hero section, the "live proof" cards and a CTA linking to `#pilot`. The full landing page and the pilot form arrive in W5.

- [ ] **Step 1: Create the app files**

`apps/partners/package.json`:

```json
{
  "name": "@smart-parking/partners",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smart-parking/api-client": "*",
    "@smart-parking/i18n": "*",
    "@smart-parking/shared": "*",
    "@smart-parking/ui": "*",
    "@tanstack/react-query": "^5.87.1",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "react-i18next": "^15.7.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.13",
    "@vitejs/plugin-react": "^5.0.2",
    "tailwindcss": "^4.1.13",
    "vite": "^7.1.5"
  }
}
```

`apps/partners/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node", "vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

`apps/partners/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiTarget = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/socket.io": { target: apiTarget, ws: true },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});
```

`apps/partners/index.html`:

```html
<!doctype html>
<html lang="mn">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Smart Parking — real-time parking availability for your sites"
    />
    <title>Smart Parking — Partners</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/partners/src/index.css`:

```css
@import "tailwindcss";
@import "@smart-parking/ui/theme.css";
@source "../../../packages/ui/src";
```

`apps/partners/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

`apps/partners/src/App.test.tsx`:

```tsx
import { ApiError, type ApiClient } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import type { ParkingSummary } from "@smart-parking/shared";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

const parkings: ParkingSummary[] = [
  {
    id: "A",
    name: "Parking A",
    address: "x",
    lat: 0,
    lng: 0,
    freeCount: 4,
    totalCount: 6,
    status: "AVAILABLE",
  },
];

function renderApp(getParkings: ApiClient["getParkings"]) {
  const client: ApiClient = { getParkings, getParking: vi.fn() };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={initI18n()}>
      <ApiProvider client={client} queryClient={queryClient}>
        <App />
      </ApiProvider>
    </I18nextProvider>,
  );
}

describe("Partners App", () => {
  it("shows the hero, the pilot CTA and live proof", async () => {
    renderApp(vi.fn().mockResolvedValue(parkings));
    expect(
      screen.getByRole("heading", { level: 1, name: "Зогсоолоо ухаалаг болгоё" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pilot хүсэлт илгээх" })).toHaveAttribute(
      "href",
      "#pilot",
    );
    expect(await screen.findByRole("article", { name: "Parking A" })).toHaveTextContent("4/6 сул");
  });

  it("keeps the marketing content visible when live data fails", async () => {
    renderApp(vi.fn().mockRejectedValue(new ApiError(502, "Request failed: 502")));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pilot хүсэлт илгээх" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @smart-parking/partners`
Expected: FAIL, cannot resolve `./App`.

- [ ] **Step 4: Implement the app**

`apps/partners/src/App.tsx`:

```tsx
import { useParkings } from "@smart-parking/api-client/react";
import { LanguageToggle, ParkingCard } from "@smart-parking/ui";
import { useTranslation } from "react-i18next";

export function App() {
  const { t } = useTranslation();
  const parkings = useParkings();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav className="flex items-center justify-between px-6 py-4">
        <span className="font-bold text-brand">{t("app.partnersTitle")}</span>
        <div className="text-brand">
          <LanguageToggle />
        </div>
      </nav>
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t("partners.heroTitle")}</h1>
        <p className="mt-4 text-lg text-slate-600">{t("partners.heroBody")}</p>
        <a
          href="#pilot"
          className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-white"
        >
          {t("partners.cta")}
        </a>
      </section>
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          {t("partners.liveTitle")}
        </h2>
        {parkings.isError && (
          <p role="alert" className="rounded-lg bg-occupied/10 p-3 text-occupied">
            {t("common.error")}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {parkings.data?.map((parking) => (
            <ParkingCard key={parking.id} parking={parking} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

`apps/partners/src/main.tsx`:

```tsx
import { createApiClient, createRealtime } from "@smart-parking/api-client";
import { ApiProvider } from "@smart-parking/api-client/react";
import { initI18n } from "@smart-parking/i18n";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
import "./index.css";

const i18n = initI18n();
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ApiProvider client={createApiClient()} queryClient={queryClient} socket={createRealtime()}>
        <App />
      </ApiProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Run the tests, typecheck and build**

Run: `npm test -w @smart-parking/partners && npm run typecheck -w @smart-parking/partners && npm run build -w @smart-parking/partners`
Expected: PASS (2 tests), typecheck clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add partner site skeleton with live proof"
```

---

### Task 13: `tools/simulator` status command

**Files:**

- Create: `tools/simulator/package.json`, `tsconfig.json`, `src/format.ts`, `src/cli.ts`
- Test: `tools/simulator/test/format.test.ts`

**Interfaces:**

- Consumes: `createApiClient` (the Node-safe root export of api-client), `ParkingSummary`.
- Produces: `formatStatus(parkings: ParkingSummary[]): string` and the command `npm run sim -w @smart-parking/simulator -- status`. W2 adds heartbeats, `set` and `scenario 2-car`.

- [ ] **Step 1: Create the package files**

`tools/simulator/package.json`:

```json
{
  "name": "@smart-parking/simulator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "sim": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smart-parking/api-client": "*",
    "@smart-parking/shared": "*"
  },
  "devDependencies": {
    "tsx": "^4.20.5"
  }
}
```

`tools/simulator/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

`tools/simulator/test/format.test.ts`:

```ts
import type { ParkingSummary } from "@smart-parking/shared";
import { describe, expect, it } from "vitest";
import { formatStatus } from "../src/format";

const base = { address: "x", lat: 0, lng: 0, totalCount: 6 };

describe("formatStatus", () => {
  it("prints one aligned line per parking", () => {
    const parkings: ParkingSummary[] = [
      { ...base, id: "A", name: "Parking A", freeCount: 4, status: "AVAILABLE" },
      { ...base, id: "B", name: "Parking B", freeCount: 0, status: "FULL" },
    ];
    expect(formatStatus(parkings)).toBe(
      ["A  Parking A   4/6    AVAILABLE", "B  Parking B   0/6    FULL"].join("\n"),
    );
  });

  it("says so when there are no parkings", () => {
    expect(formatStatus([])).toBe("No parkings found (did you run npm run db:seed?)");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @smart-parking/simulator`
Expected: FAIL, cannot resolve `../src/format`.

- [ ] **Step 4: Implement the formatter and CLI**

`tools/simulator/src/format.ts`:

```ts
import type { ParkingSummary } from "@smart-parking/shared";

export function formatStatus(parkings: ParkingSummary[]): string {
  if (parkings.length === 0) return "No parkings found (did you run npm run db:seed?)";
  return parkings
    .map(
      (p) =>
        `${p.id.padEnd(3)}${p.name.padEnd(12)}${`${p.freeCount}/${p.totalCount}`.padEnd(7)}${p.status}`,
    )
    .join("\n");
}
```

`tools/simulator/src/cli.ts`:

```ts
import { createApiClient } from "@smart-parking/api-client";
import { formatStatus } from "./format";

const baseUrl = process.env.API_URL ?? "http://localhost:3000";
const [command = "status"] = process.argv.slice(2);

if (command === "status") {
  try {
    const parkings = await createApiClient({ baseUrl }).getParkings();
    console.log(formatStatus(parkings));
  } catch (error) {
    console.error(`Cannot reach API at ${baseUrl}: ${(error as Error).message}`);
    process.exit(1);
  }
} else {
  console.error(`Unknown command "${command}". Available: status`);
  process.exit(1);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @smart-parking/simulator && npm run typecheck -w @smart-parking/simulator`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add simulator status command"
```

---

### Task 14: One-command dev, README, CI and full verification

**Files:**

- Modify: `package.json` (add `dev`, `db:migrate`, `db:seed`, `sim` scripts)
- Create: `README.md`, `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: every workspace's `dev`, `test`, `typecheck` script.
- Produces: `npm run dev` starts the API and the 3 apps. CI runs lint, typecheck and test on every push to `main` and on every PR.

- [ ] **Step 1: Add the root scripts**

In `package.json`, replace the `"scripts"` object with:

```json
  "scripts": {
    "dev": "concurrently -k -n api,driver,dashboard,partners -c blue,green,magenta,yellow \"npm run dev -w @smart-parking/api\" \"npm run dev -w @smart-parking/driver\" \"npm run dev -w @smart-parking/dashboard\" \"npm run dev -w @smart-parking/partners\"",
    "db:up": "docker compose -f docker-compose.dev.yml up -d --wait",
    "db:down": "docker compose -f docker-compose.dev.yml down",
    "db:migrate": "npm run db:migrate -w @smart-parking/api",
    "db:seed": "npm run db:seed -w @smart-parking/api",
    "sim": "npm run sim -w @smart-parking/simulator --",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  },
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Smart Parking POC

2 parking sites · 12 slots (3 live + 9 simulated) · 2 entrance gates · one realtime backend · three web experiences.
Design: [`docs/superpowers/specs/2026-10-07-smart-parking-platform-design.md`](docs/superpowers/specs/2026-10-07-smart-parking-platform-design.md)

## Requirements

- Node.js 22 (`nvm use`)
- Docker Desktop (for PostgreSQL)

## First run

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up        # PostgreSQL on localhost:5433
npm run db:migrate   # apply migrations
npm run db:seed      # parkings A/B, 12 slots, 3 devices
npm run dev          # API + 3 web apps
```

| App                | URL                                | Owner  |
| ------------------ | ---------------------------------- | ------ |
| API                | http://localhost:3000/api/parkings | Role 4 |
| Driver PWA         | http://localhost:5173              | Role 5 |
| Operator dashboard | http://localhost:5174              | Role 6 |
| Partner site       | http://localhost:5175              | Role 6 |

`npm run sim -- status` prints current availability from the API.

## Repository

| Path                  | What                                                  | Owner     |
| --------------------- | ----------------------------------------------------- | --------- |
| `apps/api`            | Express + Socket.IO + Prisma (PostgreSQL)             | Role 4    |
| `apps/driver`         | Driver PWA (Vite + React)                             | Role 5    |
| `apps/dashboard`      | Operator dashboard                                    | Role 6    |
| `apps/partners`       | Business / partner site                               | Role 6    |
| `packages/shared`     | Zod schemas, types, availability rules (the contract) | all       |
| `packages/api-client` | Typed REST + realtime client, React hooks             | Roles 5/6 |
| `packages/ui`         | Shared components + theme                             | Roles 5/6 |
| `packages/i18n`       | MN/EN dictionaries                                    | all       |
| `tools/simulator`     | Virtual device for simulated slots                    | Role 4    |
| `firmware`            | ESP32 PlatformIO project + `PROTOCOL.md`              | Role 3    |
| `hardware`            | Wiring, photos, BOM                                   | Role 2    |
| `docs`                | Specs, plans, WBS, tests, research                    | Roles 1/7 |

## Everyday commands

```bash
npm test             # all tests (needs npm run db:up for API tests)
npm run typecheck
npm run lint
npm run format
npm run db:down      # stop PostgreSQL (data is kept in a Docker volume)
```

## Rules

- Change the contract in `packages/shared` first. Every app then sees the change at compile time.
- Availability (FREE/FULL) is computed only in the API. Apps and gates display it.
- Changing the device message format means updating `firmware/PROTOCOL.md` and `packages/shared/src/protocol.ts` in the same PR (CI checks them against each other).
````

- [ ] **Step 3: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: parking
          POSTGRES_PASSWORD: parking
          POSTGRES_DB: smart_parking_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U parking"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      TEST_DATABASE_URL: postgresql://parking:parking@localhost:5432/smart_parking_test
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 4: Run the full local check**

Run: `npm run format && npm run lint && npm run typecheck && npm test`
Expected: lint and typecheck clean. Every workspace's tests pass (shared 15, i18n 7, api 13, api-client 9, ui 3, driver 2, dashboard 2, partners 2, simulator 2).

- [ ] **Step 5: Verify the end-to-end dev experience**

Run: `npm run dev`. In a second terminal:

- `curl -s localhost:5173/api/parkings`: same JSON as the API (proving the Vite proxy works)
- `npm run sim -- status`: two lines, `A … 4/6 AVAILABLE` and `B … 5/6 AVAILABLE`
- Open http://localhost:5173, http://localhost:5174 and http://localhost:5175. Each shows the Parking A/B cards. Clicking EN switches the language, and the choice survives a reload.

Stop with Ctrl+C. All 4 processes exit (`-k`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add one-command dev, README and CI"
```
