"use client";
/** Time-series forecasting with classical methods and an honest hold-out comparison (browser port of forecast.py). Smoothing parameters are fitted here by
 *  minimising the one-step squared error (Nelder-Mead), so numbers differ slightly from the server's statsmodels fit; every accuracy figure is computed from the data. */
import { err } from "./core";
import { iso } from "./csv";

const FREQ: Record<string, [string, number]> = { D: ["daily", 7], W: ["weekly", 52], MS: ["monthly", 12], QS: ["quarterly", 4], h: ["hourly", 24], YS: ["yearly", 0], min: ["minutely", 60] };
export const METHODS: Record<string, string> = { naive: "Repeat the last observed value.", seasonal_naive: "Repeat the values from the previous season.", holt: "Holt linear trend exponential smoothing (damped), no seasonality.", holt_winters: "Holt-Winters additive trend and additive seasonality (damped trend)." };
const DAY = 86400000;

function nelder(f: (x: number[]) => number, x0: number[], iters = 400): number[] {
  const n = x0.length; let sx = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + 0.4 : v)))], sf = sx.map(f);
  for (let k = 0; k < iters; k++) {
    const o = sf.map((_, i) => i).sort((a, b) => sf[a] - sf[b]); sx = o.map((i) => sx[i]); sf = o.map((i) => sf[i]);
    const c = x0.map((_, j) => sx.slice(0, n).reduce((s, p) => s + p[j], 0) / n), w = sx[n], r = c.map((v, j) => v + (v - w[j])), fr = f(r);
    if (fr < sf[0]) { const e = c.map((v, j) => v + 2 * (v - w[j])), fe = f(e); if (fe < fr) { sx[n] = e; sf[n] = fe; } else { sx[n] = r; sf[n] = fr; } }
    else if (fr < sf[n - 1]) { sx[n] = r; sf[n] = fr; }
    else { const cc = c.map((v, j) => v + 0.5 * (w[j] - v)), fc = f(cc); if (fc < sf[n]) { sx[n] = cc; sf[n] = fc; } else for (let i = 1; i <= n; i++) { sx[i] = sx[0].map((v, j) => v + 0.5 * (sx[i][j] - v)); sf[i] = f(sx[i]); } }
    if (Math.abs(sf[n] - sf[0]) < 1e-10 * (1 + Math.abs(sf[0]))) break;
  }
  return sx[0];
}
const sig = (x: number) => 1 / (1 + Math.exp(-x));
/** Damped additive trend, optional additive seasonality of length m. Returns forecast of h steps. */
function smooth(y: number[], h: number, m: number): number[] {
  const seas = m >= 2, n = y.length;
  const init = () => { if (!seas) return { l: y[0], b: y[1] - y[0], s: [] as number[] }; const a = y.slice(0, m).reduce((s, v) => s + v, 0) / m, b2 = y.slice(m, 2 * m).reduce((s, v) => s + v, 0) / m; return { l: a, b: (b2 - a) / m, s: y.slice(0, m).map((v) => v - a) }; };
  const pass = (p: number[], keep: boolean) => {
    const [al, be, ga, ph] = [sig(p[0]), sig(p[1]) * 0.5, seas ? sig(p[2]) : 0, 0.8 + 0.2 * sig(p[3])], st = init(); let { l, b } = st; const s = [...st.s]; let sse = 0;
    for (let t = seas ? m : 1; t < n; t++) { const si = seas ? s[t % m] : 0, f = l + ph * b + si, e = y[t] - f; sse += e * e; const ln = al * (y[t] - si) + (1 - al) * (l + ph * b); b = be * (ln - l) + (1 - be) * ph * b; if (seas) s[t % m] = ga * (y[t] - ln) + (1 - ga) * si; l = ln; }
    return keep ? { l, b, s, ph } : sse;
  };
  const best = nelder((p) => pass(p, false) as number, [0, -1, -1, 1]), { l, b, s, ph } = pass(best, true) as { l: number; b: number; s: number[]; ph: number };
  const out: number[] = []; let damp = 0; for (let i = 1; i <= h; i++) { damp += ph ** i; out.push(l + damp * b + (seas ? s[(n + i - 1) % m] : 0)); } return out;
}
function fitPredict(method: string, y: number[], h: number, m: number): number[] {
  if (method === "naive") return Array(h).fill(y[y.length - 1]);
  if (method === "seasonal_naive") { if (m < 2 || y.length < m) throw new Error("not enough data for a season"); return Array.from({ length: h }, (_, i) => y[y.length - m + (i % m)]); }
  if (method === "holt") return smooth(y, h, 0);
  if (m < 2 || y.length < 2 * m) throw new Error("needs at least two full seasons"); return smooth(y, h, m);
}
function inferFreq(t: number[]): [string, number] {
  const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b), med = d[d.length >> 1] / 1000; if (!(med > 0)) err(422, "The timestamps do not increase.");
  for (const [code, lo, hi] of [["min", 55, 65], ["h", 3500, 3700], ["D", 82800, 90000], ["W", 6 * 86400, 8 * 86400], ["MS", 27 * 86400, 32 * 86400], ["QS", 88 * 86400, 93 * 86400], ["YS", 360 * 86400, 370 * 86400]] as [string, number, number][]) if (med >= lo && med <= hi) return [code, med];
  return err(422, `The time steps are irregular (median ${Math.round(med)} s); the demo supports minutely, hourly, daily, weekly, monthly, quarterly or yearly data.`);
}
const monthsOf = (ms: number) => { const d = new Date(ms); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const addMonths = (ms: number, k: number) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()); };
const stepMonths: Record<string, number> = { MS: 1, QS: 3, YS: 12 }, stepMs: Record<string, number> = { min: 60000, h: 3600000, D: DAY, W: 7 * DAY };
const slot = (code: string, t0: number, t: number) => (stepMonths[code] ? Math.round((monthsOf(t) - monthsOf(t0)) / stepMonths[code]) : Math.round((t - t0) / stepMs[code]));
const at = (code: string, t0: number, k: number) => (stepMonths[code] ? addMonths(t0, k * stepMonths[code]) : t0 + k * stepMs[code]);

export function runForecast(t: number[], v: number[], horizon: number, season: number | null, method: string) {
  if (horizon < 1 || horizon > 365) err(422, "The horizon must be between 1 and 365 steps.");
  const [code] = inferFreq(t), n = slot(code, t[0], t[t.length - 1]) + 1, y: number[] = new Array(n).fill(NaN); t.forEach((x, i) => { y[slot(code, t[0], x)] = v[i]; });
  const notes: string[] = [], missing = y.filter((x) => Number.isNaN(x)).length; if (missing > 0.2 * n) err(422, `${missing} of ${n} time steps have no value; too many gaps to forecast reliably.`);
  if (missing) { for (let i = 0; i < n; i++) if (Number.isNaN(y[i])) { let a = i - 1, b = i + 1; while (a >= 0 && Number.isNaN(y[a])) a--; while (b < n && Number.isNaN(y[b])) b++; y[i] = a < 0 ? y[b] : b >= n ? y[a] : y[a] + ((y[b] - y[a]) * (i - a)) / (b - a); } notes.push(`${missing} missing time step(s) were filled by linear interpolation.`); }
  const [name, dm] = FREQ[code]; let m = season === null ? dm : season; if (season === null && code === "W" && n < 104) m = 0;
  if (m && n < 2 * m) notes.push(`Only ${n} points for a season of ${m}: seasonal methods are unavailable.`);
  if (n < 12) err(422, "At least 12 observations are needed.");
  const ho = Math.round(Math.min(Math.max(horizon, 3), Math.max(3, Math.floor(n / 4)))), train = y.slice(0, n - ho), test = y.slice(n - ho), table: Record<string, unknown>[] = [], preds: Record<string, number[]> = {};
  for (const k of Object.keys(METHODS)) {
    if (method !== "auto" && method !== k) continue;
    try { const p = fitPredict(k, train, ho, m), e = test.map((x, i) => x - p[i]), nz = test.map((x) => Math.abs(x) > 1e-9); preds[k] = p;
      table.push({ method: k, description: METHODS[k], holdout_points: ho, mae: e.reduce((s, x) => s + Math.abs(x), 0) / ho, rmse: Math.sqrt(e.reduce((s, x) => s + x * x, 0) / ho), mape_percent: nz.some(Boolean) ? (e.reduce((s, x, i) => s + (nz[i] ? Math.abs(x / test[i]) : 0), 0) / nz.filter(Boolean).length) * 100 : null });
    } catch (e) { table.push({ method: k, description: METHODS[k], unavailable: (e as Error).message }); }
  }
  const ok = table.filter((x) => "mae" in x) as (Record<string, unknown> & { mae: number; method: string })[]; if (!ok.length) err(422, "No method could be fitted to this series.");
  const bestM = ok.reduce((a, b) => (b.mae < a.mae ? b : a)), fc = fitPredict(bestM.method, y, horizon, m), resid = test.map((x, i) => x - preds[bestM.method][i]);
  let sigma: number | null = null; if (resid.length >= 5) { const mu = resid.reduce((a, b) => a + b, 0) / resid.length; sigma = Math.sqrt(resid.reduce((s, x) => s + (x - mu) ** 2, 0) / (resid.length - 1)); }
  const T = (k: number) => iso(at(code, t[0], k));
  return { frequency: name, season_length: m || null, n_observations: n, method: bestM.method, method_description: METHODS[bestM.method], selected_by: method === "auto" ? `lowest mean absolute error on the last ${ho} observations, which were held out of fitting` : "chosen by the user",
    history: { t: Array.from({ length: n }, (_, i) => T(i)), y }, holdout: { t: Array.from({ length: ho }, (_, i) => T(n - ho + i)), actual: test, predicted: preds[bestM.method] },
    forecast: { t: Array.from({ length: horizon }, (_, i) => T(n + i)), mean: fc, lower: sigma === null ? null : fc.map((x) => x - 1.96 * sigma!), upper: sigma === null ? null : fc.map((x) => x + 1.96 * sigma!) },
    interval_note: sigma !== null ? "Approximate 95% band: +/-1.96 times the standard deviation of the hold-out errors. It assumes errors of similar size in the future, roughly normal and unbiased, and understates uncertainty for long horizons." : "Fewer than 5 hold-out points: no interval is shown.",
    methods: table, notes, limitations: ["A statistical extrapolation of the series' own past: it knows nothing about events, prices, promotions or anything outside the data.", "Accuracy figures come from a single hold-out window and may not hold for the future.", "Strong structural change, outliers and short series make every method unreliable.", "This browser version fits the smoothing parameters itself (not statsmodels), so figures can differ slightly from the server version."] };
}
