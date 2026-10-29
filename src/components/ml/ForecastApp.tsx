"use client";
import { useEffect, useState } from "react";
import type { Branding } from "@/lib/types";
import { csvCell, download, form } from "@/lib/ml/api";
import { BTN, CARD, Dropzone, ErrorBox, GO, H3, INPUT, Legend, LineChart, MlShell, PreviewFeatures, SamplePicker, StatusChip, useCsv, useMl } from "./common";

interface Method { method: string; description: string; mae?: number; rmse?: number; mape_percent?: number | null; holdout_points?: number; unavailable?: string }
interface Res { frequency: string; season_length: number | null; n_observations: number; method: string; method_description: string; selected_by: string; history: { t: string[]; y: number[] }; holdout: { t: string[]; actual: number[]; predicted: number[] };
  forecast: { t: string[]; mean: number[]; lower: number[] | null; upper: number[] | null }; interval_note: string; methods: Method[]; notes: string[]; limitations: string[]; value_column: string }

export default function ForecastApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health, samples } = useMl(serviceUrl, "csv");
  const csv = useCsv(api, health?.limits.max_csv_mb ?? 5);
  const [dateCol, setDateCol] = useState(""); const [valCol, setValCol] = useState(""); const [horizon, setHorizon] = useState(24); const [method, setMethod] = useState("auto"); const [season, setSeason] = useState("");
  const [res, setRes] = useState<Res | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const pick = async (s: File | import("@/lib/ml/api").Sample) => { setRes(null); await csv.load(s); };
  const ready = csv.info && csv.src;
  useEffect(() => { if (csv.info) { setDateCol(csv.info.date_candidates[0] ?? ""); setValCol(csv.info.numeric_candidates.find((c) => c !== csv.info!.date_candidates[0]) ?? ""); } }, [csv.info]);
  const run = async () => {
    if (!api || !ready) return; setError(""); setBusy(true);
    try { setRes(await api.post<Res>("/api/forecast", form({ ...csv.fields(), date_column: dateCol, value_column: valCol, horizon, method, season: season === "" ? null : season }))); } catch (e) { setError(e instanceof Error ? e.message : "Forecast failed."); setRes(null); } finally { setBusy(false); }
  };
  const n = res?.history.y.length ?? 0;
  return (
    <MlShell branding={branding} title="Time-Series Forecasting & Predictive Analytics" project={csv.info?.filename ?? "No data selected"} service={service}
      notice="Real classical forecasting (naive, seasonal naive, Holt, Holt-Winters) fitted to your series. The method is chosen by how well it predicted the last part of the data, which was held out; those accuracy figures are computed from your data and say nothing certain about the future."
      footer="Working: CSV upload, validation, forecasting, hold-out accuracy and CSV download. Not implemented: deep learning, automated external feeds, scheduling, dashboards (previews below). The sample is the Mauna Loa CO2 record (public domain).">
      <ErrorBox msg={csv.error || error} />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Data <StatusChip s="working" /></h2>
          <Dropzone label="Upload a CSV (a date column and a numeric column)" accept=".csv,.tsv,.txt,text/csv" disabled={service !== "online" || csv.busy || busy} onFile={pick} />
          <SamplePicker samples={samples.filter((s) => s.id === "co2-monthly")} disabled={service !== "online" || csv.busy || busy} onPick={pick} />
          {csv.info && (
            <div className="mt-3 space-y-2 text-xs text-slate-300" data-testid="columns">
              <p>{csv.info.rows} rows · columns: {csv.info.columns.join(", ")}</p>
              <label className="flex items-center justify-between gap-2">Date column<select value={dateCol} onChange={(e) => setDateCol(e.target.value)} className={INPUT} data-testid="date-col">{csv.info.columns.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="flex items-center justify-between gap-2">Value column<select value={valCol} onChange={(e) => setValCol(e.target.value)} className={INPUT} data-testid="value-col">{csv.info.columns.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="flex items-center justify-between gap-2">Forecast horizon (steps)<input type="number" min={1} max={365} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className={`${INPUT} w-20`} data-testid="horizon" /></label>
              <label className="flex items-center justify-between gap-2">Method<select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT} data-testid="method"><option value="auto">Automatic (best on hold-out)</option><option value="naive">Naive</option><option value="seasonal_naive">Seasonal naive</option><option value="holt">Holt (trend)</option><option value="holt_winters">Holt-Winters (trend + season)</option></select></label>
              <label className="flex items-center justify-between gap-2">Season length (optional)<input value={season} onChange={(e) => setSeason(e.target.value.replace(/\D/g, ""))} placeholder="auto" className={`${INPUT} w-20`} /></label>
              <button className={GO} disabled={busy || !dateCol || !valCol} onClick={run} data-testid="run">Forecast</button>
            </div>
          )}
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Forecast</h2>
          {(busy || csv.busy) && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Working…</p>}
          {!busy && !res && <p className="mt-3 text-sm text-slate-400" data-testid="empty">{csv.info ? "Choose the columns and press Forecast." : "Choose or upload a CSV. Nothing is forecast until you do."}</p>}
          {res && !busy && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-200" data-testid="summary">Method: <strong className="text-white">{res.method.replace("_", " ")}</strong> — {res.method_description} ({res.selected_by}). {res.n_observations} observations, {res.frequency} data{res.season_length ? `, season ${res.season_length}` : ""}.</p>
              <LineChart yLabel={res.value_column} xLabels={[...res.history.t, ...res.forecast.t]} series={[
                { name: "History", y: res.history.y, color: "#38bdf8" },
                { name: "Hold-out prediction", y: res.holdout.predicted, x: res.holdout.t.map((_, k) => n - res.holdout.t.length + k), color: "#f59e0b", dash: true },
                { name: "Forecast", y: res.forecast.mean, x: res.forecast.t.map((_, k) => n + k), color: "#22c55e", band: res.forecast.lower && res.forecast.upper ? { lo: res.forecast.lower, hi: res.forecast.upper } : undefined },
              ]} />
              <Legend items={[{ name: "Observed history", color: "#38bdf8" }, { name: "Prediction for the held-out final observations", color: "#f59e0b", dash: true }, { name: "Forecast (band = approximate 95% interval)", color: "#22c55e" }]} />
              <p className="text-xs text-slate-400">{res.interval_note}</p>
              <table className="w-full text-left text-xs" data-testid="methods"><thead className="text-slate-400"><tr><th>Method</th><th>MAE</th><th>RMSE</th><th>MAPE</th><th>Hold-out points</th></tr></thead>
                <tbody>{res.methods.map((m) => <tr key={m.method} className={`border-t border-slate-800 ${m.method === res.method ? "text-white" : ""}`}><td className="py-1">{m.method.replace("_", " ")}{m.method === res.method ? " ✓" : ""}</td>{m.unavailable ? <td colSpan={4} className="text-slate-500">unavailable: {m.unavailable}</td> : <><td>{m.mae?.toFixed(3)}</td><td>{m.rmse?.toFixed(3)}</td><td>{m.mape_percent === null || m.mape_percent === undefined ? "–" : `${m.mape_percent.toFixed(2)}%`}</td><td>{m.holdout_points}</td></>}</tr>)}</tbody></table>
              {res.notes.map((x) => <p key={x} className="text-xs text-amber-300">{x}</p>)}
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">{res.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              <button className={BTN} data-testid="dl" onClick={() => download("forecast.csv", ["date,forecast,lower,upper", ...res.forecast.t.map((t, i) => [t, res.forecast.mean[i], res.forecast.lower?.[i], res.forecast.upper?.[i]].map(csvCell).join(","))].join("\n"))}>Download forecast (CSV)</button>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Advanced deep learning models", status: "soon", note: "only classical statistical methods are implemented." },
        { name: "Automated model selection beyond hold-out", status: "preview", note: "selection is a single hold-out comparison of four methods." },
        { name: "External data feeds", status: "external", note: "no data source is connected." },
        { name: "Scheduled forecasting", status: "soon", note: "nothing runs on a schedule and nothing is stored." },
        { name: "Enterprise forecasting dashboards", status: "preview", note: "this page is a single-series demonstration." },
      ]} />
    </MlShell>
  );
}
