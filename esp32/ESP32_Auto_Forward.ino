/*
 * ESP32 Auto Forward for Cardio Dashboard
 * 
 * This version automatically captures sensor values printed to Serial Monitor
 * and forwards them to the backend server in real-time.
 * 
 * HOW TO USE:
 * 1. Add this code to your EXISTING Arduino sketch that reads sensors
 * 2. Replace your Serial.println() statements with sendToDashboard() function
 * 3. Or modify your existing code to call sendSensorData() after reading sensors
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
const char* SERVER_URL = "http://100.59.81.84";  // IMPORTANT: Include port number!
const char* DEVICE_ID = "esp32-device-001";

// ========== GLOBAL VARIABLES ==========
WiFiClient client;
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 1000;  // Send every 1 second (adjust as needed)

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=================================");
  Serial.println("ESP32 Auto Forward Starting...");
  Serial.println("=================================\n");
  
  connectToWiFi();
  
  Serial.println("\n✅ Ready! Sensor values will be automatically forwarded to dashboard.");
  Serial.println("Make sure your sensor reading code calls sendSensorData() function.\n");
}

// ========== MAIN LOOP ==========
void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi disconnected. Reconnecting...");
    connectToWiFi();
    delay(1000);
    return;
  }
  
  // Your existing sensor reading code goes here
  // After reading sensors, call sendSensorData() with the values
  
  delay(100);  // Small delay
}

// ========== WIFI CONNECTION ==========
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

// ========== SEND SENSOR DATA TO DASHBOARD ==========
// Call this function with your sensor values
void sendSensorData(float hr = 0, float spo2 = 0, float sbp = 0, float dbp = 0, float bloodSugar = 0, float* ecgData = NULL, int ecgLength = 0) {
  // Rate limiting - don't send too frequently
  if (millis() - lastSendTime < SEND_INTERVAL) {
    return;
  }
  lastSendTime = millis();
  
  // Create JSON payload
  DynamicJsonDocument doc(2048);
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = getCurrentTimestamp();
  
  // Add sensor values (only if > 0 or valid)
  if (hr > 0) doc["hr"] = hr;
  if (spo2 > 0) doc["spo2"] = spo2;
  if (sbp > 0) doc["sbp"] = sbp;
  if (dbp > 0) doc["dbp"] = dbp;
  if (bloodSugar > 0) doc["blood_sugar"] = bloodSugar;
  
  // Add ECG data if provided
  if (ecgData != NULL && ecgLength > 0) {
    JsonArray ecgArray = doc.createNestedArray("ecg_data");
    for (int i = 0; i < ecgLength; i++) {
      ecgArray.add(ecgData[i]);
    }
  }
  
  // Serialize JSON
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  // Print to Serial Monitor (for debugging)
  Serial.print("📤 Sending: ");
  Serial.println(jsonPayload);
  
  // Send HTTP POST request
  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/readings");
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    Serial.print("✅ Sent! Response: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("❌ Error: ");
    Serial.println(httpResponseCode);
    Serial.print("Error details: ");
    Serial.println(http.errorToString(httpResponseCode));
  }
  
  http.end();
}

// ========== HELPER FUNCTION: Parse and Send from String ==========
// Use this if you're printing values in a specific format
void sendToDashboard(String serialOutput) {
  // Parse common formats like "HR:85,SpO2:95,SBP:120,DBP:80"
  float hr = 0, spo2 = 0, sbp = 0, dbp = 0;
  
  // Try to parse HR
  int hrIndex = serialOutput.indexOf("HR:");
  if (hrIndex == -1) hrIndex = serialOutput.indexOf("HR=");
  if (hrIndex != -1) {
    int start = hrIndex + 3;
    int end = serialOutput.indexOf(",", start);
    if (end == -1) end = serialOutput.length();
    hr = serialOutput.substring(start, end).toFloat();
  }
  
  // Try to parse SpO2
  int spo2Index = serialOutput.indexOf("SpO2:");
  if (spo2Index == -1) spo2Index = serialOutput.indexOf("SpO2=");
  if (spo2Index != -1) {
    int start = spo2Index + 5;
    int end = serialOutput.indexOf(",", start);
    if (end == -1) end = serialOutput.length();
    spo2 = serialOutput.substring(start, end).toFloat();
  }
  
  // Try to parse SBP
  int sbpIndex = serialOutput.indexOf("SBP:");
  if (sbpIndex == -1) sbpIndex = serialOutput.indexOf("SBP=");
  if (sbpIndex != -1) {
    int start = sbpIndex + 4;
    int end = serialOutput.indexOf(",", start);
    if (end == -1) end = serialOutput.length();
    sbp = serialOutput.substring(start, end).toFloat();
  }
  
  // Try to parse DBP
  int dbpIndex = serialOutput.indexOf("DBP:");
  if (dbpIndex == -1) dbpIndex = serialOutput.indexOf("DBP=");
  if (dbpIndex != -1) {
    int start = dbpIndex + 4;
    int end = serialOutput.length();
    dbp = serialOutput.substring(start, end).toFloat();
  }
  
  // Send if we found any data
  if (hr > 0 || spo2 > 0 || sbp > 0 || dbp > 0) {
    sendSensorData(hr, spo2, sbp, dbp);
  }
}

// ========== UTILITY FUNCTIONS ==========
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

// ========== EXAMPLE USAGE IN YOUR CODE ==========
/*
 * Replace your existing sensor reading code with something like this:
 * 
 * void loop() {
 *   // Read your sensors
 *   float heartRate = readHeartRateSensor();
 *   float oxygenLevel = readSpO2Sensor();
 *   float systolicBP = readBloodPressureSensor();
 *   float diastolicBP = systolicBP - 40;  // Example calculation
 *   
 *   // Print to Serial Monitor (for debugging)
 *   Serial.print("HR: "); Serial.print(heartRate);
 *   Serial.print(", SpO2: "); Serial.print(oxygenLevel);
 *   Serial.print(", BP: "); Serial.print(systolicBP);
 *   Serial.print("/"); Serial.println(diastolicBP);
 *   
 *   // Send to dashboard
 *   sendSensorData(heartRate, oxygenLevel, systolicBP, diastolicBP);
 *   
 *   delay(1000);
 * }
 */
