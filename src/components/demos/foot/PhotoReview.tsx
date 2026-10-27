/* eslint-disable @next/next/no-img-element */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureDTO } from "@/lib/foot/api-types";
import { activeAnalysis } from "@/lib/foot/results";
import { PAPER_MM, type PaperKind, type Pt } from "@/lib/foot/types";
import { applyH, homography } from "@/lib/foot/vision";
import { api, ApiError, type Auth } from "./api";

/** Photo with the detected sheet and foot outline drawn on it, plus a four-corner editor for fixing the calibration by hand. */
export default function PhotoReview({ auth, capture, paper, onChange, bigBtn }: { auth: Auth; capture: CaptureDTO; paper: PaperKind; onChange: (c: CaptureDTO) => void; bigBtn: string }) {
  const [url, setUrl] = useState(""); const [err, setErr] = useState(""); const [edit, setEdit] = useState(false); const [corners, setCorners] = useState<Pt[]>([]); const [busy, setBusy] = useState(false); const [sheet, setSheet] = useState<PaperKind>(paper); const drag = useRef<number | null>(null); const svg = useRef<SVGSVGElement>(null);
  const a = activeAnalysis(capture);
  useEffect(() => { let u = ""; let dead = false; setUrl(""); setErr(""); api.imageUrl(auth, capture.id).then((x) => { if (dead) URL.revokeObjectURL(x); else { u = x; setUrl(x); } }).catch((e) => setErr((e as Error).message)); return () => { dead = true; if (u) URL.revokeObjectURL(u); }; }, [auth, capture.id]);
  useEffect(() => { setEdit(false); setSheet(capture.manual?.calibration?.paper ?? capture.auto.calibration?.paper ?? paper); }, [capture.id, paper, capture.manual, capture.auto]);
  const W = capture.width, H = capture.height;
  const startEdit = () => { const c = (capture.manual?.calibration ?? capture.auto.calibration)?.corners; setCorners(c ? c.map((p) => ({ ...p })) : [{ x: W * 0.2, y: H * 0.2 }, { x: W * 0.8, y: H * 0.2 }, { x: W * 0.8, y: H * 0.8 }, { x: W * 0.2, y: H * 0.8 }]); setEdit(true); };
  const toSvg = useCallback((e: React.PointerEvent): Pt => { const s = svg.current!; const m = s.getScreenCTM()!.inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: Math.min(W, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) }; }, [W, H]);
  const save = async () => { setBusy(true); setErr(""); try { const { capture: c } = await api.calibrate(auth, capture.id, corners, sheet); onChange(c); setEdit(false); } catch (e) { setErr(e instanceof ApiError ? e.message : "Re-measuring failed"); } finally { setBusy(false); } };
  const revert = async () => { setBusy(true); try { onChange((await api.uncalibrate(auth, capture.id)).capture); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  const cal = a.calibration; const P = PAPER_MM[cal?.paper ?? sheet]; let outline: Pt[] = [];
  if (!edit && cal && a.measurement) { const Hm = homography([{ x: 0, y: 0 }, { x: P.w, y: 0 }, { x: P.w, y: P.h }, { x: 0, y: P.h }], cal.corners); if (Hm) outline = a.measurement.rawOutlineMm.map((p) => applyH(Hm, p.x, p.y)); }
  const R = Math.max(W, H) / 70; const quad = (edit ? corners : cal?.corners) ?? [];
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-stone-300 bg-stone-900" style={{ aspectRatio: `${W} / ${H}` }}>
        {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={`${capture.side} foot photo`} className="absolute inset-0 h-full w-full select-none" draggable={false} /> : <p className="absolute inset-0 flex items-center justify-center text-sm text-stone-300">{err || "Loading photo…"}</p>}
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full touch-none" onPointerMove={(e) => { if (edit && drag.current !== null) { const p = toSvg(e); setCorners((c) => c.map((q, i) => (i === drag.current ? p : q))); } }} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          {quad.length === 4 && <polygon points={quad.map((p) => `${p.x},${p.y}`).join(" ")} fill={edit ? "rgba(16,185,129,.10)" : "none"} stroke="#34d399" strokeWidth={R / 3} strokeDasharray={edit ? `${R} ${R / 2}` : undefined} />}
          {outline.length > 2 && <polygon points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(251,191,36,.18)" stroke="#fbbf24" strokeWidth={R / 3} />}
          {edit && corners.map((p, i) => <g key={i} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = i; }} style={{ cursor: "grab" }}><circle cx={p.x} cy={p.y} r={R * 2.2} fill="rgba(0,0,0,.001)" /><circle cx={p.x} cy={p.y} r={R} fill="#10b981" stroke="#fff" strokeWidth={R / 4} /><text x={p.x + R * 1.4} y={p.y - R * 1.2} fontSize={R * 1.8} fill="#fff" stroke="#000" strokeWidth={R / 6} paintOrder="stroke" fontFamily="Georgia, serif">{i + 1}</text></g>)}
        </svg>
      </div>
      <p className="mt-1.5 text-sm text-stone-600">{edit ? "Drag the four green handles onto the corners of the sheet (1 → 2 is a long side), then re-measure. Zoom the page if you need more precision." : <><span className="text-emerald-700">Green</span> = sheet used for scale · <span className="text-amber-700">amber</span> = foot outline found. Nothing is drawn if the check failed.</>}</p>
      {err && <p role="alert" className="mt-1 text-sm text-red-700">{err}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!edit ? <><button type="button" className={bigBtn} onClick={startEdit}>{a.ok ? "Adjust paper corners" : "Mark the paper corners myself"}</button>{capture.manual && <button type="button" disabled={busy} className={bigBtn} onClick={revert}>Discard my correction</button>}</>
          : <><label className="flex items-center gap-1.5 text-sm text-stone-700">Sheet <select value={sheet} onChange={(e) => setSheet(e.target.value as PaperKind)} className="rounded border border-stone-300 bg-white px-2 py-1">{(Object.keys(PAPER_MM) as PaperKind[]).map((k) => <option key={k} value={k}>{PAPER_MM[k].label}</option>)}</select></label><button type="button" disabled={busy} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50" onClick={save}>{busy ? "Measuring…" : "Re-measure"}</button><button type="button" className={bigBtn} onClick={() => setEdit(false)}>Cancel</button></>}
      </div>
    </div>
  );
}
