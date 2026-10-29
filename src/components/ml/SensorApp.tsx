"use client";
import { useEffect, useState } from "react";
import type { Branding } from "@/lib/types";
import { csvCell, download, form } from "@/lib/ml/api";
import { BTN, CARD, Dropzone, ErrorBox, GO, H3, INPUT, Legend, LineChart, MlShell, PreviewFeatures, SamplePicker, StatusChip, useCsv, useMl } from "./common";

interface Score { point_precision: number; point_recall: number; point_f1: number; labelled_events: number; labelled_events_detected: number; flagged_points_outside_labelled_faults: number }
interface Res { rows: number; sensors: string[]; time: string[]; series: Record<string, number[]>; methods: Record<string, { flagged_points: number; events: { start: number; end: number; points: number }[] }>; flags: Record<string, number[]>; notes: string[]; limitations: string[]; evaluation?: { labelled_points: number; scores: Record<string, Score>; note: string } }
const COL: Record<string, string> = { baseline: "#ef4444", zscore: "#f59e0b", iforest: "#a855f7" };
const NAME: Record<string, string> = { baseline: "Baseline z-score (first part of data = healthy)", zscore: "Rolling robust z-score", iforest: "Isolation Forest" };

export default function SensorApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health, samples } = useMl(serviceUrl, "csv");
  const csv = useCsv(api, health?.limits.max_csv_mb ?? 5);
  const [timeCol, setTimeCol] = useState(""); const [sensors, setSensors] = useState<string[]>([]); const [label, setLabel] = useState(""); const [method, setMethod] = useState("all");
  const [win, setWin] = useState(48); const [z, setZ] = useState(5); const [cont, setCont] = useState(0.03); const [base, setBase] = useState(0.25); const [view, setView] = useState("");
  const [res, setRes] = useState<Res | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const pick = async (s: File | import("@/lib/ml/api").Sample) => { setRes(null); setTimeCol(""); setSensors([]); setLabel(""); await csv.load(s); };
  useEffect(() => { if (csv.info) { setTimeCol(csv.info.date_candidates[0] ?? ""); setSensors(csv.info.numeric_candidates.filter((c) => !/fault|label|anomaly/i.test(c)).slice(0, 4)); setLabel(csv.info.columns.find((c) => /fault|label|anomaly/i.test(c)) ?? ""); } }, [csv.info]);
  const run = async () => {
    if (!api || !csv.src) return; setError(""); setBusy(true);
    try { const r = await api.post<Res>("/api/sensors", form({ ...csv.fields(), time_column: timeCol || null, sensor_columns: sensors.join(","), label_column: label || null, method, window: win, z_threshold: z, contamination: cont, baseline_fraction: base })); setRes(r); setView(r.sensors[0]); } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); setRes(null); } finally { setBusy(false); }
  };
  const ms = res ? Object.keys(res.flags) : [];
  return (
    <MlShell branding={branding} title="Predictive Maintenance & Sensor Anomaly Detection" project={csv.info?.filename ?? "No data selected"} service={service}
      notice="Real statistical anomaly detection on sensor readings. An anomaly is an unusual reading, not a confirmed machine fault, and no failure or remaining-life prediction is made. The bundled dataset is synthetic (injected faults) so detection can be scored; it is not real machine data."
      footer="Working: CSV upload, validation, three detection methods, flags, event summary, optional scoring against fault labels, CSV export. Not implemented: remaining useful life, IoT connectivity, work orders, live feeds (previews below).">
      <ErrorBox msg={csv.error || error} />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Data <StatusChip s="working" /></h2>
          <Dropzone label="Upload a CSV (timestamps and numeric sensor columns)" accept=".csv,.tsv,.txt,text/csv" disabled={service !== "online" || csv.busy || busy} onFile={pick} />
          <SamplePicker samples={samples.filter((s) => s.id === "pump-sensors-synthetic")} disabled={service !== "online" || csv.busy || busy} onPick={pick} />
          {csv.info && (
            <div className="mt-3 space-y-2 text-xs text-slate-300" data-testid="columns">
              <p>{csv.info.rows} rows · {csv.info.columns.length} columns</p>
              <label className="flex items-center justify-between gap-2">Time column<select value={timeCol} onChange={(e) => setTimeCol(e.target.value)} className={INPUT}><option value="">(row order)</option>{csv.info.columns.map((c) => <option key={c}>{c}</option>)}</select></label>
              <fieldset><legend>Sensor columns</legend><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{csv.info.numeric_candidates.map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={sensors.includes(c)} onChange={(e) => setSensors(e.target.checked ? [...sensors, c] : sensors.filter((x) => x !== c))} data-testid={`sensor-${c}`} />{c}</label>)}</div></fieldset>
              <label className="flex items-center justify-between gap-2">Fault label column (optional, for scoring)<select value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT}><option value="">(none)</option>{csv.info.columns.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="flex items-center justify-between gap-2">Method<select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT} data-testid="method"><option value="all">All three</option><option value="baseline">Baseline z-score</option><option value="zscore">Rolling z-score</option><option value="iforest">Isolation Forest</option></select></label>
              <label className="flex items-center justify-between gap-2">Window (rows)<input type="number" min={5} max={2000} value={win} onChange={(e) => setWin(Number(e.target.value))} className={`${INPUT} w-20`} /></label>
              <label className="flex items-center justify-between gap-2">z threshold<input type="number" min={1.5} max={20} step={0.5} value={z} onChange={(e) => setZ(Number(e.target.value))} className={`${INPUT} w-20`} data-testid="z" /></label>
              <label className="flex items-center justify-between gap-2">Isolation Forest contamination<input type="number" min={0.001} max={0.3} step={0.005} value={cont} onChange={(e) => setCont(Number(e.target.value))} className={`${INPUT} w-20`} /></label>
              <label className="flex items-center justify-between gap-2">Baseline share of the data<input type="number" min={0.05} max={0.8} step={0.05} value={base} onChange={(e) => setBase(Number(e.target.value))} className={`${INPUT} w-20`} /></label>
              <button className={GO} disabled={busy || sensors.length === 0} onClick={run} data-testid="run">Detect anomalies</button>
            </div>
          )}
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Readings and anomalies</h2>
          {(busy || csv.busy) && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Working…</p>}
          {!busy && !res && <p className="mt-3 text-sm text-slate-400" data-testid="empty">{csv.info ? "Choose the sensors and press Detect anomalies." : "Choose or upload a CSV. Nothing is flagged until you do."}</p>}
          {res && !busy && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">{res.sensors.map((s) => <button key={s} className={`${BTN} ${view === s ? "border-blue-500 text-white" : ""}`} onClick={() => setView(s)} data-testid="sensor-tab">{s}</button>)}</div>
              {view && <LineChart yLabel={view} xLabels={res.time} height={240} series={[{ name: view, y: res.series[view], color: "#38bdf8" }, ...ms.map((m) => ({ name: m, y: res.series[view].map((v, i) => (res.flags[m].includes(i) ? v : null)), color: "transparent", marks: res.flags[m], markColor: COL[m] }))]} />}
              <Legend items={[{ name: view, color: "#38bdf8" }, ...ms.map((m) => ({ name: `flagged by ${NAME[m]}`, color: COL[m] }))]} />
              <table className="w-full text-left text-xs" data-testid="summary"><thead className="text-slate-400"><tr><th>Method</th><th>Flagged points</th><th>Events</th><th>First events (row range)</th></tr></thead>
                <tbody>{ms.map((m) => <tr key={m} className="border-t border-slate-800"><td className="py-1" style={{ color: COL[m] }}>{NAME[m]}</td><td>{res.methods[m].flagged_points}</td><td>{res.methods[m].events.length}</td><td className="text-slate-400">{res.methods[m].events.slice(0, 4).map((e) => `${e.start}–${e.end}`).join(", ") || "none"}</td></tr>)}</tbody></table>
              {res.evaluation && (
                <div data-testid="evaluation"><p className="text-xs font-semibold text-slate-200">Scored against your fault labels ({res.evaluation.labelled_points} labelled points)</p>
                  <table className="mt-1 w-full text-left text-xs"><thead className="text-slate-400"><tr><th>Method</th><th>Precision</th><th>Recall</th><th>F1</th><th>Labelled events found</th><th>Flags outside labelled faults</th></tr></thead>
                    <tbody>{Object.entries(res.evaluation.scores).map(([m, s]) => <tr key={m} className="border-t border-slate-800"><td className="py-1">{NAME[m]}</td><td>{s.point_precision.toFixed(2)}</td><td>{s.point_recall.toFixed(2)}</td><td>{s.point_f1.toFixed(2)}</td><td>{s.labelled_events_detected} of {s.labelled_events}</td><td>{s.flagged_points_outside_labelled_faults}</td></tr>)}</tbody></table>
                  <p className="mt-1 text-xs text-slate-400">{res.evaluation.note} Differences between methods show that no single rule catches every kind of fault.</p></div>
              )}
              {res.notes.map((x) => <p key={x} className="text-xs text-amber-300">{x}</p>)}
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">{res.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              <button className={BTN} data-testid="dl" onClick={() => download("anomalies.csv", [["row", "time", ...ms.map((m) => `flag_${m}`), ...res.sensors].join(","), ...res.time.map((t, i) => [i, t, ...ms.map((m) => (res.flags[m].includes(i) ? 1 : 0)), ...res.sensors.map((s) => res.series[s][i])].map(csvCell).join(","))].join("\n"))}>Download flagged readings (CSV)</button>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Remaining useful life estimation", status: "soon", note: "it needs run-to-failure history and a trained model; none is implemented." },
        { name: "Industrial IoT connectivity", status: "external", note: "no MQTT, OPC UA or gateway is connected." },
        { name: "Maintenance scheduling", status: "preview", note: "no maintenance system exists." },
        { name: "Live sensor feeds", status: "hardware", note: "only uploaded files are analysed." },
        { name: "Automated work orders", status: "external", note: "it would need a CMMS integration." },
      ]} />
    </MlShell>
  );
}
