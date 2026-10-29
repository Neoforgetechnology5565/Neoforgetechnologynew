"use client";
/** CSV reading shared by the forecasting and sensor demos: bounded, validated, explicit about every problem (port of tabular.py). */
import { err, fileOf, LIMITS, sampleBlob, sniff, strOf, cleanName } from "./core";

export interface Table { cols: string[]; rows: string[][] }
export function parseCsv(text: string, maxRows: number): Table {
  if (text.slice(0, 2000).includes("\u0000")) err(415, "This looks like a binary file, not a CSV.");
  const first = text.split(/\r?\n/, 1)[0] ?? ""; const delim = [",", ";", "\t", "|"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let cur: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === "") q = true; else if (c === delim) { cur.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); f = ""; if (cur.some((x) => x !== "") || cur.length > 1) rows.push(cur); cur = []; if (rows.length > maxRows + 1) break; } else f += c;
  }
  if (f !== "" || cur.length) { cur.push(f); if (cur.some((x) => x !== "")) rows.push(cur); }
  if (rows.length < 1) err(422, "The CSV could not be parsed. Check that it has a header row and consistent columns.");
  const cols = rows[0].map((c) => c.trim()), body = rows.slice(1);
  if (body.length > maxRows) err(422, `The file has more than ${maxRows} rows; this demo accepts up to ${maxRows}.`);
  if (cols.length < 2 || body.length < 3) err(422, "The CSV needs at least two columns and three rows.");
  if (new Set(cols).size !== cols.length) err(422, "Column names must be unique.");
  return { cols, rows: body.map((r) => cols.map((_, i) => (r[i] ?? "").trim())) };
}
export async function readCsvBlob(b: Blob): Promise<Table> {
  if (!b.size) err(400, "The file is empty."); if (b.size > LIMITS.max_csv_mb * 1e6) err(413, `The file is larger than the ${LIMITS.max_csv_mb} MB limit.`);
  const h = new Uint8Array(await b.slice(0, 4).arrayBuffer()); if ((await sniff(b)) !== null || (h[0] === 0x50 && h[1] === 0x4b && h[2] === 3 && h[3] === 4)) err(415, "Unsupported file type. Upload a CSV file.");
  const buf = await b.arrayBuffer(); let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); } catch { text = new TextDecoder("latin1").decode(buf); }
  return parseCsv(text, LIMITS.max_csv_rows);
}
export async function csvInput(f: FormData): Promise<{ t: Table; name: string }> {
  const file = fileOf(f, "file"), sid = strOf(f, "sample_id"); if ((file === null) === (sid === null)) err(400, "Send either a CSV file or a sample_id.");
  if (sid !== null) { const { blob, item } = await sampleBlob(sid, "csv"); return { t: await readCsvBlob(blob), name: item.file }; }
  return { t: await readCsvBlob(file!), name: cleanName(file!.name) };
}
export const col = (t: Table, c: string) => t.rows.map((r) => r[t.cols.indexOf(c)]);
export const num = (s: string): number | null => { if (s === "") return null; const n = Number(s.replace(/,/g, "")); return s !== "" && Number.isFinite(n) && /^[-+]?(\d|\.\d)/.test(s.trim()) ? n : null; };
export const isNumericCol = (t: Table, c: string) => { const v = col(t, c).filter((x) => x !== ""); return v.length > 0 && v.every((x) => num(x) !== null); };
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Flexible date parsing like pandas' format="mixed"; returns UTC milliseconds or null. */
export function parseDate(s0: string): number | null {
  const s = s0.trim(); if (!s) return null; let m: RegExpMatchArray | null;
  const mk = (y: number, mo: number, d: number, h = 0, mi = 0, se = 0) => { if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null; const t = Date.UTC(y, mo - 1, d, h, mi, se); const dt = new Date(t); return dt.getUTCMonth() === mo - 1 ? t : null; };
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:Z)?$/))) return mk(+m[1], +m[2], +(m[3] ?? 1), +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3], a = +m[1], b = +m[2]; return (a > 12 ? mk(y, b, a, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) : mk(y, a, b, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))); }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/))) { const mo = MON.indexOf(m[2].toLowerCase()) + 1; return mo ? mk(+m[3], mo, +m[1]) : null; }
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) { const mo = MON.indexOf(m[1].toLowerCase()) + 1; return mo ? mk(+m[3], mo, +m[2]) : null; }
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?[ -](\d{4})$/))) { const mo = MON.indexOf(m[1].toLowerCase()) + 1; return mo ? mk(+m[2], mo, 1) : null; }
  return null;
}
export const dateShare = (t: Table, c: string) => { const v = col(t, c); return v.length ? v.filter((x) => parseDate(x) !== null).length / v.length : 0; };
export const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
export const pdStr = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

export function describe(t: Table) {
  const dates = t.cols.filter((c) => !isNumericCol(t, c) && dateShare(t, c) >= 0.9);
  const nums = t.cols.filter((c) => { if (dates.includes(c)) return false; const v = col(t, c), n = v.map(num).filter((x) => x !== null) as number[]; return v.length > 0 && n.length / v.length >= 0.9 && new Set(n).size > 1; });
  const prev = t.rows.slice(0, 8).map((r) => r.map((x, i) => (x === "" ? null : isNumericCol(t, t.cols[i]) ? num(x) : x)));
  return { rows: t.rows.length, columns: t.cols, date_candidates: dates, numeric_candidates: nums, preview: prev };
}
/** Parse the date column, coerce the value columns, drop unusable rows and say how many (clean_series). */
export function cleanSeries(t: Table, dateCol: string, cols: string[]): { t: number[]; y: number[][]; notes: string[] } {
  for (const c of [dateCol, ...cols]) if (!t.cols.includes(c)) err(422, `Column '${c}' does not exist.`);
  const notes: string[] = [], d = col(t, dateCol).map(parseDate), badDates = d.filter((x) => x === null).length;
  if (badDates > 0.1 * t.rows.length) err(422, `${badDates} of ${t.rows.length} values in '${dateCol}' are not valid dates.`);
  const vals = cols.map((c) => col(t, c).map(num)); const recs = d.map((x, i) => ({ t: x, y: vals.map((v) => v[i]) })).filter((r) => r.t !== null) as { t: number; y: (number | null)[] }[];
  const badVals = recs.filter((r) => r.y.some((v) => v === null)).length; if (badDates) notes.push(`${badDates} row(s) with an invalid date were dropped.`); if (badVals > 0) notes.push(`${badVals} row(s) had a missing or non-numeric value.`);
  recs.sort((a, b) => a.t - b.t); if (cols.some((_, j) => recs.every((r) => r.y[j] === null))) err(422, "A selected column has no numeric values.");
  const by = new Map<number, { t: number; y: (number | null)[][] }>(); let dup = 0; for (const r of recs) { const e = by.get(r.t); if (e) { dup++; e.y.push(r.y); } else by.set(r.t, { t: r.t, y: [r.y] }); }
  if (dup) { notes.push(`${dup} duplicate timestamp(s) were averaged.`); }
  const T: number[] = [], Y: number[][] = cols.map(() => []);
  for (const e of by.values()) { T.push(e.t); cols.forEach((_, j) => { const v = e.y.map((r) => r[j]).filter((x) => x !== null) as number[]; Y[j].push(v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN); }); }
  return { t: T, y: Y, notes };
}
