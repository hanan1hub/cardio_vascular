/*
 * ESP32 Serial Reader for Cardio Dashboard
 * 
 * This version reads sensor values from Serial Monitor (Arduino IDE)
 * and forwards them to the backend server.
 * 
 * Use this if you're already printing sensor values to Serial Monitor
 * and want to forward them to the dashboard.
 * 
 * Expected Serial Format:
 * HR:85,SpO2:95,SBP:120,DBP:80
 * or
 * HR=85,SpO2=95,SBP=120,DBP=80
 * 
 * Required Libraries:
 * - WiFi (built-in)
 * - HTTPClient (built-in)
 * - ArduinoJson (install via Library Manager)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ========== CONFIGURATION ==========
const char* ssid = "SoC_Lab";
const char* password = "research@soc";
const char* SERVER_URL = "http://10.7.161.78:5000";  // Change to your server IP (include port!)
const char* DEVICE_ID = "esp32-device-001";

// ========== GLOBAL VARIABLES ==========
WiFiClient client;
String serialBuffer = "";

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=================================");
  Serial.println("ESP32 Serial Reader Starting...");
  Serial.println("=================================\n");
  Serial.println("Reading sensor data from Serial Monitor");
  Serial.println("and forwarding to backend server.\n");
  
  connectToWiFi();
  
  Serial.println("\n✅ Ready! Send sensor data in format:");
  Serial.println("HR:85,SpO2:95,SBP:120,DBP:80\n");
}

void loop() {
  // Check WiFi
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
    return;
  }
  
  // Read from Serial
  if (Serial.available() > 0) {
    char c = Serial.read();
    
    if (c == '\n' || c == '\r') {
      if (serialBuffer.length() > 0) {
        processSerialData(serialBuffer);
        serialBuffer = "";
      }
    } else {
      serialBuffer += c;
    }
  }
  
  delay(10);
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
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
  }
}

void processSerialData(String data) {
  Serial.println("\n📥 Received: " + data);
  
  // Parse the data (supports both : and = separators)
  float hr = 0, spo2 = 0, sbp = 0, dbp = 0;
  bool hasData = false;
  
  // Parse HR
  int hrIndex = data.indexOf("HR:");
  if (hrIndex == -1) hrIndex = data.indexOf("HR=");
  if (hrIndex != -1) {
    int start = hrIndex + 3;
    int end = data.indexOf(",", start);
    if (end == -1) end = data.length();
    hr = data.substring(start, end).toFloat();
    hasData = true;
  }
  
  // Parse SpO2
  int spo2Index = data.indexOf("SpO2:");
  if (spo2Index == -1) spo2Index = data.indexOf("SpO2=");
  if (spo2Index != -1) {
    int start = spo2Index + 5;
    int end = data.indexOf(",", start);
    if (end == -1) end = data.length();
    spo2 = data.substring(start, end).toFloat();
    hasData = true;
  }
  
  // Parse SBP
  int sbpIndex = data.indexOf("SBP:");
  if (sbpIndex == -1) sbpIndex = data.indexOf("SBP=");
  if (sbpIndex != -1) {
    int start = sbpIndex + 4;
    int end = data.indexOf(",", start);
    if (end == -1) end = data.length();
    sbp = data.substring(start, end).toFloat();
    hasData = true;
  }
  
  // Parse DBP
  int dbpIndex = data.indexOf("DBP:");
  if (dbpIndex == -1) dbpIndex = data.indexOf("DBP=");
  if (dbpIndex != -1) {
    int start = dbpIndex + 4;
    int end = data.length();
    dbp = data.substring(start, end).toFloat();
    hasData = true;
  }
  
  if (!hasData) {
    Serial.println("⚠️ Could not parse sensor data. Format: HR:85,SpO2:95,SBP:120,DBP:80");
    return;
  }
  
  // Create JSON and send
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = getCurrentTimestamp();
  if (hr > 0) doc["hr"] = hr;
  if (spo2 > 0) doc["spo2"] = spo2;
  if (sbp > 0) doc["sbp"] = sbp;
  if (dbp > 0) doc["dbp"] = dbp;
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  Serial.println("📤 Sending: " + jsonPayload);
  
  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/readings");
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    Serial.print("✅ Sent successfully! Response: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("❌ Error: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
}

String getCurrentTimestamp() {
  unsigned long currentMillis = millis();
  unsigned long seconds = currentMillis / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  
  char timestamp[30];
  snprintf(timestamp, sizeof(timestamp), "2026-01-26T%02lu:%02lu:%02lu.000Z", 
           hours % 24, minutes % 60, seconds % 60);
  return String(timestamp);
}
