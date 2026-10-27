"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MeshEl } from "@/lib/bim/model";
import type { ElementInfo } from "@/lib/bim/demos/types";
import { BimScene, type ViewName } from "./viewer-engine";
import { BTN, H3 } from "./ui";

/** Lightweight 3D view for results that are plain meshes (structural extract, scan-to-BIM draft). */
export default function MeshViewer({ meshes, elements, focus, onPick }: { meshes: MeshEl[]; elements: Record<string, ElementInfo>; focus?: { id: string; n: number } | null; onPick?: (id: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null); const eng = useRef<BimScene | null>(null); const [ready, setReady] = useState(false); const [err, setErr] = useState(""); const [sel, setSel] = useState<string | null>(null);
  const cats = useMemo(() => [...new Set(meshes.map((m) => m.cat))], [meshes]); const [off, setOff] = useState<Set<string>>(new Set()); const [ortho, setOrtho] = useState(false); const [measure, setMeasure] = useState(false); const [d, setD] = useState<string>("");
  useEffect(() => { const el = host.current; if (!el) return; let e: BimScene; try { e = new BimScene(el); } catch { setErr("The 3D view could not start in this browser (WebGL is unavailable)."); return; } eng.current = e; e.onPick = (p) => { setSel(p.id ?? null); onPick?.(p.id ?? null); }; e.onMeasure = (a, b) => setD(b ? `${Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z).toFixed(3)} m` : "click the second point"); setReady(true); return () => { e.dispose(); eng.current = null; setReady(false); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (ready) eng.current?.load(meshes); }, [meshes, ready]);
  useEffect(() => { eng.current?.setVisible((u) => !off.has(u.cat)); }, [off, ready, meshes]);
  useEffect(() => { eng.current?.select(sel ? [sel] : []); }, [sel, ready]);
  useEffect(() => { if (focus && ready) { setSel(focus.id); eng.current?.focus([focus.id]); } }, [focus, ready]);
  useEffect(() => { eng.current?.setMeasure(measure); if (!measure) setD(""); }, [measure]);
  const v = (n: ViewName) => eng.current?.setView(n); const info = sel ? elements[sel] : null;
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_17rem]">
      <div className="relative h-[min(70vh,44rem)] min-h-[22rem] overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <div ref={host} className="h-full w-full" data-testid="mesh-viewer" />
        {err && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-amber-200">{err}</p>}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">{(["iso", "top", "front", "right"] as ViewName[]).map((n) => <button key={n} type="button" className={`${BTN} bg-slate-900/90`} onClick={() => v(n)}>{n === "iso" ? "3D" : n[0].toUpperCase() + n.slice(1)}</button>)}<button type="button" aria-pressed={ortho} className={`${BTN} bg-slate-900/90`} onClick={() => { eng.current?.setOrtho(!ortho); setOrtho(!ortho); }}>{ortho ? "Orthographic" : "Perspective"}</button><button type="button" aria-pressed={measure} className={`${BTN} ${measure ? "!border-amber-400 !text-amber-200" : ""} bg-slate-900/90`} onClick={() => setMeasure(!measure)}>Measure</button></div>
        {d && <p className="absolute bottom-2 left-2 rounded bg-slate-900/90 px-2 py-1 text-xs text-amber-200">{d}</p>}
      </div>
      <aside className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
        <div><h3 className={H3}>Visibility</h3>{cats.map((c) => <label key={c} className="flex items-center gap-2 py-0.5 text-slate-200"><input type="checkbox" checked={!off.has(c)} onChange={() => setOff((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n; })} />{c} <span className="text-xs text-slate-500">({meshes.filter((m) => m.cat === c).length})</span></label>)}</div>
        <div><h3 className={H3}>Properties</h3>{info ? <div data-testid="mesh-props"><p className="mt-1 font-semibold text-white">{info.title}</p><dl className="mt-1 space-y-0.5 text-xs">{info.props.map(([k, val]) => <div key={k} className="flex justify-between gap-2 border-t border-slate-800 py-0.5"><dt className="text-slate-400">{k}</dt><dd className="text-right text-slate-100">{val}</dd></div>)}</dl></div> : <p className="mt-1 text-xs text-slate-400">Click an element in the view to read its properties.</p>}</div>
      </aside>
    </div>
  );
}
