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
