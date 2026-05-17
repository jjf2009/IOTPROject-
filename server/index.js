const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// ─── CSV LOGGING SETUP ──────────────────────────
const OUTPUT_DIR = path.join(__dirname, "output");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const startTimestamp = new Date().toISOString()
  .replace(/T/, "_")
  .replace(/\..+/, "")
  .replace(/:/g, "-");

const RAW_CSV_PATH       = path.join(OUTPUT_DIR, `raw_${startTimestamp}.csv`);
const PROCESSED_CSV_PATH = path.join(OUTPUT_DIR, `processed_${startTimestamp}.csv`);

fs.writeFileSync(RAW_CSV_PATH,       "timestamp,ph,turb,temp,gas\n",                          "utf8");
fs.writeFileSync(PROCESSED_CSV_PATH, "timestamp,ph,turb,turbLabel,temp,gas,gasLabel,errors\n", "utf8");

console.log(`📝 Raw CSV:       ${RAW_CSV_PATH}`);
console.log(`📝 Processed CSV: ${PROCESSED_CSV_PATH}`);

function logDataToCSVs(raw, processed) {
  const ts = new Date().toISOString();

  const rawRow = `${ts},${raw.ph ?? ""},${raw.turb ?? ""},${raw.temp ?? ""},${raw.gas ?? ""}\n`;

  const errors = Object.values(processed.errors ?? {}).filter(Boolean).join("|");
  const processedRow = [
    ts,
    processed.ph       ?? "",
    processed.turb     ?? "",
    processed.turbLabel ?? "",
    processed.temp     ?? "",
    processed.gas      ?? "",
    processed.gasLabel  ?? "",
    errors              || "none",
  ].join(",") + "\n";

  fs.appendFile(RAW_CSV_PATH, rawRow, "utf8", (err) => {
    if (err) console.error("❌ Raw CSV write failed:", err.message);
  });

  fs.appendFile(PROCESSED_CSV_PATH, processedRow, "utf8", (err) => {
    if (err) console.error("❌ Processed CSV write failed:", err.message);
  });
}

// ─── CONFIG ─────────────────────────────────────
const SERIAL_PORT     = "/dev/ttyACM0";
const BAUD_RATE       = 9600;
const RECONNECT_DELAY = 2000;

// ─── CALIBRATION ────────────────────────────────
// pH: baseline = raw ADC reading when sensor is in pH-7 water
// Your tap water consistently reads ~905
const PH_BASELINE    = 905;
const PH_SENSITIVITY = 0.01;

// Turbidity: piecewise curve — HIGHER raw = CLEANER water
// Add more points after testing soil samples
// Format: { raw: <ADC avg>, ntu: <known NTU> }
const TURB_CURVE = [
  { raw: 410, ntu: 0   },  // air — true zero reference
  { raw: 428, ntu: 2   },  // clean tap water
  { raw: 445, ntu: 5   },  // packaged drinking water (more minerals)
  { raw: 462, ntu: 25  },  // soil water (your measured)
  { raw: 480, ntu: 60  },  // estimate — test with more soil
  { raw: 500, ntu: 100 },  // estimate — heavily dirty
];
// Gas: MQ-135 — lower raw = more gas detected
// Baseline from your clean-air CSV readings
const GAS_BASELINE = 397;
const GAS_MAX      = 700;

// ─── ROLLING AVERAGE BUFFER ──────────────────────
const BUFFER_SIZE = 5;
const RAW_BUFFER  = { ph: [], turb: [], temp: [], gas: [] };

function addToBuffer(key, val) {
  // Reject nulls and sensor error sentinels before buffering
  if (val === null || val === undefined || val === -1) return null;
  RAW_BUFFER[key].push(val);
  if (RAW_BUFFER[key].length > BUFFER_SIZE) RAW_BUFFER[key].shift();
  const avg = RAW_BUFFER[key].reduce((a, b) => a + b, 0) / RAW_BUFFER[key].length;
  return parseFloat(avg.toFixed(3));
}

// ─── EXPRESS SETUP ──────────────────────────────
const app = express();
app.use(cors());

let latestData = {
  raw:       { ph: null, turb: null, temp: null, gas: null },
  processed: { ph: null, turb: null, turbLabel: null, temp: null, gas: null, gasLabel: null, errors: {} },
  debug:     { lastLine: null, valid: false },
};

// ─── SERIAL STATE ───────────────────────────────
let port   = null;
let parser = null;

// ─── SERIAL CONNECTOR ───────────────────────────
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

  // ── pH ──────────────────────────────────────
  if (raw.ph === null) {
    processed.ph = null;
    errors.ph = "PH_SENSOR_FAULT — check A0 wiring";
  } else {
    let ph = 7 + (PH_BASELINE - raw.ph) * PH_SENSITIVITY;
    ph = Math.max(0, Math.min(14, ph));
    processed.ph = Number(ph.toFixed(2));
  }

  // ── TURBIDITY (piecewise interpolation) ──────
  if (raw.turb === null) {
    processed.turb      = null;
    processed.turbLabel = null;
    errors.turb = "TURB_SENSOR_FAULT — check A1 wiring";
  } else {
const curve = [...TURB_CURVE].sort((a, b) => a.raw - b.raw); // ascending now

let ntu;
if (raw.turb <= curve[0].raw) {
  ntu = 0;
} else if (raw.turb >= curve[curve.length - 1].raw) {
  ntu = 9999;
} else {
  for (let i = 0; i < curve.length - 1; i++) {
    const lower = curve[i];
    const upper = curve[i + 1];
    if (raw.turb >= lower.raw && raw.turb <= upper.raw) {
      const t = (raw.turb - lower.raw) / (upper.raw - lower.raw);
      ntu = lower.ntu + t * (upper.ntu - lower.ntu);
      break;
    }
  }
}

    processed.turb = parseFloat(ntu.toFixed(2));

    if      (ntu >= 9999) processed.turbLabel = "Saturated";
    else if (ntu <= 1)    processed.turbLabel = "Clean";
    else if (ntu <= 5)    processed.turbLabel = "Acceptable";
    else if (ntu <= 10)   processed.turbLabel = "Borderline";
    else if (ntu <= 50)   processed.turbLabel = "Dirty";
    else                  processed.turbLabel = "Very Dirty";
  }

  // ── TEMPERATURE ──────────────────────────────
  if (raw.temp === null || raw.temp <= -100) {
    processed.temp = null;
    errors.temp = "TEMP_SENSOR_FAULT — check pin 4 + add 4.7kΩ pull-up resistor";
  } else {
    processed.temp = Number(raw.temp.toFixed(2));
  }

  // ── GAS (MQ-135) ─────────────────────────────
  if (raw.gas === null) {
    processed.gas      = null;
    processed.gasLabel = null;
    errors.gas = "GAS_SENSOR_FAULT — check A2 wiring";
  } else {
    let gasPct = ((raw.gas - GAS_BASELINE) / (GAS_MAX - GAS_BASELINE)) * 100;
    gasPct = Math.max(0, Math.min(100, gasPct));
    processed.gas = Number(gasPct.toFixed(1));

    if      (gasPct < 15) processed.gasLabel = "Clean Air";
    else if (gasPct < 40) processed.gasLabel = "Moderate";
    else if (gasPct < 70) processed.gasLabel = "Poor";
    else                  processed.gasLabel = "Hazardous";
  }

  processed.errors = errors;

  // Print any active faults to terminal
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

  // Skip boot signal and STATUS: diagnostic lines from firmware
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

  // Need at least turb to have a valid packet
  if (raw.turb === null) {
    console.log("⚠️  Invalid packet skipped");
    return;
  }

  // Flag -1 (firmware wiring error sentinel) before buffering
  const phFault   = raw.ph   === -1;
  const turbFault = raw.turb === -1;
  const gasFault  = raw.gas  === -1;
  const tempFault = raw.temp !== null && raw.temp <= -100;

  // Apply rolling average — addToBuffer rejects -1 automatically
  raw.ph   = addToBuffer("ph",   raw.ph);
  raw.turb = addToBuffer("turb", raw.turb);
  raw.temp = addToBuffer("temp", tempFault ? null : raw.temp);
  raw.gas  = addToBuffer("gas",  raw.gas);

  // If turb is faulted even after buffer, mark null so processData flags it
  if (turbFault) raw.turb = null;
  if (phFault)   raw.ph   = null;
  if (gasFault)  raw.gas  = null;
  if (tempFault) raw.temp = null;

  latestData.raw       = raw;
  latestData.processed = processData(raw);
  latestData.debug.valid = true;

  console.log("Processed:", latestData.processed);

  logDataToCSVs(latestData.raw, latestData.processed);
}

// ─── API ────────────────────────────────────────
app.get("/data", (req, res) => {
  res.json({ ...latestData, timestamp: Date.now() });
});

app.get("/debug", (req, res) => {
  res.json(latestData.debug);
});

// Health check — useful to confirm server is up from Expo app
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ─── SERVER START ───────────────────────────────
app.listen(3000, "0.0.0.0", () => {
  console.log("🚀 LITMUS server running at http://0.0.0.0:3000");
  console.log("   GET /data   → processed + raw data");
  console.log("   GET /debug  → last raw line + validity");
  console.log("   GET /health → uptime check");
});

// ─── INIT ───────────────────────────────────────
setTimeout(connectSerial, 2000);