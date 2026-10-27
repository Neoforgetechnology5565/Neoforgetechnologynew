"use client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import DemoShell from "./DemoShell";
import Stage3D, { type StageCtx, type View } from "./Stage3D";
import { BRAND } from "./config3d";
import { BTN, CARD, FIELD, H3, LBL, download, pill } from "./ui";
import { COMPONENTS, addDimensions, type CompDef, type Vals } from "./dyncomp";
import type { Branding } from "@/lib/types";

const THUMB: Record<string, string> = {
  window: "M6 6h36v36H6zM12 12h24v24H12zM24 12v24M12 24h24",
  door: "M12 4h24v40H12zM17 9h14v14H17zM17 27h14v13H17zM30 26h2",
  shelving: "M8 6h32v36H8zM8 16h32M8 26h32M8 36h32",
  stair: "M6 40h10v-8h10v-8h10v-8h6M6 40h36",
  facade: "M6 6h36v36H6zM18 6v36M30 6v36M6 18h36M6 30h36",
};
const Thumb = ({ id }: { id: string }) => <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d={THUMB[id]} /></svg>;


export default function DynamicComponents({ branding }: { branding: Branding }) {
  const [compId, setCompId] = useState("window");
  const comp = COMPONENTS.find((c) => c.id === compId) as CompDef;
  const [vals, setVals] = useState<Vals>(COMPONENTS[0].presets.Standard);
  const [preset, setPreset] = useState<string | null>("Standard");
  const [sel, setSel] = useState<string | null>(null);
  const [dims, setDims] = useState(true);
  const [mode, setMode] = useState<"shaded" | "wire">("shaded");
  const [ctx, setCtx] = useState<StageCtx | null>(null);
  const [built, setBuilt] = useState<{ group: THREE.Group; parts: Record<string, string>; size: THREE.Vector3; center: THREE.Vector3 } | null>(null);
  const [tab, setTab] = useState<"library" | "params">("params");
  const [log, setLog] = useState<string[]>([]);

  const warnings = useMemo(() => comp.validate(vals), [comp, vals]);
  const qty = useMemo(() => comp.quantities(vals), [comp, vals]);
  const base = comp.presets.Standard;
  const modified = Object.keys(base).filter((k) => vals[k] !== (preset ? comp.presets[preset][k] : base[k])).length;
  const home: View = useMemo(() => {
    const s = built?.size ?? new THREE.Vector3(1.5, 1.5, 0.3), c = built?.center ?? new THREE.Vector3(0, 0.75, 0);
    const d = Math.max(s.x, s.y, s.z * 3) * 1.7 + 0.8;
    return { pos: [c.x + d * 0.55, c.y + d * 0.25, c.z + d * 0.95], target: [c.x, c.y, c.z] };
  }, [built]);

  const onReady = (c: StageCtx) => {
    c.scene.background = new THREE.Color(0x0d130f);
    c.scene.add(new THREE.HemisphereLight(0xe7f2e8, 0x1b241d, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(4, 6, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 }); c.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9bd47a, 0.5); fill.position.set(-5, 3, -3); c.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x151d18, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; floor.receiveShadow = true; c.scene.add(floor);
    const grid = new THREE.GridHelper(20, 40, 0x2f4a37, 0x1c2a21); c.scene.add(grid);
    setCtx(c);
  };

  useEffect(() => {
    if (!ctx) return;
    const r = comp.build(vals);
    ctx.pick.add(r.group);
    const m = addDimensions(r.group);
    setBuilt({ group: r.group, parts: r.parts, size: m.size, center: m.center });
    return () => { ctx.pick.remove(r.group); r.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); }); ctx.invalidate(); };
  }, [ctx, comp, vals]);
  // frame the component when switching components or presets (not on every slider move)
  const frameKey = `${compId}:${preset}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ctx && built) ctx.reset(); }, [ctx, frameKey]);
  useEffect(() => {
    if (!ctx || !built) return;
    built.group.traverse((o) => {
      if (o.userData.dim) o.visible = dims;
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const mt = m.material as THREE.MeshStandardMaterial, on = !!sel && m.userData.id === sel;
      mt.emissive?.setHex(on ? BRAND : 0x000000); mt.emissiveIntensity = on ? 0.55 : 0; mt.wireframe = mode === "wire";
    });
    ctx.invalidate();
  }, [ctx, built, sel, dims, mode]);

  const note = (t: string) => setLog((l) => [t, ...l].slice(0, 8));
  const setV = (k: string, v: number | string | boolean) => { setVals((x) => ({ ...x, [k]: v })); setPreset(null); };
  const pickComp = (id: string) => { const c = COMPONENTS.find((x) => x.id === id)!; setCompId(id); setVals(c.presets.Standard); setPreset("Standard"); setSel(null); setTab("params"); note(`Loaded ${c.name}`); };
  const applyPreset = (p: string) => { setVals(comp.presets[p]); setPreset(p); setSel(null); note(`Preset: ${p}`); };

  const partCount = built ? Object.values(built.parts).length : 0;
  const partsBy = useMemo(() => { const m = new Map<string, { label: string; n: number }>(); built?.group.traverse((o) => { const id = o.userData.id as string | undefined; if (id && (o as THREE.Mesh).isMesh) { const e = m.get(id) ?? { label: built.parts[id], n: 0 }; e.n++; m.set(id, e); } }); return m; }, [built]);
  const totalMeshes = [...partsBy.values()].reduce((s, p) => s + p.n, 0);
  const selSize = useMemo(() => { if (!sel || !built) return null; const b = new THREE.Box3(); built.group.traverse((o) => { if (o.userData.id === sel && (o as THREE.Mesh).isMesh) b.expandByObject(o); }); return b.isEmpty() ? null : b.getSize(new THREE.Vector3()); }, [sel, built]);
  const config = { component: comp.name, id: `NF-${comp.code}-${String(100 + COMPONENTS.indexOf(comp) * 7)}`, preset: preset ?? "Custom", parameters: vals, quantities: Object.fromEntries(qty), warnings };
  const report = () => [`${comp.name} configuration report (SAMPLE DATA, simulated demonstration)`, `Component ID: ${config.id} · Category: ${comp.category} · Preset: ${config.preset}`, "", "Parameters:", ...Object.entries(vals).map(([k, v]) => `  ${comp.params.find((p) => p.k === k)?.label ?? k}: ${v}`), "", "Quantities:", ...qty.map(([k, v]) => `  ${k}: ${v}`), "", "Parts:", ...[...partsBy.values()].map((p) => `  ${p.label}: ${p.n}`), "", warnings.length ? "Configuration warnings:" : "No configuration warnings.", ...warnings.map((w) => `  - ${w}`)].join("\n");

  return (
    <DemoShell branding={branding} app="SketchUp Dynamic Components Builder" project={`Component library · ${comp.name}`} status={warnings.length ? `${warnings.length} configuration warning${warnings.length > 1 ? "s" : ""}` : preset ? `Preset: ${preset}` : modified ? `Modified (${modified} parameter${modified > 1 ? "s" : ""})` : "Standard configuration"}
      actions={<button type="button" onClick={() => { applyPreset("Standard"); }} className={BTN}>Reset configuration</button>}>
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[21rem_minmax(0,1fr)]">
        <aside aria-label="Component library and parameters" className="order-2 border-t border-slate-800 bg-slate-900/60 lg:order-1 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <div className="flex border-b border-slate-800 text-sm">{([["params", "Parameters"], ["library", "Component library"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 px-3 py-2.5 ${tab === k ? "border-b-2 border-blue-500 font-semibold text-blue-300" : "text-slate-400 hover:text-white"}`}>{l}</button>)}</div>
          {tab === "library" ? (
            <ul className="space-y-2 p-3">{COMPONENTS.map((c) => (
              <li key={c.id}><button type="button" onClick={() => pickComp(c.id)} aria-pressed={c.id === compId} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${c.id === compId ? "border-blue-500 bg-blue-600/15" : "border-slate-800 hover:border-slate-600"}`}><Thumb id={c.id} /><span><span className="block text-sm font-semibold text-white">{c.name}</span><span className="block text-[11px] text-slate-400">{c.category} · {c.desc}</span></span></button></li>
            ))}</ul>
          ) : (
            <div className="space-y-4 p-4">
              <div><p className={LBL}>Presets</p><div className="grid grid-cols-3 gap-1.5">{Object.keys(comp.presets).map((p) => <button key={p} type="button" aria-pressed={preset === p} onClick={() => applyPreset(p)} className={`rounded-md border px-2 py-1.5 text-xs ${preset === p ? "border-blue-500 bg-blue-600/20 text-blue-200" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>{p}</button>)}</div></div>
              {comp.params.map((p) => {
                const id = `pm-${p.k}`;
                if (p.type === "range") return <div key={p.k}><div className="flex items-baseline justify-between"><label htmlFor={id} className={LBL}>{p.label}</label><input type="number" aria-label={`${p.label} value`} min={p.min} max={p.max} step={p.step} value={vals[p.k] as number} onChange={(e) => { const n = Math.min(p.max, Math.max(p.min, +e.target.value || p.min)); setV(p.k, n); }} className="w-20 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-right font-mono text-xs text-blue-300" /></div><input id={id} type="range" min={p.min} max={p.max} step={p.step} value={vals[p.k] as number} onChange={(e) => setV(p.k, +e.target.value)} className="w-full accent-[#55b52b]" /><p className="text-right text-[10px] text-slate-600">{p.min}–{p.max}{p.unit ?? ""}</p></div>;
                if (p.type === "select") return <div key={p.k}><label htmlFor={id} className={LBL}>{p.label}</label><select id={id} value={vals[p.k] as string} onChange={(e) => setV(p.k, e.target.value)} className={FIELD}>{p.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>;
                if (p.type === "toggle") return <label key={p.k} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-xs"><span>{p.label}</span><input type="checkbox" checked={!!vals[p.k]} onChange={(e) => setV(p.k, e.target.checked)} /></label>;
                return <div key={p.k}><p className={LBL}>{p.label}</p><div className="flex flex-wrap items-center gap-2">{p.swatches.map((c) => <button key={c} type="button" aria-label={`${p.label} ${c}`} aria-pressed={vals[p.k] === c} onClick={() => setV(p.k, c)} className={`h-8 w-8 rounded-full border-2 ${vals[p.k] === c ? "border-blue-400" : "border-slate-600"}`} style={{ background: c }} />)}<input type="color" aria-label={`Custom ${p.label}`} value={vals[p.k] as string} onChange={(e) => setV(p.k, e.target.value)} className="h-8 w-10 rounded border border-slate-700 bg-transparent" /></div></div>;
              })}
              {warnings.length > 0 && <ul className="space-y-1.5" aria-live="polite">{warnings.map((w, i) => <li key={i} className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-200">⚠ {w}</li>)}</ul>}
            </div>
          )}
        </aside>

        <div className="order-1 min-w-0 space-y-3 p-3 sm:p-4 lg:order-2">
          <Stage3D className="h-[52vh] min-h-[320px] lg:h-[60vh]" home={home} onReady={onReady} onPick={(o) => setSel((o?.userData.id as string | undefined) ?? null)} shadows label={`3D view of the ${comp.name}. Click a part to inspect it.`}
            toolbar={<>
              <button type="button" onClick={() => setDims((d) => !d)} aria-pressed={dims} className={`rounded-md border border-slate-700 bg-slate-900/90 ${pill(dims)}`}>Dimensions</button>
              <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{([["shaded", "Shaded"], ["wire", "Wireframe"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className={pill(mode === k)}>{l}</button>)}</span>
            </>}>
            <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-slate-950/80 px-3 py-1.5 text-xs">{comp.name} · {config.id}</div>
          </Stage3D>

          <div className="grid gap-3 md:grid-cols-3">
            <section className={CARD}><h3 className={H3}>Component properties</h3><dl className="mt-2 space-y-1 text-xs">{[["Name", comp.name], ["Identifier", config.id], ["Category", comp.category], ["Size (W×H×D)", built ? `${(built.size.x * 1000).toFixed(0)} × ${(built.size.y * 1000).toFixed(0)} × ${(built.size.z * 1000).toFixed(0)} mm` : "…"], ["Parts", `${partCount} types · ${totalMeshes} pieces`], ["Status", warnings.length ? `${warnings.length} warning(s)` : preset ? `Preset: ${preset}` : "Valid, custom"]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl></section>
            <section className={CARD}><h3 className={H3}>Calculated quantities</h3><dl className="mt-2 space-y-1 text-xs">{qty.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="font-medium capitalize">{v}</dd></div>)}</dl></section>
            <section className={CARD} aria-live="polite"><h3 className={H3}>Selected part</h3>{!sel ? <p className="mt-2 text-xs text-slate-500">Click a part of the component in the 3D view to inspect it, or choose one below.</p> : <div className="mt-2 text-xs"><p className="font-display text-base font-semibold text-white">{built?.parts[sel]}</p><dl className="mt-2 space-y-1"><div className="flex justify-between"><dt className="text-slate-500">Pieces</dt><dd>{partsBy.get(sel)?.n}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Bounding size</dt><dd>{selSize ? `${(selSize.x * 1000).toFixed(0)} × ${(selSize.y * 1000).toFixed(0)} × ${(selSize.z * 1000).toFixed(0)} mm` : "—"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Material</dt><dd className="capitalize">{sel === "glass" ? "Glass" : String(vals.material ?? "—")}</dd></div></dl><button type="button" onClick={() => setSel(null)} className={`${BTN} mt-2`}>Clear selection</button></div>}
              <div className="mt-3 flex flex-wrap gap-1">{[...partsBy.entries()].map(([id, p]) => <button key={id} type="button" onClick={() => setSel(id)} className={`rounded-full border px-2 py-0.5 text-[10px] ${sel === id ? "border-blue-500 text-blue-200" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>{p.label}</button>)}</div></section>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => download(`${comp.id}-configuration-sample.json`, JSON.stringify(config, null, 2), "application/json")} className={BTN}>Export configuration (.json)</button>
            <button type="button" onClick={() => download(`${comp.id}-report-sample.txt`, report())} className={BTN}>Download report (.txt)</button>
            <span className="text-[11px] text-slate-500">Exports are sample configuration data, not native SketchUp (.skp) files.</span>
            {log[0] && <span className="ml-auto text-[11px] text-slate-400">{log[0]}</span>}
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
