"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import DemoShell from "./DemoShell";
import Stage3D, { type StageCtx, type View } from "./Stage3D";
import { Shape } from "./cadshape";
import { useCadView } from "./useCadView";
import { AMBER, BRAND, buildBimModel, buildGround, type C2b } from "./c2b3d";
import { BTN, CARD, FIELD, H3, LBL, PRIMARY, SEV, download, pill, stamp, toCsv } from "./ui";
import { DEFAULT_CFG, LAYER_COLOR, PROJECT, SRC_UNITS, TARGETS, buildSource, canConvert, convert, extents, inspectSource, rawOf, validateCfg, validateModel, type Bim, type Cfg, type Conv, type Finding, type Target } from "@/lib/demo-c2b-data";
import { len } from "@/lib/demo-cad-data";
import type { Branding } from "@/lib/types";

type St = "completed" | "attention" | "failed";
const STAGES = ["Source Drawing", "Units and Scale", "Layer Classification", "Geometry Inspection", "Element Mapping", "BIM Generation", "Model Validation", "Results and Export"];
const ST_CLS: Record<string, string> = { notstarted: "border-slate-700 text-slate-500", ready: "border-sky-500/60 text-sky-300", running: "border-blue-500 bg-blue-500/15 text-blue-200", completed: "border-emerald-500/60 text-emerald-300", attention: "border-amber-500/60 text-amber-300", failed: "border-red-500/60 text-red-300" };
const ST_LBL: Record<string, string> = { notstarted: "Not started", ready: "Ready", running: "In progress", completed: "Completed", attention: "Needs attention", failed: "Failed" };
const FIT = { x: -3, y: -4, w: 26, h: 19 };
const home = (c: C2b | null): View => { const s = c?.size ?? new THREE.Vector3(20, 3, 12), ce = c?.centre ?? new THREE.Vector3(10, 1.5, 6), d = Math.max(s.x, s.z) * 1.4 + 8; return { pos: [ce.x + d * 0.55, ce.y + d * 0.55, ce.z + d * 0.85], target: [ce.x, ce.y * 0.5, ce.z] }; };

export default function C2bStudio({ branding }: { branding: Branding }) {
  const ents = useMemo(() => buildSource(), []);
  const entMap = useMemo(() => new Map(ents.map((e) => [e.id, e])), [ents]);
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
  const [done, setDone] = useState<Partial<Record<number, St>>>({});
  const [running, setRunning] = useState<number | null>(null);
  const [active, setActive] = useState(1);
  const [inspection, setInspection] = useState<Finding[] | null>(null);
  const [plan, setPlan] = useState<Conv | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [validation, setValidation] = useState<Finding[] | null>(null);
  const [log, setLog] = useState<{ t: string; text: string }[]>([]);
  const [steps, setSteps] = useState<{ lines: string[]; i: number } | null>(null);
  const [msg, setMsg] = useState<string[]>([]);
  const [selSrc, setSelSrc] = useState<string | null>(null);
  const [selBim, setSelBim] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showStatus, setShowStatus] = useState(true);
  const [ctx, setCtx] = useState<StageCtx | null>(null);
  const [model, setModel] = useState<C2b | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const doneRef = useRef<Partial<Record<number, St>>>({});
  const convRef = useRef<Conv | null>(null);
  const cv = useCadView(FIT, 12);
  const say = (text: string) => setLog((l) => [{ t: stamp(), text }, ...l].slice(0, 80));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const status = (n: number) => (running === n ? "running" : done[n] ?? (n === 1 || done[n - 1] === "completed" || done[n - 1] === "attention" ? "ready" : "notstarted"));
  const cfgErr = useMemo(() => validateCfg(cfg), [cfg]);
  const ext = useMemo(() => extents(ents, cfg), [ents, cfg]);
  const layers = useMemo(() => { const m = new Map<string, { n: number; types: Map<string, number> }>(); for (const e of ents) { const r = m.get(e.layer) ?? m.set(e.layer, { n: 0, types: new Map() }).get(e.layer)!; r.n++; r.types.set(e.type, (r.types.get(e.type) ?? 0) + 1); } return [...m.entries()]; }, [ents]);
  const bimMap = useMemo(() => new Map((conv?.bim ?? []).map((b) => [b.id, b])), [conv]);
  const invalidate = (from: number) => { timers.current.forEach(clearTimeout); timers.current = []; setRunning(null); setSteps(null); setDone((d) => { const n = { ...d }; for (let i = from; i <= 8; i++) delete n[i]; doneRef.current = n; return n; }); if (from <= 6) convRef.current = null; if (from <= 4) setInspection(null); if (from <= 5) setPlan(null); if (from <= 6) { setConv(null); setSelBim(null); } if (from <= 7) setValidation(null); };
  const changeCfg = (p: Partial<Cfg>, from: number) => { setCfg((c) => ({ ...c, ...p })); if (done[from] || Object.keys(done).some((k) => +k >= from)) { invalidate(from); say("Settings changed: later stages were reset and must be run again."); } };

  // ---- stage actions ----
  const act = (n: number, immediate = false): Promise<St | "blocked"> => new Promise((resolve) => {
    const finish = (st: St, text: string) => { doneRef.current = { ...doneRef.current, [n]: st }; setDone(doneRef.current); setRunning(null); say(`${STAGES[n - 1]}: ${text}`); resolve(st); };
    const dn = doneRef.current; const prev = n === 1 || dn[n - 1] === "completed" || dn[n - 1] === "attention" || (n === 8 && dn[7] === "failed");
    if (!prev) { setMsg([`Complete “${STAGES[n - 2]}” first.`]); return resolve("blocked"); }
    setMsg([]); setRunning(n); setActive(n);
    const delay = immediate ? 60 : 380;
    const go = (fn: () => void, ms = delay) => { const t = setTimeout(fn, ms); timers.current.push(t); };
    if (n === 1) go(() => finish("completed", `source confirmed: ${ents.length} objects on ${layers.length} layers, drawn in ${PROJECT.declared.toLowerCase()}`));
    else if (n === 2) go(() => { const e = validateCfg(cfg); if (e.length) { setMsg(e); return finish("failed", e[0]); } const x = extents(ents, cfg); if (x.w < 3 || x.w > 300 || x.d < 3 || x.d > 300) { setMsg([`Converted plan size is ${x.w.toLocaleString()} × ${x.d.toLocaleString()} m, which is not a plausible building. Check the source units (the file declares ${PROJECT.declared}).`]); return finish("attention", `implausible size ${x.w.toLocaleString()} × ${x.d.toLocaleString()} m`); } finish("completed", `units valid: plan ${x.w.toFixed(2)} × ${x.d.toFixed(2)} m`); });
    else if (n === 3) go(() => { const un = layers.filter(([l]) => (cfg.map[l] ?? "Not mapped") === "Not mapped"); finish(un.length ? "attention" : "completed", un.length ? `${un.length} layer(s) left unmapped: ${un.map(([l]) => l).join(", ")}` : "all layers mapped"); });
    else if (n === 4) go(() => { const f = inspectSource(ents, cfg); setInspection(f); finish(f.some((x) => x.severity === "error") ? "attention" : f.length ? "attention" : "completed", `${f.length} finding(s) in the source geometry`); });
    else if (n === 5) go(() => { const p = convert(ents, cfg); setPlan(p); const uns = p.skipped.filter((s) => s.kind === "unsupported" || s.kind === "invalid").length; finish(uns ? "attention" : "completed", `${ents.length - p.skipped.length} objects map to ${p.bim.length - (p.bim.some((b) => b.cat === "Floors") ? 1 : 0)} elements; ${p.skipped.filter((s) => s.kind !== "annotation").length} will not convert`); });
    else if (n === 6) {
      const c = convert(ents, cfg), k = c.skipped.filter((s) => s.kind !== "annotation").length;
      const lines = [`Validated units (${cfg.srcUnits} × ${cfg.scale} → ${cfg.tgtUnits})`, `Read ${ents.length} source objects`, `Applied ${Object.values(cfg.map).filter((t) => t !== "Not mapped").length} layer mapping rules`, `Classified supported objects into BIM categories`, `Generated ${c.bim.length} BIM elements (including the slab)`, "Preserved dimensions and source identifiers", `Recorded ${k} unsupported, unmapped or invalid object${k === 1 ? "" : "s"}`, "Produced the conversion summary"];
      setSteps({ lines, i: 0 }); let i = 0;
      const tick = () => { i++; if (i < lines.length) { setSteps({ lines, i }); go(tick, immediate ? 40 : 260); } else { setConv(c); convRef.current = c; setSteps(null); finish(k ? "attention" : "completed", `${c.bim.length} BIM elements generated, ${k} object(s) not converted`); } };
      go(tick, immediate ? 40 : 260);
    }
    else if (n === 7) go(() => { const cc = convRef.current; if (!cc) { setRunning(null); setMsg(["Generate the BIM model first."]); return resolve("blocked"); } const f = validateModel(cc, ents, cfg); setValidation(f); finish(f.some((x) => x.severity === "error") ? "failed" : f.length ? "attention" : "completed", `${f.length} validation finding(s)`); });
    else go(() => finish("completed", "report compiled; exports are ready"));
  });
  const runAll = async () => { for (let n = 1; n <= 8; n++) { if (doneRef.current[n] === "completed" || (doneRef.current[n] && n < 8)) continue; const r = await act(n, true); if ((r === "failed" && n !== 7) || r === "blocked") break; await new Promise((r2) => setTimeout(r2, 90)); } };
  const reset = () => { timers.current.forEach(clearTimeout); timers.current = []; doneRef.current = {}; convRef.current = null; setCfg(DEFAULT_CFG); setDone({}); setRunning(null); setActive(1); setInspection(null); setPlan(null); setConv(null); setValidation(null); setLog([]); setSteps(null); setMsg([]); setSelSrc(null); setSelBim(null); setHidden(new Set()); cv.fit(); };

  // ---- 3D ----
  const onReady = (c: StageCtx) => {
    c.scene.background = new THREE.Color(0x0d130f); c.scene.add(new THREE.HemisphereLight(0xdfeee0, 0x1b241d, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(25, 35, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 100 }); c.scene.add(sun);
    buildGround(c.scene); setCtx(c);
  };
  useEffect(() => {
    if (!ctx) return;
    if (!conv) { setModel(null); return; }
    const m = buildBimModel(conv.bim, cfg.storey); ctx.pick.add(m.group); setModel(m);
    return () => { ctx.pick.remove(m.group); m.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); }); ctx.invalidate(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, conv]);
  useEffect(() => { if (ctx && model) { ctx.goto(home(model)); } }, [ctx, model]);
  const flaggedBim = useMemo(() => new Set((validation ?? []).flatMap((f) => f.bim ?? [])), [validation]);
  useEffect(() => {
    if (!ctx || !model) return;
    for (const [id, meshes] of model.byId) { const b = bimMap.get(id); const on = id === selBim; const fl = flaggedBim.has(id); const hide = !!b && hidden.has(b.cat);
      meshes.forEach((m) => { m.visible = !hide; const mt = m.material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial; if (mt.userData.base === undefined) mt.userData.base = mt.color.getHex(); if (b?.cat === "Rooms") { mt.opacity = on ? 0.5 : fl ? 0.35 : 0.08; mt.color.setHex(on ? BRAND : fl ? AMBER : BRAND); return; } mt.color.setHex(on ? BRAND : mt.userData.base); if (mt.emissive) { mt.emissive.setHex(on ? BRAND : fl ? AMBER : 0); mt.emissiveIntensity = on ? 0.55 : fl ? 0.4 : 0; } }); }
    ctx.invalidate();
  }, [ctx, model, bimMap, selBim, flaggedBim, hidden]);
  const onPick = (o: THREE.Object3D | null) => { const id = o?.userData.id as string | undefined; setSelBim(id ?? null); const b = id ? bimMap.get(id) : undefined; setSelSrc(b?.src ?? null); };
  const pickSrc = (id: string | null) => { setSelSrc(id); const b = id && conv ? conv.trace.get(id) : null; setSelBim(b ?? null); };
  const locate = (f: Finding) => { const s = f.src?.[0], b = f.bim?.[0]; if (s) { setSelSrc(s); const e = entMap.get(s); if (e) cv.zoomTo(e); } if (b) setSelBim(b); else if (s && conv?.trace.get(s)) setSelBim(conv.trace.get(s)!); };

  // ---- derived results ----
  const skippedReal = conv?.skipped.filter((s) => s.kind !== "annotation") ?? [];
  const M = conv ? { src: ents.length, mapped: ents.length - conv.skipped.length, gen: conv.bim.length, unmapped: conv.skipped.filter((s) => s.kind === "unmapped").length, unsupported: conv.skipped.filter((s) => s.kind === "unsupported" || s.kind === "invalid").length, ann: conv.skipped.filter((s) => s.kind === "annotation").length, findings: (validation ?? []).length } : null;
  const selSrcEnt = selSrc ? entMap.get(selSrc) ?? null : null;
  const selBimEl: Bim | null = selBim ? bimMap.get(selBim) ?? null : null;
  const skip = selSrc ? conv?.skipped.find((s) => s.id === selSrc) : undefined;
  const unit = cfg.tgtUnits === "Millimetres" ? { f: 1000, s: "mm" } : { f: 1, s: "m" };
  const fmtLen = (m: number) => `${(m * unit.f).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit.s}`;
  const reportTxt = () => [`${PROJECT.name}: CAD-to-BIM conversion report (SAMPLE DATA, simulated demonstration)`, `Source: ${PROJECT.file} (${cfg.srcUnits}, scale ${cfg.scale}) → ${cfg.tgtUnits}, storey ${cfg.storey} m`, `Source objects ${ents.length} · BIM elements ${conv?.bim.length ?? 0} · not converted ${skippedReal.length} · annotations kept ${M?.ann ?? 0}`, "", "Mapping rules:", ...Object.entries(cfg.map).map(([l, t]) => `  ${l} → ${t}`), "", "Source inspection:", ...(inspection ?? []).map((f) => `  [${f.severity}] ${f.check}: ${f.message}`), "", "Model validation:", ...(validation ?? []).map((f) => `  [${f.severity}] ${f.check}: ${f.message}`), "", "Not converted:", ...skippedReal.map((s) => `  ${s.id}: ${s.reason}`), "", "Note: this is a browser simulation on invented data. The BIM output is a JSON dataset, not an IFC or Revit file."].join("\n");
  const summaryCsv = () => toCsv([["Source layer", "Target category", "Objects", "Converted", "Not converted"], ...layers.map(([l, v]) => { const sk = conv?.skipped.filter((s) => entMap.get(s.id)?.layer === l).length ?? 0; return [l, cfg.map[l] ?? "Not mapped", v.n, conv ? v.n - sk : "", conv ? sk : ""]; })]);
  const findingsCsv = () => toCsv([["Stage", "Check", "Severity", "Message"], ...(inspection ?? []).map((f) => ["Inspection", f.check, f.severity, f.message]), ...(validation ?? []).map((f) => ["Validation", f.check, f.severity, f.message])]);
  const stageBtn = (n: number) => { const s = status(n); return <button key={n} type="button" onClick={() => setActive(n)} aria-current={active === n} className={`min-w-[8.5rem] flex-1 rounded-lg border px-3 py-2 text-left ${ST_CLS[s]} ${active === n ? "ring-1 ring-blue-400" : ""}`}><span className="block text-[10px] uppercase tracking-wider opacity-70">Stage {n}</span><span className="block text-xs font-semibold text-white">{STAGES[n - 1]}</span><span className="block text-[10px]">{ST_LBL[s]}</span></button>; };
  const visibleSrc = (e: (typeof ents)[number]) => !hidden.has(`L:${e.layer}`);
  const actBtn = (n: number, label: string) => <button type="button" className={PRIMARY} disabled={running !== null} onClick={() => void act(n)}>{running === n ? "Running…" : label}</button>;

  return (
    <DemoShell branding={branding} app="CAD-to-BIM Conversion & Validation Studio" project={`${PROJECT.name} · ${PROJECT.file}`} status={running ? `Running: ${STAGES[running - 1]}` : `Stage ${Math.max(1, ...Object.keys(done).map(Number))} of 8`}
      actions={<><button type="button" className={BTN} disabled={running !== null} onClick={() => void runAll()}>Run all stages</button><button type="button" className={BTN} onClick={reset}>Reset</button></>}>
      <div className="space-y-3 p-3 sm:p-4">
        <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Conversion workflow">{STAGES.map((_, i) => <li key={i} className="flex-1">{stageBtn(i + 1)}</li>)}</ol>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem_minmax(0,1fr)]">
          {/* SOURCE */}
          <section className="min-w-0 space-y-2" aria-label="Source CAD drawing">
            <div className="flex flex-wrap items-center gap-1.5"><h2 className={H3}>Source CAD drawing</h2><span className="ml-auto flex gap-0.5 rounded-md border border-slate-700 p-0.5"><button type="button" className={pill(cv.tool === "select")} onClick={() => cv.setTool("select")}>Select</button><button type="button" className={pill(cv.tool === "pan")} onClick={() => cv.setTool("pan")}>Pan</button></span><button type="button" className={BTN} aria-label="Zoom in" onClick={() => cv.zoomAt(0.8)}>＋</button><button type="button" className={BTN} aria-label="Zoom out" onClick={() => cv.zoomAt(1.25)}>－</button><button type="button" className={BTN} onClick={cv.fit}>Fit</button></div>
            <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#0a0f0c]">
              <svg ref={cv.svg} viewBox={`${cv.vb.x} ${cv.vb.y} ${cv.vb.w} ${cv.vb.h}`} className="block h-[44vh] min-h-[280px] w-full touch-none select-none" style={{ cursor: cv.tool === "pan" ? "grab" : "crosshair" }} role="img" aria-label="Source floor plan. Click an object to select it." {...cv.handlers} onClick={() => !cv.moved.current && pickSrc(null)}>
                <defs><pattern id="c2g" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#17221b" strokeWidth="0.02" /></pattern></defs>
                <rect x={-30} y={-30} width={90} height={80} fill="url(#c2g)" />
                {conv && showStatus && ents.filter(visibleSrc).map((e) => { const ok = conv.trace.has(e.id), ann = conv.skipped.find((s) => s.id === e.id)?.kind === "annotation"; if (ann) return null; return <g key={`u${e.id}`} pointerEvents="none" opacity={0.4} strokeDasharray={ok ? undefined : "0.3 0.2"}><Shape e={e} color={ok ? BRAND_S : RED_S} sw={6} /></g>; })}
                {inspection && ents.filter(visibleSrc).filter((e) => flagSrc(inspection).has(e.id)).map((e) => <g key={`f${e.id}`} pointerEvents="none" opacity={0.6}><Shape e={e} color="#f59e0b" sw={7} /></g>)}
                {ents.filter(visibleSrc).map((e) => <g key={e.id} onClick={(ev) => { ev.stopPropagation(); if (!cv.moved.current) pickSrc(e.id); }} style={{ cursor: "pointer" }}><Shape e={e} color={e.id === selSrc ? BRAND_S : LAYER_COLOR[e.layer] ?? "#fb923c"} sw={e.id === selSrc ? 2.6 : 1.25} /></g>)}
              </svg>
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-between bg-slate-950/80 px-3 py-1 font-mono text-[11px] text-slate-400"><span>{cv.cursor ? `X ${rawOf(cv.cursor[0]).toFixed(0)}  Y ${rawOf(cv.cursor[1]).toFixed(0)} ${cfg.srcUnits === "Millimetres" ? "mm" : "units"}` : "X —  Y —"}</span><span>{ents.length} objects</span></div>
            </div>
            <div className="flex flex-wrap gap-1.5">{layers.map(([l, v]) => <label key={l} className="flex items-center gap-1.5 rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px]"><input type="checkbox" checked={!hidden.has(`L:${l}`)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(`L:${l}`)) n.delete(`L:${l}`); else n.add(`L:${l}`); return n; })} aria-label={`Show layer ${l}`} /><span className="h-2 w-2 rounded-full" style={{ background: LAYER_COLOR[l] }} />{l} <span className="text-slate-500">{v.n}</span></label>)}</div>
            {conv && <label className="flex items-center gap-2 text-[11px] text-slate-400"><input type="checkbox" checked={showStatus} onChange={() => setShowStatus((v) => !v)} />Show conversion status (green converted, red dashed not converted)</label>}
            <div className={`${CARD} text-xs`} aria-live="polite"><h3 className={H3}>Selected source object</h3>
              {!selSrcEnt ? <p className="mt-2 text-slate-500">Click an object in the drawing.</p> : (
                <dl className="mt-2 space-y-1">{[["Id / handle", `${selSrcEnt.id} / ${selSrcEnt.handle}`], ["Type", selSrcEnt.type], ["Layer", selSrcEnt.layer], ["Position", `${rawOf(selSrcEnt.x1).toFixed(0)}, ${rawOf(selSrcEnt.y1).toFixed(0)} (drawing units)`], ["Length / size", selSrcEnt.x2 !== undefined ? `${rawOf(len(selSrcEnt)).toFixed(0)} units` : selSrcEnt.w ? `${rawOf(selSrcEnt.w).toFixed(0)} × ${rawOf(selSrcEnt.h ?? selSrcEnt.w).toFixed(0)} units` : "—"], ["Mapped to", cfg.map[selSrcEnt.layer] ?? "Not mapped"]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-mono text-slate-200">{v}</dd></div>)}
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Conversion</dt><dd className="text-right">{!conv ? <span className="text-slate-500">not generated yet</span> : conv.trace.has(selSrcEnt.id) ? <button type="button" onClick={() => setSelBim(conv.trace.get(selSrcEnt.id)!)} className="font-mono text-blue-300 hover:underline">→ {conv.trace.get(selSrcEnt.id)}</button> : <span className="text-amber-300">{skip?.reason ?? "not converted"}</span>}</dd></div></dl>)}
            </div>
          </section>

          {/* STAGE PANEL */}
          <section className={`${CARD} min-w-0 space-y-3 text-xs`} aria-label="Conversion stage" aria-live="polite">
            <div className="flex items-center justify-between"><h2 className="font-display text-base font-semibold text-white">{active}. {STAGES[active - 1]}</h2><span className={`rounded-full border px-2 py-0.5 text-[10px] ${ST_CLS[status(active)]}`}>{ST_LBL[status(active)]}</span></div>
            {msg.length > 0 && <ul role="alert" className="space-y-1">{msg.map((m, i) => <li key={i} className="rounded bg-amber-500/10 px-3 py-2 text-amber-200">{m}</li>)}</ul>}
            {active === 1 && <div className="space-y-2"><dl className="space-y-1 rounded border border-slate-800 bg-slate-950 p-3">{[["File", PROJECT.file], ["Declared units", PROJECT.declared], ["Objects", ents.length], ["Layers", layers.length]].map(([k, v]) => <div key={String(k)} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-mono text-slate-200">{v}</dd></div>)}</dl><p className="text-slate-400">A sample plan of a small office, represented as CAD objects with layers. Review the drawing, then confirm it as the source.</p>{actBtn(1, "Confirm source drawing")}</div>}
            {active === 2 && <div className="space-y-2.5">
              <div><label className={LBL} htmlFor="su">Source drawing units</label><select id="su" value={cfg.srcUnits} onChange={(e) => changeCfg({ srcUnits: e.target.value }, 2)} className={FIELD}>{SRC_UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
              <div><label className={LBL} htmlFor="sc">Scale factor</label><input id="sc" inputMode="decimal" defaultValue={cfg.scale} key={cfg.scale} onBlur={(e) => { const v = Number(e.target.value); changeCfg({ scale: Number.isFinite(v) ? v : NaN }, 2); }} aria-invalid={!(cfg.scale > 0)} className={`${FIELD} ${!(cfg.scale > 0) ? "border-red-500" : ""}`} /></div>
              <div><label className={LBL} htmlFor="tu">Target model units</label><select id="tu" value={cfg.tgtUnits} onChange={(e) => changeCfg({ tgtUnits: e.target.value as Cfg["tgtUnits"] }, 2)} className={FIELD}><option>Metres</option><option>Millimetres</option></select></div>
              <div><label className={LBL} htmlFor="sh">Storey height (m)</label><input id="sh" inputMode="decimal" defaultValue={cfg.storey} key={cfg.storey} onBlur={(e) => changeCfg({ storey: Number(e.target.value) }, 2)} className={FIELD} /></div>
              {cfgErr.length > 0 ? <ul role="alert">{cfgErr.map((e, i) => <li key={i} className="rounded bg-red-500/10 px-3 py-2 text-red-200">✗ {e}</li>)}</ul> : <p className="rounded bg-slate-950 px-3 py-2 text-slate-300">Plan size after conversion: <b className="text-white">{ext.w.toLocaleString(undefined, { maximumFractionDigits: 2 })} × {ext.d.toLocaleString(undefined, { maximumFractionDigits: 2 })} m</b>. Level 1 at 0.00 m, storey {cfg.storey} m.</p>}
              {actBtn(2, "Validate units and scale")}</div>}
            {active === 3 && <div className="space-y-2"><p className="text-slate-400">Map each source layer to a BIM category. Changing a mapping changes what is generated.</p>
              {layers.map(([l, v]) => { const t = cfg.map[l] ?? "Not mapped"; const bad = [...v.types.keys()].filter((ty) => t !== "Not mapped" && !canConvert(ty, t)); return (
                <div key={l} className={`rounded border p-2 ${t === "Not mapped" ? "border-amber-500/40" : bad.length ? "border-red-500/40" : "border-slate-800"} bg-slate-950`}><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLOR[l] }} /><span className="flex-1 font-mono text-slate-100">{l}</span><span className="text-slate-500">{v.n}</span><select aria-label={`Target for layer ${l}`} value={t} onChange={(e) => changeCfg({ map: { ...cfg.map, [l]: e.target.value as Target } }, 3)} className={`${FIELD} w-32`}>{TARGETS.map((x) => <option key={x}>{x}</option>)}</select></div>
                  <p className="mt-1 text-[10px] text-slate-500">{[...v.types.entries()].map(([ty, nn]) => `${nn} ${ty}`).join(", ")}</p>{t === "Not mapped" && <p className="text-[11px] text-amber-300">⚠ Unmapped: these objects will not be converted.</p>}{bad.length > 0 && <p className="text-[11px] text-red-300">✗ {bad.join(", ")} objects cannot become {t}.</p>}</div>); })}
              {actBtn(3, "Apply mapping")}</div>}
            {active === 4 && <div className="space-y-2">{!inspection ? <p className="text-slate-400">Inspect the source geometry for problems before conversion.</p> : <FindingList f={inspection} onPick={locate} />}{actBtn(4, inspection ? "Run inspection again" : "Run geometry inspection")}</div>}
            {active === 5 && <div className="space-y-2">{!plan ? <p className="text-slate-400">Build the mapping: decide, object by object, which BIM category each source object becomes.</p> : (<><table className="w-full"><thead className="text-slate-500"><tr><th className="text-left font-medium">BIM category</th><th className="text-right font-medium">From source</th></tr></thead><tbody>{(["Walls", "Doors", "Windows", "Rooms", "Columns", "Floors"] as const).map((c) => <tr key={c} className="border-t border-slate-800"><td className="py-1">{c}</td><td className="py-1 text-right font-mono">{plan.bim.filter((b) => b.cat === c).length}{c === "Floors" ? " (generated)" : ""}</td></tr>)}</tbody></table>
              <h3 className={H3}>Will not convert ({plan.skipped.filter((s) => s.kind !== "annotation").length})</h3><ul className="max-h-40 space-y-1 overflow-auto">{plan.skipped.filter((s) => s.kind !== "annotation").map((s) => <li key={s.id}><button type="button" onClick={() => { pickSrc(s.id); const e = entMap.get(s.id); if (e) cv.zoomTo(e); }} className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-left hover:border-blue-500"><span className="font-mono">{s.id}</span> {s.reason}</button></li>)}</ul>
              <p className="text-slate-500">{plan.skipped.filter((s) => s.kind === "annotation").length} annotation objects stay in the drawing.</p></>)}{actBtn(5, plan ? "Rebuild mapping" : "Build element mapping")}</div>}
            {active === 6 && <div className="space-y-2">{steps ? <ol className="space-y-1">{steps.lines.map((l, i) => <li key={i} className={i < steps.i ? "text-emerald-300" : i === steps.i ? "text-white" : "text-slate-600"}>{i < steps.i ? "✓" : i === steps.i ? "…" : "·"} {l}</li>)}</ol> : conv ? <p className="rounded bg-blue-500/10 px-3 py-2 text-blue-200">Generated {conv.bim.length} BIM elements from {ents.length - conv.skipped.length} source objects. Select an element in the 3D model to trace it back to its source.</p> : <p className="text-slate-400">Transform the sample source records into BIM element records using the units, scale and mapping rules.</p>}{actBtn(6, conv ? "Regenerate BIM model" : "Generate BIM model")}</div>}
            {active === 7 && <div className="space-y-2">{!validation ? <p className="text-slate-400">Check the generated BIM dataset: required properties, identifiers, dimensions, levels, hosts and source/target counts.</p> : validation.length === 0 ? <p className="rounded bg-blue-500/10 px-3 py-2 text-blue-200">✓ All validation checks passed.</p> : <FindingList f={validation} onPick={locate} />}{actBtn(7, validation ? "Validate again" : "Validate BIM model")}</div>}
            {active === 8 && <div className="space-y-2">{M ? <div className="grid grid-cols-2 gap-2">{[["Source objects", M.src], ["Mapped and converted", M.src - M.ann - skippedReal.length], ["BIM elements", M.gen], ["Unmapped", M.unmapped], ["Unsupported / invalid", M.unsupported], ["Annotations kept", M.ann], ["Validation findings", validation ? M.findings : "—"], ["Status", skippedReal.length || (validation ?? []).some((f) => f.severity === "error") ? "Needs review" : "Converted"]].map(([k, v]) => <div key={String(k)} className="rounded border border-slate-800 bg-slate-950 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p><p className="font-display text-base font-semibold text-white">{v}</p></div>)}</div> : <p className="text-slate-400">Generate the BIM model to see the conversion results.</p>}
              {actBtn(8, "Compile report")}
              {done[8] && <div className="space-y-2 border-t border-slate-800 pt-2"><div className="flex flex-wrap gap-2"><button type="button" className={PRIMARY} onClick={() => download("conversion-report-sample.txt", reportTxt())}>Report (.txt)</button><button type="button" className={BTN} onClick={() => download("conversion-summary-sample.csv", summaryCsv(), "text/csv")}>Summary (.csv)</button><button type="button" className={BTN} onClick={() => download("validation-findings-sample.csv", findingsCsv(), "text/csv")}>Findings (.csv)</button><button type="button" className={BTN} onClick={() => download("mapping-rules-sample.json", JSON.stringify(cfg, null, 2), "application/json")}>Mapping rules (.json)</button><button type="button" className={BTN} disabled={!conv} onClick={() => download("bim-elements-sample.json", JSON.stringify(conv?.bim, null, 2), "application/json")}>BIM elements (.json)</button></div><p className="text-[10px] text-slate-500">The BIM output is a JSON dataset of sample elements. It is not an IFC or Revit file.</p></div>}</div>}
            <div className="border-t border-slate-800 pt-2"><h3 className={H3}>Pipeline log</h3><ul className="mt-1 max-h-28 space-y-0.5 overflow-auto font-mono text-[13px] text-slate-400">{log.map((l, i) => <li key={i}><span className="text-slate-600">{l.t}</span> {l.text}</li>)}{!log.length && <li className="text-slate-600">Nothing has run yet.</li>}</ul></div>
          </section>

          {/* BIM */}
          <section className="min-w-0 space-y-2" aria-label="Generated BIM model">
            <div className="flex items-center gap-2"><h2 className={H3}>Generated BIM model</h2>{conv && <span className="text-[11px] text-slate-500">{conv.bim.length} elements</span>}</div>
            <Stage3D className="h-[44vh] min-h-[280px]" home={home(model)} onReady={onReady} onPick={onPick} shadows label="Generated 3D BIM model. Click an element to trace it to the source drawing.">
              {!conv && <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">The BIM model appears here after stage 6 (BIM Generation).</div>}
            </Stage3D>
            {conv && <div className="flex flex-wrap gap-1.5">{(["Walls", "Doors", "Windows", "Columns", "Rooms", "Floors"] as const).map((c) => <label key={c} className="flex items-center gap-1.5 rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px]"><input type="checkbox" checked={!hidden.has(c)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; })} />{c} <span className="text-slate-500">{conv.bim.filter((b) => b.cat === c).length}</span></label>)}</div>}
            <div className={`${CARD} text-xs`} aria-live="polite"><h3 className={H3}>Selected BIM element</h3>
              {!selBimEl ? <p className="mt-2 text-slate-500">{conv ? "Click an element in the 3D model." : "No model generated yet."}</p> : (
                <dl className="mt-2 space-y-1">{[["Element", `${selBimEl.id} · ${selBimEl.cat}`], ["Name", selBimEl.name], ["Level", selBimEl.level], ["Width / length", `${fmtLen(selBimEl.cat === "Walls" ? selBimEl.length : selBimEl.width)}`], ["Height", fmtLen(selBimEl.cat === "Doors" ? 2.1 : selBimEl.cat === "Windows" ? 1.5 : selBimEl.height)], ["Thickness", selBimEl.thickness ? fmtLen(selBimEl.thickness) : "—"], ["Area", `${(selBimEl.area).toFixed(2)} m²`], ["Material", selBimEl.material || "—"], ["Classification", selBimEl.classification || "—"], ["Host wall", selBimEl.host ?? "—"]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-mono text-slate-200">{v}</dd></div>)}
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Source</dt><dd className="text-right">{selBimEl.src ? <button type="button" onClick={() => { setSelSrc(selBimEl.src); const e = entMap.get(selBimEl.src!); if (e) cv.zoomTo(e); }} className="font-mono text-blue-300 hover:underline">{selBimEl.src} · {selBimEl.srcHandle}</button> : <span className="text-slate-400">generated</span>}</dd></div>
                  {selBimEl.inferred && <p className="rounded bg-amber-500/10 px-2 py-1.5 text-amber-200">{selBimEl.inferred}</p>}</dl>)}
            </div>
          </section>
        </div>
        <p className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] leading-snug text-slate-400">Browser simulation on an invented drawing: the transformation, counts and validation are computed from the sample objects, and the output is a JSON dataset. It does not read DWG or DXF files, and it does not produce IFC or Revit files.</p>
      </div>
    </DemoShell>
  );
}
const BRAND_S = "#55b52b", RED_S = "#f87171";
const flagSrc = (f: Finding[]) => new Set(f.flatMap((x) => x.src ?? []));
function FindingList({ f, onPick }: { f: Finding[]; onPick: (x: Finding) => void }) {
  if (!f.length) return <p className="rounded bg-blue-500/10 px-3 py-2 text-blue-200">✓ No findings.</p>;
  const groups = new Map<string, Finding[]>(); f.forEach((x) => (groups.get(x.check) ?? groups.set(x.check, []).get(x.check)!).push(x));
  return <div className="max-h-72 space-y-2 overflow-auto">{[...groups.entries()].map(([c, l]) => <div key={c}><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c} ({l.length})</p><ul className="mt-1 space-y-1">{l.map((x, i) => <li key={i}><button type="button" onClick={() => onPick(x)} className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-left hover:border-blue-500"><span className={`mr-1.5 rounded px-1 text-[10px] font-semibold uppercase ${SEV[x.severity]}`}>{x.severity}</span>{x.message}</button></li>)}</ul></div>)}</div>;
}
