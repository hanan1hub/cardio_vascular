/*
 * ESP32 Dashboard Integration - FIXED VERSION
 * This code sends sensor data to your Cardio Dashboard
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

/* =========================
   WIFI & SERVER CONFIG
   ========================= */
const char* ssid = "SoC_Lab";
const char* password = "research@soc";
const char* SERVER_URL = "http://100.59.81.84";   // Your computer's IP
const char* DEVICE_ID  = "esp32-device-001";

/* =========================
   GLOBAL VARIABLES
   ========================= */
WiFiClient client;
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 1000;  // Send every 1 second

/* =========================
   WIFI CONNECTION
   ========================= */
void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("Please check your credentials and try again.");
  }
}

/* =========================
   GET CURRENT TIMESTAMP
   ========================= */
String getCurrentTimestamp() {
  // Generate ISO 8601 timestamp
  unsigned long currentMillis = millis();
  unsigned long seconds = currentMillis / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  
  char timestamp[30];
  snprintf(timestamp, sizeof(timestamp), "2026-01-26T%02lu:%02lu:%02lu.000Z", 
           hours % 24, minutes % 60, seconds % 60);
  return String(timestamp);
}

/* =========================
   SEND DATA TO DASHBOARD
   ========================= */
void sendToDashboard(float hr, float spo2, float sbp, float dbp) {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi not connected. Attempting to reconnect...");
    connectToWiFi();
    return;
  }

  // Rate limiting
  if (millis() - lastSendTime < SEND_INTERVAL) {
    return;
  }
  lastSendTime = millis();

  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = getCurrentTimestamp();  // Dynamic timestamp

  // Add sensor values (only if > 0)
  if (hr > 0)   doc["hr"] = hr;
  if (spo2 > 0) doc["spo2"] = spo2;
  if (sbp > 0)  doc["sbp"] = sbp;
  if (dbp > 0)  doc["dbp"] = dbp;

  // Serialize JSON
  String jsonPayload;
  serializeJson(doc, jsonPayload);

  Serial.print("📤 Sending: ");
  Serial.println(jsonPayload);

  // Send HTTP POST request
  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/readings");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);  // 5 second timeout

  int httpResponseCode = http.POST(jsonPayload);
  
  Serial.print("📡 HTTP Response: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("✅ Response: ");
    Serial.println(response);
  } else {
    Serial.print("❌ Error: ");
    Serial.println(httpResponseCode);
    Serial.print("Error details: ");
    Serial.println(http.errorToString(httpResponseCode));
    
    // Detailed error diagnosis
    Serial.println("\n🔍 Connection Troubleshooting:");
    if (httpResponseCode == -1) {
      Serial.println("   Error -1: Connection failed");
      Serial.println("   Possible causes:");
      Serial.println("   1. Backend server not running");
      Serial.println("      → Run: cd backend && node server.js");
      Serial.println("   2. Wrong IP address");
      Serial.print("      → Current: ");
      Serial.println(SERVER_URL);
      Serial.println("      → Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)");
      Serial.println("   3. Firewall blocking port 5000");
      Serial.println("      → Allow port 5000 in Windows Firewall");
      Serial.println("   4. ESP32 and computer on different networks");
      Serial.print("      → ESP32 IP: ");
      Serial.println(WiFi.localIP());
      Serial.print("      → Target IP: ");
      Serial.println(SERVER_URL);
    } else if (httpResponseCode == -2) {
      Serial.println("   Error -2: Invalid URL");
      Serial.println("   → Check SERVER_URL format");
    } else if (httpResponseCode == -11) {
      Serial.println("   Error -11: Connection timeout");
      Serial.println("   → Server not responding");
      Serial.println("   → Check if backend is running");
    }
    Serial.println();
  }

  http.end();
}

/* =========================
   SETUP
   ========================= */
void setup() {
  Serial.begin(115200);
  delay(2000);  // Give Serial Monitor time to open

  Serial.println("\n\n=================================");
  Serial.println("ESP32 Dashboard Integration");
  Serial.println("=================================\n");
  
  connectToWiFi();
  
  Serial.println("\n✅ Setup complete! Starting sensor data transmission...\n");
}

/* =========================
   LOOP
   ========================= */
void loop() {
  // Check WiFi connection periodically
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi disconnected. Reconnecting...");
    connectToWiFi();
    delay(2000);
    return;
  }

  /* =========================
     SENSOR READING SECTION
     (Replace with REAL sensor data)
     ========================= */
  float heartRate = random(65, 90);
  float spo2      = random(94, 99);
  float sbp       = random(110, 125);
  float dbp       = random(70, 85);

  /* =========================
     SERIAL OUTPUT (for debugging)
     ========================= */
  Serial.print("HR:");
  Serial.print(heartRate);
  Serial.print(",SpO2:");
  Serial.print(spo2);
  Serial.print(",SBP:");
  Serial.print(sbp);
  Serial.print(",DBP:");
  Serial.println(dbp);

  /* =========================
     SEND TO DASHBOARD
     ========================= */
  sendToDashboard(heartRate, spo2, sbp, dbp);

  delay(1000);   // Send every 1 second
}
