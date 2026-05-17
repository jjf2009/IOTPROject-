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
#define SAMPLE_DELAY_MS     10

// ─── ERROR SENTINEL ──────────────────────────────
// Node.js checks for -1 on analog sensors and -999 on temp
// to detect wiring/hardware faults
#define ANALOG_ERROR   -1
#define TEMP_ERROR     -999.0

// ─── ANALOG SANITY BOUNDS ────────────────────────
// A healthy analog sensor on 5V Arduino should never
// rail at exactly 0 or 1023 consistently.
// If average is outside (LOW_BOUND, HIGH_BOUND) → likely wiring fault.
#define ANALOG_LOW_BOUND   10    // below this → sensor probably shorted to GND
#define ANALOG_HIGH_BOUND  1013  // above this → sensor probably disconnected (floating high)

// ─── SENSOR OBJECTS ──────────────────────────────
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensor(&oneWire);

unsigned long lastSampleTime = 0;

// ─── SETUP ───────────────────────────────────────
void setup() {
  Serial.begin(BAUD_RATE);
  tempSensor.begin();
  delay(2000);
  Serial.println("LITMUS:READY");
}

// ─── MAIN LOOP ───────────────────────────────────
void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentTime;

    int   ph_raw   = readRawAnalog(PH_PIN);
    int   turb_raw = readRawAnalog(TURB_PIN);
    float temp     = readTemperature();
    int   gas_raw  = readRawAnalog(GAS_PIN);

    // Emit packet — Node.js handles -1 and -999 as error signals
    Serial.print("ph_raw:");    Serial.print(ph_raw);
    Serial.print(",turb_raw:"); Serial.print(turb_raw);
    Serial.print(",temp:");     Serial.print(temp, 2);
    Serial.print(",gas_raw:");  Serial.println(gas_raw);

    // Human-readable status line for Serial Monitor debugging
    // Node.js ignores lines that don't match the key:value packet format
    printSensorStatus(ph_raw, turb_raw, temp, gas_raw);
  }
}

// ─── SHARED: AVERAGED ANALOG READ ────────────────
// Returns integer average of NUM_SAMPLES reads.
// Returns ANALOG_ERROR (-1) if reading is out of sane bounds —
// indicates a disconnected or shorted sensor wire.
int readRawAnalog(int pin) {
  long total = 0;

  for (int i = 0; i < NUM_SAMPLES; i++) {
    total += analogRead(pin);
    delay(SAMPLE_DELAY_MS);
  }

  int avg = (int)(total / NUM_SAMPLES);

  // Floating/disconnected pin → reads near 1023
  // Shorted to GND → reads near 0
  if (avg <= ANALOG_LOW_BOUND || avg >= ANALOG_HIGH_BOUND) {
    return ANALOG_ERROR;
  }

  return avg;
}

// ─── TEMPERATURE ─────────────────────────────────
// Returns Celsius.
// Returns TEMP_ERROR (-999.0) if DS18B20 not found on OneWire bus.
// Most common cause: missing 4.7kΩ pull-up resistor between DATA pin and VCC.
float readTemperature() {
  tempSensor.requestTemperatures();
  float tempC = tempSensor.getTempCByIndex(0);
  if (tempC == DEVICE_DISCONNECTED_C) return TEMP_ERROR;
  return tempC;
}

// ─── STATUS PRINTER ──────────────────────────────
// Prints a STATUS: line after every packet.
// Node.js skips it (no key:value match), useful in Serial Monitor.
void printSensorStatus(int ph, int turb, float temp, int gas) {
  Serial.print("STATUS:");

  Serial.print(" PH=");
  Serial.print(ph == ANALOG_ERROR ? "ERR(check A0 wire)" : "OK");

  Serial.print(" TURB=");
  Serial.print(turb == ANALOG_ERROR ? "ERR(check A1 wire)" : "OK");

  Serial.print(" TEMP=");
  if (temp == TEMP_ERROR) {
    Serial.print("ERR(check pin4 + 4.7k pullup)");
  } else {
    Serial.print("OK");
  }

  Serial.print(" GAS=");
  Serial.println(gas == ANALOG_ERROR ? "ERR(check A2 wire)" : "OK");
}