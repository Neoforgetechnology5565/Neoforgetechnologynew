"use client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import DemoShell from "./DemoShell";
import Stage3D, { type StageCtx, type View } from "./Stage3D";
import { BRAND, buildHouse, buildSurroundings, type House } from "./config3d";
import { DEFAULT_CFG, LIMITS, MATERIALS, PRESETS, ROOF_FINISHES, doorSize, summary, windowLayout, type Cfg, type DoorCfg, type Roof, type WindowCfg } from "@/lib/demo-config-data";
import type { Branding } from "@/lib/types";

const field = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500";
const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500";
const card = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const gbp = (n: number) => `£${Math.round(n / 10) * 10 > 0 ? (Math.round(n / 10) * 10).toLocaleString("en-GB") : "0"}`;
const download = (name: string, text: string, type = "text/plain") => { const u = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };

function Slider({ id, label, value, min, max, step, unit, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between"><label htmlFor={id} className={lbl}>{label}</label><span className="font-mono text-xs text-blue-300">{Number.isInteger(step) ? value : value.toFixed(1)}{unit}</span></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-[#55b52b]" />
    </div>
  );
}

export default function SketchConfigurator({ branding }: { branding: Branding }) {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [preset, setPreset] = useState<string | null>("modern");
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"shaded" | "wire">("shaded");
  const [ctx, setCtx] = useState<StageCtx | null>(null);
  const [house, setHouse] = useState<House | null>(null);
  const [changes, setChanges] = useState(0);

  const S = useMemo(() => summary(cfg), [cfg]);
  const dist = Math.max(cfg.width, cfg.length, S.totalHeight) * 1.7 + 9;
  const home: View = useMemo(() => ({ pos: [dist * 0.75, S.totalHeight * 0.9 + dist * 0.3, dist * 0.85], target: [0, S.totalHeight * 0.4, 0] }), [dist, S.totalHeight]);
  const views: Record<string, View> = useMemo(() => ({
    Perspective: home,
    Front: { pos: [0, S.totalHeight * 0.5, dist * 1.35], target: [0, S.totalHeight * 0.45, 0] },
    Rear: { pos: [0, S.totalHeight * 0.5, -dist * 1.35], target: [0, S.totalHeight * 0.45, 0] },
    Side: { pos: [dist * 1.35, S.totalHeight * 0.5, 0], target: [0, S.totalHeight * 0.45, 0] },
    Top: { pos: [0, dist * 1.6, 0.01], target: [0, 0, 0] },
  }), [home, S.totalHeight, dist]);

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => { setCfg((c) => ({ ...c, [k]: v })); setPreset(null); setChanges((n) => n + 1); };
  const choose = (k: string) => { setCfg(PRESETS[k].cfg); setPreset(k); setSel(null); setChanges(0); ctx?.reset(); };

  const onReady = (c: StageCtx) => {
    c.scene.background = new THREE.Color(0xcfe3ee); c.scene.fog = new THREE.Fog(0xcfe3ee, 70, 190);
    c.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x7a8a6a, 0.85));
    const sun = new THREE.DirectionalLight(0xfff3e0, 1.5); sun.position.set(22, 34, 26); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 }); sun.shadow.bias = -0.0004;
    c.scene.add(sun); setCtx(c);
  };
  useEffect(() => {
    if (!ctx) return;
    const h = buildHouse(cfg), sur = buildSurroundings(ctx.scene, cfg.width, cfg.length);
    ctx.pick.add(h.group); setHouse(h);
    return () => { ctx.pick.remove(h.group); ctx.scene.remove(sur); [h.group, sur].forEach((g) => g.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); })); ctx.invalidate(); };
  }, [ctx, cfg]);
  useEffect(() => {
    if (!ctx || !house) return;
    house.group.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const mt = m.material as THREE.MeshStandardMaterial, on = !!sel && m.userData.id === sel;
      mt.emissive.setHex(on ? BRAND : 0x000000); mt.emissiveIntensity = on ? 0.5 : 0; mt.wireframe = mode === "wire";
    });
    ctx.invalidate();
  }, [ctx, house, sel, mode]);
  const goView = (k: string) => ctx?.goto(views[k]);

  const info = (id: string): [string, string][] => {
    const mat = MATERIALS.find((m) => m.key === cfg.material)!.label, rf = ROOF_FINISHES.find((m) => m.key === cfg.roofFinish)!.label;
    const dz = doorSize(cfg.door), wl = windowLayout(cfg, cfg.width);
    switch (id) {
      case "front": case "back": return [["Material", mat], ["Width", `${cfg.width} m`], ["Height", `${S.H.toFixed(1)} m`], ["Gross area", `${(cfg.width * S.H).toFixed(1)} m²`], ["Openings", id === "front" ? `${wl.count * cfg.floors} windows + door` : `${wl.count * cfg.floors} windows`]];
      case "left": case "right": return [["Material", mat], ["Length", `${(cfg.length - 0.6).toFixed(1)} m`], ["Height", `${S.H.toFixed(1)} m`], ["Gross area", `${((cfg.length - 0.6) * S.H).toFixed(1)} m²`]];
      case "roof": return [["Type", cfg.roof], ["Finish", rf], ["Pitch", cfg.roof === "flat" ? "flat" : `${cfg.pitch}°`], ["Rise", `${S.rise.toFixed(2)} m`], ["Area", `${S.roofArea.toFixed(0)} m²`]];
      case "windows": return [["Count", String(S.winCount)], ["Glazed area", `${S.winArea.toFixed(1)} m²`], ["Glazing ratio", `${(S.glazing * 100).toFixed(0)}%`], ["Configuration", cfg.windows]];
      case "door": return [["Type", cfg.door], ["Size", `${dz.w} × ${dz.h} m`], ["Count (incl. balcony doors)", String(S.doorCount)]];
      case "balcony": return [["Balconies", String(cfg.floors - 1)], ["Size each", "2.8 × 1.3 m"], ["Balustrade", "Glass"]];
      case "porch": return [["Canopy", `${(dz.w + 1.6).toFixed(1)} × 1.5 m`], ["Height", "2.75 m"]];
      case "chimney": return [["Size", `0.7 × 0.7 m`], ["Height above roof edge", `${(S.rise + 1).toFixed(1)} m`]];
      case "solar": return [["Panels", String(S.panels)], ["Panel size", "1.0 × 1.6 m"], ["Illustrative capacity", `${(S.panels * 0.4).toFixed(1)} kWp`]];
      case "slabs": return [["Floors", String(cfg.floors + 1)], ["Thickness", "200 mm"]];
      default: return [["Part", id]];
    }
  };

  const summaryText = () => [
    "SketchUp-style parametric configuration (SAMPLE DATA, simulated demonstration)", `Preset: ${preset ? PRESETS[preset].label : "Custom"}`, "",
    ...Object.entries(cfg).map(([k, v]) => `${k}: ${v}`), "",
    `Footprint ${S.footprint.toFixed(0)} m² · Gross internal area ${S.gia.toFixed(0)} m² · Height ${S.totalHeight.toFixed(1)} m`,
    `Façade gross ${S.faceGross.toFixed(0)} m² · Cladding net ${S.cladding.toFixed(0)} m² · Windows ${S.winCount} (${S.winArea.toFixed(1)} m²) · Roof ${S.roofArea.toFixed(0)} m²`, "",
    "Illustrative sample estimate (not a quotation):", ...S.lines.filter((l) => l[1] > 0).map(([k, v]) => `  ${k}: ${gbp(v)}`), `  TOTAL: ${gbp(S.total)}`,
  ].join("\n");
  const exportObj = () => {
    if (!house) return;
    const g = house.group.clone(true); const rm: THREE.Object3D[] = []; g.traverse((o) => { if (o.userData.edge) rm.push(o); }); rm.forEach((o) => o.parent?.remove(o));
    download("sample-house.obj", new OBJExporter().parse(g), "text/plain");
  };

  const pill = (on: boolean) => `rounded px-2.5 py-1 text-xs font-medium ${on ? "bg-blue-600 text-white" : "bg-slate-900/90 text-slate-300 hover:bg-slate-800"}`;
  const btn = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white";
  const chip = (on: boolean) => `rounded-md border px-2.5 py-1.5 text-xs ${on ? "border-blue-500 bg-blue-600/20 text-blue-200" : "border-slate-700 text-slate-300 hover:border-slate-500"}`;
  const matDef = MATERIALS.find((m) => m.key === cfg.material)!;
  const solarOk = cfg.roof !== "hip";

  return (
    <DemoShell branding={branding} app="SketchUp Parametric Model Configurator" project="Configurable house · sample project" status={preset ? `Configuration: ${PRESETS[preset].label}` : "Configuration: custom"}
      actions={<button type="button" onClick={() => choose("modern")} className={btn}>Reset configuration</button>}>
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside aria-label="Configuration controls" className="order-2 space-y-5 border-t border-slate-800 bg-slate-900/60 p-4 lg:order-1 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Presets</h2>
            <div className="grid grid-cols-2 gap-2">{Object.entries(PRESETS).map(([k, p]) => <button key={k} type="button" onClick={() => choose(k)} aria-pressed={preset === k} title={p.blurb} className={chip(preset === k)}>{p.label}</button>)}</div>
            <p className="mt-2 text-[11px] text-slate-500">{preset ? PRESETS[preset].blurb : "Custom configuration. Pick a preset to start from one."}</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dimensions</h2>
            <Slider id="w" label="Building width" value={cfg.width} {...{ min: LIMITS.width[0], max: LIMITS.width[1], step: LIMITS.width[2] }} unit=" m" onChange={(v) => set("width", v)} />
            <Slider id="l" label="Building length" value={cfg.length} {...{ min: LIMITS.length[0], max: LIMITS.length[1], step: LIMITS.length[2] }} unit=" m" onChange={(v) => set("length", v)} />
            <Slider id="f" label="Number of floors" value={cfg.floors} {...{ min: LIMITS.floors[0], max: LIMITS.floors[1], step: LIMITS.floors[2] }} onChange={(v) => set("floors", v)} />
            <Slider id="fh" label="Floor height" value={cfg.floorHeight} {...{ min: LIMITS.floorHeight[0], max: LIMITS.floorHeight[1], step: LIMITS.floorHeight[2] }} unit=" m" onChange={(v) => set("floorHeight", v)} />
          </section>
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Roof</h2>
            <div className="grid grid-cols-4 gap-1.5">{(["flat", "gable", "hip", "shed"] as Roof[]).map((r) => <button key={r} type="button" aria-pressed={cfg.roof === r} onClick={() => set("roof", r)} className={`${chip(cfg.roof === r)} capitalize`}>{r}</button>)}</div>
            {cfg.roof !== "flat" && <Slider id="pitch" label="Roof pitch" value={cfg.pitch} {...{ min: LIMITS.pitch[0], max: LIMITS.pitch[1], step: LIMITS.pitch[2] }} unit="°" onChange={(v) => set("pitch", v)} />}
            <div><label className={lbl} htmlFor="rf">Roof finish</label><select id="rf" value={cfg.roofFinish} onChange={(e) => set("roofFinish", e.target.value as Cfg["roofFinish"])} className={field}>{ROOF_FINISHES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
          </section>
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Windows and door</h2>
            <div className="grid grid-cols-2 gap-1.5">{([["standard", "Standard"], ["large", "Large"], ["ribbon", "Ribbon"], ["none", "None"]] as [WindowCfg, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={cfg.windows === k} onClick={() => set("windows", k)} className={chip(cfg.windows === k)}>{l}</button>)}</div>
            {(cfg.windows === "standard" || cfg.windows === "large") && <Slider id="sp" label="Window spacing" value={cfg.spacing} {...{ min: LIMITS.spacing[0], max: LIMITS.spacing[1], step: LIMITS.spacing[2] }} unit=" m" onChange={(v) => set("spacing", v)} />}
            <div><label className={lbl} htmlFor="dr">Entrance door</label><select id="dr" value={cfg.door} onChange={(e) => set("door", e.target.value as DoorCfg)} className={field}><option value="single">Single solid door (1.0 m)</option><option value="double">Double door (1.8 m)</option><option value="glazed">Wide glazed double door (2.2 m)</option></select></div>
          </section>
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Exterior finish</h2>
            <div><label className={lbl} htmlFor="mt">Material</label><select id="mt" value={cfg.material} onChange={(e) => { const m = MATERIALS.find((x) => x.key === e.target.value)!; setCfg((c) => ({ ...c, material: m.key, color: m.colors[0] })); setPreset(null); setChanges((n) => n + 1); }} className={field}>{MATERIALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
            <div><p className={lbl}>{cfg.material === "brick" || cfg.material === "timber" ? "Tone" : "Colour"}</p><div className="flex flex-wrap gap-2">{matDef.colors.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={cfg.color === c} onClick={() => set("color", c)} className={`h-8 w-8 rounded-full border-2 ${cfg.color === c ? "border-blue-400" : "border-slate-600"}`} style={{ background: c }} />)}<label className="flex items-center gap-1.5 text-[11px] text-slate-400">Custom <input type="color" value={cfg.color} onChange={(e) => set("color", e.target.value)} aria-label="Custom colour" className="h-8 w-10 rounded border border-slate-700 bg-transparent" /></label></div></div>
          </section>
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Components</h2>
            {([["balcony", "Balcony (upper floors)", cfg.floors > 1 ? "" : "Needs 2+ floors"], ["porch", "Porch canopy", ""], ["chimney", "Chimney", ""], ["solar", "Solar panels", solarOk ? "" : "Not available on hip roofs"]] as const).map(([k, l, note]) => (
              <label key={k} className={`flex items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2 text-xs ${note ? "opacity-60" : ""}`}><span>{l}{note && <span className="ml-2 text-[10px] text-amber-300">{note}</span>}</span><input type="checkbox" checked={cfg[k] && !note} disabled={!!note} onChange={(e) => set(k, e.target.checked)} /></label>
            ))}
          </section>
        </aside>

        <div className="order-1 min-w-0 space-y-3 p-3 sm:p-4 lg:order-2">
          <Stage3D className="h-[52vh] min-h-[320px] lg:h-[62vh]" home={home} onReady={onReady} onPick={(o) => setSel((o?.userData.id as string | undefined) ?? null)} shadows label="3D model of the configurable house. Click a part to inspect it."
            toolbar={<>
              <span className="flex gap-0.5 rounded-md border border-slate-700 bg-slate-900/80 p-0.5">{Object.keys(views).map((v) => <button key={v} type="button" onClick={() => goView(v)} className={pill(false)}>{v}</button>)}</span>
              <span className="flex gap-0.5 rounded-md border border-slate-700 bg-slate-900/80 p-0.5">{([["shaded", "Shaded"], ["wire", "Wireframe"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className={pill(mode === k)}>{l}</button>)}</span>
            </>}>
            <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-slate-950/80 px-3 py-1.5 text-xs text-slate-200">{cfg.width} × {cfg.length} m · {cfg.floors} floor{cfg.floors > 1 ? "s" : ""} · {S.totalHeight.toFixed(1)} m high</div>
          </Stage3D>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <section className={card}><h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dimensions</h3><dl className="mt-2 space-y-1 text-xs">{[["Footprint", `${S.footprint.toFixed(0)} m²`], ["Gross internal area", `${S.gia.toFixed(0)} m²`], ["Total height", `${S.totalHeight.toFixed(1)} m`], ["Volume", `${S.volume.toFixed(0)} m³`]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl></section>
            <section className={card}><h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Envelope</h3><dl className="mt-2 space-y-1 text-xs">{[["Façade (gross)", `${S.faceGross.toFixed(0)} m²`], ["Cladding (net)", `${S.cladding.toFixed(0)} m²`], ["Windows", `${S.winCount} · ${S.winArea.toFixed(1)} m²`], ["Glazing ratio", `${(S.glazing * 100).toFixed(0)}%`], ["Roof area", `${S.roofArea.toFixed(0)} m²`]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl></section>
            <section className={card}><h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Components</h3><dl className="mt-2 space-y-1 text-xs">{[["Doors", String(S.doorCount)], ["Balconies", String(cfg.balcony ? cfg.floors - 1 : 0)], ["Porch canopy", cfg.porch ? "Yes" : "No"], ["Chimney", cfg.chimney ? "Yes" : "No"], ["Solar panels", String(S.panels)]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl><p className="mt-2 text-[11px] text-slate-500">{changes} change{changes === 1 ? "" : "s"} since {preset ? "preset" : "last preset"}</p></section>
            <section className={card}><h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Illustrative estimate</h3><p className="mt-2 font-display text-2xl font-semibold text-white">{gbp(S.total)}</p><details className="mt-1 text-xs"><summary className="cursor-pointer text-slate-400">Breakdown</summary><ul className="mt-1 space-y-0.5">{S.lines.filter((l) => l[1] > 0).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span>{gbp(v)}</span></li>)}</ul></details><p className="mt-2 text-[10px] leading-snug text-amber-300/80">Sample rates for illustration only. Not a construction quotation.</p></section>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <section className={card} aria-live="polite">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Selected component</h3>
              {!sel ? <p className="mt-2 text-xs text-slate-500">Click the façade, roof, windows, door or a component in the 3D view to see its properties.</p> : (
                <div className="mt-2"><p className="font-display text-base font-semibold text-white">{house?.parts[sel] ?? sel}</p><dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">{info(sel).map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-medium capitalize">{v}</dd></div>)}</dl><button type="button" onClick={() => setSel(null)} className={`${btn} mt-3`}>Clear selection</button></div>
              )}
            </section>
            <section className={`${card} flex flex-wrap items-start gap-2 md:w-72`}>
              <h3 className="w-full text-[11px] font-semibold uppercase tracking-wider text-slate-400">Export</h3>
              <button type="button" onClick={() => download("configuration-summary-sample.txt", summaryText())} className={btn}>Summary (.txt)</button>
              <button type="button" onClick={() => download("configuration-sample.json", JSON.stringify({ configuration: cfg, summary: { ...S, lines: S.lines } }, null, 2), "application/json")} className={btn}>Data (.json)</button>
              <button type="button" onClick={exportObj} className={btn}>3D model (.obj)</button>
            </section>
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
