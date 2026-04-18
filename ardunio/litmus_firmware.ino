// ═══════════════════════════════════════════════════
// LITMUS IoT Firmware — Arduino Uno
// Adulteration Detection System
// ═══════════════════════════════════════════════════

#include <OneWire.h>
#include <DallasTemperature.h>

// ─── PIN DEFINITIONS ─────────────────────────────
#define PH_PIN        A0    // pH sensor analog
#define TURB_PIN      A1    // Turbidity sensor analog
#define GAS_PIN       A2    // MQ-135 gas sensor analog
#define TEMP_PIN      4     // DS18B20 data pin (digital)

// ─── CONFIGURATION ───────────────────────────────
#define SAMPLE_INTERVAL_MS  1000   // Send data every 1 second
#define BAUD_RATE           9600   // HC-06 default baud rate
#define NUM_SAMPLES         10     // Average over N readings for stability

// ─── CALIBRATION CONSTANTS ───────────────────────
// pH sensor calibration (adjust based on your sensor + buffer solutions)
#define PH_OFFSET       0.00
#define PH_SLOPE        -5.70   // mV per pH unit (typical for analog pH module)

// Turbidity calibration
#define TURB_CLEAR       750    // Analog reading for clear water
#define TURB_DIRTY       200    // Analog reading for very turbid water

// ─── SENSOR OBJECTS ──────────────────────────────
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

// ─── VARIABLES ───────────────────────────────────
unsigned long lastSampleTime = 0;

void setup() {
  Serial.begin(BAUD_RATE);  // HC-06 communicates via hardware serial
  tempSensor.begin();
  
  // Allow MQ-135 warm-up time (ideally 24h, minimum 2 min)
  delay(2000);
  
  Serial.println("LITMUS:READY");
}

void loop() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentTime;
    
    float phValue = readPH();
    float turbValue = readTurbidity();
    float tempValue = readTemperature();
    int gasValue = readGas();
    
    // ─── TRANSMIT DATA ─────────────────────────
    // Format: ph:<val>,turb:<val>,temp:<val>,gas:<val>\n
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

// ─── SENSOR READING FUNCTIONS ────────────────────

float readPH() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(PH_PIN);
    delay(10);
  }
  float avgAnalog = total / (float)NUM_SAMPLES;
  
  // Convert analog (0-1023) to voltage (0-5V)
  float voltage = avgAnalog * (5.0 / 1023.0);
  
  // Convert voltage to pH (linear calibration)
  // Neutral pH 7.0 = ~2.5V for most analog pH modules
  float ph = 7.0 + ((2.5 - voltage) / (PH_SLOPE / 1000.0)) + PH_OFFSET;
  
  // Clamp to valid range
  return constrain(ph, 0.0, 14.0);
}

float readTurbidity() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(TURB_PIN);
    delay(10);
  }
  float avgAnalog = total / (float)NUM_SAMPLES;
  
  // Map analog reading to NTU (Nephelometric Turbidity Units)
  // Higher analog = clearer water, lower analog = more turbid
  float ntu = map(avgAnalog, TURB_CLEAR, TURB_DIRTY, 0, 1000);
  return constrain(ntu, 0, 1000);
}

float readTemperature() {
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);
  
  // DS18B20 returns -127 on error
  if (tempC == DEVICE_DISCONNECTED_C) {
    return -999.0; // Error sentinel
  }
  return tempC;
}

int readGas() {
  long total = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(GAS_PIN);
    delay(10);
  }
  return total / NUM_SAMPLES;  // Raw analog value (0-1023)
}