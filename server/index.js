const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

// Change this to match your Arduino port:
// Windows: 'COM3', 'COM4', etc.
// Mac/Linux: '/dev/ttyUSB0' or '/dev/ttyACM0'
const SERIAL_PORT = "COM3";
const BAUD_RATE = 9600;

let latestData = { ph: null, turb: null, temp: null, gas: null };

const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

parser.on("data", (line) => {
  console.log("Arduino:", line.trim());
  const pairs = line.trim().split(",");
  for (const pair of pairs) {
    const [key, val] = pair.split(":");
    const num = parseFloat(val);
    if (!isNaN(num)) {
      if (key === "ph") latestData.ph = num;
      if (key === "turb") latestData.turb = num;
      if (key === "temp") latestData.temp = num === -999 ? null : num; 
      if (key === "gas") latestData.gas = num;
    }
  }
});

port.on("error", (err) => {
  console.error("Serial error:", err.message);
  console.error("Check that the Arduino is plugged in and the port is correct.");
});

app.get("/data", (req, res) => {
  res.json(latestData);
});

app.listen(3000, "0.0.0.0", () => {
  console.log("LITMUS server running at http://0.0.0.0:3000");
  console.log("GET /data to read sensor values");
});
