"use client";
import { err, numOf, strOf } from "./core";
import { cleanSeries, col, csvInput, describe, isNumericCol, num, parseDate, pdStr } from "./csv";
import { METHODS, runForecast } from "./forecast";
import { runSensors } from "./sensors";

export async function inspect(f: FormData) { const { t, name } = await csvInput(f); return { filename: name, ...describe(t) }; }
export async function forecast(f: FormData) {
  const method = strOf(f, "method") ?? "auto"; if (method !== "auto" && !(method in METHODS)) err(400, "method must be auto, " + Object.keys(METHODS).join(", ") + ".");
  const seasonS = strOf(f, "season"), season = seasonS === null || seasonS === "" ? null : Number(seasonS); if (season !== null && !(season >= 0 && season <= 400)) err(400, "season must be between 0 and 400.");
  const dateCol = strOf(f, "date_column"), valueCol = strOf(f, "value_column"); if (!dateCol || !valueCol) err(422, "date_column and value_column are required.");
  const { t, name } = await csvInput(f), c = cleanSeries(t, dateCol!, [valueCol!]), r = runForecast(c.t, c.y[0], Math.round(numOf(f, "horizon", 12)), season, method);
  return { filename: name, date_column: dateCol, value_column: valueCol, ...r, notes: [...c.notes, ...r.notes] };
}
export async function sensors(f: FormData) {
  const method = strOf(f, "method") ?? "all"; if (!["zscore", "baseline", "iforest", "all"].includes(method)) err(400, "method must be zscore, baseline, iforest or all.");
  const bf = numOf(f, "baseline_fraction", 0.25); if (bf < 0.05 || bf > 0.8) err(400, "baseline_fraction must be between 0.05 and 0.8.");
  const window = Math.round(numOf(f, "window", 48)), z = numOf(f, "z_threshold", 4), cont = numOf(f, "contamination", 0.02);
  if (!(window >= 5 && window <= 2000 && z >= 1.5 && z <= 20 && cont >= 0.001 && cont <= 0.3)) err(400, "window must be 5-2000, z_threshold 1.5-20 and contamination 0.001-0.3.");
  const { t, name } = await csvInput(f), cols = (strOf(f, "sensor_columns") ?? "").split(",").map((c) => c.trim()).filter(Boolean); if (cols.length < 1 || cols.length > 12) err(400, "Choose between 1 and 12 sensor columns.");
  const timeCol = strOf(f, "time_column") || null, labelCol = strOf(f, "label_column") || null;
  for (const c of [...cols, ...(timeCol ? [timeCol] : []), ...(labelCol ? [labelCol] : [])]) if (!t.cols.includes(c)) err(422, `Column '${c}' does not exist.`);
  const X: Record<string, number[]> = {}; for (const c of cols) { const v = col(t, c).map(num); if (v.filter((x) => x !== null).length / v.length < 0.8) err(422, `Column '${c}' is mostly non-numeric.`); X[c] = v.map((x) => (x === null ? NaN : x)); }
  if (timeCol && cols.includes(timeCol)) err(400, "The time column cannot also be a sensor column.");
  let order = Array.from({ length: t.rows.length }, (_, i) => i), labels: string[] | null = null;
  if (timeCol) {
    if (isNumericCol(t, timeCol)) err(422, `Column '${timeCol}' is numeric, not a date/time column.`);
    const tt = col(t, timeCol).map(parseDate); if (tt.filter((x) => x === null).length / tt.length > 0.1) err(422, `Column '${timeCol}' does not contain valid timestamps.`);
    order = order.filter((i) => tt[i] !== null).sort((a, b) => tt[a]! - tt[b]!); labels = order.map((i) => pdStr(tt[i]!));
  }
  const Xo = Object.fromEntries(cols.map((c) => [c, order.map((i) => X[c][i])])), lab = labelCol ? order.map((i) => num(col(t, labelCol)[i]) ?? 0) : null;
  return { filename: name, time_column: timeCol, ...runSensors(labels, Xo, cols, method, window, z, cont, lab, bf, labelCol) };
}
