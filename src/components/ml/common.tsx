"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { mlApi, type MlApi, type MlHealth, type Sample } from "@/lib/ml/api";

export const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";
export const GO = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40";
export const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
export const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
export const INPUT = "rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100";

export type FeatureStatus = "working" | "preview" | "soon" | "external" | "hardware" | "model";
export const STATUS_TEXT: Record<FeatureStatus, string> = { working: "Working", preview: "UI Preview — Not Functional", soon: "Coming Soon", external: "Requires External Integration", hardware: "Requires Compatible Hardware", model: "Requires Model Setup" };
const STATUS_CLS: Record<FeatureStatus, string> = { working: "border-green-500/50 bg-green-500/10 text-green-300", preview: "border-amber-500/50 bg-amber-500/10 text-amber-300", soon: "border-slate-500/50 bg-slate-500/10 text-slate-300", external: "border-violet-500/50 bg-violet-500/10 text-violet-300", hardware: "border-rose-500/50 bg-rose-500/10 text-rose-300", model: "border-sky-500/50 bg-sky-500/10 text-sky-300" };
export const StatusChip = ({ s }: { s: FeatureStatus }) => <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLS[s]}`}>{STATUS_TEXT[s]}</span>;

/** Advanced capabilities the product could have but this demo does not implement. Buttons never pretend to act. */
export function PreviewFeatures({ items }: { items: { name: string; status: Exclude<FeatureStatus, "working">; note: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className={CARD} aria-label="Features not implemented in this demo" data-testid="previews">
      <h2 className={H3}>Beyond this demo</h2>
      <p className="mt-2 text-xs text-slate-400">These are shown to indicate what a full product could include. None of them works in this demo.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((f) => (
          <li key={f.name} className="rounded-md border border-slate-800 p-3 text-xs text-slate-300" data-testid="preview-item">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-100">{f.name}</span><StatusChip s={f.status} /></div>
            <button className={`${BTN} mt-2 opacity-60`} aria-disabled="true" onClick={() => setOpen(open === f.name ? null : f.name)}>Try it</button>
            {open === f.name && <p className="mt-2 text-amber-200" role="status">Not available: {f.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function useMl(serviceUrl: string | null, kind?: string) {
  const api = useMemo(() => (serviceUrl ? mlApi(serviceUrl) : null), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">(serviceUrl ? "unknown" : "offline");
  const [health, setHealth] = useState<MlHealth | null>(null); const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); api.samples(kind).then((s) => setSamples(s.samples)).catch(() => undefined); }, [api, kind]);
  return { api, service, health, samples };
}

export function MlShell({ branding, title, project, service, notice, children, footer }: { branding: Branding; title: string; project: string; service: "unknown" | "online" | "offline"; notice: string; children: ReactNode; footer: string }) {
  return (
    <DemoShell branding={branding} app={title} project={project} status={service === "online" ? "Service online" : service === "offline" ? "Service not connected" : "Checking service…"} badge="Computer Vision · prototype"
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision" footer={footer}>
      <div className="mx-auto max-w-[1500px] space-y-4 p-3 sm:p-4">
        <div role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13px] leading-snug text-amber-100" data-testid="notice">{notice}</div>
        {service === "offline" && <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300" role="alert" data-testid="offline">The ML service is not connected, so nothing can be processed. Start <code>services/ml-lab</code> and set <code>ML_API_URL</code>. No results are shown without it.</div>}
        {children}
      </div>
    </DemoShell>
  );
}

export const ErrorBox = ({ msg }: { msg: string }) => (msg ? <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200" data-testid="error">{msg}</div> : null);

export function SamplePicker({ samples, disabled, onPick, testPrefix = "sample" }: { samples: Sample[]; disabled: boolean; onPick: (s: Sample) => void; testPrefix?: string }) {
  return (
    <div className="mt-3 space-y-2">
      {samples.map((s) => (
        <div key={s.id} className="rounded-md border border-slate-800 p-2 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">{s.title}</p><p className="mt-1">{s.description}</p>
          <details className="mt-1 text-slate-400"><summary className="cursor-pointer">Source and licence</summary><p className="mt-1">{s.provenance}</p><p className="mt-1">{s.licence}</p></details>
          <button className={`${BTN} mt-2`} disabled={disabled} onClick={() => onPick(s)} data-testid={`${testPrefix}-${s.id}`}>Use this sample</button>
        </div>
      ))}
    </div>
  );
}

export function Dropzone({ label, accept, disabled, onFile, testId = "file-input" }: { label: string; accept: string; disabled: boolean; onFile: (f: File) => void; testId?: string }) {
  return (
    <label className="mt-3 block cursor-pointer rounded-md border border-dashed border-slate-600 p-3 text-center text-sm text-slate-300 hover:border-blue-500">
      {label}
      <input type="file" accept={accept} className="sr-only" data-testid={testId} disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

/** Minimal SVG line chart: several series on a shared x index, optional band and highlighted points. */
export interface Series { name: string; y: (number | null)[]; x?: number[]; color: string; dash?: boolean; band?: { lo: number[]; hi: number[] }; marks?: number[]; markColor?: string }
export function LineChart({ series, xLabels, height = 260, yLabel }: { series: Series[]; xLabels: string[]; height?: number; yLabel?: string }) {
  const W = 900, H = height, L = 52, R = 10, T = 10, B = 28;
  const n = xLabels.length;
  const all = series.flatMap((s) => [...s.y.filter((v): v is number => v !== null), ...(s.band ? [...s.band.lo, ...s.band.hi] : [])]);
  if (!all.length) return null;
  let lo = Math.min(...all), hi = Math.max(...all); if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const X = (i: number) => L + (i / Math.max(n - 1, 1)) * (W - L - R), Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (s: Series) => { let d = "", pen = false; s.y.forEach((v, k) => { const i = s.x ? s.x[k] : k; if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }); return d; };
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4); const xt = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={yLabel ?? "chart"} data-testid="chart">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#1e293b" /><text x={L - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{Math.abs(t) >= 100 ? t.toFixed(0) : t.toFixed(2)}</text></g>)}
      {xt.map((i) => <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">{xLabels[i]?.slice(0, 10)}</text>)}
      {series.map((s) => s.band && <path key={`b${s.name}`} d={`M${s.band.hi.map((v, k) => `${X(s.x ? s.x[k] : k).toFixed(1)},${Y(v).toFixed(1)}`).join("L")}L${[...s.band.lo].reverse().map((v, k) => `${X(s.x ? s.x[s.band!.lo.length - 1 - k] : s.band!.lo.length - 1 - k).toFixed(1)},${Y(v).toFixed(1)}`).join("L")}Z`} fill={s.color} opacity={0.15} />)}
      {series.map((s) => <path key={s.name} d={path(s)} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dash ? "5 4" : undefined} />)}
      {series.map((s) => (s.marks ?? []).map((i) => (s.y[i] !== null && s.y[i] !== undefined ? <circle key={`${s.name}${i}`} cx={X(i)} cy={Y(s.y[i] as number)} r={3} fill={s.markColor ?? "#ef4444"} /> : null)))}
    </svg>
  );
}
export const Legend = ({ items }: { items: { name: string; color: string; dash?: boolean }[] }) => <p className="flex flex-wrap gap-4 text-[11px] text-slate-400">{items.map((i) => <span key={i.name}><span style={{ color: i.color }}>{i.dash ? "╌╌" : "━━"}</span> {i.name}</span>)}</p>;

import { form } from "@/lib/ml/api";
/** Runs one POST with an uploaded file or a sample id and keeps the busy/error/result state. */
export function useRun<T>(api: MlApi | null, path: string, accept: RegExp, tooBigMb: number) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<T | null>(null); const [source, setSource] = useState<{ name: string; url: string } | null>(null);
  const run = async (src: File | Sample, extra: Record<string, string | number | boolean | null | undefined> = {}) => {
    if (!api) return; setError("");
    if (src instanceof File) {
      if (!accept.test(src.name) && !accept.test(src.type)) { setError(`Unsupported file type: ${src.name}.`); return; }
      if (src.size > tooBigMb * 1_000_000) { setError(`The file is larger than the ${tooBigMb} MB limit.`); return; }
    }
    setBusy(true);
    try {
      const r = await api.post<T>(path, form({ ...(src instanceof File ? { file: src } : { sample_id: src.id }), ...extra }));
      setResult(r); setSource(src instanceof File ? { name: src.name, url: URL.createObjectURL(src) } : { name: src.title, url: api.sampleUrl(src.id) });
    } catch (e) { setError(e instanceof Error ? e.message : "Processing failed."); setResult(null); } finally { setBusy(false); }
  };
  return { busy, error, result, source, run, setError, setResult };
}

export interface Inspect { filename: string; rows: number; columns: string[]; date_candidates: string[]; numeric_candidates: string[]; preview: (string | number | null)[][] }
/** Shared CSV intake: file or sample, then the service's column inspection. */
export function useCsv(api: MlApi | null, maxMb: number) {
  const [src, setSrc] = useState<File | Sample | null>(null); const [info, setInfo] = useState<Inspect | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = async (s: File | Sample) => {
    if (!api) return; setError(""); setInfo(null);
    if (s instanceof File) { if (!/\.(csv|txt|tsv)$/i.test(s.name) && !/csv|text/.test(s.type)) { setError("Unsupported file type. Upload a CSV file."); return; } if (s.size > maxMb * 1_000_000) { setError(`The file is larger than the ${maxMb} MB limit.`); return; } }
    setBusy(true);
    try { setInfo(await api.post<Inspect>("/api/tabular/inspect", form(s instanceof File ? { file: s } : { sample_id: s.id }))); setSrc(s); } catch (e) { setError(e instanceof Error ? e.message : "Could not read the file."); setSrc(null); } finally { setBusy(false); }
  };
  const fields = () => (src instanceof File ? { file: src } : src ? { sample_id: src.id } : {});
  return { src, info, error, setError, busy, load, fields };
}
