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
