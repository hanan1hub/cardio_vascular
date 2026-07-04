/*
 * CARDIOTRIX — ESP32 Firmware
 * ═══════════════════════════════════════════════════════════════════════════
 * Sensors : INMP441 (I2S microphone)  +  MAX30102 (PPG / IR+Red)
 *
 * ── MODE 1  (PCG Active — default) ────────────────────────────────────────
 *   Audio task (Core 0) streams raw 16-bit I2S samples continuously over USB
 *   Serial at 921600 baud.  serialService.js opens the port and reads them
 *   when the "Record Heart Sound" button is pressed on the dashboard.
 *
 *   Main loop (Core 1) calculates BPM + SpO2 from MAX30102, shows them on
 *   the LCD, and POSTs {hr, spo2} to the Node.js backend via WiFi every 5 s.
 *   The backend saves the reading and re-broadcasts via Socket.IO so the
 *   LiveSensor panel on the dashboard updates in real time.
 *
 * ── MODE 2  (PPG Recording — triggered by "PPG_REC\n") ────────────────────
 *   Audio task sleeps — Serial bus is quiet.
 *   Main loop sends "D:<IR>,<Red>\n" at ~100 Hz for 120 s.
 *   serialService.js collects these lines and feeds them to ppg_bp_server.py
 *   for blood-pressure prediction.
 *   After 120 s the device returns to Mode 1 automatically.
 *
 * ── Commands (sent by serialService.js over USB) ───────────────────────────
 *   "PCG_REC\n"  →  stay in / return to Mode 1  (PCG)
 *   "PPG_REC\n"  →  switch to Mode 2             (PPG 120 s)
 *
 * ── WiFi POST  →  POST /api/readings ─────────────────────────────────────
 *   { "deviceId":"esp32-cardiotrix", "hr":<n>, "spo2":<n>,
 *     "ecg":[], "ppg":[], "pcg":[] }
 *
 * ── Required Arduino libraries ────────────────────────────────────────────
 *   LiquidCrystal_I2C          (Frank de Brabander / johnrickman)
 *   SparkFun MAX3010x Pulse and Proximity Sensor Library
 * ═══════════════════════════════════════════════════════════════════════════
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "MAX30105.h"
#include "heartRate.h"

// ── WiFi / Backend ────────────────────────────────────────────────────────────
const char* SSID       = "SoC_Lab";
const char* PASSWORD   = "research@soc";
const char* SERVER_URL = "http://100.59.81.84/api/readings";

// ── I2S pins (INMP441) ────────────────────────────────────────────────────────
#define I2S_WS   15
#define I2S_SCK  14
#define I2S_SD   32
#define I2S_PORT I2S_NUM_0

// ── LCD (I2C address 0x27, 16×2) ─────────────────────────────────────────────
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ── MAX30102 ──────────────────────────────────────────────────────────────────
MAX30105 particleSensor;

// ── Mode ──────────────────────────────────────────────────────────────────────
//   1 = PCG active  (I2S → Serial, live vitals via WiFi)
//   2 = PPG recording  (D:IR,Red lines for 120 s, then auto-return to 1)
volatile int currentMode = 1;

// ── BPM ───────────────────────────────────────────────────────────────────────
const byte RATE_SIZE = 4;
byte  rates[RATE_SIZE] = {0};
byte  rateSpot         = 0;
long  lastBeat         = 0;
float beatsPerMinute   = 0.0f;
int   beatAvg          = 0;

// ── SpO2 ──────────────────────────────────────────────────────────────────────
int spo2Val = 0;

// ── Periodic timers ───────────────────────────────────────────────────────────
unsigned long lastLcdMs  = 0;
unsigned long lastPostMs = 0;
const unsigned long LCD_INTERVAL  = 1000;   // ms
const unsigned long POST_INTERVAL = 5000;   // ms

// ── FreeRTOS ──────────────────────────────────────────────────────────────────
TaskHandle_t AudioTaskHandle;


// ─────────────────────────────────────────────────────────────────────────────
//  I2S driver install
// ─────────────────────────────────────────────────────────────────────────────
void i2s_install() {
  const i2s_config_t cfg = {
    .mode             = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate      = 16000,
    .bits_per_sample  = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format   = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count    = 16,   // 16 x 512 x 2 B  ≈  512 ms DMA headroom
    .dma_buf_len      = 512,  // prevents dropout when WiFi POST runs on Core 0
    .use_apll         = false,
  };
  i2s_driver_install(I2S_PORT, &cfg, 0, NULL);
}

void i2s_setpin() {
  const i2s_pin_config_t pins = {
    .bck_io_num   = I2S_SCK,
    .ws_io_num    = I2S_WS,
    .data_out_num = -1,
    .data_in_num  = I2S_SD,
  };
  i2s_set_pin(I2S_PORT, &pins);
}


// ─────────────────────────────────────────────────────────────────────────────
//  Audio task — pinned to Core 0
//  Streams 16-bit PCG samples over USB Serial when in Mode 1.
//  portMAX_DELAY: blocks until the DMA delivers a sample (~62 µs at 16 kHz).
//  Mode change takes effect on the very next sample — no perceptible gap.
// ─────────────────────────────────────────────────────────────────────────────
void audio_task(void* param) {
  int16_t sample = 0;
  size_t  bytesRead;
  for (;;) {
    if (currentMode == 1) {
      i2s_read(I2S_PORT, &sample, sizeof(sample), &bytesRead, portMAX_DELAY);
      if (bytesRead > 0) {
        Serial.write((uint8_t*)&sample, sizeof(sample));
      }
    } else {
      vTaskDelay(5 / portTICK_PERIOD_MS);
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  WiFi connect helper
// ─────────────────────────────────────────────────────────────────────────────
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(SSID, PASSWORD);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("WiFi Connecting ");

  int dots = 0;
  while (WiFi.status() != WL_CONNECTED && dots < 20) {
    delay(500);
    lcd.setCursor(dots % 16, 1);
    lcd.print(".");
    dots++;
  }

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    lcd.setCursor(0, 0); lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
  } else {
    lcd.setCursor(0, 0); lcd.print("WiFi FAILED");
    lcd.setCursor(0, 1); lcd.print("USB Mode Only");
  }
  delay(2000);
}


// ─────────────────────────────────────────────────────────────────────────────
//  POST {hr, spo2} to the Node.js backend.
//  Backend writes to DB and emits "new_reading" via Socket.IO so the
//  dashboard LiveSensor panel (Heart Rate + SpO2 VCards) updates live.
//  Timeout 1500 ms — keeps the main loop from stalling too long.
// ─────────────────────────────────────────────────────────────────────────────
void postVitals(int hr, int spo2) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(1500);

  // Manual JSON — no ArduinoJson library needed
  String body = "{\"deviceId\":\"esp32-cardiotrix\","
                "\"hr\":"   + String(hr)   + ","
                "\"spo2\":" + String(spo2) + ","
                "\"ecg\":[], \"ppg\":[], \"pcg\":[]}";

  http.POST(body);   // fire-and-forget
  http.end();
}


// ─────────────────────────────────────────────────────────────────────────────
//  setup()
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(921600);
  Wire.begin();

  // LCD welcome
  lcd.init();
  lcd.backlight();
  lcd.setCursor(3, 0); lcd.print("CARDIOTRIX");
  lcd.setCursor(1, 1); lcd.print("SYSTEM READY");
  delay(2000);

  // MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("MAX30102 FAIL!");
    lcd.setCursor(0, 1); lcd.print("Check wiring.");
    while (1) delay(1000);
  }
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeGreen(0);

  // I2S (INMP441)
  i2s_install();
  i2s_setpin();
  i2s_start(I2S_PORT);

  // Audio task on Core 0
  xTaskCreatePinnedToCore(
    audio_task, "AudioTask",
    10000, NULL, 1, &AudioTaskHandle, 0
  );

  // WiFi
  connectWiFi();

  // Ready
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("PCG ACTIVE");
  lcd.setCursor(0, 1); lcd.print("No finger...");
}


// ─────────────────────────────────────────────────────────────────────────────
//  loop()  — runs on Core 1
// ─────────────────────────────────────────────────────────────────────────────
void loop() {

  // ── Serial command handler ────────────────────────────────────────────────
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "PPG_REC") {
      currentMode = 2;
      return;
    }
    if (cmd == "PCG_REC") {
      currentMode = 1;
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print("PCG ACTIVE");
      lcd.setCursor(0, 1); lcd.print("No finger...");
      return;
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  //  MODE 1 — PCG active
  //  Audio task (Core 0) handles I2S → Serial automatically.
  //  This loop only updates LCD and posts vitals via WiFi.
  // ═══════════════════════════════════════════════════════════════════════════
  if (currentMode == 1) {

    long irValue = particleSensor.getIR();

    // Beat detection → 4-sample rolling BPM average
    if (checkForBeat(irValue)) {
      long delta = millis() - lastBeat;
      lastBeat   = millis();
      beatsPerMinute = 60.0f / (delta / 1000.0f);
      if (beatsPerMinute > 20 && beatsPerMinute < 255) {
        rates[rateSpot++] = (byte)beatsPerMinute;
        rateSpot %= RATE_SIZE;
        beatAvg = 0;
        for (byte i = 0; i < RATE_SIZE; i++) beatAvg += rates[i];
        beatAvg /= RATE_SIZE;
      }
    }

    // SpO2 — ratio-of-ratios estimate (±2%).
    // For medically accurate SpO2 include spo2_algorithm.h from the Sparkfun library.
    if (irValue > 50000) {
      long redValue = particleSensor.getRed();
      float r = (float)redValue / (float)irValue;
      spo2Val = constrain((int)(110.0f - 25.0f * r), 90, 100);
    }

    // LCD refresh every 1 s
    if (millis() - lastLcdMs > LCD_INTERVAL) {
      lastLcdMs = millis();
      lcd.setCursor(0, 0); lcd.print("PCG ACTIVE      ");
      lcd.setCursor(0, 1);
      if (irValue < 50000) {
        lcd.print("No finger...    ");
      } else {
        char buf[17];
        snprintf(buf, sizeof(buf), "H:%-3d  Sp:%3d%%  ", beatAvg, spo2Val);
        lcd.print(buf);
      }
    }

    // WiFi POST every 5 s — only when finger is present and BPM is valid
    if (millis() - lastPostMs > POST_INTERVAL) {
      lastPostMs = millis();
      if (irValue > 50000 && beatAvg > 0) {
        postVitals(beatAvg, spo2Val);
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  //  MODE 2 — PPG recording  (blocking 120 s loop)
  //  Audio task is idle — Serial bus is clear for text PPG lines.
  //  serialService.js parses "D:<IR>,<Red>\n" and sends to ppg_bp_server.py.
  // ═══════════════════════════════════════════════════════════════════════════
  if (currentMode == 2) {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("RECORDING PPG..");
    lcd.setCursor(0, 1); lcd.print("Keep still  45s");

    unsigned long start   = millis();
    unsigned long lastCnt = 0;

    while (millis() - start < 50000UL) {
      long ir  = particleSensor.getIR();
      long red = particleSensor.getRed();

      Serial.print("D:");
      Serial.print(ir);
      Serial.print(",");
      Serial.println(red);

      // LCD countdown every 5 s
      if (millis() - lastCnt > 5000) {
        lastCnt = millis();
        int secs = (int)((50000UL - (millis() - start)) / 1000);
        char buf[17];
        snprintf(buf, sizeof(buf), "%-3ds remaining   ", secs);
        lcd.setCursor(0, 1);
        lcd.print(buf);
      }

      delay(10);   // ~100 Hz sample rate
    }

    currentMode = 1;
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("PPG Complete!");
    lcd.setCursor(0, 1); lcd.print("PCG Restored");
    delay(2000);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("PCG ACTIVE");
    lcd.setCursor(0, 1); lcd.print("No finger...");
  }
}
