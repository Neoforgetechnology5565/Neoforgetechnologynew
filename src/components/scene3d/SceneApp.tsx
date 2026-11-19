"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Branding } from "@/lib/types";
import { CLASSES, CLASS_LABEL, CLASS_NAME, DEFAULT_COLORS, SCENE_IDS, SCENE_INFO, STRUCTURAL, type Cls } from "@/lib/scene3d/scenes";
import { boxOf, relations, type Box } from "@/lib/scene3d/stats";
import type { SceneResult } from "@/lib/scene3d/worker";
import { PcViewer } from "@/components/pc/PcViewer";
import PcShell, { Badge, BTN, CARD, GO, H3, INPUT, TAB } from "@/components/pc/PcShell";

type Source = "reference" | "computed"; type Colour = "semantic" | "instance" | "rgb";
const f = (v: number, d = 2) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const nm = (c: Cls, i: number) => `${CLASS_NAME[c]} ${String(i).padStart(3, "0")}`;
const hsl = (id: number) => new THREE.Color().setHSL(((id * 0.618034) % 1), 0.7, 0.55);

export default function SceneApp({ branding }: { branding: Branding }) {
  const host = useRef<HTMLDivElement>(null), viewer = useRef<PcViewer | null>(null), worker = useRef<Worker | null>(null), runId = useRef(0);
  const objs = useRef<{ points?: THREE.Points; boxes: Map<number, THREE.Box3Helper>; boxGroup?: THREE.Group }>({ boxes: new Map() });
  const [sceneId, setSceneId] = useState("office"), [state, setState] = useState<"idle" | "running" | "done" | "error">("idle"), [progress, setProgress] = useState({ stage: "", fraction: 0 }), [error, setError] = useState(""), [data, setData] = useState<SceneResult | null>(null);
  const [source, setSource] = useState<Source>("reference"), [colourBy, setColourBy] = useState<Colour>("semantic"), [colors, setColors] = useState<Record<Cls, string>>({ ...DEFAULT_COLORS }), [on, setOn] = useState<Record<Cls, boolean>>(() => Object.fromEntries(CLASSES.map((c) => [c, true])) as Record<Cls, boolean>);
  const [showBoxes, setShowBoxes] = useState(false), [ptSize, setPtSize] = useState(2.5), [selected, setSelected] = useState<number | null>(null), [hover, setHover] = useState<number | null>(null), [hidden, setHidden] = useState<Set<number>>(new Set()), [isolate, setIsolate] = useState(false);

  useEffect(() => { if (!host.current) return; const v = new PcViewer(host.current, { background: 0x0b1220 }); viewer.current = v; v.pointPickRadius = 0.07; return () => { v.dispose(); viewer.current = null; }; }, []);
  useEffect(() => () => worker.current?.terminate(), []);
  const load = (id: string) => {
    worker.current?.terminate(); const rid = ++runId.current, w = new Worker(new URL("../../lib/scene3d/worker.ts", import.meta.url), { type: "module" }); worker.current = w; setState("running"); setError(""); setProgress({ stage: "Starting", fraction: 0 });
    w.onerror = (e) => { setState("error"); setError(e.message || "The worker failed."); };
    w.onmessage = (ev) => { const m = ev.data; if (m.id !== rid) return; if (m.type === "progress") setProgress({ stage: m.stage, fraction: m.fraction }); else if (m.type === "done") { setData({ scene: m.scene, seg: m.seg, evaluation: m.evaluation }); setSelected(null); setHover(null); setHidden(new Set()); setIsolate(false); setState("done"); w.terminate(); } else if (m.type === "error") { setState("error"); setError(m.message); w.terminate(); } };
    w.postMessage({ id: rid, scene: id });
  };
  useEffect(() => { load("office"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // labels in use: the scene's reference labels, or the result of the computed segmentation
  const lab = useMemo(() => {
    if (!data) return null; const s = data.scene, ref = source === "reference", cls = ref ? s.cls : data.seg.cls, inst = ref ? s.inst : data.seg.inst;
    const meta = new Map<number, { cls: Cls; index: number; score: number | null; checks: string[] }>();
    if (ref) for (const i of s.instances) meta.set(i.id, { cls: i.cls, index: i.index, score: null, checks: [] }); else for (const i of data.seg.instances) meta.set(i.id, { cls: i.cls, index: i.index, score: i.score, checks: i.checks });
    const idx = new Map<number, number[]>(); for (let i = 0; i < inst.length; i++) if (inst[i] > 0) { const a = idx.get(inst[i]); if (a) a.push(i); else idx.set(inst[i], [i]); }
    const boxes = new Map<number, Box>(); for (const [id, a] of idx) boxes.set(id, boxOf(s.pos, a));
    return { cls, inst, meta, idx, boxes };
  }, [data, source]);

  // build the point cloud once per dataset
  useEffect(() => {
    const v = viewer.current; if (!v || !data) return; const o = objs.current, s = data.scene;
    if (o.points) { o.points.parent?.remove(o.points); o.points.geometry.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(s.pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(s.pos.length), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: false, vertexColors: true })); pts.frustumCulled = false; v.left.add(pts); o.points = pts;
    const [a, b] = [s.bbox.min, s.bbox.max]; const box = new THREE.Box3(new THREE.Vector3(...a), new THREE.Vector3(...b)); const grid = new THREE.GridHelper(Math.max(b[0] - a[0], b[2] - a[2]) * 1.2, 20, 0x334155, 0x1e293b); grid.position.set((a[0] + b[0]) / 2, a[1] - 0.02, (a[2] + b[2]) / 2); v.left.add(grid);
    v.fit(box, new THREE.Vector3(0.9, 0.7, 1.1)); v.invalidate();
    v.setPicking(() => (o.points ? [o.points] : []), (e, hit) => { const i = hit?.index; const id = i === undefined ? null : (labRef.current?.inst[i] ?? 0); setSelected(id && id > 0 ? id : null); });
    return () => { grid.parent?.remove(grid); grid.geometry.dispose(); };
  }, [data]);
  const labRef = useRef(lab); labRef.current = lab;

  // hover highlight: ray cast on pointer move, one per animation frame
  useEffect(() => {
    const v = viewer.current, el = v?.renderer.domElement; if (!v || !el) return; let raf = 0, last: PointerEvent | null = null;
    const move = (e: PointerEvent) => { last = e; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (!last || !objs.current.points) return; const hit = v.pick(last), i = hit?.index, id = i === undefined ? 0 : (labRef.current?.inst[i] ?? 0); setHover(id > 0 ? id : null); }); };
    const leave = () => setHover(null); el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave); return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, []);

  // visibility (index buffer) and colours
  useEffect(() => {
    const v = viewer.current, o = objs.current; if (!v || !data || !lab || !o.points) return; const s = data.scene, n = s.cls.length, col = o.points.geometry.getAttribute("color") as THREE.BufferAttribute, c = col.array as Float32Array, vis: number[] = [];
    const cc = Object.fromEntries(CLASSES.map((k) => [k, new THREE.Color(colors[k])])) as Record<Cls, THREE.Color>, iso = isolate && selected !== null;
    for (let i = 0; i < n; i++) {
      const id = lab.inst[i], k = CLASSES[lab.cls[i]]; if (!on[k] || hidden.has(id) || (iso && id !== selected)) continue; vis.push(i);
      let r: number, g: number, b: number;
      if (colourBy === "rgb") { r = s.rgb[i * 3] / 255; g = s.rgb[i * 3 + 1] / 255; b = s.rgb[i * 3 + 2] / 255; } else if (colourBy === "instance") { const q = id > 0 && !STRUCTURAL.includes(k) ? hsl(id) : new THREE.Color(0x64748b); r = q.r; g = q.g; b = q.b; } else { const q = cc[k]; r = q.r; g = q.g; b = q.b; }
      if (id > 0 && id === selected) { r = Math.min(1, r * 0.5 + 0.6); g = Math.min(1, g * 0.5 + 0.6); b = Math.min(1, b * 0.5 + 0.6); } else if (id > 0 && id === hover) { r = Math.min(1, r + 0.3); g = Math.min(1, g + 0.3); b = Math.min(1, b + 0.3); }
      c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
    }
    o.points.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(vis), 1)); col.needsUpdate = true; (o.points.material as THREE.PointsMaterial).size = ptSize; v.invalidate();
  }, [data, lab, colors, on, colourBy, hidden, isolate, selected, hover, ptSize]);

  // bounding boxes
  useEffect(() => {
    const v = viewer.current, o = objs.current; if (!v) return; o.boxGroup?.parent?.remove(o.boxGroup); o.boxes.clear(); if (!lab || !showBoxes) { v.invalidate(); return; }
    const grp = new THREE.Group(); for (const [id, b] of lab.boxes) { const m = lab.meta.get(id); if (!m || STRUCTURAL.includes(m.cls) || !on[m.cls] || hidden.has(id)) continue; const h = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)), new THREE.Color(id === selected ? "#ffffff" : colors[m.cls])); grp.add(h); o.boxes.set(id, h); }
    v.left.add(grp); o.boxGroup = grp; v.invalidate(); return () => { grp.parent?.remove(grp); };
  }, [lab, showBoxes, on, hidden, selected, colors]);

  const sel = selected !== null ? lab?.meta.get(selected) : undefined, selBox = selected !== null ? lab?.boxes.get(selected) : undefined, hov = hover !== null ? lab?.meta.get(hover) : undefined;
  const stats = useMemo(() => {
    if (!data || !lab) return null; const n = data.scene.cls.length, counts = new Array(CLASSES.length).fill(0); for (let i = 0; i < n; i++) counts[lab.cls[i]]++;
    const objects = [...lab.meta].filter(([, m]) => !STRUCTURAL.includes(m.cls)), byCat = new Map<Cls, number>(); for (const [, m] of objects) byCat.set(m.cls, (byCat.get(m.cls) ?? 0) + 1);
    const s = data.scene.bbox, vol = (s.max[0] - s.min[0]) * (s.max[1] - s.min[1]) * (s.max[2] - s.min[2]), structural = CLASSES.reduce((a, c, k) => a + (STRUCTURAL.includes(c) ? counts[k] : 0), 0);
    const skip = new Set(objects.length ? [] : []), rel = relations(new Map(objects.map(([id]) => [id, lab.boxes.get(id)!]).filter((x) => x[1]) as [number, Box][]), skip);
    return { n, counts, objects: objects.length, byCat, density: n / vol, vol, structural, rel };
  }, [data, lab]);
  const resetView = () => { setOn(Object.fromEntries(CLASSES.map((c) => [c, true])) as Record<Cls, boolean>); setHidden(new Set()); setIsolate(false); setSelected(null); setColors({ ...DEFAULT_COLORS }); if (data) { const b = data.scene.bbox; viewer.current?.fit(new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)), new THREE.Vector3(0.9, 0.7, 1.1)); } };
  const ev = data?.evaluation;
  const name = (id: number) => { const m = lab?.meta.get(id); return m ? nm(m.cls, m.index) : `#${id}`; };

  return (
    <PcShell branding={branding} title="3D Point Cloud Segmentation & Scene Understanding" project={data?.scene.label ?? "Loading scene"} status={state === "running" ? "Processing…" : state === "done" ? "Ready" : "Idle"}
      notice="Sample data: the scenes are generated by code from simple shapes (no real scan). Reference labels come from the generator. The computed segmentation is classical geometry (surface normals, height histogram, plane fitting, connected components and size rules) with no neural network; it is scored against the reference labels, so its accuracy applies to this synthetic data only."
      footer="Working: five generated scenes, 11 semantic classes, instance IDs, hover and click picking, inspector, class filters and colours, bounding boxes, hide/isolate, scene statistics, spatial relations, a computed segmentation with accuracy, mIoU and a confusion matrix. Not implemented: real scans, learned models, upload of your own point clouds."
      actions={<Badge ok={null}>{data ? `${(data.scene.pos.length / 3).toLocaleString()} points` : ""}</Badge>}>
      {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" data-testid="error">{error}</div>}
      <div className="grid gap-3 xl:grid-cols-[290px_minmax(0,1fr)_340px]">
        <aside className="space-y-3">
          <section className={CARD}><h2 className={H3}>Scene</h2>
            <select className={`${INPUT} mt-2 w-full`} value={sceneId} onChange={(e) => { setSceneId(e.target.value); load(e.target.value); }} data-testid="scene">{SCENE_IDS.map((id) => <option key={id} value={id}>{SCENE_INFO[id].label}</option>)}</select>
            <p className="mt-2 text-[11px] text-slate-400" data-testid="scene-desc">{SCENE_INFO[sceneId].description}</p>
            <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Labels shown</h3>
            <div className="mt-1 flex gap-1">{(["reference", "computed"] as Source[]).map((s) => <button key={s} className={TAB(source === s)} onClick={() => setSource(s)} data-testid={`source-${s}`}>{s === "reference" ? "Reference labels" : "Computed segmentation"}</button>)}</div>
            <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Colour by</h3>
            <div className="mt-1 flex flex-wrap gap-1">{(["semantic", "instance", "rgb"] as Colour[]).map((c) => <button key={c} className={TAB(colourBy === c)} onClick={() => setColourBy(c)} data-testid={`colour-${c}`}>{{ semantic: "Semantic class", instance: "Instance", rgb: "Original colour" }[c]}</button>)}</div>
          </section>
          <section className={CARD}><h2 className={H3}>Classes</h2>
            <ul className="mt-2 space-y-1" data-testid="classes">{CLASSES.map((c, k) => <li key={c} className="flex items-center gap-2 text-xs text-slate-200"><input type="checkbox" checked={on[c]} onChange={(e) => setOn({ ...on, [c]: e.target.checked })} aria-label={`Show ${CLASS_LABEL[c]}`} data-testid={`cls-${c}`} />
              <input type="color" value={colors[c]} onChange={(e) => setColors({ ...colors, [c]: e.target.value })} className="h-5 w-6 cursor-pointer rounded border border-slate-700 bg-transparent p-0" aria-label={`Colour of ${CLASS_LABEL[c]}`} data-testid={`col-${c}`} />
              <span className="flex-1">{CLASS_LABEL[c]}</span><span className="tabular-nums text-slate-500" data-testid={`n-${c}`}>{stats ? stats.counts[k].toLocaleString() : ""}</span></li>)}</ul>
          </section>
          <section className={CARD}><h2 className={H3}>View</h2>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} data-testid="t-boxes" /> Bounding boxes</label>
            <label className="mt-2 flex items-center justify-between text-xs text-slate-300">Point size<input type="range" min={1} max={6} step={0.5} value={ptSize} onChange={(e) => setPtSize(Number(e.target.value))} className="w-28 accent-blue-500" data-testid="ptsize" /></label>
            <div className="mt-3 flex gap-2"><button className={`${BTN} flex-1`} onClick={resetView} data-testid="reset">Reset view</button></div>
          </section>
        </aside>
        <section className="space-y-2" aria-label="3D viewer">
          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950" style={{ height: "min(64vh, 620px)", minHeight: 340 }}>
            <div ref={host} className="absolute inset-0" data-testid="viewport" />
            {state === "running" && <div className="absolute inset-x-0 bottom-0 bg-slate-900/90 p-3" role="status" data-testid="progress"><p className="text-xs text-slate-200">{progress.stage}… {Math.round(progress.fraction * 100)}%</p><div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${progress.fraction * 100}%` }} /></div></div>}
            {hov && hover !== null && <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/85 px-2 py-1 text-[11px] text-slate-100" data-testid="hover">{name(hover)}</div>}
            {!hov && <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400">Hover to highlight, click to inspect</div>}
          </div>
        </section>
        <aside className="space-y-3" aria-label="Analysis">
          <section className={CARD} data-testid="inspector"><h2 className={H3}>Object inspector</h2>
            {sel && selBox && selected !== null ? (<>
              <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1 text-xs"><dt className="text-slate-400">Name</dt><dd data-testid="i-name">{nm(sel.cls, sel.index)}</dd>
                <dt className="text-slate-400">Category</dt><dd data-testid="i-cat">{CLASS_NAME[sel.cls]}</dd><dt className="text-slate-400">Object ID</dt><dd data-testid="i-id">{selected}</dd>
                <dt className="text-slate-400">Points</dt><dd data-testid="i-points">{selBox.points.toLocaleString()}</dd>
                <dt className="text-slate-400">Dimensions (W × H × D)</dt><dd data-testid="i-dim">{f(selBox.size[0])} × {f(selBox.size[1])} × {f(selBox.size[2])} m</dd>
                <dt className="text-slate-400">Centre (x, y, z)</dt><dd>{selBox.center.map((x) => f(x)).join(", ")} m</dd>
                <dt className="text-slate-400">Box min</dt><dd>{selBox.min.map((x) => f(x)).join(", ")}</dd><dt className="text-slate-400">Box max</dt><dd>{selBox.max.map((x) => f(x)).join(", ")}</dd>
                <dt className="text-slate-400">Confidence</dt><dd data-testid="i-conf">{sel.score === null ? "Reference label (generator)" : `${(sel.score * 100).toFixed(0)}% rule match`}</dd></dl>
              {sel.checks.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Why: {sel.checks.join("; ")}</p>}
              <div className="mt-3 flex flex-wrap gap-1"><button className={BTN} onClick={() => setHidden(new Set(hidden).add(selected))} data-testid="hide">Hide</button><button className={isolate ? GO : BTN} onClick={() => setIsolate((x) => !x)} data-testid="isolate">{isolate ? "Show all" : "Isolate"}</button><button className={BTN} onClick={() => setSelected(null)} data-testid="deselect">Deselect</button></div>
            </>) : <p className="mt-2 text-xs text-slate-400" data-testid="i-empty">Click an object or surface in the viewer. Walls, floors and ceilings are shared surfaces and have no instance box.</p>}
            {hidden.size > 0 && <button className={`${BTN} mt-2`} onClick={() => setHidden(new Set())} data-testid="unhide">Show {hidden.size} hidden object(s)</button>}
          </section>
          {stats && (<>
            <section className={CARD} data-testid="analytics"><h2 className={H3}>Scene analytics</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><dt className="text-slate-400">Objects</dt><dd data-testid="a-objects">{stats.objects}</dd><dt className="text-slate-400">Categories</dt><dd data-testid="a-cats">{stats.byCat.size}</dd>
                <dt className="text-slate-400">Point density</dt><dd>{f(stats.density, 0)} pts/m³</dd><dt className="text-slate-400">Scene volume</dt><dd>{f(stats.vol, 0)} m³</dd>
                <dt className="text-slate-400">Structure / objects</dt><dd data-testid="a-comp">{pct(stats.structural / stats.n)} / {pct(1 - stats.structural / stats.n)}</dd></dl>
              <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Distribution by class (points)</h3>
              <ul className="mt-1 space-y-1">{CLASSES.map((c, k) => stats.counts[k] ? <li key={c} className="flex items-center gap-2 text-[11px]"><span className="w-20 text-slate-400">{CLASS_LABEL[c]}</span><span className="h-1.5 flex-1 rounded bg-slate-800"><span className="block h-1.5 rounded" style={{ width: `${(stats.counts[k] / stats.n) * 100}%`, background: colors[c] }} /></span><span className="w-12 text-right tabular-nums text-slate-300">{pct(stats.counts[k] / stats.n)}</span></li> : null)}</ul>
              <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Objects</h3>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto text-[11px]" data-testid="objects">{[...(lab?.meta ?? [])].filter(([, m]) => !STRUCTURAL.includes(m.cls)).map(([id, m]) => <li key={id}><button className={`w-full rounded px-1 py-0.5 text-left hover:bg-slate-800 ${id === selected ? "bg-slate-800 text-white" : "text-slate-300"}`} onClick={() => setSelected(id)} data-testid={`obj-${id}`}>{nm(m.cls, m.index)} <span className="text-slate-500">· {lab?.idx.get(id)?.length.toLocaleString()} pts</span></button></li>)}</ul>
              <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Spatial relationships (from bounding boxes)</h3>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-300" data-testid="relations">{stats.rel.slice(0, 8).map((r, i) => <li key={i}>{name(r.a)} {r.kind} {name(r.b)}{r.kind === "next to" ? ` (${f(r.gap)} m)` : ""}</li>)}{stats.rel.length === 0 && <li className="text-slate-500">No objects within 0.5 m of each other.</li>}</ul>
            </section>
            {ev && <section className={CARD} data-testid="evaluation"><h2 className={H3}>Computed segmentation vs reference</h2>
              <p className="mt-2 text-sm text-slate-200">Point accuracy <b data-testid="e-acc">{pct(ev.accuracy)}</b>, mean IoU <b data-testid="e-miou">{pct(ev.meanIoU)}</b>. Objects found: <b data-testid="e-inst">{ev.instances.matched} of {ev.instances.truth}</b> (IoU ≥ 0.5, right class). Run time {f(data!.seg.ms / 1000, 1)} s.</p>
              <table className="mt-2 w-full text-left text-[11px]"><thead className="text-slate-500"><tr><th>Class</th><th>Points</th><th>Prec.</th><th>Recall</th><th>IoU</th></tr></thead><tbody>{ev.perClass.map((c) => <tr key={c.cls} className="border-t border-slate-800"><td className="py-0.5 text-slate-300">{CLASS_LABEL[c.cls]}</td><td>{c.points.toLocaleString()}</td><td>{pct(c.precision)}</td><td>{pct(c.recall)}</td><td>{pct(c.iou)}</td></tr>)}</tbody></table>
              <details className="mt-2 text-[11px] text-slate-400"><summary className="cursor-pointer">Confusion matrix (rows reference, columns computed)</summary><div className="mt-1 overflow-auto"><table className="text-[10px]"><thead><tr><th />{CLASSES.map((c) => <th key={c} className="px-1 text-slate-500">{c.slice(0, 3)}</th>)}</tr></thead><tbody>{CLASSES.map((c, r) => ev.confusion[r].some((x) => x) ? <tr key={c}><th className="pr-1 text-left text-slate-500">{c.slice(0, 3)}</th>{ev.confusion[r].map((x, k) => <td key={k} className={`px-1 text-right tabular-nums ${r === k ? "text-green-300" : x ? "text-amber-300" : "text-slate-700"}`}>{x}</td>)}</tr> : null)}</tbody></table></div></details>
              <p className="mt-2 text-[11px] text-slate-500">Rule-based on synthetic data. Thin or partly hidden objects (racks, TV cabinet, some tables) are the usual misses; see the confusion matrix.</p>
            </section>}
          </>)}
        </aside>
      </div>
    </PcShell>
  );
}
