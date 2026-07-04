/*
 * ─────────────────────────────────────────────────────────────────────────────
 * ESP32 Cardiovascular Monitor
 * MAX30102 (HR / SpO2 / PPG)  +  INMP441 (PCG microphone)  +  LCD 16×2 I2C
 *
 * WiFi    : NCIL_Lab  /  ncillab@123
 * Server  : http://10.7.241.2:5000/api/readings
 *
 * Pin map
 * ─────────────────────────────────────────────────────────────────────────────
 *  MAX30102 (I2C)          INMP441 (I2S)           LCD 16×2 (I2C, 0x27)
 *  SDA  → GPIO 21          WS  (LRCL)  → GPIO 25   SDA → GPIO 21
 *  SCL  → GPIO 22          SCK (BCLK)  → GPIO 26   SCL → GPIO 22
 *  VIN  → 3.3 V            SD  (DOUT)  → GPIO 34
 *  GND  → GND              VDD → 3.3 V
 *                          GND → GND
 *                          L/R → GND  (selects LEFT channel)
 *
 * Libraries (install via Library Manager)
 *   • SparkFun MAX3010x Pulse and Proximity Sensor Library
 *   • LiquidCrystal_I2C  (by Frank de Brabander)
 *   • ArduinoJson  (v6)
 *   • WiFi, HTTPClient, driver/i2s.h  — all built into ESP32 core
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>

#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <LiquidCrystal_I2C.h>

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// WiFi
const char* SSID       = "SoC_Lab";
const char* PASSWORD   = "research@soc";
const char* SERVER_URL = "http://10.7.161.78:5000/api/readings";

// I2C pins (shared by MAX30102 and LCD)
#define SDA_PIN 21
#define SCL_PIN 22

// I2S pins for INMP441
#define I2S_WS_PIN   25   // Word Select  (LRCL)
#define I2S_SCK_PIN  26   // Bit Clock    (BCLK)
#define I2S_SD_PIN   34   // Serial Data  (DOUT from mic)
#define I2S_PORT     I2S_NUM_0

// PPG buffer
#define PPG_BUFFER_SIZE 100
#define ECG_SAMPLES       0   // no ECG sensor in this build — send empty array

// PCG capture
#define PCG_SAMPLE_RATE_HZ  8000    // I2S capture rate
#define PCG_CAPTURE_MS      1000    // record 1 second  → 8 000 raw samples
#define PCG_RAW_SAMPLES     (PCG_SAMPLE_RATE_HZ * PCG_CAPTURE_MS / 1000)  // 8 000
#define PCG_DOWNSAMPLE      4       // 8 000 Hz → 2 000 Hz
#define PCG_OUT_SAMPLES     (PCG_RAW_SAMPLES / PCG_DOWNSAMPLE)            // 2 000
#define PCG_OUT_RATE        (PCG_SAMPLE_RATE_HZ / PCG_DOWNSAMPLE)         // 2 000

// LCD
#define LCD_ADDR  0x27
#define LCD_COLS  16
#define LCD_ROWS   2

// Display pages (cycles every LCD_PAGE_MS ms)
#define LCD_PAGE_MS   3000
#define LCD_PAGES          4   // HR+SpO2 | BP | Heart Sound | Status

// ═══════════════════════════════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════════════════════════════

MAX30105          particleSensor;
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

// PPG
uint32_t irBuffer[PPG_BUFFER_SIZE];
uint32_t redBuffer[PPG_BUFFER_SIZE];
int32_t  heartRate;
int8_t   validHeartRate;
int32_t  spo2;
int8_t   validSPO2;
bool     ppgReady = false;

// PCG — raw I2S samples (int32_t × 8 000 = 32 KB on heap)
int32_t*  pcgRaw = nullptr;
float     pcgOut[PCG_OUT_SAMPLES];   // normalised, downsampled (8 KB)

// LCD state
uint8_t   lcdPage        = 0;
unsigned long lcdPageMs  = 0;

// Last ML results (parsed from server HTTP response)
float  lastSBP  = 0, lastDBP  = 0, lastMeanBP = 0;
char   lastHSType[16]  = "---";
float  lastHSConf      = 0.0f;
bool   haveMLResult    = false;

// Uptime / status
unsigned long loopCount = 0;
char statusMsg[17]      = "Booting...";

// ═══════════════════════════════════════════════════════════════════════════
//  I2S  (INMP441 microphone)
// ═══════════════════════════════════════════════════════════════════════════

void i2s_init() {
  i2s_config_t cfg = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate          = PCG_SAMPLE_RATE_HZ,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,   // L/R pin tied to GND
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count        = 8,
    .dma_buf_len          = 512,
    .use_apll             = false,
    .tx_desc_auto_clear   = false,
    .fixed_mclk           = 0
  };

  i2s_pin_config_t pins = {
    .bck_io_num   = I2S_SCK_PIN,
    .ws_io_num    = I2S_WS_PIN,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num  = I2S_SD_PIN
  };

  i2s_driver_install(I2S_PORT, &cfg, 0, nullptr);
  i2s_set_pin(I2S_PORT, &pins);
  i2s_zero_dma_buffer(I2S_PORT);
  Serial.println(">>> I2S (INMP441) ready");
}

// Record PCG_RAW_SAMPLES samples then normalise + downsample into pcgOut[]
bool capturePCG() {
  if (!pcgRaw) {
    Serial.println("❌ PCG buffer not allocated");
    return false;
  }

  size_t bytesRead = 0;
  const size_t totalBytes = PCG_RAW_SAMPLES * sizeof(int32_t);
  size_t offset = 0;

  // Read in chunks until buffer is full
  unsigned long deadline = millis() + PCG_CAPTURE_MS + 500;   // +0.5 s slack
  while (offset < totalBytes && millis() < deadline) {
    size_t chunk = 0;
    i2s_read(I2S_PORT,
             (char*)pcgRaw + offset,
             min((size_t)2048, totalBytes - offset),
             &chunk,
             portMAX_DELAY);
    offset += chunk;
    bytesRead += chunk;
  }

  int samplesRead = bytesRead / sizeof(int32_t);
  if (samplesRead < 500) {
    Serial.printf("❌ PCG capture too short: %d samples\n", samplesRead);
    return false;
  }

  // ── Normalise: INMP441 data is in bits [31:14] of each int32_t
  //    Right-shift by 14 → 18-bit signed value → normalise to [-1, 1]
  // ── Downsample 4:1 simultaneously
  float maxAbs = 1.0f;   // find peak for normalisation
  for (int i = 0; i < samplesRead; i++) {
    float v = (float)(pcgRaw[i] >> 14);
    if (fabsf(v) > maxAbs) maxAbs = fabsf(v);
  }

  int outIdx = 0;
  for (int i = 0; i < samplesRead && outIdx < PCG_OUT_SAMPLES; i += PCG_DOWNSAMPLE) {
    float v = (float)(pcgRaw[i] >> 14) / maxAbs;   // [-1, 1]
    pcgOut[outIdx++] = v;
  }

  // Zero-fill remainder if short
  while (outIdx < PCG_OUT_SAMPLES) pcgOut[outIdx++] = 0.0f;

  Serial.printf(">>> PCG captured: %d raw → %d out @ %d Hz\n",
                samplesRead, PCG_OUT_SAMPLES, PCG_OUT_RATE);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LCD helpers
// ═══════════════════════════════════════════════════════════════════════════

// Print a padded line (fills rest with spaces so old chars are erased)
void lcdLine(uint8_t row, const char* text) {
  lcd.setCursor(0, row);
  char buf[LCD_COLS + 1];
  snprintf(buf, sizeof(buf), "%-16s", text);
  lcd.print(buf);
}

void updateLCD(int hr, int sp) {
  if (millis() - lcdPageMs < LCD_PAGE_MS) return;
  lcdPageMs = millis();
  lcdPage = (lcdPage + 1) % LCD_PAGES;

  char line0[17], line1[17];

  switch (lcdPage) {
    case 0:   // ── HR + SpO2
      snprintf(line0, sizeof(line0), "HR: %3d bpm", hr);
      snprintf(line1, sizeof(line1), "SpO2: %3d %%", sp);
      break;

    case 1:   // ── Blood Pressure
      if (haveMLResult && lastSBP > 0) {
        snprintf(line0, sizeof(line0), "BP:%3.0f/%3.0f mmHg", lastSBP, lastDBP);
        snprintf(line1, sizeof(line1), "Mean:%4.0f mmHg", lastMeanBP);
      } else {
        snprintf(line0, sizeof(line0), "BP: ---/---");
        snprintf(line1, sizeof(line1), "Waiting...");
      }
      break;

    case 2:   // ── Heart Sound
      if (haveMLResult) {
        snprintf(line0, sizeof(line0), "Heart: %-5s", lastHSType);
        snprintf(line1, sizeof(line1), "Conf: %4.1f %%", lastHSConf * 100.0f);
      } else {
        snprintf(line0, sizeof(line0), "Heart Sound:");
        snprintf(line1, sizeof(line1), "Analyzing...");
      }
      break;

    case 3:   // ── Status
      snprintf(line0, sizeof(line0), "Loop: %-7lu", loopCount);
      snprintf(line1, sizeof(line1), "%-16s", statusMsg);
      break;
  }

  lcdLine(0, line0);
  lcdLine(1, line1);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Parse ML results from server HTTP response
// ═══════════════════════════════════════════════════════════════════════════

void parseServerResponse(const String& body) {
  // Expected JSON shape (approximate):
  // {
  //   "bp": { "mean_bp": 95.0 },
  //   "heartSoundType": "N",
  //   "confidence": 0.98,
  //   "sbp": 120.0,
  //   "dbp": 80.0
  // }
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return;

  // BP
  float mean = 0;
  if (doc.containsKey("bp") && doc["bp"].containsKey("mean_bp")) {
    mean = doc["bp"]["mean_bp"].as<float>();
  } else if (doc.containsKey("mean_bp")) {
    mean = doc["mean_bp"].as<float>();
  }

  float sbp = doc["sbp"] | 0.0f;
  float dbp = doc["dbp"] | 0.0f;
  if (sbp == 0 && mean > 0) {
    sbp = mean * 1.35f;
    dbp = mean * 0.87f;
  }

  // Heart sound
  const char* hs   = doc["heartSoundType"] | doc["heart_sound_type"] | (const char*)nullptr;
  float conf       = doc["confidence"] | 0.0f;

  if (sbp > 0 || hs) {
    lastSBP    = sbp;
    lastDBP    = dbp;
    lastMeanBP = mean;
    if (hs) {
      strncpy(lastHSType, hs, sizeof(lastHSType) - 1);
      lastHSType[sizeof(lastHSType) - 1] = '\0';
    }
    lastHSConf  = conf;
    haveMLResult = true;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Send reading to server
// ═══════════════════════════════════════════════════════════════════════════

void sendReading(int hr, int sp) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi disconnected, skipping send");
    strcpy(statusMsg, "WiFi lost!");
    WiFi.reconnect();
    return;
  }

  // ── Build JSON payload manually for the large PCG array ────────────────
  // We write directly into a heap buffer to avoid double-copying.
  // Estimate: ~24 000 chars for 2000 floats + ~3 000 for header/PPG/meta
  const int JSON_BUF_SIZE = 32768;
  char* jsonBuf = (char*)malloc(JSON_BUF_SIZE);
  if (!jsonBuf) {
    Serial.println("❌ Out of memory for JSON buffer");
    strcpy(statusMsg, "OOM!");
    return;
  }

  // Header fields + PPG array
  int pos = 0;
  pos += snprintf(jsonBuf + pos, JSON_BUF_SIZE - pos,
    "{\"deviceId\":\"esp32-cardio\","
    "\"hr\":%d,"
    "\"spo2\":%d,"
    "\"ecg\":[],"
    "\"ppg\":[",
    hr, sp);

  for (int i = 0; i < PPG_BUFFER_SIZE; i++) {
    pos += snprintf(jsonBuf + pos, JSON_BUF_SIZE - pos,
                    "%lu%s", (unsigned long)irBuffer[i],
                    i < PPG_BUFFER_SIZE - 1 ? "," : "");
  }

  // PCG array (float, 4 decimal places)
  pos += snprintf(jsonBuf + pos, JSON_BUF_SIZE - pos,
                  "],\"pcg_sample_rate\":%d,\"pcg\":[", PCG_OUT_RATE);

  for (int i = 0; i < PCG_OUT_SAMPLES; i++) {
    // Clamp output to valid range
    float v = pcgOut[i];
    if (v >  1.0f) v =  1.0f;
    if (v < -1.0f) v = -1.0f;
    pos += snprintf(jsonBuf + pos, JSON_BUF_SIZE - pos,
                    "%.4f%s", v,
                    i < PCG_OUT_SAMPLES - 1 ? "," : "");
    if (pos > JSON_BUF_SIZE - 200) {
      Serial.println("⚠️ JSON buffer nearly full, truncating PCG array");
      // close array early
      snprintf(jsonBuf + pos, JSON_BUF_SIZE - pos, "]}");
      pos = strlen(jsonBuf);
      break;
    }
  }

  pos += snprintf(jsonBuf + pos, JSON_BUF_SIZE - pos, "]}");

  Serial.printf("📤 Sending %d bytes → %s\n", pos, SERVER_URL);
  strcpy(statusMsg, "Sending...");
  updateLCD(hr, sp);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(20000);

  int code = http.POST((uint8_t*)jsonBuf, pos);
  free(jsonBuf);

  if (code > 0) {
    Serial.printf("✅ HTTP %d\n", code);
    if (code == 200 || code == 201) {
      String resp = http.getString();
      Serial.println("Response: " + resp);
      parseServerResponse(resp);
      strcpy(statusMsg, "OK");
    }
  } else {
    Serial.printf("❌ HTTP Error: %s\n", http.errorToString(code).c_str());
    strcpy(statusMsg, "Send fail!");
  }
  http.end();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n╔══════════════════════════════════╗");
  Serial.println(  "║  ESP32 Cardiovascular Monitor    ║");
  Serial.println(  "║  MAX30102 + INMP441 + LCD 16×2   ║");
  Serial.println(  "╚══════════════════════════════════╝\n");

  // ── I2C ──────────────────────────────────────────────────────────────────
  Wire.begin(SDA_PIN, SCL_PIN);

  // ── LCD ──────────────────────────────────────────────────────────────────
  lcd.init();
  lcd.backlight();
  lcdLine(0, "Cardio Monitor");
  lcdLine(1, "Booting...");
  Serial.println(">>> LCD ready");

  // ── MAX30102 ─────────────────────────────────────────────────────────────
  if (particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    ppgReady = true;
    particleSensor.setup(60, 4, 2, 100, 411, 4096);
    //  brightness=60  averages=4  ledMode=2(Red+IR)
    //  sampleRate=100  pulseWidth=411  adcRange=4096
    Serial.println(">>> MAX30102 ready");
    lcdLine(1, "MAX30102 OK");
  } else {
    Serial.println("❌ MAX30102 not found! Check SDA/SCL wiring.");
    lcdLine(1, "PPG FAIL!");
  }
  delay(500);

  // ── I2S / INMP441 ────────────────────────────────────────────────────────
  i2s_init();
  lcdLine(1, "INMP441 OK");
  delay(500);

  // ── Allocate PCG raw buffer on heap (32 KB) ───────────────────────────
  pcgRaw = (int32_t*)malloc(PCG_RAW_SAMPLES * sizeof(int32_t));
  if (pcgRaw) {
    Serial.printf(">>> PCG buffer: %d bytes allocated\n",
                  (int)(PCG_RAW_SAMPLES * sizeof(int32_t)));
  } else {
    Serial.println("❌ Failed to allocate PCG buffer!");
    lcdLine(1, "PCG alloc fail");
  }
  delay(500);

  // ── WiFi ─────────────────────────────────────────────────────────────────
  lcdLine(0, "Connecting WiFi");
  lcdLine(1, SSID);
  WiFi.begin(SSID, PASSWORD);
  Serial.print(">>> Connecting to WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n>>> WiFi connected: %s\n", WiFi.localIP().toString().c_str());
    lcdLine(0, "WiFi Connected!");
    char ipStr[17];
    snprintf(ipStr, sizeof(ipStr), "%s", WiFi.localIP().toString().c_str());
    lcdLine(1, ipStr);
    strcpy(statusMsg, "WiFi OK");
  } else {
    Serial.println("\n❌ WiFi connection failed — continuing offline");
    lcdLine(0, "WiFi FAILED");
    lcdLine(1, "Offline mode");
    strcpy(statusMsg, "No WiFi");
  }
  delay(1500);

  lcdLine(0, "Place finger on");
  lcdLine(1, "PPG sensor...");
  Serial.println("\n>>> Place finger on MAX30102.  Starting in 2 s...\n");
  delay(2000);
  lcdPageMs = millis();
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════════════════

void loop() {
  loopCount++;
  Serial.printf("\n═══ Loop %lu ════════════════════════════════\n", loopCount);

  // ── 1. Collect PPG samples ────────────────────────────────────────────
  int hr = 0, sp = 0;

  if (ppgReady) {
    Serial.println("📊 Collecting PPG samples...");
    lcdLine(0, "Reading PPG...");
    lcdLine(1, "");

    for (int i = 0; i < PPG_BUFFER_SIZE; i++) {
      while (!particleSensor.available()) particleSensor.check();
      redBuffer[i] = particleSensor.getRed();
      irBuffer[i]  = particleSensor.getIR();
      particleSensor.nextSample();
    }

    maxim_heart_rate_and_oxygen_saturation(
      irBuffer, PPG_BUFFER_SIZE,
      redBuffer,
      &spo2, &validSPO2,
      &heartRate, &validHeartRate
    );

    hr = (validHeartRate && heartRate > 30 && heartRate < 220) ? (int)heartRate : 0;
    sp = (validSPO2     && spo2 > 50      && spo2 <= 100)      ? (int)spo2      : 0;

    bool fingerOn = (irBuffer[0] > 50000);
    Serial.printf(">>> HR: %d bpm  SpO2: %d %%  Finger: %s\n",
                  hr, sp, fingerOn ? "YES" : "NO");

    if (!fingerOn) {
      lcdLine(0, "No finger!");
      lcdLine(1, "Put on sensor");
    }
  }

  // ── 2. Capture PCG audio ──────────────────────────────────────────────
  bool pcgOk = false;
  if (pcgRaw) {
    Serial.println("🎙 Capturing PCG (1 s)...");
    lcdLine(0, "Recording PCG..");
    lcdLine(1, "Keep device still");
    pcgOk = capturePCG();
  }

  // ── 3. Serial debug summary ───────────────────────────────────────────
  Serial.println("─────────────────────────────");
  Serial.printf("  HR    : %d bpm\n", hr);
  Serial.printf("  SpO2  : %d %%\n", sp);
  Serial.printf("  PCG   : %s (%d out-samples @ %d Hz)\n",
                pcgOk ? "OK" : "FAIL", PCG_OUT_SAMPLES, PCG_OUT_RATE);
  if (haveMLResult) {
    Serial.printf("  BP    : %.0f/%.0f (mean %.0f)\n", lastSBP, lastDBP, lastMeanBP);
    Serial.printf("  Heart : %s  conf=%.1f%%\n", lastHSType, lastHSConf * 100);
  }
  Serial.println("─────────────────────────────");

  // ── 4. Send to backend ────────────────────────────────────────────────
  sendReading(hr, sp);

  // ── 5. Update LCD with latest values ─────────────────────────────────
  // Force-show new data on next page switch
  if (millis() - lcdPageMs >= LCD_PAGE_MS) {
    updateLCD(hr, sp);
  }

  Serial.println(">>> Waiting 2 s...\n");
  // LCD updates during the wait
  unsigned long waitEnd = millis() + 2000;
  while (millis() < waitEnd) {
    updateLCD(hr, sp);
    delay(100);
  }
}
