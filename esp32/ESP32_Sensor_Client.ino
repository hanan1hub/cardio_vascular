/*
 * ESP32 Sensor Client for Cardio Dashboard
 * 
 * This sketch reads sensor values from ESP32 and sends them to the backend server
 * via HTTP POST requests. The backend then broadcasts the data via Socket.io
 * to all connected frontend clients.
 * 
 * Required Libraries:
 * - WiFi (built-in)
 * - HTTPClient (built-in)
 * - ArduinoJson (install via Library Manager)
 * 
 * Setup:
 * 1. Install ArduinoJson library: Tools -> Manage Libraries -> Search "ArduinoJson" -> Install
 * 2. Update WiFi credentials below
 * 3. Update SERVER_URL to match your backend server IP/URL
 * 4. Upload this sketch to your ESP32
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ========== CONFIGURATION ==========
// WiFi Credentials
const char* ssid = "SoC_Lab";           // Change this
const char* password = "research@soc";    // Change this

// Backend Server URL
// For local network: "http://192.168.1.100:5000"
// For localhost (if ESP32 and server on same machine): "http://localhost:5000"
// For public server: "http://your-server.com:5000"
const char* SERVER_URL = "http://100.59.81.84";  // Change this to your server IP

// Device ID (unique identifier for this ESP32)
const char* DEVICE_ID = "esp32-device-001";

// Sensor Reading Interval (milliseconds)
const unsigned long SEND_INTERVAL = 1000;  // Send data every 1 second (adjust as needed)

// ========== PIN CONFIGURATION ==========
// Define your sensor pins here
// Example pins - adjust based on your hardware setup
const int ECG_PIN = A0;        // ECG sensor analog pin
const int HR_PIN = A1;         // Heart rate sensor pin
const int SPO2_PIN = A2;       // SpO2 sensor pin
const int BP_PIN = A3;         // Blood pressure sensor pin

// ========== GLOBAL VARIABLES ==========
unsigned long lastSendTime = 0;
HTTPClient http;
WiFiClient client;

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=================================");
  Serial.println("ESP32 Sensor Client Starting...");
  Serial.println("=================================\n");
  
  // Initialize sensor pins
  pinMode(ECG_PIN, INPUT);
  pinMode(HR_PIN, INPUT);
  pinMode(SPO2_PIN, INPUT);
  pinMode(BP_PIN, INPUT);
  
  // Connect to WiFi
  connectToWiFi();
  
  Serial.println("\n✅ Setup complete!");
  Serial.println("Starting sensor data transmission...\n");
}

// ========== MAIN LOOP ==========
void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi disconnected. Reconnecting...");
    connectToWiFi();
    return;
  }
  
  // Send data at specified interval
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    sendSensorData();
    lastSendTime = millis();
  }
  
  delay(10); // Small delay to prevent watchdog issues
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
    Serial.print("Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("Please check your credentials and try again.");
  }
}

// ========== READ SENSOR VALUES ==========
// Modify these functions based on your actual sensor hardware
float readHeartRate() {
  // Example: Read from heart rate sensor
  // Replace with your actual sensor reading logic
  int rawValue = analogRead(HR_PIN);
  // Convert to BPM (adjust conversion formula based on your sensor)
  float hr = map(rawValue, 0, 4095, 60, 120);  // Example mapping
  return hr;
}

float readSpO2() {
  // Example: Read from SpO2 sensor
  int rawValue = analogRead(SPO2_PIN);
  // Convert to percentage (adjust conversion formula based on your sensor)
  float spo2 = map(rawValue, 0, 4095, 90, 100);  // Example mapping
  return spo2;
}

float readBloodPressure() {
  // Example: Read systolic and diastolic BP
  // This is a simplified example - adjust based on your sensor
  int rawValue = analogRead(BP_PIN);
  float sbp = map(rawValue, 0, 4095, 100, 140);  // Systolic
  float dbp = sbp - 40;  // Diastolic (simplified)
  return sbp;  // Return systolic, diastolic handled separately
}

float readDiastolicBP() {
  // Read diastolic BP
  int rawValue = analogRead(BP_PIN);
  float sbp = map(rawValue, 0, 4095, 100, 140);
  return sbp - 40;
}

// Read ECG data points (array of values)
void readECGData(float* ecgArray, int arraySize) {
  // Read multiple ECG samples
  for (int i = 0; i < arraySize; i++) {
    int rawValue = analogRead(ECG_PIN);
    // Convert analog reading to voltage (adjust based on your ADC reference)
    float voltage = (rawValue / 4095.0) * 3.3;  // Assuming 3.3V reference
    ecgArray[i] = voltage;
    delayMicroseconds(100);  // Small delay between samples
  }
}

// ========== SEND DATA TO BACKEND ==========
void sendSensorData() {
  // Read sensor values
  float hr = readHeartRate();
  float spo2 = readSpO2();
  float sbp = readBloodPressure();
  float dbp = readDiastolicBP();
  
  // Read ECG data (30 samples for example)
  const int ECG_SAMPLES = 30;
  float ecgData[ECG_SAMPLES];
  readECGData(ecgData, ECG_SAMPLES);
  
  // Create JSON payload
  DynamicJsonDocument doc(2048);
  doc["deviceId"] = DEVICE_ID;
  doc["timestamp"] = getCurrentTimestamp();
  doc["hr"] = hr;
  doc["spo2"] = spo2;
  doc["sbp"] = sbp;
  doc["dbp"] = dbp;
  doc["blood_sugar"] = (float)NULL;  // Set to null if not available
  
  // Add ECG data array
  JsonArray ecgArray = doc.createNestedArray("ecg_data");
  for (int i = 0; i < ECG_SAMPLES; i++) {
    ecgArray.add(ecgData[i]);
  }
  
  // Serialize JSON
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  // Print to Serial Monitor (for debugging)
  Serial.println("\n📤 Sending sensor data:");
  Serial.println(jsonPayload);
  Serial.print("HR: "); Serial.print(hr); Serial.println(" BPM");
  Serial.print("SpO2: "); Serial.print(spo2); Serial.println(" %");
  Serial.print("BP: "); Serial.print(sbp); Serial.print("/"); Serial.print(dbp); Serial.println(" mmHg");
  
  // Send HTTP POST request
  http.begin(client, String(SERVER_URL) + "/api/readings");
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    Serial.print("✅ Response code: ");
    Serial.println(httpResponseCode);
    
    String response = http.getString();
    Serial.println("Response: " + response);
  } else {
    Serial.print("❌ Error sending data: ");
    Serial.println(httpResponseCode);
    Serial.print("Error: ");
    Serial.println(http.errorToString(httpResponseCode));
  }
  
  http.end();
}

// ========== UTILITY FUNCTIONS ==========
String getCurrentTimestamp() {
  // Generate ISO 8601 timestamp
  // Note: ESP32 doesn't have RTC by default, so this uses millis()
  // For accurate timestamps, consider using NTP or RTC module
  unsigned long currentMillis = millis();
  unsigned long seconds = currentMillis / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  
  // Simple timestamp (you may want to use NTP for real timestamps)
  char timestamp[30];
  snprintf(timestamp, sizeof(timestamp), "2026-01-26T%02lu:%02lu:%02lu.000Z", 
           hours % 24, minutes % 60, seconds % 60);
  return String(timestamp);
}
