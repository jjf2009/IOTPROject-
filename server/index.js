const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// ─── CSV LOGGING SETUP ──────────────────────────
const OUTPUT_DIR = path.join(__dirname, "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const startTimestamp = new Date().toISOString()
  .replace(/T/, "_").replace(/\..+/, "").replace(/:/g, "-");

const RAW_CSV_PATH       = path.join(OUTPUT_DIR, `raw_${startTimestamp}.csv`);
const PROCESSED_CSV_PATH = path.join(OUTPUT_DIR, `processed_${startTimestamp}.csv`);

fs.writeFileSync(RAW_CSV_PATH,       "timestamp,ph,turb,temp,gas\n", "utf8");
fs.writeFileSync(PROCESSED_CSV_PATH, "timestamp,ph,turb,temp,gas,adulterated,confidence,errors\n", "utf8");

console.log(`📝 Raw CSV:       ${RAW_CSV_PATH}`);
console.log(`📝 Processed CSV: ${PROCESSED_CSV_PATH}`);

function logDataToCSVs(raw, processed) {
  const ts = new Date().toISOString();
  const rawRow = `${ts},${raw.ph ?? ""},${raw.turb ?? ""},${raw.temp ?? ""},${raw.gas ?? ""}\n`;
  const errors = Object.values(processed.errors ?? {}).filter(Boolean).join("|") || "none";
  const processedRow = [
    ts,
    processed.ph          ?? "",
    processed.turb        ?? "",
    processed.temp        ?? "",
    processed.gas         ?? "",
    processed.adulterated ?? "",
    processed.confidence  ?? "",
    errors,
  ].join(",") + "\n";

  fs.appendFile(RAW_CSV_PATH,       rawRow,       "utf8", (err) => { if (err) console.error("❌ Raw CSV:", err.message); });
  fs.appendFile(PROCESSED_CSV_PATH, processedRow, "utf8", (err) => { if (err) console.error("❌ Processed CSV:", err.message); });
}

// ─── CONFIG ─────────────────────────────────────
const SERIAL_PORT     = "/dev/ttyACM0";
const BAUD_RATE       = 9600;
const RECONNECT_DELAY = 2000;

// ─── CALIBRATION ────────────────────────────────
const PH_BASELINE    = 905;
const PH_SENSITIVITY = 0.01;
const GAS_BASELINE   = 397;
const GAS_MAX        = 700;

// ─── PURE MILK BASELINE ──────────────────────────
// Measured from stable pure Amul milk session.
// Update these if you switch milk brands.
const PURE_MILK_BASELINE = {
  turb: 232,
  ph:   6.30,
  gas:  500,
};

// ─── DETECTION THRESHOLDS ────────────────────────
// Any reading outside these tolerances = adulterated.
const TOLERANCE = {
  turb: 8,    // ±8% turb deviation allowed
  ph:   0.2,  // ±0.2 pH allowed
  gas:  8,    // ±8% gas deviation allowed
};

// ─── ADULTERATION DETECTION ──────────────────────
function detectAdulteration(ph, turb_raw, gas_raw) {
  const b = PURE_MILK_BASELINE;

  const turbDev = ((turb_raw - b.turb) / b.turb) * 100;
  const phDev   = Math.abs(ph - b.ph);
  const gasDev  = Math.abs(((b.gas - gas_raw) / b.gas) * 100);

  // Each sensor votes: true = anomaly detected
  const turbFlagged = Math.abs(turbDev) > TOLERANCE.turb;
  const phFlagged   = phDev   > TOLERANCE.ph;
  const gasFlagged  = gasDev  > TOLERANCE.gas;

  const flagCount = [turbFlagged, phFlagged, gasFlagged].filter(Boolean).length;

  // Adulterated if 2 or more sensors flag an anomaly
  const adulterated = flagCount >= 2;

  const confidence = flagCount === 3 ? "High"
                   : flagCount === 2 ? "Medium"
                   : flagCount === 1 ? "Low"
                   : "High"; // 0 flags = confidently pure

  return {
    adulterated,
    confidence,
    flagCount,
    deviations: {
      turbDev: parseFloat(turbDev.toFixed(1)),
      phDev:   parseFloat(phDev.toFixed(3)),
      gasDev:  parseFloat(gasDev.toFixed(1)),
    },
  };
}

// ─── ROLLING AVERAGE BUFFER ──────────────────────
const BUFFER_SIZE = 5;
const RAW_BUFFER  = { ph: [], turb: [], temp: [], gas: [] };

function addToBuffer(key, val) {
  if (val === null || val === undefined || val === -1) return null;
  RAW_BUFFER[key].push(val);
  if (RAW_BUFFER[key].length > BUFFER_SIZE) RAW_BUFFER[key].shift();
  return parseFloat((RAW_BUFFER[key].reduce((a, b) => a + b, 0) / RAW_BUFFER[key].length).toFixed(3));
}

// ─── EXPRESS SETUP ──────────────────────────────
const app = express();
app.use(cors());

let latestData = {
  raw:       { ph: null, turb: null, temp: null, gas: null },
  processed: { ph: null, turb: null, temp: null, gas: null, adulterated: null, confidence: null, deviations: {}, errors: {} },
  debug:     { lastLine: null, valid: false },
};

// ─── SERIAL STATE ───────────────────────────────
let port = null, parser = null;

function connectSerial() {
  console.log("Attempting serial connection...");
  port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE, autoOpen: false });

  port.open((err) => {
    if (err) {
      console.log("Connection failed, retrying...");
      setTimeout(connectSerial, RECONNECT_DELAY);
      return;
    }
    console.log("✅ Serial connected");
    parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
    parser.on("data", handleData);
    port.on("close", () => {
      console.log("Serial disconnected. Reconnecting...");
      setTimeout(connectSerial, RECONNECT_DELAY);
    });
    port.on("error", (err) => {
      console.error("Serial error:", err.message);
      try { port.close(); } catch { }
    });
  });
}

// ─── CORE PROCESSING LOGIC ──────────────────────
function processData(raw) {
  const processed = {};
  const errors    = {};

  // pH
  if (raw.ph === null) {
    processed.ph = null;
    errors.ph = "PH_SENSOR_FAULT — check A0 wiring";
  } else {
    let ph = 7 + (PH_BASELINE - raw.ph) * PH_SENSITIVITY;
    processed.ph = Number(Math.max(0, Math.min(14, ph)).toFixed(2));
  }

  // Turbidity
  if (raw.turb === null) {
    processed.turb = null;
    errors.turb = "TURB_SENSOR_FAULT — check A1 wiring";
  } else {
    processed.turb = Number(raw.turb.toFixed(1));
  }

  // Temperature
  if (raw.temp === null || raw.temp <= -100) {
    processed.temp = null;
    errors.temp = "TEMP_SENSOR_FAULT — check pin 4 + 4.7kΩ pull-up";
  } else {
    processed.temp = Number(raw.temp.toFixed(2));
  }

  // Gas
  if (raw.gas === null) {
    processed.gas = null;
    errors.gas = "GAS_SENSOR_FAULT — check A2 wiring";
  } else {
    let gasPct = ((raw.gas - GAS_BASELINE) / (GAS_MAX - GAS_BASELINE)) * 100;
    processed.gas = Number(Math.max(0, Math.min(100, gasPct)).toFixed(1));
  }

  // Detection — needs all 3 key sensors
  if (processed.ph !== null && raw.turb !== null && raw.gas !== null) {
    const detection = detectAdulteration(processed.ph, raw.turb, raw.gas);
    processed.adulterated = detection.adulterated;
    processed.confidence  = detection.confidence;
    processed.deviations  = detection.deviations;
  } else {
    processed.adulterated = null;
    processed.confidence  = "None";
    processed.deviations  = {};
  }

  processed.errors = errors;

  const faultList = Object.values(errors);
  if (faultList.length > 0) {
    console.warn("⚠️  SENSOR FAULTS:");
    faultList.forEach(f => console.warn("   →", f));
  }

  return processed;
}

// ─── DATA HANDLER ───────────────────────────────
function handleData(line) {
  const clean = line.trim();
  console.log("Arduino RAW:", clean);
  latestData.debug.lastLine = clean;
  latestData.debug.valid    = false;

  if (clean.includes("READY") || clean.startsWith("STATUS:")) return;

  const pairs = clean.split(",");
  let raw = { ph: null, turb: null, temp: null, gas: null };

  for (const pair of pairs) {
    const [key, val] = pair.split(":");
    const num = parseFloat(val);
    if (isNaN(num)) continue;
    if (key === "ph_raw")   raw.ph   = num;
    if (key === "turb_raw") raw.turb = num;
    if (key === "temp")     raw.temp = num;
    if (key === "gas_raw")  raw.gas  = num;
  }

  if (raw.turb === null) { console.log("⚠️  Invalid packet skipped"); return; }

  const phFault   = raw.ph   === -1;
  const turbFault = raw.turb === -1;
  const gasFault  = raw.gas  === -1;
  const tempFault = raw.temp !== null && raw.temp <= -100;

  raw.ph   = addToBuffer("ph",   raw.ph);
  raw.turb = addToBuffer("turb", raw.turb);
  raw.temp = addToBuffer("temp", tempFault ? null : raw.temp);
  raw.gas  = addToBuffer("gas",  raw.gas);

  if (phFault)   raw.ph   = null;
  if (turbFault) raw.turb = null;
  if (gasFault)  raw.gas  = null;
  if (tempFault) raw.temp = null;

  latestData.raw       = raw;
  latestData.processed = processData(raw);
  latestData.debug.valid = true;

  const p = latestData.processed;
  const label = p.adulterated === null ? "UNKNOWN"
              : p.adulterated ? "❌ ADULTERATED" : "✅ PURE";
  console.log(`🧪 ${label} | Confidence: ${p.confidence}`);

  logDataToCSVs(latestData.raw, latestData.processed);
}

// ─── API ────────────────────────────────────────
app.get("/data",   (req, res) => res.json({ ...latestData, timestamp: Date.now() }));
app.get("/debug",  (req, res) => res.json(latestData.debug));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// ─── SERVER START ───────────────────────────────
app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 LITMUS server running at http://0.0.0.0:3000");
  console.log("   GET /data   → sensor readings + adulteration result");
  console.log("   GET /debug  → last raw line");
  console.log("   GET /health → uptime check");
  console.log("\n📊 Pure milk baseline:");
  console.log(`   turb: ${PURE_MILK_BASELINE.turb} | pH: ${PURE_MILK_BASELINE.ph} | gas: ${PURE_MILK_BASELINE.gas}`);
  console.log(`\n🔍 Tolerances: turb ±${TOLERANCE.turb}% | pH ±${TOLERANCE.ph} | gas ±${TOLERANCE.gas}%`);
  console.log("   2+ sensors outside tolerance → ADULTERATED");
});

setTimeout(connectSerial, 2000);