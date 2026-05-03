const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const express = require("express");
const cors = require("cors");

// ─── CONFIG ─────────────────────────────────────
const SERIAL_PORT = "/dev/ttyACM0";
const BAUD_RATE = 9600;
const RECONNECT_DELAY = 2000;

// Calibration constants (MOVE ALL LOGIC HERE)
const PH_SLOPE = 0.1786;
const PH_OFFSET = 0.0;

const TURB_CLEAR = 750;
const TURB_DIRTY = 200;

// ─── EXPRESS SETUP ──────────────────────────────
const app = express();
app.use(cors());

// Raw + processed data
let latestData = {
  raw: {
    ph: null,
    turb: null,
    temp: null,
    gas: null,
  },
  processed: {
    ph: null,
    turb: null,
    temp: null,
    gas: null,
  },
  debug: {
    lastLine: null,
    valid: false,
  },
};

// ─── SERIAL STATE ───────────────────────────────
let port = null;
let parser = null;

// ─── SERIAL CONNECTOR ───────────────────────────
function connectSerial() {
  console.log("Attempting serial connection...");

  port = new SerialPort({
    path: SERIAL_PORT,
    baudRate: BAUD_RATE,
    autoOpen: false,
  });

  port.open((err) => {
    if (err) {
      console.log("Connection failed, retrying...");
      setTimeout(connectSerial, RECONNECT_DELAY);
      return;
    }

    console.log("Serial connected");

    parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

    parser.on("data", handleData);

    port.on("close", () => {
      console.log("Serial disconnected. Reconnecting...");
      setTimeout(connectSerial, RECONNECT_DELAY);
    });

    port.on("error", (err) => {
      console.error("Serial error:", err.message);
      try {
        port.close();
      } catch {}
    });
  });
}

// ─── CORE PROCESSING LOGIC ──────────────────────
function processData(raw) {
  let processed = {};

  // --- PH (convert from raw analog)
function processPH(raw) {
  if (raw === null) return null;

  // Normalize around baseline
  const baseline = 600; // YOUR observed neutral point
  const sensitivity = 0.03; // tweak factor

  let ph = 7 + (baseline - raw) * sensitivity;

  return Math.max(0, Math.min(14, ph));
}

processed.ph = processPH(raw.ph);

// TURBIDITY
if (raw.turb !== null) {
  const TURB_CLEAR =163.6;// avg raw for clean water
  const TURB_DIRTY =176.8;// avg raw for dirty water
  const NTU_MAX = 10;        // what dirty water represents in NTU

  let ntu = ((raw.turb - TURB_CLEAR) / (TURB_DIRTY - TURB_CLEAR)) * NTU_MAX;

  ntu = Math.max(0, Math.min(NTU_MAX, ntu));
  // console.log("NTU: ", ntu.toFixed(2));
  processed.turb = parseFloat(ntu.toFixed(2));
}

  // --- TEMP
  processed.temp = raw.temp === -999 ? null : raw.temp;

  // --- GAS
  processed.gas = raw.gas;

  return processed;
}

// ─── DATA HANDLER ───────────────────────────────
function handleData(line) {
  const clean = line.trim();

  console.log("Arduino RAW:", clean);

  latestData.debug.lastLine = clean;
  latestData.debug.valid = false;

  if (clean.includes("READY")) return;

  const pairs = clean.split(",");

  let raw = {
    ph: null,
    turb: null,
    temp: null,
    gas: null,
  };

  for (const pair of pairs) {
    const [key, val] = pair.split(":");
    const num = parseFloat(val);

    if (isNaN(num)) continue;

    // ✅ UPDATED KEY MAPPING
    if (key === "ph_raw") raw.ph = num;
    if (key === "turb_raw") raw.turb = num;
    if (key === "temp") raw.temp = num;
    if (key === "gas_raw") raw.gas = num;
  }

  // ✅ VALIDATION FIX (only require turb to exist)
  if (raw.turb === null) {
    console.log("⚠️ Invalid packet skipped");
    return;
  }

  latestData.raw = raw;
  latestData.processed = processData(raw);
  latestData.debug.valid = true;

  // console.log("Processed:", latestData.processed);
}

// ─── API ────────────────────────────────────────
app.get("/data", (req, res) => {
  res.json({
    ...latestData,
    timestamp: Date.now(),
  });
});

// Extra debug endpoint
app.get("/debug", (req, res) => {
  res.json(latestData.debug);
});

// ─── SERVER START ───────────────────────────────
app.listen(3000, "0.0.0.0", () => {
  console.log("LITMUS server running at http://0.0.0.0:3000");
  console.log("GET /data → processed + raw data");
  console.log("GET /debug → low-level diagnostics");
});

// ─── INIT ───────────────────────────────────────
setTimeout(connectSerial, 2000);