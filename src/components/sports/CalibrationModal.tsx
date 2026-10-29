"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import PitchDiagram from "./PitchDiagram";
import type { CalibrationInfo, Landmark, PitchMapping } from "@/lib/sports/types";

interface Pair { id: string; x: number; y: number }
interface Props { open: boolean; frameUrl: string; time: number; srcW: number; srcH: number; length: number; width: number; landmarks: Landmark[]; current: PitchMapping; onApply: (points: Pair[], length: number, width: number) => Promise<void>; onClear: () => Promise<void>; onClose: () => void }

/** Manual pitch calibration: pair visible pitch landmarks (clicked on the frame) with their positions on the standard pitch. */
export default function CalibrationModal({ open, frameUrl, time, srcW, srcH, length, width, landmarks, current, onApply, onClear, onClose }: Props) {
  const [pairs, setPairs] = useState<Pair[]>([]); const [active, setActive] = useState<string | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [L, setL] = useState(length); const [W, setW] = useState(width); const [result, setResult] = useState<CalibrationInfo | null>(null); const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => { if (open) { setPairs([]); setActive(null); setErr(""); setLoaded(false); } }, [open]);
  useEffect(() => { if (open) setResult(current.calibration ?? null); }, [open, current.calibration]);
  const lmById = useMemo(() => Object.fromEntries(landmarks.map((l) => [l.id, l])), [landmarks]);
  if (!open) return null;
  const used = new Set(pairs.map((p) => p.id));
  const clickImage = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!active) { setErr("First choose a pitch landmark (on the pitch diagram or in the list), then click where it is on the frame."); return; }
    const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * srcW, y = ((e.clientY - r.top) / r.height) * srcH;
    setPairs((p) => [...p.filter((q) => q.id !== active), { id: active, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }]); setErr(""); setActive(null);
  };
  const apply = async () => { setBusy(true); setErr(""); try { await onApply(pairs, L, W); } catch (e) { setErr(e instanceof Error ? e.message : "Calibration failed."); } finally { setBusy(false); } };
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Pitch calibration" data-testid="calibration">
      <div className="mx-auto max-w-7xl rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-white">Calibrate the pitch</h2>
          <span className="text-xs text-slate-400">Frame at {time.toFixed(2)} s. Pair at least 4 landmarks (6 or more shows a real error estimate). They must be spread across the pitch, not along one line.</span>
          <button type="button" className="ml-auto rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-amber-500" onClick={onClose} data-testid="cal-close">Close</button>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-1 text-xs text-slate-300">1. Choose a landmark on the right, 2. click its position on this frame ({active ? <b className="text-amber-300">placing: {lmById[active]?.label}</b> : "none chosen"}).</p>
            <div className="relative overflow-hidden rounded-md border border-slate-700 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={img} src={frameUrl} alt="Video frame used for calibration" className="block w-full cursor-crosshair" onClick={clickImage} onLoad={() => setLoaded(true)} data-testid="cal-image" draggable={false} />
              {loaded && pairs.map((p, i) => (
                <div key={p.id} className="pointer-events-none absolute" style={{ left: `${(p.x / srcW) * 100}%`, top: `${(p.y / srcH) * 100}%` }}>
                  <div className="-ml-2 -mt-2 h-4 w-4 rounded-full border-2 border-amber-300 bg-amber-300/30" /><span className="ml-2 -mt-6 block rounded bg-slate-950/80 px-1 text-[10px] text-amber-200">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <label>Pitch length (m)<input type="number" className="ml-1 w-16 rounded border border-slate-700 bg-slate-950 px-1 py-0.5" min={40} max={130} value={L} onChange={(e) => setL(Number(e.target.value))} data-testid="cal-length" /></label>
              <label>width (m)<input type="number" className="ml-1 w-16 rounded border border-slate-700 bg-slate-950 px-1 py-0.5" min={30} max={100} value={W} onChange={(e) => setW(Number(e.target.value))} data-testid="cal-width" /></label>
            </div>
            <PitchDiagram length={L} width={W} label="Standard pitch: click a landmark to pair it">
              {landmarks.map((l) => {
                const lx = (l.x / length) * L, ly = (l.y / width) * W; const isU = used.has(l.id), isA = active === l.id;
                return <g key={l.id} onClick={() => setActive(l.id)} className="cursor-pointer" data-testid={`lm-${l.id}`}><circle cx={lx} cy={ly} r={2.4} fill="transparent" /><circle cx={lx} cy={ly} r={isA ? 1.6 : 1.1} fill={isA ? "#fde047" : isU ? "#4ade80" : "#e2e8f0"} stroke="#020617" strokeWidth={0.2}><title>{l.label}</title></circle></g>;
              })}
            </PitchDiagram>
            <label className="block text-xs text-slate-300">Landmark
              <select className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" value={active ?? ""} onChange={(e) => setActive(e.target.value || null)} data-testid="cal-select">
                <option value="">Choose a landmark…</option>{landmarks.map((l) => <option key={l.id} value={l.id}>{used.has(l.id) ? "✓ " : ""}{l.label}</option>)}
              </select>
            </label>
            <ol className="max-h-32 overflow-auto text-xs text-slate-300" data-testid="cal-pairs">
              {pairs.map((p, i) => <li key={p.id} className="flex items-center gap-2 border-b border-slate-800 py-0.5"><span className="w-4 text-amber-300">{i + 1}</span><span className="flex-1 truncate">{lmById[p.id]?.label}</span><span className="tabular-nums text-slate-500">{p.x.toFixed(0)}, {p.y.toFixed(0)}</span>
                <button type="button" className="text-red-300 hover:underline" onClick={() => setPairs((q) => q.filter((z) => z.id !== p.id))}>remove</button></li>)}
              {!pairs.length && <li className="text-slate-500">No landmarks paired yet.</li>}
            </ol>
            {err && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1 text-xs text-red-200" data-testid="cal-error">{err}</p>}
            {result && (
              <div className="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300" data-testid="cal-result">
                <b className={result.quality === "good" ? "text-emerald-300" : result.quality === "approximate" ? "text-amber-300" : "text-red-300"}>Calibration {result.quality}</b> · {result.points_used} landmarks · RMS error {result.rms_error_m.toFixed(2)} m · worst {result.max_error_m.toFixed(2)} m
                {result.warnings.map((w) => <p key={w} className="mt-1 text-amber-200">{w}</p>)}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || pairs.length < 4} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40" onClick={() => void apply().then(() => undefined)} data-testid="cal-apply">{busy ? "Fitting…" : `Fit and apply (${pairs.length})`}</button>
              <button type="button" disabled={busy || current.status === "unavailable"} className="rounded-md border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:border-amber-500 disabled:opacity-40" onClick={() => { setBusy(true); void onClear().finally(() => { setBusy(false); setResult(null); }); }} data-testid="cal-clear">Remove calibration</button>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">Positions are mapped with a homography, which assumes players’ feet are on the flat pitch. Click on the line intersections as exactly as you can: errors of a few pixels become metres for distant players. The error above is measured on your landmarks only; it is not an accuracy guarantee for every player.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
