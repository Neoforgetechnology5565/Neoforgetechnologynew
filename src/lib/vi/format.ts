/** Small, dependency-free helpers shared by the three video intelligence demos (and unit tested in vi.test.ts). */
export const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // a spreadsheet must never run a formula from exported text
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
export const mmss = (t: number) => { const s = Math.max(0, Math.round(t * 10) / 10); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`; };
export const hms = (t: number) => { const s = Math.max(0, Math.round(t)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
export const saveText = (name: string, text: string, mime = "text/csv") => saveBlob(name, new Blob([text], { type: mime }));
export function saveBlob(name: string, blob: Blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/** Index of the analysed frame nearest to t, or -1 if there is none within maxGap seconds. */
export function nearestFrame(times: number[], t: number, maxGap: number): number {
  if (!times.length) return -1;
  let lo = 0, hi = times.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  const c = [lo - 1, lo].filter((i) => i >= 0 && i < times.length).sort((a, b) => Math.abs(times[a] - t) - Math.abs(times[b] - t))[0];
  return Math.abs(times[c] - t) <= maxGap ? c : -1;
}
