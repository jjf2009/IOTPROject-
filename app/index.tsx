import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SensorData, getResult } from "../utils/parseData";
import ReadingCard from "../components/ReadingCard";
import ResultBadge from "../components/ResultBadge";

const SERVER_URL = "http://10.208.226.43:3000/data";
const POLL_INTERVAL_MS = 1000;

export default function Index() {
  const [data, setData] = useState<SensorData>({ ph: null, turb: null, temp: null, gas: null });
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(SERVER_URL);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (active) { setData(json); setConnected(true); setLoading(false); }
      } catch {
        if (active) { setConnected(false); setLoading(false); }
      }
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const result = getResult(data);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <Text style={styles.title}>LITMUS</Text>
        <Text style={styles.subtitle}>Adulteration Detection System</Text>

        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: connected ? "#34d399" : "#ef4444" }]} />
          <Text style={styles.statusText}>
            {loading ? "Connecting..." : connected ? "Live — receiving data" : "Server unreachable"}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.row}>
              <ReadingCard label="pH" value={data.ph} unit="pH" />
              <ReadingCard label="Turbidity" value={data.turb} unit="NTU" />
            </View>
            <View style={styles.row}>
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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#18181b",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  title: {
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "#71717a",
    fontSize: 13,
    marginBottom: 32,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: "#a1a1aa",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    marginBottom: 12,
  },
});