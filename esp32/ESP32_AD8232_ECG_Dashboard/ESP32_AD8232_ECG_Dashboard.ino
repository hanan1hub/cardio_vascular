/*
 * CARDIOTRIX — ESP32 AD8232 ECG → Dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * Hardware  : AD8232 ECG module
 *   OUTPUT  → GPIO 34  (ADC input, 12-bit 0-4095)
 *   LO+     → GPIO 32  (leads-off detection)
 *   LO-     → GPIO 33  (leads-off detection)
 *   3.3V / GND from ESP32
 *
 * Samples ECG at 250 Hz, batches 250 samples (~1 second), and POSTs them
 * to the Node.js backend every second.  The backend immediately broadcasts
 * via Socket.IO so the LiveSensor ECG waveform on the dashboard updates
 * in real time.
 *
 * POST  http://<server>:5000/api/ecg
 *       { "deviceId": "esp32-ecg", "ecg": [0..4095, ...250 values] }
 *
 * Required Arduino libraries : WiFi, HTTPClient (both built into ESP32 core)
 *                               ArduinoJson  (v6 or v7)
 * ═══════════════════════════════════════════════════════════════════════════
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── WiFi / Backend ────────────────────────────────────────────────────────────
const char* SSID       = "SoC_Lab";
const char* PASSWORD   = "research@soc";
const char* SERVER_URL = "http://10.7.161.78:5000/api/ecg";

// ── AD8232 Pins ───────────────────────────────────────────────────────────────
#define ECG_PIN    34   // Analog output from AD8232
#define LO_PLUS    32   // Leads-off detection LO+
#define LO_MINUS   33   // Leads-off detection LO-

// ── Sampling config ───────────────────────────────────────────────────────────
#define SAMPLE_RATE_HZ   250              // 250 samples per second
#define BATCH_SIZE       250              // 1 second of data per POST
#define SAMPLE_US        (1000000 / SAMPLE_RATE_HZ)   // 4000 µs between samples

// ── ECG buffer ────────────────────────────────────────────────────────────────
uint16_t ecgBatch[BATCH_SIZE];

// ── Reconnect helper ──────────────────────────────────────────────────────────
void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.println("WiFi lost — reconnecting…");
  WiFi.disconnect();
  WiFi.begin(SSID, PASSWORD);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 10000) {
    delay(300);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi reconnected: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi reconnect failed — will retry next loop");
  }
}

// ── setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== CARDIOTRIX ECG — AD8232 ===");

  analogReadResolution(12);             // 12-bit ADC → 0..4095
  analogSetAttenuation(ADC_11db);       // full-scale ~3.3 V
  pinMode(ECG_PIN,   INPUT);
  pinMode(LO_PLUS,   INPUT);
  pinMode(LO_MINUS,  INPUT);

  WiFi.mode(WIFI_STA);
  WiFi.begin(SSID, PASSWORD);
  Serial.print("Connecting to WiFi");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(400);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n⚠️  WiFi timeout — continuing, will retry each loop");
  }

  Serial.println("Attach ECG electrodes, then data will stream automatically.");
}

// ── loop ──────────────────────────────────────────────────────────────────────
void loop() {
  ensureWiFi();

  bool leadsOff = (digitalRead(LO_PLUS) == HIGH || digitalRead(LO_MINUS) == HIGH);

  // ── Collect BATCH_SIZE samples at SAMPLE_RATE_HZ ──────────────────────────
  for (int i = 0; i < BATCH_SIZE; i++) {
    unsigned long sampleStart = micros();

    ecgBatch[i] = leadsOff ? 0 : (uint16_t)analogRead(ECG_PIN);

    // Hold timing: wait until the full sample interval has elapsed
    long remaining = (long)SAMPLE_US - (long)(micros() - sampleStart);
    if (remaining > 0) delayMicroseconds((uint32_t)remaining);
  }

  if (leadsOff) {
    Serial.println("⚠️  ECG leads off — sending zeros (check electrode placement)");
  }

  // ── POST to backend ────────────────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ No WiFi — skipping POST");
    return;
  }

  // Build JSON: {"deviceId":"esp32-ecg","ecg":[...]}
  // 250 uint16 values × ~5 chars each + overhead ≈ 1.5 KB → use 4 KB doc
  StaticJsonDocument<4096> doc;
  doc["deviceId"] = "esp32-ecg";
  JsonArray arr = doc.createNestedArray("ecg");
  for (int i = 0; i < BATCH_SIZE; i++) arr.add(ecgBatch[i]);

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);   // 3 s timeout — fast enough to keep waveform smooth

  int code = http.POST(payload);
  if (code > 0) {
    if (code == 200) {
      Serial.printf("✅ ECG batch sent (%d samples)\n", BATCH_SIZE);
    } else {
      Serial.printf("⚠️  HTTP %d: %s\n", code, http.getString().c_str());
    }
  } else {
    Serial.printf("❌ POST failed: %s\n", http.errorToString(code).c_str());
  }
  http.end();

  // No extra delay — the 250-sample collection already took ~1 second
}

