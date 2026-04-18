# LITMUS – Build Task for Antigravity

## Architecture

```
Arduino (USB) → Node.js server on laptop → HTTP endpoint → Expo Go on phone
```

Phone and laptop must be on the same network (phone hotspot works).

---

## What Gets Built

1. **`server/`** — Node.js script. Reads Arduino serial over USB, exposes sensor data at `GET /data`.
2. **Expo app** — Single screen. Polls `/data` every second. Displays readings and SAFE/ADULTERATED result.

---

## Final File Structure

```
/
├── server/
│   ├── package.json
│   └── index.js
├── app/
│   ├── _layout.tsx
│   └── index.tsx
├── components/
│   ├── ReadingCard.tsx
│   └── ResultBadge.tsx
├── utils/
│   └── parseData.ts
├── global.css
├── tailwind.config.js
├── babel.config.js
├── metro.config.js
└── app.json
```

---

## Part 1 — Node.js Serial Server

### `server/package.json`

```json
{
  "name": "litmus-server",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "serialport": "^12.0.0",
    "@serialport/parser-readline": "^12.0.0",
    "cors": "^2.8.5",
    "express": "^4.18.2"
  }
}
```

### `server/index.js`

```js
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
      if (key === "temp") latestData.temp = num;
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
```

### How to run the server

```bash
cd server
npm install
node index.js
```

Find your laptop IP address:
- Windows: run `ipconfig` → look for IPv4 Address
- Mac/Linux: run `ifconfig` → look for inet address

Note it down — you'll need it in the app (e.g. `192.168.1.5`).

---

## Part 2 — Expo App

### Step 1 — Install Dependencies

```bash
npm install nativewind tailwindcss react-native-css-interop
```

No other packages needed. No native modules.

### Step 2 — `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### Step 3 — `global.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 4 — `babel.config.js`

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: ["nativewind/babel"],
  };
};
```

### Step 5 — `metro.config.js`

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
module.exports = withNativeWind(config, { input: "./global.css" });
```

### Step 6 — `app/_layout.tsx`

```tsx
import "../global.css";
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

### Step 7 — `utils/parseData.ts`

```ts
export type SensorData = {
  ph: number | null;
  turb: number | null;
  temp: number | null;
  gas: number | null;
};

export function getResult(
  data: SensorData
): "SAFE" | "ADULTERATED" | "UNKNOWN" {
  if (
    data.ph === null &&
    data.turb === null &&
    data.temp === null &&
    data.gas === null
  )
    return "UNKNOWN";

  let abnormal = 0;
  if (data.ph !== null && (data.ph < 6.0 || data.ph > 8.5)) abnormal++;
  if (data.turb !== null && data.turb > 100) abnormal++;
  if (data.temp !== null && data.temp > 40) abnormal++;
  if (data.gas !== null && data.gas > 400) abnormal++;

  return abnormal >= 2 ? "ADULTERATED" : "SAFE";
}
```

### Step 8 — `components/ReadingCard.tsx`

```tsx
import React from "react";
import { View, Text } from "react-native";

type Props = {
  label: string;
  value: number | null;
  unit: string;
};

export default function ReadingCard({ label, value, unit }: Props) {
  return (
    <View className="bg-zinc-800 rounded-2xl p-4 flex-1 mx-1 items-center justify-center">
      <Text className="text-zinc-400 text-xs uppercase tracking-widest mb-1">
        {label}
      </Text>
      <Text className="text-white text-2xl font-bold">
        {value !== null ? value.toFixed(1) : "--"}
      </Text>
      <Text className="text-zinc-500 text-xs mt-1">{unit}</Text>
    </View>
  );
}
```

### Step 9 — `components/ResultBadge.tsx`

```tsx
import React from "react";
import { View, Text } from "react-native";

type Result = "SAFE" | "ADULTERATED" | "UNKNOWN";

type Props = {
  result: Result;
};

const config: Record<Result, { containerClass: string; textClass: string; label: string }> = {
  SAFE: {
    containerClass: "bg-emerald-500",
    textClass: "text-white",
    label: "✓  SAFE",
  },
  ADULTERATED: {
    containerClass: "bg-red-500",
    textClass: "text-white",
    label: "✗  ADULTERATED",
  },
  UNKNOWN: {
    containerClass: "bg-zinc-700",
    textClass: "text-zinc-400",
    label: "—  AWAITING DATA",
  },
};

export default function ResultBadge({ result }: Props) {
  const { containerClass, textClass, label } = config[result];
  return (
    <View className={`${containerClass} rounded-2xl px-6 py-5 items-center justify-center mt-6`}>
      <Text className={`${textClass} text-xl font-bold tracking-widest`}>
        {label}
      </Text>
    </View>
  );
}
```

### Step 10 — `app/index.tsx`

**Important:** Replace `YOUR_LAPTOP_IP` with the actual IP address of the laptop running the server (e.g. `192.168.43.105`).

```tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { SensorData, getResult } from "../utils/parseData";
import ReadingCard from "../components/ReadingCard";
import ResultBadge from "../components/ResultBadge";

const SERVER_URL = "http://YOUR_LAPTOP_IP:3000/data";
const POLL_INTERVAL_MS = 1000;

export default function Index() {
  const [data, setData] = useState<SensorData>({
    ph: null,
    turb: null,
    temp: null,
    gas: null,
  });
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(SERVER_URL);
        if (!res.ok) throw new Error("Bad response");
        const json = await res.json();
        if (active) {
          setData(json);
          setConnected(true);
          setLoading(false);
        }
      } catch {
        if (active) {
          setConnected(false);
          setLoading(false);
        }
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const result = getResult(data);

  return (
    <SafeAreaView className="flex-1 bg-zinc-900">
      <View className="flex-1 px-5 pt-8">

        <Text className="text-white text-4xl font-bold tracking-tight">
          LITMUS
        </Text>
        <Text className="text-zinc-500 text-sm mb-8">
          Adulteration Detection System
        </Text>

        <View className="flex-row items-center mb-6">
          <View
            className={`w-2 h-2 rounded-full mr-2 ${
              connected ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
          <Text className="text-zinc-400 text-sm">
            {loading
              ? "Connecting to server..."
              : connected
              ? "Live — receiving data"
              : "Server unreachable — check IP and server"}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#fff" className="mt-10" />
        ) : (
          <>
            <View className="flex-row mb-3">
              <ReadingCard label="pH" value={data.ph} unit="pH" />
              <ReadingCard label="Turbidity" value={data.turb} unit="NTU" />
            </View>
            <View className="flex-row mb-3">
              <ReadingCard label="Temperature" value={data.temp} unit="°C" />
              <ReadingCard label="Gas" value={data.gas} unit="ppm" />
            </View>

            <ResultBadge result={result} />
          </>
        )}

      </View>
    </SafeAreaView>
  );
}
```

---

## Step 11 — Arduino Sketch Requirement

Make sure your Arduino sketch sends data in this exact format over Serial:

```cpp
Serial.println("ph:7.10,turb:85,temp:27,gas:310");
```

All four keys, comma separated, newline at the end. The server parses this line.

---

## How to Run Everything

### Terminal 1 — Start the server (laptop)
```bash
cd server
node index.js
```
You should see: `LITMUS server running at http://0.0.0.0:3000`

### Terminal 2 — Start the Expo app (laptop)
```bash
npx expo start
```
Scan the QR code with Expo Go on your phone.
Phone must be on the same network as the laptop (phone hotspot is fine).

### Before scanning the QR
Update `SERVER_URL` in `app/index.tsx` with your laptop's IP address.
Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux) to find it.

---

## Checklist

- [ ] `npm install nativewind tailwindcss react-native-css-interop` done (in Expo project root)
- [ ] `tailwind.config.js` created
- [ ] `global.css` created
- [ ] `babel.config.js` replaced
- [ ] `metro.config.js` replaced
- [ ] `app/_layout.tsx` replaced
- [ ] `utils/parseData.ts` created
- [ ] `components/ReadingCard.tsx` created
- [ ] `components/ResultBadge.tsx` created
- [ ] `app/index.tsx` replaced — `YOUR_LAPTOP_IP` updated with real IP
- [ ] `server/package.json` created
- [ ] `server/index.js` created — `SERIAL_PORT` updated with correct COM port
- [ ] `cd server && npm install && node index.js` running without errors
- [ ] Arduino plugged in and sketch running
- [ ] `npx expo start` running
- [ ] Expo Go scans QR — app shows dark UI with live readings