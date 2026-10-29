/*
  ThermoPredict AI - ESP32 cloud telemetry
  Libraries: OneWire, DallasTemperature, DHT sensor library by Adafruit
  Wiring defaults: DS18B20 bus GPIO4; DHT22 data GPIO5 (change DHT_PIN if your wiring differs).

  IMPORTANT SECURITY NOTE:
  This starter sketch uses setInsecure() to simplify first-time cloud connectivity testing.
  It encrypts HTTPS traffic but does NOT validate the server certificate, so it is not
  suitable for security-sensitive production use. Before production, install the current
  root CA certificate for your hosting domain and use client.setCACert(root_ca).
*/
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <time.h>

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_URL = "https://YOUR-RENDER-SERVICE.onrender.com/api/readings";
const char* DEVICE_ID = "thermopredict-01";
const char* DEVICE_API_TOKEN = "CHANGE_TO_THE_SAME_LONG_RANDOM_SECRET_AS_RENDER";

#define ONE_WIRE_BUS 4
#define DHT_PIN 5
#define DHT_TYPE DHT22

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);
DHT dht(DHT_PIN, DHT_TYPE);

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(500); Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWi-Fi connected. IP: %s\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    return true;
  }
  Serial.println("\nWi-Fi connection failed; retrying later.");
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  ds18b20.begin();
  dht.begin();
  Serial.printf("DS18B20 probes found: %d\n", ds18b20.getDeviceCount());
  connectWiFi();
}

void loop() {
  if (!connectWiFi()) { delay(5000); return; }

  ds18b20.requestTemperatures();
  float exterior = ds18b20.getTempCByIndex(0);
  float interior = ds18b20.getTempCByIndex(1);
  float room = dht.readTemperature();
  float humidity = dht.readHumidity();

  Serial.printf("Exterior: %.2f C | Interior: %.2f C | Room: %.2f C | Humidity: %.2f %%\n",
                exterior, interior, room, humidity);
  bool valid = exterior != DEVICE_DISCONNECTED_C && interior != DEVICE_DISCONNECTED_C &&
               isfinite(exterior) && isfinite(interior) && exterior >= -50 && exterior <= 100 &&
               interior >= -50 && interior <= 100 && isfinite(room) && room >= -20 && room <= 80 &&
               isfinite(humidity) && humidity >= 0 && humidity <= 100;
  if (!valid) {
    Serial.println("Invalid/disconnected sensor reading; not uploading.");
    delay(10000); return;
  }

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 5000)) {
    Serial.println("NTP time unavailable; not uploading yet.");
    delay(10000); return;
  }
  char timestamp[25];
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  String payload = "{\"device_id\":\"" + String(DEVICE_ID) +
    "\",\"timestamp\":\"" + String(timestamp) +
    "\",\"exterior_wall_temp_c\":" + String(exterior, 2) +
    ",\"interior_wall_temp_c\":" + String(interior, 2) +
    ",\"room_temp_c\":" + String(room, 2) +
    ",\"humidity_pct\":" + String(humidity, 2) + "}";

  WiFiClientSecure client;
  client.setInsecure(); // Replace with client.setCACert(root_ca) for production.
  HTTPClient http;
  if (http.begin(client, BACKEND_URL)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_API_TOKEN);
    int code = http.POST(payload);
    Serial.printf("Cloud POST status: %d\n", code);
    if (code > 0) Serial.println(http.getString());
    else Serial.printf("HTTP error: %s\n", http.errorToString(code).c_str());
    http.end();
  } else {
    Serial.println("Could not start HTTPS request; check BACKEND_URL.");
  }
  delay(10000);
}
