"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Branding } from "@/lib/types";
import { PointGrid } from "@/lib/photo/grid";
import { cloudToPLY, writeDXF, writeGLB, writeOBJ, writePLY, writeSTL } from "@/lib/photo/io";
import type { Report } from "@/lib/photo/pipeline";
import { PRESETS, truthChecks, type TruthCheck } from "@/lib/photo/synth";
import { DEFAULT_PARAMS, UNIT_PER_M, type Mesh, type Params, type Unit } from "@/lib/photo/types";
import { centreOf, PcViewer, ramp, toLocal } from "@/components/pc/PcViewer";
import PcShell, { Badge, BTN, CARD, download, GO, H3, INPUT, Slider, TAB } from "@/components/pc/PcShell";

interface Loaded { kind: "cloud" | "mesh"; format: string; pos: Float64Array; colors: Uint8Array | null; idx: Uint32Array | null; vertexCount: number; faceCount: number; truthOrigin: [number, number, number] | null }
interface Result { cleaned: Float64Array; cleanedColors: Uint8Array | null; recon: Mesh; mesh: Mesh; deviation: Float32Array; report: Report; truthOrigin: [number, number, number] | null }
type View = "original" | "processed" | "compare" | "deviation";
const f1 = (v: number, d = 1) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

export default function PhotoApp({ branding }: { branding: Branding }) {
  const host = useRef<HTMLDivElement>(null), viewer = useRef<PcViewer | null>(null), worker = useRef<Worker | null>(null), runId = useRef(0), group = useRef<THREE.Group[]>([]);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS), [source, setSource] = useState<{ label: string; preset?: string; file?: File } | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle"), [progress, setProgress] = useState({ stage: "", fraction: 0 }), [error, setError] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null), [result, setResult] = useState<Result | null>(null), [view, setView] = useState<View>("original"), [wire, setWire] = useState(false), [ptSize, setPtSize] = useState(2);
  const [measure, setMeasure] = useState(false), [picks, setPicks] = useState<THREE.Vector3[]>([]), [preset, setPreset] = useState("typical");
  const unit = params.unit, set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }));
  const origin = useMemo(() => (loaded ? centreOf(loaded.pos) : ([0, 0, 0] as [number, number, number])), [loaded]);
  const truth = useMemo<TruthCheck[] | null>(() => (result?.truthOrigin && result.mesh.idx.length ? truthChecks(result.mesh.pos, result.mesh.idx, result.truthOrigin) : null), [result]);
  const cleanedGrid = useMemo(() => (result ? new PointGrid(result.cleaned, Math.max(1e-6, (result.report.accuracy.surfaceDev.mean || 0.005) * 4)) : null), [result]);

  // ---- viewer lifecycle
  useEffect(() => { if (!host.current) return; const v = new PcViewer(host.current); viewer.current = v; return () => { v.dispose(); viewer.current = null; }; }, []);
  useEffect(() => () => worker.current?.terminate(), []);
  const clearGroups = () => { for (const g of group.current) { g.parent?.remove(g); g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); }); } group.current = []; };
  const pointsObj = useCallback((pos: Float64Array, colors: Uint8Array | null, org: [number, number, number], rgb?: [number, number, number]) => {
    const g = new THREE.BufferGeometry(), p = toLocal(pos, org); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); const n = p.length / 3, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { if (colors) { c[i * 3] = colors[i * 3] / 255; c[i * 3 + 1] = colors[i * 3 + 1] / 255; c[i * 3 + 2] = colors[i * 3 + 2] / 255; } else { c[i * 3] = rgb?.[0] ?? 0.55; c[i * 3 + 1] = rgb?.[1] ?? 0.7; c[i * 3 + 2] = rgb?.[2] ?? 1; } }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3)); const m = new THREE.PointsMaterial({ size: ptSize, sizeAttenuation: false, vertexColors: true }); const pts = new THREE.Points(g, m); pts.name = "points"; const grp = new THREE.Group(); grp.add(pts); return grp;
  }, [ptSize]);
  const meshObj = useCallback((m: Mesh, org: [number, number, number], dev: Float32Array | null, tolUnits: number, wf: boolean) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(toLocal(m.pos, org), 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1)); g.computeVertexNormals();
    if (dev) { const c = new Float32Array(dev.length * 3); for (let i = 0; i < dev.length; i++) { const rgb = ramp(dev[i] / tolUnits); c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; } g.setAttribute("color", new THREE.BufferAttribute(c, 3)); }
    const mat = new THREE.MeshStandardMaterial({ color: dev ? 0xffffff : 0xcfd6e4, vertexColors: !!dev, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide, flatShading: !dev }); const mesh = new THREE.Mesh(g, mat); mesh.name = "mesh"; const grp = new THREE.Group(); grp.add(mesh);
    if (wf) { const l = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.55 })); grp.add(l); } return grp;
  }, []);
  useEffect(() => {
    const v = viewer.current; if (!v || !loaded) return; clearGroups(); const org = origin; let original: THREE.Group;
    if (loaded.kind === "mesh" && loaded.idx) original = meshObj({ pos: loaded.pos, idx: loaded.idx }, org, null, 1, false); else original = pointsObj(loaded.pos, loaded.colors, org);
    const tolU = (params.toleranceMm / 1000) * UNIT_PER_M[unit]; let proc: THREE.Group | null = null;
    if (result) proc = meshObj(result.mesh, org, view === "deviation" ? result.deviation : null, tolU, wire);
    v.left.add(original); group.current.push(original);
    if (view === "original" || !result) { original.visible = true; v.setCompare(false); }
    else if (view === "processed" || view === "deviation") { original.visible = false; v.left.add(proc!); group.current.push(proc!); v.setCompare(false); }
    else { original.visible = true; v.right.add(proc!); group.current.push(proc!); v.setCompare(true, 0.5); }
    if (picks.length) { const mk = new THREE.Group(); for (const p of picks) { const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.005, v.pointPickRadius * 5), 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe14d })); m.position.copy(p); mk.add(m); } (v.compare ? v.right : v.left).add(mk); group.current.push(mk); }
    v.invalidate();
  }, [loaded, result, view, wire, ptSize, picks, origin, params.toleranceMm, unit, pointsObj, meshObj]);
  const fitted = useRef<unknown>(null);
  useEffect(() => { const v = viewer.current; if (!v || !loaded || fitted.current === loaded) return; fitted.current = loaded; const lp = toLocal(loaded.pos, origin), box = new THREE.Box3(); const stride = Math.max(1, Math.floor(lp.length / 3 / 5000)); for (let i = 0; i < lp.length; i += 3 * stride) box.expandByPoint(new THREE.Vector3(lp[i], lp[i + 1], lp[i + 2])); v.fit(box); }, [loaded, origin]);
  // ---- measuring
  useEffect(() => {
    const v = viewer.current; if (!v) return;
    v.setPicking(() => { const t: THREE.Object3D[] = []; for (const g of group.current) g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name === "mesh") t.push(o); }); return t; }, (_e, hit) => { if (!measure || !hit) return; setPicks((p) => (p.length >= 2 ? [hit.point.clone()] : [...p, hit.point.clone()])); });
  }, [measure, result, view]);
  const measured = useMemo(() => {
    if (picks.length < 2 || !cleanedGrid || !result) return null; const nearest = (p: THREE.Vector3) => { const x = p.x + origin[0], y = p.y + origin[1], z = p.z + origin[2]; let r = cleanedGrid.cell, best = Infinity, bi = -1; for (let t = 0; t < 6 && bi < 0; t++, r *= 2) cleanedGrid.near(x, y, z, r, (i, d2) => { if (d2 < best) { best = d2; bi = i; } }); const c = result.cleaned; return bi < 0 ? [x, y, z] : [c[bi * 3], c[bi * 3 + 1], c[bi * 3 + 2]]; };
    const a = picks[0], b = picks[1], proc = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), na = nearest(a), nb = nearest(b), orig = Math.hypot(na[0] - nb[0], na[1] - nb[1], na[2] - nb[2]), k = 1000 / UNIT_PER_M[unit];
    return { procMm: proc * k, origMm: orig * k, diffMm: (proc - orig) * k };
  }, [picks, cleanedGrid, result, origin, unit]);

  // ---- running
  const run = async (src: { label: string; preset?: string; file?: File }) => {
    worker.current?.terminate(); const id = ++runId.current, w = new Worker(new URL("../../lib/photo/worker.ts", import.meta.url), { type: "module" }); worker.current = w;
    setSource(src); setState("running"); setError(""); setResult(null); setPicks([]); setView("original"); setProgress({ stage: "Starting", fraction: 0 }); fitted.current = null;
    w.onerror = (e) => { setState("error"); setError(e.message || "The processing worker failed."); };
    w.onmessage = (ev) => {
      const m = ev.data; if (m.id !== id) return;
      if (m.type === "progress") setProgress({ stage: m.stage, fraction: m.fraction });
      else if (m.type === "loaded") setLoaded({ kind: m.kind, format: m.format, pos: m.pos, colors: m.colors, idx: m.idx, vertexCount: m.vertexCount, faceCount: m.faceCount, truthOrigin: m.truthOrigin });
      else if (m.type === "done") { setResult({ cleaned: m.cleaned, cleanedColors: m.cleanedColors, recon: m.recon, mesh: m.mesh, deviation: m.deviation, report: m.report, truthOrigin: m.truthOrigin }); setState("done"); setView("compare"); w.terminate(); }
      else if (m.type === "error") { setState("error"); setError(m.message); w.terminate(); }
    };
    if (src.file) { if (src.file.size > 400e6) { setState("error"); setError("The file is larger than 400 MB. Use a decimated copy of the scan."); return; } const buffer = await src.file.arrayBuffer(); w.postMessage({ type: "run", id, params, source: { kind: "file", name: src.file.name, buffer } }, [buffer]); }
    else w.postMessage({ type: "run", id, params, source: { kind: "synthetic", preset: src.preset } });
  };
  const rerun = () => source && run(source);
  const base = (source?.file?.name ?? `facade-${source?.preset ?? "sample"}`).replace(/\.[^.]+$/, "");
  const exp = (kind: string) => {
    if (!result) return; const m = result.mesh;
    if (kind === "obj") download(`${base}-clean.obj`, writeOBJ(m)); if (kind === "ply") download(`${base}-clean.ply`, writePLY(m)); if (kind === "glb") download(`${base}-clean.glb`, writeGLB(m, unit)); if (kind === "dxf") download(`${base}-clean.dxf`, writeDXF(m, unit));
    if (kind === "stl") { const s = writeSTL(m); download(`${base}-clean.stl`, s.blob); alert(`STL stores 32-bit coordinates, so the mesh was written relative to its minimum corner. Add this offset (${unit}) to restore world coordinates: ${s.offset.map((v) => v.toFixed(6)).join(", ")}`); }
    if (kind === "cloud") download(`${base}-cleaned-points.ply`, cloudToPLY({ pos: result.cleaned, colors: result.cleanedColors ?? undefined }));
    if (kind === "report") download(`${base}-report.json`, new Blob([JSON.stringify({ source: source?.label, parameters: params, report: result.report, groundTruth: truth }, null, 2)], { type: "application/json" }));
  };
  const rep = result?.report, acc = rep?.accuracy;
  return (
    <PcShell branding={branding} title="Photogrammetry Clean-up for Architectural Scans" project={source?.label ?? "No scan selected"} status={state === "running" ? "Processing…" : state === "done" ? "Done" : "Ready"}
      notice="Proof of concept that runs in your browser. It cleans a noisy point cloud (or mesh), rebuilds a surface, smooths and simplifies it, and then MEASURES how far the result is from the scan and whether the dimensions were preserved. Reconstruction here handles facade-like (mostly planar) scans; it is not a general photogrammetry engine, it never invents missing geometry, and it is not the macOS application or the server described in the project brief. The built-in sample is generated by code with known dimensions; no Apple Object Capture scan is bundled."
      footer="Working: PLY/OBJ import, outlier and floating-geometry removal, height-field surface reconstruction, Taubin smoothing with a hard movement limit, quadric simplification with an error limit, deviation colour map, before/after comparison, two-point measurement on both versions, export to OBJ, PLY, STL, GLB and DXF. Not implemented: macOS app, server processing, FBX, non-planar reconstruction (columns, full buildings), texture transfer.">
      {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" data-testid="error">{error}</div>}
      <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)_390px]">
        <aside className="space-y-3">
          <section className={CARD} aria-label="Scan source">
            <h2 className={H3}>1 · Scan</h2>
            <label className="mt-2 block text-xs text-slate-300">Sample (generated, with known dimensions)
              <select className={`${INPUT} mt-1 w-full`} value={preset} onChange={(e) => setPreset(e.target.value)} data-testid="preset">{Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <button className={`${GO} mt-2 w-full`} disabled={state === "running"} onClick={() => run({ label: `Generated facade, ${PRESETS[preset].label}`, preset })} data-testid="run-sample">Process this sample</button>
            <p className="mt-2 text-[11px] text-slate-400">A 12 × 8 m facade with 10 window recesses, a door, pilasters and a cornice, sampled with noise, outliers, floating blobs and occlusion holes, at a UTM-style world offset. Synthetic: not a photograph or a real Object Capture scan.</p>
            <label className="mt-3 block cursor-pointer rounded-md border border-dashed border-slate-600 p-3 text-center text-sm text-slate-300 hover:border-blue-500">Upload a PLY or OBJ scan
              <input type="file" accept=".ply,.obj" className="sr-only" data-testid="file-input" disabled={state === "running"} onChange={(e) => { const f = e.target.files?.[0]; if (f) run({ label: f.name, file: f }); e.target.value = ""; }} /></label>
            <p className="mt-1 text-[11px] text-slate-500">Point clouds (PLY/OBJ vertices) and meshes. Files stay in your browser. Coordinates are processed as they are; set the units below.</p>
          </section>
          <section className={CARD} aria-label="Processing settings">
            <h2 className={H3}>2 · Settings</h2>
            <label className="mt-2 block text-xs text-slate-300">Units of the file<select className={`${INPUT} mt-1 w-full`} value={unit} onChange={(e) => set("unit", e.target.value as Unit)} data-testid="unit"><option value="m">metres (Object Capture default)</option><option value="mm">millimetres</option><option value="cm">centimetres</option><option value="ft">feet</option><option value="in">inches</option></select></label>
            <div className="mt-3 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Noise removal</p>
              <Slider id="s-k" label="Neighbours for outlier test" value={params.outlierK} min={4} max={30} step={1} onChange={(v) => set("outlierK", v)} />
              <Slider id="s-std" label="Outlier threshold" value={params.outlierStd} min={1} max={5} step={0.1} unit="σ" onChange={(v) => set("outlierStd", v)} hint="Lower removes more points." />
              <Slider id="s-float" label="Floating groups smaller than" value={Math.round(params.floatingFraction * 1000) / 10} min={0} max={10} step={0.5} unit="% of largest" onChange={(v) => set("floatingFraction", v / 100)} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Surface</p>
              <Slider id="s-ppc" label="Scan points per surface cell" value={params.pointsPerCell} min={3} max={20} step={1} onChange={(v) => set("pointsPerCell", v)} hint="More points per cell = smoother but coarser." />
              <Slider id="s-gap" label="Small-gap filling" value={params.fillIterations} min={0} max={6} step={1} unit="cells" onChange={(v) => set("fillIterations", v)} hint="Larger holes are left open, never invented." />
              <Slider id="s-snap" label="Flatten wall to its plane within" value={params.snapMm} min={0} max={20} step={1} unit="mm" onChange={(v) => set("snapMm", v)} hint="0 = off. Deeper or proud features are untouched." />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Smoothing</p>
              <Slider id="s-smooth" label="Smoothing intensity" value={params.smoothIterations} min={0} max={30} step={1} unit="iterations" onChange={(v) => set("smoothIterations", v)} />
              <Slider id="s-angle" label="Keep edges sharper than" value={params.featureAngle} min={10} max={80} step={5} unit="°" onChange={(v) => set("featureAngle", v)} />
              <Slider id="s-move" label="No vertex may move more than" value={params.maxMoveMm} min={0} max={20} step={1} unit="mm" onChange={(v) => set("maxMoveMm", v)} hint="A hard limit on smoothing, so it cannot erode dimensions." />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Simplification</p>
              <Slider id="s-keep" label="Keep at most" value={Math.round(params.keepRatio * 100)} min={2} max={100} step={1} unit="% of triangles" onChange={(v) => set("keepRatio", v / 100)} />
              <Slider id="s-err" label="Simplification error limit" value={params.errorMm} min={0} max={30} step={1} unit="mm" onChange={(v) => set("errorMm", v)} hint="Each merge must keep merged vertices this close to the new surface." />
              <Slider id="s-tol" label="Accuracy tolerance for the report" value={params.toleranceMm} min={1} max={100} step={1} unit="mm" onChange={(v) => set("toleranceMm", v)} />
            </div>
            <button className={`${BTN} mt-3 w-full`} disabled={!source || state === "running"} onClick={rerun} data-testid="rerun">Re-run with these settings</button>
            <button className={`${BTN} mt-2 w-full`} onClick={() => setParams(DEFAULT_PARAMS)}>Reset settings</button>
          </section>
        </aside>
        <section className="space-y-2" aria-label="3D viewer">
          <div className="flex flex-wrap items-center gap-2">
            {(["original", "processed", "compare", "deviation"] as View[]).map((v) => <button key={v} className={TAB(view === v)} disabled={v !== "original" && !result} onClick={() => setView(v)} data-testid={`view-${v}`}>{{ original: "Original scan", processed: "Processed", compare: "Before / after", deviation: "Deviation map" }[v]}</button>)}
            <label className="ml-2 flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} data-testid="wire" /> Wireframe</label>
            <label className="flex items-center gap-1 text-xs text-slate-300">Point size <input type="range" min={1} max={6} value={ptSize} onChange={(e) => setPtSize(Number(e.target.value))} className="w-20 accent-blue-500" /></label>
            <button className={TAB(measure)} disabled={!result} onClick={() => { setMeasure((m) => !m); setPicks([]); }} data-testid="measure">Measure distance</button>
            <button className={BTN} onClick={() => { const v = viewer.current; if (v && loaded) { const lp = toLocal(loaded.pos, origin), box = new THREE.Box3(); const st = Math.max(1, Math.floor(lp.length / 3 / 5000)); for (let i = 0; i < lp.length; i += 3 * st) box.expandByPoint(new THREE.Vector3(lp[i], lp[i + 1], lp[i + 2])); v.fit(box); } }} data-testid="reset-camera">Reset camera</button>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950" style={{ height: "min(70vh, 640px)", minHeight: 360 }}>
            <div ref={host} className="absolute inset-0" data-testid="viewport" />
            {!loaded && state !== "running" && <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400" data-testid="empty">Choose the generated sample or upload a scan. Nothing is processed until you do.</p>}
            {state === "running" && <div className="absolute inset-x-0 bottom-0 bg-slate-900/90 p-3" role="status" data-testid="progress"><p className="text-xs text-slate-200">{progress.stage}… {Math.round(progress.fraction * 100)}%</p><div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.fraction * 100}%` }} /></div></div>}
            {view === "compare" && result && <><span className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-200">Original scan</span><span className="pointer-events-none absolute right-2 top-2 rounded bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-200">Processed</span></>}
            {view === "deviation" && result && <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/85 p-2 text-[11px] text-slate-200" data-testid="legend"><div className="h-2 w-40 rounded" style={{ background: "linear-gradient(90deg,#1a59e6,#1ac7c7,#80e64d,#fad933,#f23326)" }} /><div className="mt-1 flex justify-between"><span>0</span><span>{params.toleranceMm} mm</span></div><p className="mt-1 text-slate-400">Distance from each vertex to the cleaned scan points.</p></div>}
          </div>
          {measure && <p className="text-xs text-slate-300" data-testid="measure-help">{picks.length === 0 ? "Click two points on the processed surface." : picks.length === 1 ? "Click a second point." : null}{measured && <span data-testid="measure-result">Processed surface: <b>{f1(measured.procMm)} mm</b> · same two places in the scan points: <b>{f1(measured.origMm)} mm</b> · difference <b>{f1(measured.diffMm)} mm</b> <span className="text-slate-500">(the scan&apos;s own noise limits how exactly the points can be located)</span></span>}</p>}
        </section>
        <aside className="space-y-3" aria-label="Report">
          {!result && <section className={CARD}><h2 className={H3}>3 · Report</h2><p className="mt-2 text-sm text-slate-400" data-testid="no-report">The accuracy report appears here after processing.</p></section>}
          {result && rep && acc && (<>
            <section className={CARD} data-testid="report"><h2 className={H3}>3 · Result</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><dt className="text-slate-400">Input</dt><dd>{rep.input.format}, {rep.input.points.toLocaleString()} {rep.input.kind === "cloud" ? "points" : "vertices"}</dd><dt className="text-slate-400">After cleaning</dt><dd data-testid="cleaned-count">{rep.counts.cleanedPoints.toLocaleString()}</dd><dt className="text-slate-400">Reconstructed</dt><dd>{rep.counts.reconTriangles.toLocaleString()} triangles</dd><dt className="text-slate-400">Final mesh</dt><dd data-testid="final-tris">{rep.counts.finalTriangles.toLocaleString()} triangles ({f1((rep.counts.finalTriangles / Math.max(1, rep.counts.reconTriangles)) * 100, 0)}%)</dd></dl>
              <table className="mt-3 w-full text-left text-[11px]" data-testid="stages"><thead className="text-slate-500"><tr><th className="py-1">Step</th><th>ms</th></tr></thead><tbody>{rep.stages.map((s) => <tr key={s.name} className="border-t border-slate-800 align-top"><td className="py-1 pr-2"><b className="text-slate-200">{s.name}</b><br /><span className="text-slate-400">{s.detail}</span></td><td className="tabular-nums">{s.ms}</td></tr>)}</tbody></table>
            </section>
            <section className={CARD} data-testid="accuracy"><h2 className={H3}>Dimensional accuracy</h2>
              <p className="mt-1 flex flex-wrap gap-1"><Badge ok={acc.pass.dimensions}>Width and height {acc.pass.dimensions ? "kept" : "changed"} (≤ {acc.tolMm} mm)</Badge><Badge ok={acc.pass.surface}>Surface fit p95 ≤ {acc.tolMm} mm</Badge><Badge ok={acc.pass.process}>Smoothing + simplification p95 ≤ {acc.tolMm} mm</Badge></p>
              <table className="mt-2 w-full text-left text-[11px]"><thead className="text-slate-500"><tr><th>Along the scan&apos;s axes</th><th>Scan (mm)</th><th>Mesh (mm)</th><th>Δ (mm)</th></tr></thead><tbody>{["Width", "Height", "Depth"].map((n, i) => <tr key={n} className="border-t border-slate-800"><td className="py-1">{n}</td><td className="tabular-nums">{f1(acc.bboxBefore[i])}</td><td className="tabular-nums">{f1(acc.bboxAfter[i])}</td><td className="tabular-nums" data-testid={`delta-${n.toLowerCase()}`}>{f1(acc.bboxDeltaMm[i], 2)}</td></tr>)}</tbody></table>
              <p className="mt-1 text-[11px] text-slate-500">Depth is shown for information: the scan&apos;s depth range includes noise tails, so it is not a pass/fail value. Position of the mesh versus the scan&apos;s minimum corner: {acc.originShiftMm.map((v) => f1(v, 1)).join(", ")} mm. Coordinates and units are the input&apos;s: nothing is re-centred or rescaled.</p>
              <table className="mt-3 w-full text-left text-[11px]" data-testid="deviation"><thead className="text-slate-500"><tr><th>Distance (mm)</th><th>mean</th><th>RMS</th><th>95%</th><th>max</th></tr></thead><tbody>
                <tr className="border-t border-slate-800"><td className="py-1">Mesh to cleaned scan points</td>{[acc.surfaceDevMm.mean, acc.surfaceDevMm.rms, acc.surfaceDevMm.p95, acc.surfaceDevMm.max].map((v, i) => <td key={i} className="tabular-nums">{f1(v)}</td>)}</tr>
                <tr className="border-t border-slate-800"><td className="py-1">Added by smoothing + simplification</td>{[acc.processDevMm.mean, acc.processDevMm.rms, acc.processDevMm.p95, acc.processDevMm.max].map((v, i) => <td key={i} className="tabular-nums">{f1(v)}</td>)}</tr></tbody></table>
              <p className="mt-1 text-[11px] text-slate-500">No vertex moves more than the smoothing limit ({params.smoothIterations > 0 ? params.maxMoveMm : 0} mm) and the wall snap ({input_snap(rep, params)} mm); the simplification limit applies to merged vertices and the largest single deviation is measured, not assumed.</p>
              <p className="mt-2 text-xs text-slate-300" data-testid="pairs">Distances between {acc.pairs.n} random point pairs, before vs after: mean change <b>{f1(acc.pairs.meanAbsMm, 2)} mm</b> ({f1(acc.pairs.meanRelPercent, 3)}%), largest {f1(acc.pairs.maxAbsMm)} mm ({f1(acc.pairs.maxRelPercent, 2)}%).</p>
            </section>
            {truth && (<section className={CARD} data-testid="truth"><h2 className={H3}>Ground-truth check (generated sample only)</h2>
              <table className="mt-2 w-full text-left text-[11px]"><thead className="text-slate-500"><tr><th>Feature</th><th>True (m)</th><th>Measured (m)</th><th>Error (mm)</th></tr></thead><tbody>{truth.map((c) => <tr key={c.name} className="border-t border-slate-800"><td className="py-1">{c.name}</td><td className="tabular-nums">{c.truth.toFixed(3)}</td><td className="tabular-nums">{c.measured.toFixed(3)}</td><td className="tabular-nums" data-testid="truth-error">{(c.error * 1000).toFixed(1)}</td></tr>)}</tbody></table>
              <p className="mt-1 text-[11px] text-slate-500">The true values are the dimensions the sample was generated from. A real scan has no such reference: compare against a measured dimension on site.</p></section>)}
            <section className={CARD} data-testid="exports"><h2 className={H3}>Export</h2>
              <div className="mt-2 flex flex-wrap gap-2">{["obj", "ply", "stl", "glb", "dxf", "cloud", "report"].map((k) => <button key={k} className={BTN} onClick={() => exp(k)} data-testid={`export-${k}`}>{{ obj: "OBJ", ply: "PLY mesh", stl: "STL", glb: "GLB", dxf: "DXF (CAD)", cloud: "Cleaned points (PLY)", report: "Report (JSON)" }[k]}</button>)}</div>
              <p className="mt-2 text-[11px] text-slate-500">DXF carries one 3D face per triangle for AutoCAD and other CAD tools (a surface, not a solid). FBX is not implemented. STL and GLB store 32-bit coordinates; STL is written relative to its minimum corner and GLB keeps the world position in the node translation.</p></section>
            {rep.notes.length > 0 && <section className={CARD}><h2 className={H3}>Notes</h2><ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-300">{rep.notes.map((n) => <li key={n}>{n}</li>)}</ul></section>}
          </>)}
        </aside>
      </div>
    </PcShell>
  );
}
const input_snap = (rep: Report, p: Params) => (rep.input.kind === "cloud" ? p.snapMm : 0);
