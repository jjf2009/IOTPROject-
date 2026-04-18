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
