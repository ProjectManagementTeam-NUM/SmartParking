# Firmware (Role 3)

PlatformIO project for ESP32 site controllers A and B. Not part of the npm workspace.

1. Install PlatformIO (VS Code extension or `pip install platformio`).
2. `cp include/config.example.h include/config.h` and fill in Wi-Fi, API host and device key.
3. `pio run -t upload && pio device monitor`

The message format is defined in [PROTOCOL.md](PROTOCOL.md). Changing it means changing `packages/shared/src/protocol.ts` in the same PR.
