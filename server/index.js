const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const express = require("express");
const cors = require("cors");

// ─── CONFIG ─────────────────────────────────────
const SERIAL_PORT = "/dev/ttyACM0";
const BAUD_RATE = 9600;
const RECONNECT_DELAY = 2000;

// ─── EXPRESS SETUP ──────────────────────────────
const app = express();
app.use(cors());

let latestData = {
  ph: null,
  turb: null,
  temp: null,
  gas: null,
};

// ─── SERIAL STATE ───────────────────────────────
let port = null;
let parser = null;

// ─── SERIAL CONNECTOR (SELF-HEALING) ────────────
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

// ─── DATA PARSER ────────────────────────────────
function handleData(line) {
  const clean = line.trim();
  console.log("Arduino:", clean);

  if (clean === "LITMUS:READY") return;

  const pairs = clean.split(",");

  for (const pair of pairs) {
    const [key, val] = pair.split(":");
    const num = parseFloat(val);

    if (!isNaN(num)) {
      if (key === "ph") {
        // Reject fake grounded value (14 from GND)
        latestData.ph = num === 14 ? null : num;
      }

      if (key === "turb") {
        latestData.turb = num;
      }

      if (key === "temp") {
        latestData.temp = num === -999 ? null : num;
      }

      if (key === "gas") {
        // Reject grounded gas
        latestData.gas = num === 0 ? null : num;
      }
    }
  }
}

// ─── API ────────────────────────────────────────
app.get("/data", (req, res) => {
  res.json({
    ...latestData,
    timestamp: Date.now(),
  });
});

// ─── SERVER START ───────────────────────────────
app.listen(3000, "0.0.0.0", () => {
  console.log("LITMUS server running at http://0.0.0.0:3000");
  console.log("GET /data to read sensor values");
});

// ─── INIT ───────────────────────────────────────
setTimeout(connectSerial, 2000);