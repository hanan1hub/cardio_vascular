/*
 * ESP32 ECG + PPG with 125 ECG samples for Live Waveform Display
 *
 * Based on your existing code. Collects 125 ECG samples at ~250Hz
 * (one sample every 4ms) before each PPG reading, for proper
 * waveform display on the dashboard and ML BP prediction.
 *
 * Required: ArduinoJson, Wire, MAX30105 library, spo2_algorithm
 */

#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

// -------- Sensor Pins --------
#define SDA_PIN 21
#define SCL_PIN 22

MAX30105 particleSensor;

// -------- WiFi --------
const char* ssid = "SoC_Lab";
const char* password = "research@soc";
const char* serverURL = "http://100.59.81.84/api/readings";

// -------- ECG --------
const int ecgPin = 34;      // AD8232 OUTPUT
const int loPlusPin = 32;   // LO+
const int loMinusPin = 33;  // LO-

// ECG: 125 samples at 250Hz = 4ms per sample (~500ms total)
#define ECG_SAMPLE_RATE_HZ 250
#define ECG_SAMPLES 125
#define ECG_SAMPLE_INTERVAL_US (1000000 / ECG_SAMPLE_RATE_HZ)  // 4000 us = 4ms
uint16_t ecgBuffer[ECG_SAMPLES];

// -------- PPG --------
#define BUFFER_SIZE 100
uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];
int32_t spo2;
int8_t validSPO2;
int32_t heartRate;
int8_t validHeartRate;
bool ppgFound = false;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n>>> SYSTEM BOOTING (ECG 125 samples + PPG MODE)...");

  // -------- ECG Setup --------
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  pinMode(ecgPin, INPUT);
  pinMode(loPlusPin, INPUT);
  pinMode(loMinusPin, INPUT);
  Serial.printf(">>> ECG Ready on GPIO 34. Will collect %d samples at %dHz.\n", ECG_SAMPLES, ECG_SAMPLE_RATE_HZ);

  // -------- PPG Setup --------
  Wire.begin(SDA_PIN, SCL_PIN);
  if (particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    ppgFound = true;
    Serial.println(">>> PPG Ready on GPIO 21/22.");

    particleSensor.setup();
    particleSensor.setPulseAmplitudeRed(0x1F);
    particleSensor.setPulseAmplitudeIR(0x1F);
    particleSensor.enableDIETEMPRDY();

  } else {
    Serial.println(">>> PPG NOT FOUND! Check wiring on GPIO 21 and 22.");
  }

  // -------- WiFi Setup --------
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.println("\n>>> Place finger on PPG sensor...");
}

// Collect 125 ECG samples at ~250Hz
void collectECGSamples() {
  bool leadsOff = (digitalRead(loPlusPin) == HIGH || digitalRead(loMinusPin) == HIGH);

  for (int i = 0; i < ECG_SAMPLES; i++) {
    unsigned long sampleStart = micros();

    if (leadsOff) {
      ecgBuffer[i] = 0;
    } else {
      ecgBuffer[i] = (uint16_t)analogRead(ecgPin);
    }

    // Maintain 250Hz (4ms between samples)
    unsigned long elapsed = micros() - sampleStart;
    if (elapsed < ECG_SAMPLE_INTERVAL_US) {
      delayMicroseconds(ECG_SAMPLE_INTERVAL_US - elapsed);
    }
  }
}

void loop() {
  // ---------- COLLECT 125 ECG SAMPLES (before PPG) ----------
  if (digitalRead(loPlusPin) == HIGH || digitalRead(loMinusPin) == HIGH) {
    Serial.println("⚠️ ECG leads disconnected!");
    for (int i = 0; i < ECG_SAMPLES; i++) ecgBuffer[i] = 0;
  } else {
    collectECGSamples();
  }

  // ---------- READ PPG ----------
  if (ppgFound) {
    Serial.println("📊 Collecting PPG samples...");

    for (int i = 0; i < BUFFER_SIZE; i++) {
      while (!particleSensor.available()) {
        particleSensor.check();
      }

      redBuffer[i] = particleSensor.getRed();
      irBuffer[i] = particleSensor.getIR();
      particleSensor.nextSample();

      if (i % 25 == 0) Serial.print(".");
    }
    Serial.println(" Done!");

    maxim_heart_rate_and_oxygen_saturation(
      irBuffer, BUFFER_SIZE,
      redBuffer,
      &spo2, &validSPO2,
      &heartRate, &validHeartRate
    );
  }

  int hr = (validHeartRate && heartRate > 0 && heartRate < 200) ? heartRate : 0;
  int sp = (validSPO2 && spo2 > 0 && spo2 <= 100) ? spo2 : 0;

  // ---------- DEBUG SERIAL ----------
  Serial.println("\n========== SENSOR READINGS ==========");
  Serial.printf("ECG: %d samples | HR: %d bpm | SpO2: %d %%\n", ECG_SAMPLES, hr, sp);
  if (ppgFound && irBuffer[0] < 50000) {
    Serial.println("⚠️ No finger detected on PPG sensor!");
  }

  // ---------- SEND TO BACKEND ----------
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(15000);

    // JSON: use StaticJsonDocument with enough capacity
    // 125 ECG ints + 100 PPG ints + overhead ~ 2.5KB, use 8KB to be safe
    StaticJsonDocument<8192> doc;
    doc["deviceId"] = "esp32-device";
    doc["hr"] = hr;
    doc["spo2"] = sp;

    // ECG array: all 125 samples (12-bit ADC, 0-4095)
    JsonArray ecgArr = doc.createNestedArray("ecg");
    for (int i = 0; i < ECG_SAMPLES; i++) {
      ecgArr.add(ecgBuffer[i]);
    }

    // PPG array: IR buffer
    JsonArray ppgArr = doc.createNestedArray("ppg");
    for (int i = 0; i < BUFFER_SIZE; i++) {
      ppgArr.add(irBuffer[i]);
    }

    String payload;
    serializeJson(doc, payload);

    Serial.println("\n📤 Sending to backend...");
    int code = http.POST(payload);

    if (code > 0) {
      Serial.printf("✅ HTTP %d\n", code);
      if (code == 200) {
        Serial.println("Response: " + http.getString());
      }
    } else {
      Serial.printf("❌ HTTP Error: %s\n", http.errorToString(code).c_str());
    }

    http.end();
  } else {
    Serial.println("❌ WiFi Disconnected!");
    WiFi.reconnect();
  }

  Serial.println("=====================================\n");
  delay(1000);
}
