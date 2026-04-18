import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  label: string;
  value: number | null;
  unit: string;
};

export default function ReadingCard({ label, value, unit }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value !== null ? value.toFixed(1) : "--"}</Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#27272a",
    borderRadius: 16,
    padding: 16,
    flex: 1,
    marginHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 96,
  },
  label: {
    color: "#a1a1aa",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  value: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "bold",
  },
  unit: {
    color: "#71717a",
    fontSize: 11,
    marginTop: 4,
  },
});