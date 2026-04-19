# 🧪 LITMUS — IoT Food Adulteration Detection System

A real-time food adulteration detection system built with **Arduino**, a **Node.js bridge server**, and a **React Native (Expo)** mobile app. LITMUS reads pH, turbidity, temperature, and gas sensor data from an Arduino board and displays a live **SAFE / ADULTERATED** verdict on your phone.

---

## 📐 Architecture

```
┌─────────────┐    USB/Serial    ┌──────────────┐    HTTP (Wi-Fi)    ┌──────────────┐
│  Arduino Uno│ ──────────────► │  Node.js     │ ◄───────────────── │  Expo Go     │
│  + Sensors   │   9600 baud     │  Server      │   GET /data        │  Mobile App  │
└─────────────┘                  └──────────────┘   (polling 1s)     └──────────────┘
```

> Phone and laptop must be on the **same network** (phone hotspot works perfectly).

---

## 🔬 Sensors

| Sensor | Pin | Measurement | Safe Range |
|--------|-----|-------------|------------|
| **pH Sensor** | A0 | Acidity / alkalinity | 6.0 – 8.5 pH |
| **Turbidity Sensor** | A1 | Clarity of liquid | < 100 NTU |
| **DS18B20 (Temperature)** | D4 | Temperature | < 40 °C |
| **MQ Gas Sensor** | A2 | Gas concentration | < 400 ppm |

If **2 or more** readings fall outside their safe range → verdict is **ADULTERATED**.

---

## 📁 Project Structure

```
litmus/
├── ardunio/
│   └── litmus_firmware.ino      # Arduino sketch
├── server/
│   ├── package.json
│   └── index.js                 # Serial → HTTP bridge
├── app/
│   ├── _layout.tsx              # Root layout
│   └── index.tsx                # Main screen (polls /data)
├── components/
│   ├── ReadingCard.tsx           # Sensor value card
│   └── ResultBadge.tsx          # SAFE / ADULTERATED badge
├── utils/
│   └── parseData.ts             # Types + detection logic
├── app.json
├── babel.config.js
├── metro.config.js
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- **Arduino IDE** with `OneWire` and `DallasTemperature` libraries installed
- **Node.js** v18+
- **Expo Go** app on your Android phone
- Arduino Uno connected via USB to your laptop

### 1. Flash the Arduino

1. Open `ardunio/litmus_firmware.ino` in the Arduino IDE
2. Adjust the `SERIAL_PORT` (COM port) if needed
3. Calibrate `PH_SLOPE` and `PH_OFFSET` for your pH sensor
4. Upload to your Arduino Uno

The Arduino outputs data in this format over Serial:
```
ph:7.10,turb:85.0,temp:27.3,gas:310
```

### 2. Start the Bridge Server

```bash
cd server
npm install
node index.js
```

> **Edit `SERIAL_PORT`** in `server/index.js` to match your Arduino's COM port  
> (Windows: `COM3`, `COM4` … | Linux/Mac: `/dev/ttyUSB0`, `/dev/ttyACM0`)

You should see:
```
LITMUS server running at http://0.0.0.0:3000
GET /data to read sensor values
```

### 3. Find Your Laptop IP

| OS | Command |
|----|---------|
| Windows | `ipconfig` → IPv4 Address |
| Mac/Linux | `ifconfig` or `ip addr` |

### 4. Configure & Run the Expo App

1. **Update the server IP** in `app/index.tsx`:
   ```ts
   const SERVER_URL = "http://<YOUR_LAPTOP_IP>:3000/data";
   ```

2. Install dependencies and start:
   ```bash
   npm install
   npx expo start
   ```

3. Scan the QR code with **Expo Go** on your phone

> ⚠️ Your phone must be on the **same Wi-Fi network** as your laptop.

---

## 🧠 Detection Logic

The system evaluates four parameters against safe thresholds:

```
pH      →  abnormal if < 6.0 or > 8.5
Turbidity →  abnormal if > 100 NTU
Temperature →  abnormal if > 40 °C
Gas     →  abnormal if > 400 ppm
```

| Abnormal Count | Verdict |
|:--------------:|:-------:|
| 0–1 | ✅ **SAFE** |
| 2+ | ❌ **ADULTERATED** |
| No data | ⏳ **AWAITING DATA** |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Hardware** | Arduino Uno, pH/Turbidity/MQ-Gas/DS18B20 sensors |
| **Firmware** | C++ (Arduino IDE) |
| **Bridge Server** | Node.js, Express, SerialPort |
| **Mobile App** | React Native (Expo Router), TypeScript |
| **Styling** | React Native StyleSheet |

---

## 📷 Screenshots

*Coming soon — run the app and add screenshots here.*

---

## 📄 License

This project is for educational and research purposes.

---

<p align="center">
  Built with ⚗️ by <strong>LITMUS Team</strong>
</p>
