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
| Landing site       | http://localhost:5175              | Role 6 |

`npm run sim -- status` prints current availability from the API.

## API endpoints

Base URL `http://localhost:3000/api`. Contracts: `packages/shared`. Device wire format: `firmware/PROTOCOL.md`.

| Method | Path                   | Auth                               | Purpose                                          |
| ------ | ---------------------- | ---------------------------------- | ------------------------------------------------ |
| GET    | `/parkings`            | —                                  | Sites with `freeCount`, `totalCount`, `status`   |
| GET    | `/parkings/:id`        | —                                  | Site + slots + gate                              |
| GET    | `/slots?parkingId=`    | —                                  | Slot list (optionally one site)                  |
| PATCH  | `/slots/:id`           | operator                           | Manual override `{ state }`                      |
| GET    | `/devices`             | —                                  | Devices with derived `online`                    |
| GET    | `/events?limit=50`     | operator                           | Event log, newest first (limit 1–200)            |
| POST   | `/pilot-requests`      | —                                  | "Request a Pilot" form → `201`                   |
| GET    | `/pilot-requests`      | operator                           | Submissions, newest first                        |
| POST   | `/ingest`              | device (`X-Device-Key`)            | Heartbeat + slot reports + gate decision → `204` |
| WS     | `/ws/device?deviceId=` | device (`X-Device-Key` or `&key=`) | Server → gate `availability` messages            |

Operator auth: `Authorization: Bearer $OPERATOR_TOKEN` (unset token → always `401`).
Socket.IO: `parking.updated` to everyone; `subscribe { parkingId }` for `slot.updated`; connect with `auth: { token }` for the dashboard feed (`slot.updated`, `device.updated`, `event.created`).

## Repository

| Path                  | What                                                  | Owner     |
| --------------------- | ----------------------------------------------------- | --------- |
| `apps/api`            | Express + Socket.IO + Prisma (PostgreSQL)             | Role 4    |
| `apps/driver`         | Driver PWA (Vite + React)                             | Role 5    |
| `apps/dashboard`      | Operator dashboard                                    | Role 6    |
| `apps/landing`        | Business / landing page (for partners)                | Role 6    |
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
