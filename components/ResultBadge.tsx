import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Result = "SAFE" | "ADULTERATED" | "UNKNOWN";

type Props = { result: Result };

const config: Record<Result, { bg: string; text: string; label: string }> = {
  SAFE:        { bg: "#10b981", text: "#ffffff", label: "✓   SAFE" },
  ADULTERATED: { bg: "#ef4444", text: "#ffffff", label: "✗   ADULTERATED" },
  UNKNOWN:     { bg: "#3f3f46", text: "#a1a1aa", label: "—   AWAITING DATA" },
};

export default function ResultBadge({ result }: Props) {
  const { bg, text, label } = config[result];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  text: {
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 2,
  },
});