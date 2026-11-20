"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import type { Branding } from "@/lib/types";
import { PcViewer } from "@/components/pc/PcViewer";
import PcShell, { Badge, BTN, CARD, H3, INPUT, TAB } from "@/components/pc/PcShell";

const STAGES = ["original", "cleaned", "reconstructed", "refined"] as const; type Stage = (typeof STAGES)[number];
const LABEL: Record<Stage, string> = { original: "Original noisy point cloud", cleaned: "Cleaned point cloud", reconstructed: "Initial reconstructed mesh", refined: "Final refined mesh" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Report = any;
interface Parsed { kind: "cloud" | "mesh"; center: number[]; bbox_min: number[]; bbox_max: number[]; count: number; faces?: number; total?: number; total_faces?: number; positions: Float32Array; colors: Uint8Array | null; indices: Uint32Array | null }
const n = (v: number | undefined, d = 0) => (v === undefined ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));

function parse(buf: ArrayBuffer): Parsed {
  const hl = new DataView(buf).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))); let o = 4 + hl; const c = h.count;
  const positions = new Float32Array(buf.slice(o, o + c * 12)); o += c * 12; let colors: Uint8Array | null = null; if (h.has_colors) { colors = new Uint8Array(buf.slice(o, o + c * 3)); o += c * 3; }
  o += (4 - ((c * 12 + (h.has_colors ? c * 3 : 0)) % 4)) % 4; return { ...h, positions, colors, indices: h.kind === "mesh" ? new Uint32Array(buf.slice(o, o + h.faces * 12)) : null };
}

export default function StudioDemo({ branding }: { branding: Branding }) {
  const host = useRef<HTMLDivElement>(null), viewer = useRef<PcViewer | null>(null);
  const [data, setData] = useState<Record<Stage, Parsed> | null>(null), [report, setReport] = useState<Report>(null), [error, setError] = useState("");
  const [view, setView] = useState<Stage>("original"), [cmp, setCmp] = useState(false), [a, setA] = useState<Stage>("original"), [b, setB] = useState<Stage>("refined"), [split, setSplit] = useState(0.5), [wire, setWire] = useState(false), [colour, setColour] = useState(true), [pt, setPt] = useState(2.5);

  useEffect(() => { if (!host.current) return; const v = new PcViewer(host.current, { background: 0x0b1220 }); viewer.current = v; return () => { v.dispose(); viewer.current = null; }; }, []);
  useEffect(() => { (async () => { try {
    const out: Partial<Record<Stage, Parsed>> = {}; for (const s of STAGES) { const r = await fetch(`/models/photomesh-studio/${s}.bin`); if (!r.ok) throw new Error(`Could not load ${s} (${r.status})`); out[s] = parse(await r.arrayBuffer()); }
    setData(out as Record<Stage, Parsed>); const r = await fetch("/models/photomesh-studio/report.json"); if (r.ok) setReport(await r.json());
  } catch (e) { setError(e instanceof Error ? e.message : "Loading failed"); } })(); }, []);

  const origin = useMemo(() => data?.original.center ?? [0, 0, 0], [data]);
  const build = useMemo(() => (s: Stage) => {
    if (!data) return null; const p = data[s], g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p.positions, 3)); if (p.colors && colour) g.setAttribute("color", new THREE.BufferAttribute(Float32Array.from(p.colors, (x) => x / 255), 3));
    const grp = new THREE.Group(); grp.position.set(p.center[0] - origin[0], p.center[1] - origin[1], p.center[2] - origin[2]);
    if (p.kind === "cloud") grp.add(new THREE.Points(g, new THREE.PointsMaterial({ size: pt, sizeAttenuation: false, vertexColors: !!(p.colors && colour), color: p.colors && colour ? 0xffffff : 0x9db4d8 })));
    else { g.setIndex(new THREE.BufferAttribute(p.indices!, 1)); g.computeVertexNormals(); if (!wire) grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: !!(p.colors && colour), color: p.colors && colour ? 0xffffff : 0xb8c4d6, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))); grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ wireframe: true, color: wire ? 0x8fb2ff : 0x15233f, transparent: true, opacity: wire ? 0.9 : 0.0 }))); }
    return grp;
  }, [data, colour, wire, pt, origin]);
  useEffect(() => {
    const v = viewer.current; if (!v || !data) return; const made: THREE.Group[] = [];
    const add = (sc: THREE.Scene, s: Stage) => { const g = build(s); if (g) { sc.add(g); made.push(g); } };
    add(v.left, cmp ? a : view); if (cmp) add(v.right, b); v.setCompare(cmp, split);
    return () => { for (const g of made) { g.parent?.remove(g); g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); }); } v.invalidate(); };
  }, [data, build, view, cmp, a, b, split]);
  useEffect(() => { const v = viewer.current; if (!v || !data) return; const mn = data.original.bbox_min, mx = data.original.bbox_max; v.fit(new THREE.Box3(new THREE.Vector3(...mn.map((x, i) => x - origin[i])), new THREE.Vector3(...mx.map((x, i) => x - origin[i]))), new THREE.Vector3(0.9, 0.5, 1.1)); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const R = report?.reports, S = report?.stages;
  return (
    <PcShell branding={branding} title="PhotoMesh Studio: Photogrammetry Cleanup Desktop Software" project="Sample: Stanford Bunny, degraded scan" status={data ? "Ready" : error ? "Error" : "Loading"}
      notice="This page shows REAL output of the PhotoMesh Studio desktop engine (Python, Open3D, PyMeshLab) on a bundled sample: a real 3D asset (the Stanford Bunny) turned into a noisy photogrammetry-like point cloud on purpose (noise, duplicates, outliers, a floating blob, uneven density, an occlusion hole). The processing ran offline; this web page does not run the engine and you cannot upload files here. The desktop application is separate software you install on your computer. The sample is not an iPhone Object Capture scan."
      footer="Desktop software: React + Three.js interface, local Python engine, Tauri shell. Verified on Linux; Windows and macOS builds were not made. CPU only; texture-atlas re-baking is not implemented."
      actions={<Badge ok={null}>Output of the desktop engine</Badge>}>
      {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" data-testid="error">{error}</div>}
      <div className="grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)_360px]">
        <aside className="space-y-3">
          <section className={CARD}><h2 className={H3}>Stage</h2>
            <div className="mt-2 flex flex-col gap-1">{STAGES.map((s) => <button key={s} className={TAB(!cmp && view === s)} onClick={() => { setCmp(false); setView(s); }} data-testid={`stage-${s}`}>{LABEL[s]}</button>)}</div></section>
          <section className={CARD}><h2 className={H3}>Compare</h2>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={cmp} onChange={(e) => setCmp(e.target.checked)} data-testid="cmp" /> Split-screen comparison</label>
            {cmp && <><label className="mt-2 block text-xs text-slate-300">Left<select className={`${INPUT} mt-1 w-full`} value={a} onChange={(e) => setA(e.target.value as Stage)} data-testid="cmp-a">{STAGES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select></label>
              <label className="mt-2 block text-xs text-slate-300">Right<select className={`${INPUT} mt-1 w-full`} value={b} onChange={(e) => setB(e.target.value as Stage)} data-testid="cmp-b">{STAGES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}</select></label>
              <label className="mt-2 block text-xs text-slate-300">Divider<input type="range" min={0.1} max={0.9} step={0.01} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-full accent-blue-500" data-testid="split" /></label></>}</section>
          <section className={CARD}><h2 className={H3}>Display</h2>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} data-testid="wire" /> Wireframe (meshes)</label>
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={colour} onChange={(e) => setColour(e.target.checked)} data-testid="colour" /> Colours</label>
            <label className="mt-2 flex items-center justify-between text-xs text-slate-300">Point size<input type="range" min={1} max={6} step={0.5} value={pt} onChange={(e) => setPt(Number(e.target.value))} className="w-28 accent-blue-500" /></label></section>
        </aside>
        <section className="space-y-2" aria-label="3D viewer"><div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950" style={{ height: "min(66vh, 640px)", minHeight: 340 }}><div ref={host} className="absolute inset-0" data-testid="viewport" />
          {!data && !error && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">Loading the sample outputs…</div>}
          {data && <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/85 px-2 py-1 text-[11px] text-slate-100" data-testid="hud">{cmp ? `${LABEL[a]}  |  ${LABEL[b]}` : LABEL[view]}</div>}
          {data && <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300">Display files are decimated for the web (up to 70,000 points / 60,000 faces); the numbers on the right are from the full-resolution result.</div>}</div></section>
        <aside className="space-y-3" aria-label="Measured results">
          <section className={CARD} data-testid="numbers"><h2 className={H3}>Measured by the engine</h2>
            {R && S ? <dl className="mt-2 grid grid-cols-[150px_1fr] gap-y-1 text-xs">
              <dt className="text-slate-400">Original points</dt><dd data-testid="n-original">{n(S.original.points)}</dd><dt className="text-slate-400">After cleaning</dt><dd>{n(S.cleaned.points)}</dd>
              <dt className="text-slate-400">Reconstructed mesh</dt><dd>{n(S.reconstructed.faces)} faces</dd><dt className="text-slate-400">Refined mesh</dt><dd data-testid="n-refined">{n(S.refined.faces)} faces</dd>
              <dt className="text-slate-400">Watertight</dt><dd>{R.refined.watertight ? "yes" : `no (${R.refined.holes} holes left open)`}</dd><dt className="text-slate-400">Non-manifold edges</dt><dd>{n(R.refined.non_manifold_edges)}</dd><dt className="text-slate-400">Pieces</dt><dd>{n(R.refined.components)}</dd>
              <dt className="text-slate-400">Distance to the true surface</dt><dd data-testid="n-ref">{n(R.refined.against_reference.mean * 1000, 3)} mm mean · {n(R.refined.against_reference.max * 1000, 2)} mm max</dd>
              <dt className="text-slate-400">Size error vs truth</dt><dd>{R.refined.against_reference.size_error_percent.map((v: number) => `${n(v, 2)}%`).join(", ")}</dd><dt className="text-slate-400">Processing time</dt><dd>{n(report.seconds, 1)} s (CPU)</dd></dl> : <p className="mt-2 text-xs text-slate-400">Loading…</p>}
            <p className="mt-2 text-[11px] text-slate-500">Preset: {report?.preset}. Distances are in model units of the sample (metres for the bunny), shown in millimetres. The truth is the bunny mesh before the scan defects were added.</p></section>
          <section className={CARD}><h2 className={H3}>The desktop software</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-300"><li>Import PLY, OBJ, STL, PCD, XYZ, GLB/GLTF, LAS/LAZ and USDZ (including OBJ with MTL and texture).</li><li>Cleaning, four reconstruction methods with a recommendation, smoothing that keeps edges and size, hole and non-manifold repair, decimation, validation report, export to OBJ, PLY, STL, GLB and GLTF.</li><li>Presets, undo/redo, cancel, before/after comparison, save and open projects.</li></ul>
            <p className="mt-2 text-[11px] text-slate-400">Install and build instructions are in <code>desktop/photogrammetry-studio/README.md</code> of the project source. <Link className="text-blue-300 underline" href="/contact?division=computer-vision">Contact us</Link> for a packaged build or a custom version.</p></section>
          <section className={CARD}><h2 className={H3}>Limits</h2><ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-slate-400"><li>Tested on a degraded real asset, not on real iPhone Object Capture scans.</li><li>CPU processing only; no GPU acceleration.</li><li>Texture maps are kept only while topology is unchanged; re-baking atlases is not implemented.</li><li>Tauri shell verified on Linux only.</li></ul></section>
        </aside>
      </div>
    </PcShell>
  );
}
