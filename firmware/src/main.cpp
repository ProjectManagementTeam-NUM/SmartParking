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
