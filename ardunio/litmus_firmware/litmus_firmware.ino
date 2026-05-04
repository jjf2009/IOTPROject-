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

    int phRaw   = readPHRaw();
    int turbRaw = readTurbidityRaw();
    float temp  = readTemperatureRaw();
    int gasRaw  = readGasRaw();

    Serial.print("ph_raw:");
    Serial.print(phRaw);
    Serial.print(",turb_raw:");
    Serial.print(turbRaw);
    Serial.print(",temp:");
    Serial.print(temp);
    Serial.print(",gas_raw:");
    Serial.println(gasRaw);
  }
}

// ─── SENSOR FUNCTIONS ────────────────────────────

int readPHRaw() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(PH_PIN);
    delay(10);
  }
  return total / NUM_SAMPLES; // raw ADC (0–1023)
}

int readTurbidityRaw() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(TURB_PIN);
    delay(10);
  }
  return total / NUM_SAMPLES; // raw ADC
}

float readTemperatureRaw() {
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);
  if (tempC == DEVICE_DISCONNECTED_C) return -999.0;
  return tempC; // already raw enough
}

int readGasRaw() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(GAS_PIN);
    delay(10);
  }
  return total / NUM_SAMPLES; // raw ADC
}