/*
 * ESP32 Connection Test - Diagnose Connection Issues
 * This will help identify why ESP32 can't connect to backend
 */

#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "SoC_Lab";
const char* password = "research@soc";
const char* SERVER_URL = "http://10.7.161.78:5000";  // Your computer's IP

WiFiClient client;

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("\n\n=================================");
  Serial.println("ESP32 Connection Diagnostic Test");
  Serial.println("=================================\n");
  
  // Test WiFi
  Serial.println("Step 1: Testing WiFi Connection...");
  connectToWiFi();
  
  delay(2000);
  
  // Test basic connectivity
  Serial.println("\nStep 2: Testing Basic Connectivity...");
  testPing();
  
  delay(2000);
  
  // Test HTTP connection
  Serial.println("\nStep 3: Testing HTTP Connection...");
  testHTTPConnection();
  
  delay(2000);
  
  // Test backend endpoint
  Serial.println("\nStep 4: Testing Backend Endpoint...");
  testBackendEndpoint();
  
  Serial.println("\n=================================");
  Serial.println("Diagnostic Complete!");
  Serial.println("=================================\n");
}

void loop() {
  // Run test every 10 seconds
  delay(10000);
  testBackendEndpoint();
}

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("   IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("   Subnet Mask: ");
    Serial.println(WiFi.subnetMask());
    Serial.print("   Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("   RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("   Please check:");
    Serial.println("   - WiFi SSID and password");
    Serial.println("   - WiFi is 2.4GHz (not 5GHz)");
    Serial.println("   - ESP32 is within range");
  }
}

void testPing() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected. Skipping ping test.");
    return;
  }
  
  // Extract IP from SERVER_URL
  String serverIP = String(SERVER_URL);
  serverIP.replace("http://", "");
  serverIP.replace(":5000", "");
  int colonIndex = serverIP.indexOf(":");
  if (colonIndex > 0) {
    serverIP = serverIP.substring(0, colonIndex);
  }
  
  Serial.print("   Target IP: ");
  Serial.println(serverIP);
  Serial.print("   ESP32 IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("   Gateway: ");
  Serial.println(WiFi.gatewayIP());
  
  // Check if on same network
  IPAddress gateway = WiFi.gatewayIP();
  IPAddress localIP = WiFi.localIP();
  IPAddress targetIP;
  
  if (targetIP.fromString(serverIP)) {
    // Check if same subnet
    bool sameSubnet = (localIP[0] == targetIP[0] && 
                       localIP[1] == targetIP[1] && 
                       localIP[2] == targetIP[2]);
    
    if (sameSubnet) {
      Serial.println("   ✅ Same subnet detected");
    } else {
      Serial.println("   ⚠️ Different subnet - may cause issues");
    }
  }
}

void testHTTPConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected. Skipping HTTP test.");
    return;
  }
  
  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/health");
  http.setTimeout(3000);
  
  Serial.print("   Testing: ");
  Serial.println(String(SERVER_URL) + "/api/health");
  
  int httpCode = http.GET();
  
  if (httpCode > 0) {
    Serial.print("   ✅ HTTP Connection OK! Response: ");
    Serial.println(httpCode);
    String response = http.getString();
    Serial.print("   Response body: ");
    Serial.println(response);
  } else {
    Serial.print("   ❌ HTTP Connection Failed! Code: ");
    Serial.println(httpCode);
    Serial.print("   Error: ");
    Serial.println(http.errorToString(httpCode));
    
    // Detailed error diagnosis
    if (httpCode == -1) {
      Serial.println("\n   🔍 Diagnosis for Error -1:");
      Serial.println("      - Backend server not running?");
      Serial.println("      - Wrong IP address?");
      Serial.println("      - Firewall blocking port 5000?");
      Serial.println("      - ESP32 and computer on different networks?");
    } else if (httpCode == -2) {
      Serial.println("\n   🔍 Diagnosis for Error -2:");
      Serial.println("      - Invalid URL format");
      Serial.println("      - Check SERVER_URL in code");
    } else if (httpCode == -11) {
      Serial.println("\n   🔍 Diagnosis for Error -11:");
      Serial.println("      - Connection timeout");
      Serial.println("      - Server not responding");
      Serial.println("      - Network issue");
    }
  }
  
  http.end();
}

void testBackendEndpoint() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected.");
    return;
  }
  
  // Create test JSON
  String jsonPayload = "{\"deviceId\":\"test-device\",\"hr\":75,\"spo2\":96}";
  
  HTTPClient http;
  http.begin(client, String(SERVER_URL) + "/api/readings");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  
  Serial.print("   Testing POST to: ");
  Serial.println(String(SERVER_URL) + "/api/readings");
  Serial.print("   Payload: ");
  Serial.println(jsonPayload);
  
  int httpCode = http.POST(jsonPayload);
  
  if (httpCode > 0) {
    Serial.print("   ✅ POST Success! Response: ");
    Serial.println(httpCode);
    String response = http.getString();
    Serial.print("   Response: ");
    Serial.println(response);
  } else {
    Serial.print("   ❌ POST Failed! Code: ");
    Serial.println(httpCode);
    Serial.print("   Error: ");
    Serial.println(http.errorToString(httpCode));
  }
  
  http.end();
}
