// ═══════════════════════════════════════════════════
// LITMUS IoT Firmware — Arduino Uno
// Adulteration Detection System
// ═══════════════════════════════════════════════════

#include <OneWire.h>
#include <DallasTemperature.h>

// ─── PIN DEFINITIONS ─────────────────────────────
#define PH_PIN        A0
#define TURB_PIN      A1
#define GAS_PIN       A2
#define TEMP_PIN      4

// ─── CONFIGURATION ───────────────────────────────
#define SAMPLE_INTERVAL_MS  1000
#define BAUD_RATE           9600
#define NUM_SAMPLES         10

// ─── CALIBRATION CONSTANTS ───────────────────────
#define PH_OFFSET       0.00
#define PH_SLOPE        0.1786  // V per pH unit — adjust after calibration

#define TURB_CLEAR      750
#define TURB_DIRTY      200

// ─── SENSOR OBJECTS ──────────────────────────────
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

unsigned long lastSampleTime = 0;

void setup() {
  Serial.begin(BAUD_RATE);
  tempSensor.begin();
  delay(2000);
  Serial.println("LITMUS:READY");
}

void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentTime;

    float phValue   = readPH();
    float turbValue = readTurbidity();
    float tempValue = readTemperature();
    int   gasValue  = readGas();

    Serial.print("ph:");
    Serial.print(phValue, 2);
    Serial.print(",turb:");
    Serial.print(turbValue, 1);
    Serial.print(",temp:");
    Serial.print(tempValue, 1);
    Serial.print(",gas:");
    Serial.println(gasValue);
  }
}

// ─── SENSOR FUNCTIONS ────────────────────────────

float readPH() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(PH_PIN);
    delay(10);
  }
  float voltage = (total / (float)NUM_SAMPLES) * (5.0 / 1023.0);
  float ph = 7.0 + ((2.5 - voltage) / PH_SLOPE) + PH_OFFSET;
  return constrain(ph, 0.0, 14.0);
}

float readTurbidity() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(TURB_PIN);
    delay(10);
  }
  float avgAnalog = total / (float)NUM_SAMPLES;
  float ntu = map(avgAnalog, TURB_CLEAR, TURB_DIRTY, 0, 1000);
  return constrain(ntu, 0, 1000);
}

float readTemperature() {
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);
  if (tempC == DEVICE_DISCONNECTED_C) return -999.0;
  return tempC;
}

int readGas() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(GAS_PIN);
    delay(10);
  }
  return total / NUM_SAMPLES;
}