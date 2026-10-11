# Smart Parking POC — Platform Design

- **Date:** 2026-10-07
- **Source:** `Smart Parking POC.pdf` (product proposal, 13 slides) + team roles table (7 roles)
- **Status:** Draft — awaiting team review

## 1. Goal

Turn the current "3 sensors → 1 dashboard" demo into an end-to-end system simulation:
**2 parking sites, 12 slots (3 live + 9 simulated), 2 entrance gates, one realtime backend, three web experiences.**

Success = the final-day **2-car scenario** runs reliably, offline, in front of judges:

1. Two cars both head to parking B (B has exactly 1 free slot).
2. Car 1 parks in B → slot sensor fires → B becomes **FULL** everywhere (driver app, dashboard, gate OLED).
3. Car 2 arrives at gate B → barrier stays closed → driver app suggests A → car 2 parks in A.

### In scope

- 2 physical parking models, 12 represented / 3 live slots, 2 entrance gates
- Driver Web/PWA, Operator Dashboard, Business/Partner website
- Shared backend + realtime API
- ESP32 firmware, ESP32 simulator, 2-car scenario script
- MN + EN UI

### Out of scope (from proposal)

Native mobile app · real GPS navigation · reservations · payments · ANPR · AI prediction · production-scale cloud · user accounts.

## 2. Repository

One git monorepo using **npm workspaces**. `firmware/` and `hardware/` are not workspaces.

```
smart-parking/
├── package.json              # workspaces: apps/*, packages/*, tools/*
├── tsconfig.base.json
├── docker-compose.yml        # full stack: db + api + web (Caddy)
├── docker-compose.dev.yml    # db only, for local dev
├── .env.example
├── README.md
├── apps/
│   ├── api/                  # Role 4 — Express + Socket.IO + device WS + Prisma
│   │   ├── Dockerfile
│   │   ├── prisma/           # schema.prisma, migrations, seed
│   │   ├── src/
│   │   │   ├── routes/       # parkings, slots, devices, events, ingest, pilot-requests
│   │   │   ├── realtime/     # event bus + Socket.IO adapter + device WS adapter
│   │   │   ├── domain/       # availability, offline detection, ownership — pure logic
│   │   │   └── server.ts
│   │   └── test/
│   ├── driver/               # Role 5 — Vite + React + TS PWA
│   ├── dashboard/            # Role 6 — Vite + React + TS
│   └── partners/             # Role 6 — Vite + React + TS
├── packages/
│   ├── shared/               # Zod schemas + TS types + pure helpers (suggested slot)
│   ├── api-client/           # typed REST client + Socket.IO client + TanStack Query hooks
│   ├── ui/                   # Tailwind preset, tokens, SlotBadge, ParkingCard, StatusPill…
│   └── i18n/                 # mn.json, en.json, react-i18next setup
├── tools/
│   └── simulator/            # virtual device for SIMULATED slots + scenario scripts
├── infra/
│   ├── Caddyfile
│   └── web.Dockerfile        # builds the 3 frontends, served by Caddy
├── firmware/                 # Role 3 — PlatformIO (Arduino), ESP32 A + B
│   ├── platformio.ini
│   ├── src/
│   └── PROTOCOL.md           # device ↔ API message contract
├── hardware/                 # Role 2 — wiring diagrams, photos, BOM.csv
└── docs/                     # Roles 1 + 7 — WBS, test plan/results, survey, risks, demo script
```

Ownership maps to the roles table: each top-level app/folder has one owner and one backup.

## 3. Stack

| Layer            | Choice                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Runtime          | Node.js 22 LTS                                                                               |
| Package manager  | npm workspaces                                                                               |
| API              | Express + Zod validation                                                                     |
| Browser realtime | Socket.IO (rooms)                                                                            |
| Device realtime  | plain WebSocket (`ws`) at `/ws/device`                                                       |
| Database         | PostgreSQL 16 via Prisma (same engine in every environment)                                  |
| Frontends        | Vite + React + TS ×3; `vite-plugin-pwa` on driver                                            |
| Styling          | Tailwind + `packages/ui` preset                                                              |
| Data fetching    | TanStack Query; socket events update/invalidate caches                                       |
| i18n             | react-i18next, dictionaries in `packages/i18n`, default `mn`                                 |
| Quality          | ESLint + Prettier, Vitest, supertest, Playwright                                             |
| CI               | GitHub Actions (lint, typecheck, unit, integration with Postgres service)                    |
| Containers       | Docker Compose; Caddy as reverse proxy + static server                                       |
| Firmware         | PlatformIO + Arduino framework, ArduinoJson, arduinoWebSockets, ESP32Servo, Adafruit SSD1306 |

Not used, by decision: Bun/pnpm (team familiarity), Supabase (not permitted), MQTT (overkill for 2 devices).

## 4. Data model

```
Parking       id ("A"|"B"), name, address, lat, lng
Slot          id ("A1".."B6"), parkingId, label, state, source, deviceId?, updatedAt
Device        id ("esp32-a"|"esp32-b"|"simulator"), parkingId?, apiKeyHash, lastSeenAt?, firmwareVersion?
Gate          parkingId (PK), position (OPEN|CLOSED), lastDecision (OPENED|DENIED)?, lastDecisionAt?
Event         id, type, parkingId?, slotId?, deviceId?, payload (json), createdAt
PilotRequest  id, name, organization, email, phone?, siteCount?, message?, createdAt
```

- `Slot.state`: `FREE | OCCUPIED | UNKNOWN`
- `Slot.source`: `LIVE | SIMULATED`
- **Derived, never stored:**
  - `parking.freeCount` = number of slots with `state = FREE` (UNKNOWN is _not_ free)
  - `parking.status` = `freeCount > 0 ? AVAILABLE : FULL`
  - `device.online` = `lastSeenAt` within the last **15 s**

**Seed:**

| Parking | LIVE slots (device) | SIMULATED slots (device `simulator`) |
| ------- | ------------------- | ------------------------------------ |
| A       | A1, A2 (`esp32-a`)  | A3–A6                                |
| B       | B1 (`esp32-b`)      | B2–B6                                |

**Sensor noise** is filtered on the ESP32 (state change only after N consistent readings); the API trusts reported state.

## 5. API

Base path `/api`. Every request and response body is defined by a Zod schema in `packages/shared`.

| Method | Path                | Auth     | Purpose                                   |
| ------ | ------------------- | -------- | ----------------------------------------- |
| GET    | `/parkings`         | —        | list with `freeCount`, `status`           |
| GET    | `/parkings/:id`     | —        | parking + slots + gate                    |
| GET    | `/slots?parkingId=` | —        | slot list                                 |
| PATCH  | `/slots/:id`        | operator | manual override `{ state }`               |
| GET    | `/devices`          | —        | devices with `online`                     |
| GET    | `/events?limit=50`  | operator | latest events, newest first               |
| POST   | `/pilot-requests`   | —        | Request a Pilot form                      |
| GET    | `/pilot-requests`   | operator | list submissions                          |
| POST   | `/ingest`           | device   | sensor readings + heartbeat + gate events |

### `POST /ingest`

Header `X-Device-Key: <key>`. Body:

```json
{
  "deviceId": "esp32-b",
  "firmwareVersion": "0.1.0",
  "slots": [{ "id": "B1", "state": "OCCUPIED" }],
  "gate": { "event": "DENIED" }
}
```

- `slots` and `gate` are optional; an empty body (just `deviceId`) is a valid heartbeat.
- Devices POST on every state change and at least every **5 s**.
- Each call updates `lastSeenAt`.
- A device may only write slots whose `deviceId` matches it, otherwise `403`.

### Device WebSocket `/ws/device?deviceId=…&key=…`

Server → device, on connect and on every availability change for the device's parking (the `simulator` device has no parking and receives updates for all parkings):

```json
{ "type": "availability", "parkingId": "B", "status": "FULL", "freeCount": 0 }
```

### Auth (POC level)

- Device keys and one `OPERATOR_TOKEN` come from environment variables. Device keys are hashed into `Device.apiKeyHash` at seed time.
- Operator endpoints require `Authorization: Bearer <OPERATOR_TOKEN>`.
- No user accounts.

## 6. Realtime

Inside the API there is one **domain event bus** with two adapters:

```
domain (slot changed / device online changed / gate decision)
        │
     event bus
     ├── Socket.IO adapter  → browsers
     └── device WS adapter  → ESP32 gates (availability only)
```

Socket.IO events:

| Event             | Rooms                       | Payload                      |
| ----------------- | --------------------------- | ---------------------------- |
| `slot.updated`    | `parking:<id>`, `dashboard` | Slot                         |
| `parking.updated` | broadcast                   | `{ id, freeCount, status }`  |
| `device.updated`  | `dashboard`                 | `{ id, online, lastSeenAt }` |
| `event.created`   | `dashboard`                 | Event                        |

When a client reconnects it refetches everything through TanStack Query; missed events are not replayed.

## 7. Gate decision

- The **server owns the rule** (`status`). The **ESP32 acts on its cached copy**: when the gate IR sensor detects a car, it opens the servo if AVAILABLE and keeps it closed if FULL, with no network round trip.
- The OLED shows `AVAILABLE n` / `FULL`, plus `OFFLINE` when the device WS is disconnected. If disconnected, the gate keeps using the last known status.
- The ESP32 reports `OPENED` / `DENIED` through `/ingest`, so the dashboard logs it and `Gate` is updated.
- **Availability is sensor-only.** A car that has passed the gate but not yet parked does not reduce `freeCount` (chosen deliberately, see §12).

## 8. Applications

### Driver PWA — `apps/driver`

- **Parking list:** a card per site showing free/total, AVAILABLE/FULL badge and a live indicator. Sorted by distance when browser geolocation is granted, otherwise fixed order. No map SDK.
- **Parking detail:** 2×3 slot grid (FREE green / OCCUPIED red / UNKNOWN grey), **one suggested slot highlighted**, gate status.
- **FULL fallback:** if the selected site is FULL, a banner suggests the other site with its free count and a switch button.
- **Connection state:** "Reconnecting…" banner and "last updated Ns ago" time when the socket is down.
- **PWA:** manifest + icons, app shell precached; API data is never served from cache.

### Operator Dashboard — `apps/dashboard`

- Overview: per-site free/total, status, gate position + last decision.
- Slot grid with `LIVE`/`SIM` tag; clicking a slot opens a FREE/OCCUPIED override (PATCH).
- Devices: online/offline, last seen, firmware version.
- Live event feed (`event.created`).
- Pilot requests table.
- Operator token entered once, stored in localStorage.

### Business / Partner site — `apps/partners`

Single landing page: Problem → Solution (3-step how it works) → **Live proof** (read-only A/B availability widget from the API) → Pilot package → Benefits/ROI → **Request a Pilot** form (POST `/pilot-requests`, with success and error states).

### Shared frontend concerns

- `packages/api-client` is the only code that knows URLs and socket setup.
- `packages/ui` holds shared components and the Tailwind preset.
- `packages/i18n` holds MN/EN dictionaries. The language toggle appears on all 3 sites and is persisted in localStorage.
- **Suggested-slot rule** is a pure function in `packages/shared` (`suggestSlot(slots) → slotId | null`), unit-tested.

## 9. Simulator — `tools/simulator`

- A virtual device `simulator` that owns all SIMULATED slots and uses `/ingest` exactly like an ESP32. It also connects to `/ws/device` so it can act as a gate when hardware is absent.
- Commands:
  - `npm run sim` keeps heartbeats running and randomly flips simulated slots at a configurable rate.
  - `npm run sim -- set B 1` sets site B to exactly N free slots.
  - `npm run sim -- scenario 2-car` scripts the final-day flow, with simulated gate events when no hardware is attached.
- Lets software roles work end-to-end before the hardware exists (W2–W3).

## 10. Environments & deployment

| Env       | How                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev | `docker compose -f docker-compose.dev.yml up -d` (Postgres only) + `npm run dev` (api, 3 frontends, simulator; hot reload)                          |
| Staging   | **Deferred until ~W3.** Requirement: any Docker-capable host running `docker-compose.yml` (VPS preferred), or a PaaS building `apps/api/Dockerfile` |
| Demo day  | Demo laptop runs `docker compose up` on a dedicated Wi-Fi hotspot, fully offline. ESP32s use plain HTTP/WS to the laptop's LAN IP                   |

`docker-compose.yml` services:

- `db`: postgres:16 with a named volume
- `api`: runs `prisma migrate deploy` then starts; `restart: unless-stopped`
- `web`: Caddy serving the 3 built frontends and proxying `/api`, `/socket.io` and `/ws/device` to `api`. Routes by hostname when a domain exists (`app.`, `dashboard.`, root), otherwise by port or path on the LAN.

Firmware reads the server host and port from a config header, so switching between dev, staging and demo is one constant.

## 11. Error handling

| Failure                             | Behaviour                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Invalid input                       | `400` + Zod field errors                                                                                          |
| Missing or wrong device key         | `401`                                                                                                             |
| Device writes a slot it doesn't own | `403`                                                                                                             |
| Device silent > 15 s                | marked offline; its slots → `UNKNOWN`; `device.updated` + `event.created` emitted (checked by a 5 s interval job) |
| Device WS drops                     | gate uses cached status, OLED `OFFLINE`, reconnect with backoff                                                   |
| Browser socket drops                | banner + last-updated time; full refetch on reconnect                                                             |
| API crash                           | container restarts; all state is in Postgres                                                                      |

## 12. Known limitations

- **Sensor-only availability:** between gate entry and slot detection, the site still counts the slot as free. The demo script requires car 2 to approach only after car 1's slot sensor shows OCCUPIED.
- Staging host not chosen yet.
- POC-level auth (shared tokens); no rate limiting, accounts or audit trail.

## 13. Testing

| Level           | Tool                                                           | Covers                                                                                     |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Unit            | Vitest                                                         | availability/status, offline detection, slot ownership, `suggestSlot`                      |
| API integration | Vitest + supertest + Postgres container                        | `/ingest` → DB → emitted Socket.IO/device events; auth errors                              |
| Contract        | Vitest                                                         | JSON examples in `firmware/PROTOCOL.md` validate against `packages/shared` schemas         |
| E2E             | Playwright                                                     | `scenario 2-car`: driver shows B FULL + switch-to-A banner; dashboard logs `Gate B DENIED` |
| Hardware        | manual checklist, `docs/test-plan.md` → `docs/test-results.md` | HC-SR04 thresholds, servo angles, OLED text, power under load                              |
| CI              | GitHub Actions                                                 | lint, typecheck, unit, integration on every PR                                             |

## 14. Delivery alignment (8-week plan)

| Week | Platform milestone                                                               |
| ---- | -------------------------------------------------------------------------------- |
| W1   | Repo skeleton, shared schemas, Prisma schema + seed, PROTOCOL.md, compose dev DB |
| W2   | Hardware proof (roles 2/3); simulator posting to a stub `/ingest`                |
| W3   | API + realtime complete; staging host decided                                    |
| W4   | Driver PWA                                                                       |
| W5   | Dashboard + Partner site; Docker build of full stack                             |
| W6   | Integration: real ESP32 A + B + simulator against one API                        |
| W7   | System test (E2E + hardware checklist), pitch                                    |
| W8   | Freeze, demo-laptop rehearsal of the 2-car scenario                              |

From W6 onward no new core features, only integration, stability and pitch work (per the proposal).
