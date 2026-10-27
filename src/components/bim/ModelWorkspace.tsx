/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Plan3dModel } from "@/lib/bim/pipeline-types";
import { SYSTEM_LABEL, isHvac } from "@/lib/bim/mep";
import type { MepSystem } from "@/lib/bim/model";
import { SYS_COLOR } from "@/lib/bim/colors";
import { api, ApiError, type Auth, type ComponentRow } from "./api";
import { BimScene, type ViewName } from "./viewer-engine";

const BTN = "rounded-md border border-slate-600 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";
const ON = "rounded-md border border-blue-500 bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white";
const FIELD = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500";
const rgb = (c: [number, number, number]) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

export interface Vis { architecture: boolean; structure: boolean; hvacDucts: boolean; hvacEquipment: boolean; supply: boolean; ret: boolean; exhaust: boolean; electrical: boolean; plumbing: boolean; drainage: boolean; fire: boolean; rooms: boolean; ceiling: boolean; ghost: boolean; level: string }
const ALL_ON: Vis = { architecture: true, structure: true, hvacDucts: true, hvacEquipment: true, supply: true, ret: true, exhaust: true, electrical: true, plumbing: true, drainage: true, fire: true, rooms: false, ceiling: true, ghost: false, level: "all" };
const NONE: Vis = { ...ALL_ON, architecture: false, structure: false, hvacDucts: false, hvacEquipment: false, supply: false, ret: false, exhaust: false, electrical: false, plumbing: false, drainage: false, fire: false };
const PRESETS: { id: string; label: string; v: Partial<Vis> }[] = [
  { id: "arch", label: "Architecture", v: { ...NONE, architecture: true, structure: true } }, { id: "arch-hvac", label: "Architecture + HVAC", v: { ...NONE, architecture: true, structure: true, hvacDucts: true, hvacEquipment: true, supply: true, ret: true, exhaust: true, ceiling: false } },
  { id: "arch-elec", label: "Architecture + electrical", v: { ...NONE, architecture: true, structure: true, electrical: true, ceiling: false } }, { id: "arch-plumb", label: "Architecture + plumbing", v: { ...NONE, architecture: true, structure: true, plumbing: true, drainage: true, ceiling: false } },
  { id: "arch-mep", label: "Architecture + all MEP", v: { ...ALL_ON, ceiling: false } }, { id: "hvac", label: "HVAC only", v: { ...NONE, hvacDucts: true, hvacEquipment: true, supply: true, ret: true, exhaust: true } },
  { id: "elec", label: "Electrical only", v: { ...NONE, electrical: true } }, { id: "plumb", label: "Plumbing only", v: { ...NONE, plumbing: true, drainage: true } }, { id: "coord", label: "Coordination (ghosted architecture)", v: { ...ALL_ON, ghost: true, ceiling: false } },
];
const STRUCT = /^(column|beam|foundation|member)/;
const groupOf = (u: { cat: string; sys?: string }): { kind: "arch" | "struct" | "mep" | "space"; sys?: MepSystem; cat: string } => (u.cat.startsWith("mep-") ? { kind: "mep", sys: u.sys as MepSystem, cat: u.cat } : u.cat === "space" ? { kind: "space", cat: u.cat } : STRUCT.test(u.cat) ? { kind: "struct", cat: u.cat } : { kind: "arch", cat: u.cat });
export function visibleFor(v: Vis, u: { id: string; cat: string; sys?: string; level?: string }, levelIdx: (l?: string) => number, lowest: number): boolean {
  const g = groupOf(u); if (v.level !== "all" && u.level && u.level !== v.level && g.kind !== "mep") return false; if (v.level !== "all" && u.level && u.level !== v.level && g.kind === "mep") return false;
  if (!v.ceiling && (u.cat === "roof" || (u.cat === "slab-floor" && levelIdx(u.level) > lowest))) return false;
  if (g.kind === "space") return v.rooms; if (g.kind === "arch") return v.architecture; if (g.kind === "struct") return v.structure;
  const s = g.sys!; const hv = isHvac(s); const catKey = g.cat.replace("mep-", "");
  if (s === "supply-air" && !v.supply) return false; if (s === "return-air" && !v.ret) return false; if (s === "exhaust-air" && !v.exhaust) return false;
  if (hv) { const equip = catKey === "equipment" || catKey === "air-terminal"; if (equip ? !v.hvacEquipment : !v.hvacDucts) return false; if (s === "equipment") return v.hvacEquipment; return true; }
  if (s === "electrical-power" || s === "electrical-lighting" || s === "cable-tray") return v.electrical; if (s === "water-cold" || s === "water-hot" || s === "vent" || s === "mechanical-pipe") return v.plumbing; if (s === "drainage") return v.drainage; if (s === "fire-protection") return v.fire; return true;
}

export default function ModelWorkspace({ model, auth, onRegenerate, busy, onToast, className = "" }: { model: Plan3dModel; auth: Auth; onRegenerate: (patch: Record<string, unknown>) => Promise<void>; busy: boolean; onToast: (m: string, bad?: boolean) => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null); const eng = useRef<BimScene | null>(null); const [ready, setReady] = useState(false); const [glError, setGlError] = useState("");
  const [vis, setVis] = useState<Vis>(ALL_ON); const stack = useRef<Vis[]>([]); const [sel, setSel] = useState<string | null>(null); const [selCat, setSelCat] = useState<string | undefined>(); const [left, setLeft] = useState<"layers" | "rooms" | "search">("layers"); const [right, setRight] = useState<"props" | "clashes" | "info">("props");
  const [ortho, setOrtho] = useState(false); const [walk, setWalk] = useState(false); const [measure, setMeasure] = useState(false); const [dist, setDist] = useState<null | { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } | null; server?: Record<string, number | string> }>(null);
  const [sec, setSec] = useState<{ on: boolean; axis: "elevation" | "x" | "y"; offset: number; flip: boolean }>({ on: false, axis: "elevation", offset: 1.5, flip: false }); const [, tick] = useState(0);
  const levels = useMemo(() => model.building?.levels ?? (model.ifc ? model.ifc.storeys.map((s) => ({ id: s.name, name: s.name, elevation: s.elevation ?? 0, height: 3 })) : []), [model]);
  const levelIdx = useCallback((l?: string) => Math.max(0, levels.findIndex((x) => x.id === l)), [levels]);

  useEffect(() => { // mount engine
    const el = host.current; if (!el) return; let e: BimScene; try { e = new BimScene(el); } catch { setGlError("The 3D view could not start in this browser (WebGL is unavailable)."); return; }
    eng.current = e; e.onPick = (p) => { if (p.id && p.shift) { setSel(p.id); setSelCat(p.cat); } else { setSel(p.id); setSelCat(p.cat); } }; e.onMeasure = (a, b) => setDist({ a, b }); e.onWalkState = setWalk; setReady(true);
    const t = window.setInterval(() => tick((n) => n + 1), 400); return () => { window.clearInterval(t); e.dispose(); eng.current = null; setReady(false); };
  }, []);
  useEffect(() => { const e = eng.current; if (!e || !ready) return; e.load(model.meshes); e.setVisible((u) => visibleFor(vis, u, levelIdx, 0)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [model, ready]);
  useEffect(() => { const e = eng.current; if (!e || !ready) return; e.setVisible((u) => visibleFor(vis, u, levelIdx, 0)); e.setGhost(vis.ghost); }, [vis, ready, levelIdx]);
  useEffect(() => { eng.current?.select(sel ? [sel] : []); }, [sel, ready, model]);
  useEffect(() => { const e = eng.current; if (!e) return; if (!sec.on) e.setSection(null); else e.setSection(sec.axis, sec.offset, sec.flip); }, [sec, ready, model]);
  useEffect(() => { eng.current?.setMeasure(measure); if (!measure) setDist(null); }, [measure]);

  const setV = (p: Partial<Vis>, remember = true) => { if (remember) stack.current.push(vis); setVis((v) => ({ ...v, ...p })); };
  const restore = () => { const v = stack.current.pop(); if (v) setVis(v); };
  const isolateCategory = () => { if (!selCat) return; const g = groupOf({ cat: selCat, sys: model.meshes.find((m) => m.id === sel)?.sys }); stack.current.push(vis); if (g.kind === "mep") { const s = g.sys!; const base: Vis = { ...NONE, level: vis.level }; const flag: Partial<Vis> = s === "supply-air" ? { supply: true, hvacDucts: true, hvacEquipment: true } : s === "return-air" ? { ret: true, hvacDucts: true, hvacEquipment: true } : s === "exhaust-air" ? { exhaust: true, hvacDucts: true, hvacEquipment: true } : s === "equipment" ? { hvacEquipment: true } : s.startsWith("electrical") || s === "cable-tray" ? { electrical: true } : s === "drainage" ? { drainage: true } : s === "fire-protection" ? { fire: true } : { plumbing: true }; setVis({ ...base, ...flag }); } else if (g.kind === "struct") setVis({ ...NONE, structure: true, level: vis.level }); else setVis({ ...NONE, architecture: true, level: vis.level }); };
  const isolateComponent = () => { const e = eng.current; if (!e || !sel) return; stack.current.push(vis); e.setVisible((u) => u.id === sel); e.focus([sel]); };
  const view = (v: ViewName) => eng.current?.setView(v);
  const walkInto = (roomId: string) => { const r = model.building?.rooms.find((x) => x.id === roomId); const e = eng.current; if (!r || !e) return; const lv = model.building!.levels.find((l) => l.id === r.level)!; stack.current.push(vis); setVis((v) => ({ ...v, ceiling: false, rooms: false, level: r.level })); const xs = r.polygon.map((p) => p.x), ys = r.polygon.map((p) => p.y); const heading = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : Math.PI / 2; e.walkTo(r.centroid.x, r.centroid.y, lv.elevation, heading); setSel(roomId); };
  const overhead = () => { const e = eng.current; if (!e) return; setVis((v) => ({ ...v, ceiling: false })); e.setOrtho(true); setOrtho(true); window.setTimeout(() => e.setView("top"), 30); };
  const exterior = () => { const e = eng.current; if (!e) return; setVis((v) => ({ ...v, ceiling: true, rooms: false, level: "all" })); e.setOrtho(false); setOrtho(false); e.setView("iso"); };
  const selectRoom = (id: string) => { setSel(id); setSelCat("space"); setVis((v) => ({ ...v, rooms: true })); eng.current?.focus([id]); };

  const sysCount = useMemo(() => { const o: Record<string, number> = {}; for (const e of model.mep.elements) o[e.system] = (o[e.system] ?? 0) + 1; return o; }, [model]);
  const cats = useMemo(() => { const o: Record<string, number> = {}; for (const m of model.meshes) o[m.cat] = (o[m.cat] ?? 0) + 1; return o; }, [model]);
  const pickLabel = (id: string) => model.mep.elements.find((e) => e.id === id)?.tag ?? model.building?.rooms.find((r) => r.id === id)?.name ?? model.ifc?.elements.find((e) => `#${e.id}` === id)?.name ?? id;
  const clashFocus = (a: string, b: string) => { const e = eng.current; if (!e) return; stack.current.push(vis); e.setVisible((u) => u.id === a || u.id === b); e.focus([a, b]); e.select([a, b]); setSel(a); };
  const clearIsolation = () => { restore(); eng.current?.setVisible((u) => visibleFor(vis, u, levelIdx, 0)); eng.current?.fit(); };
  const label = (p: { x: number; y: number; z: number }) => eng.current?.project(p.x, p.y, p.z);
  const verifyMeasure = async () => { if (!dist?.b) return; try { const r = await api.measure(auth, { type: "distance", a: dist.a, b: dist.b }); setDist({ ...dist, server: r }); } catch (e) { onToast((e as Error).message, true); } };
  const bimWalk = (f: number, s: number) => eng.current?.walkMove(f, s);

  return (
    <div className={`grid min-h-[34rem] gap-2 lg:h-[calc(100vh-12.5rem)] lg:grid-cols-[17rem_1fr_19rem] ${className}`}>
      {/* LEFT */}
      <aside className="flex max-h-[44rem] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 lg:max-h-full" aria-label="Layers and rooms">
        <div role="tablist" className="flex border-b border-slate-800 text-xs">{(["layers", "rooms", "search"] as const).map((t) => <button key={t} role="tab" aria-selected={left === t} type="button" onClick={() => setLeft(t)} className={`flex-1 px-2 py-2 font-semibold capitalize ${left === t ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}>{t === "layers" ? "Layers & MEP" : t}</button>)}</div>
        <div className="flex-1 overflow-y-auto p-2.5 text-xs">
          {left === "layers" && <LayersPanel vis={vis} setV={setV} setVis={(v) => { stack.current.push(vis); setVis(v as Vis); }} levels={levels} sysCount={sysCount} cats={cats} restore={restore} canRestore={stack.current.length > 0} isolateCategory={isolateCategory} isolateComponent={isolateComponent} sel={sel} hasMep={model.mep.elements.length > 0} />}
          {left === "rooms" && <RoomsPanel model={model} sel={sel} selectRoom={selectRoom} walkInto={walkInto} />}
          {left === "search" && <SearchPanel auth={auth} onPick={(r) => { setSel(r.id); setSelCat(r.category); eng.current?.focus([r.id]); setRight("props"); }} />}
        </div>
      </aside>
      {/* CENTER */}
      <section className="relative min-h-[30rem] overflow-hidden rounded-lg border border-slate-800 bg-slate-950" aria-label="3D model viewer">
        <div ref={host} className="absolute inset-0" data-testid="bim-viewport" role="img" aria-label="Interactive 3D building model" />
        {glError && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-amber-300">{glError}</p>}
        <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-col gap-1.5"><div className="flex flex-wrap gap-1.5">
          <button type="button" className={BTN} onClick={() => eng.current?.fit()}>Fit</button><button type="button" className={BTN} onClick={() => { clearIsolation(); }}>Reset</button>
          {(["front", "rear", "left", "right", "top", "iso"] as ViewName[]).map((v) => <button key={v} type="button" className={BTN} onClick={() => view(v)}>{v === "iso" ? "Isometric" : v[0].toUpperCase() + v.slice(1)}</button>)}
          <button type="button" className={ortho ? ON : BTN} aria-pressed={ortho} onClick={() => { eng.current?.setOrtho(!ortho); setOrtho(!ortho); }}>{ortho ? "Orthographic" : "Perspective"}</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={BTN} onClick={exterior}>Exterior</button><button type="button" className={BTN} onClick={overhead}>Floor plan</button>
          <button type="button" className={walk ? ON : BTN} aria-pressed={walk} onClick={() => { if (walk) { eng.current?.setMode("orbit"); eng.current?.fit(); } else { const r = model.building?.rooms[0]; if (r) walkInto(r.id); else onToast("Walkthrough needs generated rooms.", true); } }}>Walkthrough</button>
          <button type="button" className={measure ? ON : BTN} aria-pressed={measure} onClick={() => setMeasure(!measure)}>Measure</button>
          <button type="button" className={sec.on ? ON : BTN} aria-pressed={sec.on} onClick={() => setSec({ ...sec, on: !sec.on })}>Section</button>
          <button type="button" className={vis.ceiling ? BTN : ON} aria-pressed={!vis.ceiling} onClick={() => setV({ ceiling: !vis.ceiling }, false)}>{vis.ceiling ? "Hide ceiling/roof" : "Ceiling hidden"}</button>
        </div></div>
        {sec.on && <div className="absolute bottom-3 left-2 z-10 flex flex-wrap items-center gap-2 rounded-md border border-slate-700 bg-slate-900/95 p-2 text-xs text-slate-200"><label>Cut<select value={sec.axis} onChange={(e) => setSec({ ...sec, axis: e.target.value as "elevation", offset: 1.5 })} className="ml-1 rounded border border-slate-700 bg-slate-950 px-1 py-1"><option value="elevation">horizontal (elevation)</option><option value="x">vertical X</option><option value="y">vertical Y</option></select></label><input type="range" aria-label="Section position" min={0} max={eng.current ? Math.max(0.1, eng.current.sectionRange(sec.axis)) : 10} step={0.05} value={sec.offset} onChange={(e) => setSec({ ...sec, offset: Number(e.target.value) })} className="w-40 accent-emerald-500" /><span className="tabular-nums">{sec.offset.toFixed(2)} m</span><button type="button" className={BTN} onClick={() => setSec({ ...sec, flip: !sec.flip })}>Flip side</button></div>}
        {walk && <div className="absolute bottom-3 right-3 z-10 grid grid-cols-3 gap-1" aria-label="Walkthrough controls"><span /><button type="button" className={BTN} onPointerDown={() => bimWalk(0.4, 0)} aria-label="Forward">▲</button><span /><button type="button" className={BTN} onPointerDown={() => bimWalk(0, -0.4)} aria-label="Left">◀</button><button type="button" className={BTN} onPointerDown={() => bimWalk(-0.4, 0)} aria-label="Back">▼</button><button type="button" className={BTN} onPointerDown={() => bimWalk(0, 0.4)} aria-label="Right">▶</button></div>}
        {walk && <p className="pointer-events-none absolute left-2 bottom-3 z-10 rounded bg-slate-900/90 px-2 py-1 text-xs text-slate-300">Walkthrough: W A S D / arrows to move, drag to look, Shift = faster</p>}
        {dist && dist.a && (() => { const pa = label(dist.a); const pb = dist.b ? label(dist.b) : null; const m = dist.b ? Math.hypot(dist.b.x - dist.a.x, dist.b.y - dist.a.y, dist.b.z - dist.a.z) : null; return <>{pa && pb && m !== null && <div className="pointer-events-none absolute z-10 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white" style={{ left: (pa.x + pb.x) / 2, top: (pa.y + pb.y) / 2 }}>{m.toFixed(3)} m</div>}</>; })()}
        {measure && <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-red-500/60 bg-slate-900/95 px-3 py-2 text-xs text-slate-200">{dist?.b ? <>Distance <b className="text-white">{Math.hypot(dist.b.x - dist.a.x, dist.b.y - dist.a.y, dist.b.z - dist.a.z).toFixed(3)} m</b> · horizontal {Math.hypot(dist.b.x - dist.a.x, dist.b.y - dist.a.y).toFixed(3)} m · Δz {(dist.b.z - dist.a.z).toFixed(3)} m <button type="button" className={`${BTN} ml-2`} onClick={verifyMeasure}>Verify on server</button>{dist.server && <span className="ml-2 text-emerald-300">server: {Number(dist.server.distance).toFixed(3)} m</span>}</> : "Click two points on the model to measure (in metres)."}</div>}
        {!model.meshes.length && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">The model has no geometry yet.</p>}
        <p className="pointer-events-none absolute bottom-1 right-2 z-0 text-[11px] text-slate-500">{model.sample ? "Sample project · " : "Your upload · "}drag to orbit · scroll to zoom · right-drag to pan · click to select</p>
      </section>
      {/* RIGHT */}
      <aside className="flex max-h-[44rem] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 lg:max-h-full" aria-label="Inspector">
        <div role="tablist" className="flex border-b border-slate-800 text-xs">{(["props", "clashes", "info"] as const).map((t) => <button key={t} role="tab" aria-selected={right === t} type="button" onClick={() => setRight(t)} className={`flex-1 px-2 py-2 font-semibold ${right === t ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}>{t === "props" ? "Properties" : t === "clashes" ? `Clashes (${model.clashes.length})` : "Info"}</button>)}</div>
        <div className="flex-1 overflow-y-auto p-2.5 text-xs">
          {right === "props" && <PropsPanel auth={auth} id={sel} label={sel ? pickLabel(sel) : ""} model={model} onRegenerate={onRegenerate} busy={busy} />}
          {right === "clashes" && <ClashPanel auth={auth} model={model} onFocus={clashFocus} onClear={clearIsolation} onToast={onToast} setModelClashes={() => undefined} />}
          {right === "info" && <InfoPanel model={model} />}
        </div>
      </aside>
    </div>
  );
}

function Toggle({ on, onChange, label, color, count }: { on: boolean; onChange: (v: boolean) => void; label: string; color?: string; count?: number }) {
  return <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-800"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-500" />{color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />}<span className="min-w-0 flex-1 truncate text-slate-200">{label}</span>{count !== undefined && <span className="tabular-nums text-slate-500">{count}</span>}</label>;
}
function LayersPanel({ vis, setV, setVis, levels, sysCount, cats, restore, canRestore, isolateCategory, isolateComponent, sel, hasMep }: { vis: Vis; setV: (p: Partial<Vis>, r?: boolean) => void; setVis: (v: Partial<Vis>) => void; levels: { id: string; name: string }[]; sysCount: Record<string, number>; cats: Record<string, number>; restore: () => void; canRestore: boolean; isolateCategory: () => void; isolateComponent: () => void; sel: string | null; hasMep: boolean }) {
  const col = (s: MepSystem) => rgb(SYS_COLOR[s] ?? [0.6, 0.6, 0.6]);
  const archCount = Object.entries(cats).filter(([c]) => !c.startsWith("mep-") && c !== "space" && !STRUCT.test(c)).reduce((s, [, n]) => s + n, 0);
  const structCount = Object.entries(cats).filter(([c]) => STRUCT.test(c)).reduce((s, [, n]) => s + n, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5"><button type="button" className={BTN} onClick={() => setVis({ ...ALL_ON, level: vis.level })}>Show all</button><button type="button" className={BTN} onClick={() => setVis({ ...NONE, level: vis.level })}>Hide all</button><button type="button" className={BTN} disabled={!sel} onClick={isolateCategory}>Isolate category</button><button type="button" className={BTN} disabled={!sel} onClick={isolateComponent}>Isolate component</button><button type="button" className={`${BTN} col-span-2`} disabled={!canRestore} onClick={restore}>Restore previous visibility</button></div>
      <div><p className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Combined views</p><div className="grid grid-cols-1 gap-1">{PRESETS.filter((p) => hasMep || p.id === "arch").map((p) => <button key={p.id} type="button" className={`${BTN} text-left`} onClick={() => { setVis({ ...p.v, level: vis.level, rooms: false, ceiling: p.v.ceiling ?? vis.ceiling } as Partial<Vis>); }}>{p.label}</button>)}</div></div>
      {levels.length > 1 && <div><p className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Storey</p><select aria-label="Storey" className={FIELD} value={vis.level} onChange={(e) => setV({ level: e.target.value }, false)}><option value="all">All storeys</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
      <div><p className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Building</p>
        <Toggle on={vis.architecture} onChange={(v) => setV({ architecture: v }, false)} label="Architecture" count={archCount} /><Toggle on={vis.structure} onChange={(v) => setV({ structure: v }, false)} label="Structure (columns, beams)" count={structCount} /><Toggle on={vis.rooms} onChange={(v) => setV({ rooms: v }, false)} label="Room volumes" count={cats.space} /><Toggle on={vis.ghost} onChange={(v) => setV({ ghost: v }, false)} label="Ghost architecture (X-ray)" /></div>
      {hasMep && <div><p className="mb-1 font-semibold uppercase tracking-wider text-slate-400">HVAC</p>
        <Toggle on={vis.hvacDucts} onChange={(v) => setV({ hvacDucts: v }, false)} label="Ducts & fittings" color={col("supply-air")} /><Toggle on={vis.hvacEquipment} onChange={(v) => setV({ hvacEquipment: v }, false)} label="Equipment & terminals" color={col("equipment")} />
        <Toggle on={vis.supply} onChange={(v) => setV({ supply: v }, false)} label="Supply air" color={col("supply-air")} count={sysCount["supply-air"]} /><Toggle on={vis.ret} onChange={(v) => setV({ ret: v }, false)} label="Return air" color={col("return-air")} count={sysCount["return-air"]} /><Toggle on={vis.exhaust} onChange={(v) => setV({ exhaust: v }, false)} label="Exhaust air" color={col("exhaust-air")} count={sysCount["exhaust-air"]} />
        <p className="mb-1 mt-2 font-semibold uppercase tracking-wider text-slate-400">Electrical · Plumbing · Fire</p>
        <Toggle on={vis.electrical} onChange={(v) => setV({ electrical: v }, false)} label="Electrical (conduit, trays, lights)" color={col("electrical-power")} count={(sysCount["electrical-power"] ?? 0) + (sysCount["cable-tray"] ?? 0) + (sysCount["electrical-lighting"] ?? 0)} /><Toggle on={vis.plumbing} onChange={(v) => setV({ plumbing: v }, false)} label="Plumbing (water, vent)" color={col("water-cold")} count={(sysCount["water-cold"] ?? 0) + (sysCount["water-hot"] ?? 0) + (sysCount.vent ?? 0)} /><Toggle on={vis.drainage} onChange={(v) => setV({ drainage: v }, false)} label="Drainage" color={col("drainage")} count={sysCount.drainage} /><Toggle on={vis.fire} onChange={(v) => setV({ fire: v }, false)} label="Fire protection" color={col("fire-protection")} count={sysCount["fire-protection"]} /></div>}
      {!hasMep && <p className="rounded bg-slate-800 p-2 text-slate-300">No MEP geometry is loaded. Upload a MEP drawing (DXF) or an IFC with MEP, or open the sample with MEP.</p>}
    </div>
  );
}
function RoomsPanel({ model, sel, selectRoom, walkInto }: { model: Plan3dModel; sel: string | null; selectRoom: (id: string) => void; walkInto: (id: string) => void }) {
  const rooms = model.building?.rooms ?? []; if (!rooms.length) return <p className="text-slate-400">{model.ifc ? "Rooms of an IFC model are listed under Search (class IFCSPACE)." : "No rooms yet: rooms need closed wall loops."}</p>;
  const total = rooms.filter((r) => r.level === "L0").reduce((s, r) => s + r.area, 0);
  return <div className="space-y-1.5"><p className="text-slate-400">{rooms.filter((r) => r.level === "L0").length} rooms · net area {total.toFixed(2)} m² (per storey)</p>{rooms.map((r) => <div key={r.id} className={`rounded border p-2 ${sel === r.id ? "border-blue-500 bg-slate-800" : "border-slate-800"}`}><button type="button" className="w-full text-left" onClick={() => selectRoom(r.id)}><span className="font-semibold text-white">{r.name}</span> <span className="text-slate-500">{r.level}</span><span className="block text-slate-300">{r.area.toFixed(2)} m² · perimeter {r.perimeter.toFixed(2)} m</span><span className="block text-slate-500">{r.nameSource === "text-label" ? "named from drawing text" : "generated name"}{r.netValid ? "" : " · gross area"}</span></button><button type="button" className={`${BTN} mt-1.5`} onClick={() => walkInto(r.id)}>Walk inside</button></div>)}</div>;
}
function SearchPanel({ auth, onPick }: { auth: Auth; onPick: (r: ComponentRow) => void }) {
  const [q, setQ] = useState(""); const [rows, setRows] = useState<ComponentRow[]>([]); const [total, setTotal] = useState(0); const [err, setErr] = useState("");
  useEffect(() => { const t = window.setTimeout(() => { api.components(auth, q).then((r) => { setRows(r.items); setTotal(r.total); setErr(""); }).catch((e) => setErr((e as Error).message)); }, 250); return () => window.clearTimeout(t); }, [auth, q]);
  return <div className="space-y-2"><input aria-label="Search components" placeholder="Search id, tag, system, size…" value={q} onChange={(e) => setQ(e.target.value)} className={FIELD} />{err && <p role="alert" className="text-red-300">{err}</p>}<p className="text-slate-500">{total} match(es)</p><ul className="space-y-1">{rows.map((r) => <li key={r.id}><button type="button" onClick={() => onPick(r)} className="w-full rounded border border-slate-800 p-1.5 text-left hover:border-blue-500"><span className="font-semibold text-white">{r.tag}</span> <span className="text-slate-500">{r.id}</span><span className="block truncate text-slate-400">{r.category}{r.system ? ` · ${r.system}` : ""}</span></button></li>)}</ul></div>;
}
function Row({ k, v, assumed }: { k: string; v: React.ReactNode; assumed?: boolean }) { return <tr className="border-t border-slate-800 align-top"><th className="w-[42%] py-1 pr-2 text-left font-normal text-slate-400">{k}</th><td className="py-1 text-slate-100">{v}{assumed && <span className="ml-1.5 rounded bg-amber-500/20 px-1 text-[11px] font-semibold text-amber-300">assumed</span>}</td></tr>; }
function PropsPanel({ auth, id, label, model, onRegenerate, busy }: { auth: Auth; id: string | null; label: string; model: Plan3dModel; onRegenerate: (p: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.component>> | null>(null); const [err, setErr] = useState(""); const [edit, setEdit] = useState<Record<string, string>>({});
  useEffect(() => { setData(null); setErr(""); setEdit({}); if (!id) return; let dead = false; api.component(auth, id).then((d) => !dead && setData(d)).catch((e) => !dead && setErr(e instanceof ApiError ? e.message : "Could not load properties")); return () => { dead = true; }; }, [auth, id, model.version]);
  if (!id) return <p className="text-slate-400">Click an element in the model, a room in the list, or a search result to inspect its properties. Only values that exist in the source or were derived by a documented method are shown.</p>;
  if (err) return <p role="alert" className="text-red-300">{err} <span className="text-slate-500">({id}{label ? ` · ${label}` : ""})</span></p>; if (!data) return <p className="text-slate-400">Loading {label || id}…</p>;
  const el = data.element as Record<string, any>; const src = el.source as { origin: string; layer?: string; handle?: string; note?: string } | undefined; const assumed = new Set<string>((el.assumed as string[]) ?? []);
  const fields: Record<string, { k: string; unit: string; get: () => number | undefined }[]> = { wall: [{ k: "thickness", unit: "m", get: () => el.thickness }, { k: "height", unit: "m", get: () => el.height }], opening: [{ k: "width", unit: "m", get: () => el.width }, { k: "height", unit: "m", get: () => el.height }, { k: "sill", unit: "m", get: () => el.sill }], mep: [{ k: "elevation", unit: "m", get: () => el.path?.[0]?.z }, ...(el.section?.shape === "rect" ? [{ k: "width", unit: "m", get: () => el.section.w }, { k: "height", unit: "m", get: () => el.section.h }] : [{ k: "diameter", unit: "m", get: () => el.section?.w }])].filter(() => el.category !== "equipment" || true) };
  const editable = fields[data.kind] ?? []; const apply = async () => { const o: Record<string, number> = {}; for (const f of editable) { const v = Number(edit[f.k]); if (edit[f.k] !== undefined && edit[f.k] !== "" && Number.isFinite(v) && v !== f.get()) o[f.k] = v; } if (!Object.keys(o).length) return; await onRegenerate({ overrides: { ...(model.settings.overrides ?? {}), [id]: { ...(model.settings.overrides?.[id] ?? {}), ...o } } }); };
  return (
    <div className="space-y-3">
      <div><p className="text-sm font-semibold text-white">{String(el.tag ?? el.name ?? el.id ?? id)}</p><p className="text-slate-400">{data.kind}{el.category ? ` · ${el.category}` : ""}{el.system ? ` · ${SYSTEM_LABEL[el.system as MepSystem] ?? el.system}` : ""} · id {id}</p></div>
      <table className="w-full"><tbody>
        {data.kind === "wall" && <><Row k="Type" v={el.kind} /><Row k="Length" v={`${Math.hypot(el.b.x - el.a.x, el.b.y - el.a.y).toFixed(3)} m`} /><Row k="Thickness" v={`${el.thickness} m`} assumed={assumed.has("thickness (setting)")} /><Row k="Height" v={`${el.height} m`} assumed={assumed.has("height (setting)")} /><Row k="Openings" v={el.openings.length} /></>}
        {data.kind === "opening" && <><Row k="Kind" v={el.kind} /><Row k="Width" v={`${el.width} m`} /><Row k="Height" v={`${el.height} m`} assumed={el.assumed?.some((a: string) => /height/.test(a))} /><Row k="Sill height" v={`${el.sill} m`} assumed={el.assumed?.some((a: string) => /sill/.test(a))} /><Row k="Wall" v={data.wall} /></>}
        {data.kind === "room" && <><Row k="Net area" v={`${el.area} m²`} /><Row k="Gross area (to centrelines)" v={`${el.grossArea} m²`} /><Row k="Net perimeter" v={`${el.perimeter} m`} /><Row k="Name source" v={el.nameSource === "text-label" ? "text in the drawing" : "generated"} /><Row k="Bounding walls" v={el.wallIds.join(", ")} /></>}
        {data.kind === "column" && <><Row k="Section" v={el.round ? `Ø${(el.w * 1000).toFixed(0)} mm` : `${(el.w * 1000).toFixed(0)} × ${(el.d * 1000).toFixed(0)} mm`} /><Row k="Height" v={`${el.height} m`} assumed /></>}
        {data.kind === "stair" && <><Row k="Width × run" v={`${el.width.toFixed(2)} × ${el.run.toFixed(2)} m`} /><Row k="Treads" v={el.treads} assumed={el.assumed?.some((a: string) => /tread/.test(a))} /><Row k="Total rise" v={`${el.rise} m`} assumed /></>}
        {data.kind === "mep" && Object.entries(el.props as Record<string, string | number>).filter(([, v]) => v !== "").map(([k, v]) => <Row key={k} k={k} v={String(v)} assumed={[...assumed].some((a) => (k.startsWith("Width") || k.startsWith("Height") || k.startsWith("Diameter") ? /width|diameter/.test(a) : k.startsWith("Elevation") ? a.startsWith("elevation") : false))} />)}
        {data.kind === "mep" && <><Row k="Network" v={el.networkId ?? "—"} /><Row k="Connected to" v={(el.connections as string[]).length ? (el.connections as string[]).join(", ") : "—"} /></>}
        {data.kind === "ifc" && <><Row k="IFC class" v={el.cls} /><Row k="GlobalId" v={el.guid} /><Row k="Storey" v={el.storey ?? "—"} /><Row k="System" v={el.systemName ?? "—"} />{Object.entries(el.quantities as Record<string, number>).map(([k, v]) => <Row key={k} k={k} v={String(v)} />)}{Object.entries(el.props as Record<string, Record<string, unknown>>).flatMap(([ps, o]) => Object.entries(o).map(([k, v]) => <Row key={`${ps}.${k}`} k={`${ps}.${k}`} v={String(v)} />))}</>}
        {src && <Row k="Source" v={`${src.origin}${src.layer ? ` · layer ${src.layer}` : ""}${src.handle ? ` · handle ${src.handle}` : ""}`} />}{src?.note && <Row k="Derivation" v={src.note} />}
        {el.overrides?.length > 0 && <Row k="User edits" v={(el.overrides as string[]).join(", ")} />}
      </tbody></table>
      {el.assumed?.length > 0 && <p className="rounded bg-amber-500/10 p-2 text-amber-200"><b>Assumed values:</b> {(el.assumed as string[]).join("; ")}. These come from settings, not from the source file.</p>}
      {data.clashes && data.clashes.length > 0 && <div><p className="font-semibold text-slate-300">Clashes involving this element</p><ul className="mt-1 space-y-0.5">{data.clashes.map((c) => <li key={c.id} className="text-slate-300">{c.id} · {c.type} · {c.severity} · with {c.a.id === id ? c.b.tag : c.a.tag}</li>)}</ul></div>}
      {editable.length > 0 && <div className="rounded border border-slate-700 p-2"><p className="mb-1.5 font-semibold text-slate-300">Edit and regenerate</p><div className="grid grid-cols-2 gap-1.5">{editable.map((f) => <label key={f.k} className="text-slate-400">{f.k} ({f.unit})<input className={`${FIELD} mt-0.5`} inputMode="decimal" placeholder={String(f.get() ?? "")} value={edit[f.k] ?? ""} onChange={(e) => setEdit({ ...edit, [f.k]: e.target.value })} /></label>)}</div><button type="button" className={`${BTN} mt-2`} disabled={busy} onClick={apply}>{busy ? "Regenerating…" : "Apply and regenerate"}</button><p className="mt-1 text-slate-500">Edits are recorded as user overrides; the source geometry is unchanged. Use Output → Undo to reset.</p></div>}
    </div>
  );
}
function ClashPanel({ auth, model, onFocus, onClear, onToast }: { auth: Auth; model: Plan3dModel; onFocus: (a: string, b: string) => void; onClear: () => void; onToast: (m: string, bad?: boolean) => void; setModelClashes: () => void }) {
  const [clr, setClr] = useState(String(model.clashInfo.clearance)); const [tol, setTol] = useState(String(model.clashInfo.tolerance)); const [res, setRes] = useState<{ clashes: Plan3dModel["clashes"]; info: Plan3dModel["clashInfo"] } | null>(null); const [busy, setBusy] = useState(false); const [filter, setFilter] = useState<"all" | "hard" | "clearance">("all");
  const cur = res ?? { clashes: model.clashes, info: model.clashInfo }; const rows = cur.clashes.filter((c) => filter === "all" || c.type === filter);
  const run = async () => { setBusy(true); try { const r = await api.clashes(auth, Number(clr), Number(tol)); setRes({ clashes: r.clashes, info: r.info }); onToast(`Clash detection finished: ${r.clashes.length} finding(s) in ${r.ms} ms.`); } catch (e) { onToast((e as Error).message, true); } finally { setBusy(false); } };
  const SEV: Record<string, string> = { high: "bg-red-500/20 text-red-300", medium: "bg-orange-500/20 text-orange-300", low: "bg-yellow-500/20 text-yellow-200", warning: "bg-sky-500/20 text-sky-300" };
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1.5"><label className="text-slate-400">Clearance (m)<input className={`${FIELD} mt-0.5`} value={clr} onChange={(e) => setClr(e.target.value)} inputMode="decimal" /></label><label className="text-slate-400">Hard-clash tolerance (m)<input className={`${FIELD} mt-0.5`} value={tol} onChange={(e) => setTol(e.target.value)} inputMode="decimal" /></label></div>
      <div className="flex flex-wrap gap-1.5"><button type="button" className={BTN} disabled={busy} onClick={run}>{busy ? "Running…" : "Run clash detection"}</button><button type="button" className={BTN} onClick={onClear}>Show everything again</button></div>
      <p className="text-slate-500">{cur.info.tested} element pairs tested · {cur.info.level}. A hard clash is a real overlap deeper than the tolerance; a clearance finding is a gap smaller than the clearance. “No findings” does not prove a model is clash-free: <b>only the methods below are checked</b>.</p>
      <details className="text-slate-400"><summary className="cursor-pointer">Methods and limits</summary><ul className="mt-1 list-disc pl-4">{cur.info.method.map((m) => <li key={m}>{m}</li>)}<li>Severity: hard ≥ 0.10 m high · ≥ 0.03 m medium · else low; clearance = warning.</li></ul></details>
      <div role="group" aria-label="Filter" className="flex gap-1">{(["all", "hard", "clearance"] as const).map((f) => <button key={f} type="button" className={filter === f ? ON : BTN} onClick={() => setFilter(f)}>{f}</button>)}</div>
      {rows.length === 0 ? <p className="text-slate-400">No findings for this filter.</p> : <ul className="space-y-1.5">{rows.map((c) => <li key={c.id} className="rounded border border-slate-800 p-2"><div className="flex items-center gap-1.5"><span className="font-semibold text-white">{c.id}</span><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${SEV[c.severity]}`}>{c.severity}</span><span className="text-slate-400">{c.type}</span></div><p className="text-slate-200">{c.a.tag} <span className="text-slate-500">({c.a.cat})</span> × {c.b.tag} <span className="text-slate-500">({c.b.cat})</span></p><p className="text-slate-400">{c.type === "hard" ? `overlap depth ${(c.depth * 1000).toFixed(0)} mm` : `gap ${(c.distance * 1000).toFixed(0)} mm`} · at ({c.point.x.toFixed(2)}, {c.point.y.toFixed(2)}, {c.point.z.toFixed(2)}) m</p><p className="text-slate-500">{c.method}{c.note ? ` · ${c.note}` : ""}</p><button type="button" className={`${BTN} mt-1`} onClick={() => onFocus(c.a.id, c.b.id)}>Isolate and zoom</button></li>)}</ul>}
    </div>
  );
}
function InfoPanel({ model }: { model: Plan3dModel }) {
  const b = model.building; return (
    <div className="space-y-2.5 text-slate-300">
      <p><b className="text-white">{model.sample ? "Sample project" : "Your upload"}</b> — {model.provenance.architecture}. MEP: {model.provenance.mep}.</p>
      {b && <p>Units: {b.units.name} ({b.units.note}). Levels {b.levels.length}; walls {b.stats.walls}, doors {b.stats.doors}, windows {b.stats.windows}, rooms {b.stats.rooms}, columns {b.stats.columns}, stairs {b.stats.stairs}.</p>}
      {b?.roof && <p>Roof: {b.roof.note}</p>}{model.ifc && <p>IFC {model.ifc.schema}: {model.ifc.elements.length} elements, {model.ifc.triangles.toLocaleString()} triangles; geometry shown as triangulated by web-ifc.</p>}
      {model.warnings.length > 0 && <div><p className="font-semibold text-amber-300">Warnings</p><ul className="list-disc pl-4">{model.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
      <div><p className="font-semibold text-slate-200">Assumptions</p><ul className="list-disc pl-4">{model.assumptions.map((w) => <li key={w}>{w}</li>)}</ul></div>
      <div><p className="font-semibold text-slate-200">Limitations</p><ul className="list-disc pl-4">{model.limitations.map((w) => <li key={w}>{w}</li>)}</ul></div>
    </div>
  );
}
