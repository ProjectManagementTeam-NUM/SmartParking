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
