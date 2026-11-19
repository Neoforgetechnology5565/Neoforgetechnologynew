"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Branding } from "@/lib/types";
import { ANGLE_LABEL, anglesOf, motionLabel, type Analysis, type Angles } from "@/lib/pose3d/analysis";
import type { FrameEstimate } from "@/lib/pose3d/estimate";
import { BONE_IDX, DATASETS, J, JOINTS, JOINT_LABEL, type Dataset, type V3 } from "@/lib/pose3d/model";
import { PcViewer, ramp } from "@/components/pc/PcViewer";
import PcShell, { Badge, BTN, CARD, GO, H3, INPUT, TAB } from "@/components/pc/PcShell";

interface Done { dataset: Dataset; frames: { points: Float32Array; truth: V3[][] }[]; estimates: FrameEstimate[]; analyses: { id: number; analysis: Analysis }[]; accuracy: { mean: number; perJoint: number[]; frames: number[]; matched: number; missed: number }; ms: number }
type Mode = "both" | "points" | "skeleton"; type Colour = "height" | "person" | "residual";
const PERSON = [0x38bdf8, 0xf97316, 0xa3e635, 0xe879f9], PCOL = (id: number) => PERSON[id % PERSON.length];
const f1 = (v: number, d = 1) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const MOTION_COLOR: Record<string, string> = { stand: "#64748b", walk: "#38bdf8", squat: "#f59e0b", jacks: "#a3e635", jump: "#e879f9", kick: "#f43f5e" };

function Spark({ values, frame, label, unit, color = "#38bdf8", id }: { values: number[]; frame: number; label: string; unit: string; color?: string; id?: string }) {
  const W = 300, H = 56, mx = Math.max(1e-6, ...values), pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - 4 - (v / mx) * (H - 10)}`).join(" "), x = (frame / Math.max(1, values.length - 1)) * W;
  return <div data-testid={id}><p className="flex justify-between text-[11px] text-slate-400"><span>{label}</span><span className="tabular-nums text-slate-200">{f1(values[frame] ?? 0, 2)} {unit} (max {f1(mx, 2)})</span></p><svg viewBox={`0 0 ${W} ${H}`} className="mt-0.5 w-full" role="img" aria-label={label}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /><line x1={x} x2={x} y1="0" y2={H} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" /></svg></div>;
}

export default function PoseApp({ branding }: { branding: Branding }) {
  const host = useRef<HTMLDivElement>(null), viewer = useRef<PcViewer | null>(null), worker = useRef<Worker | null>(null), runId = useRef(0);
  const objs = useRef<{ points?: THREE.Points; skel: THREE.LineSegments[]; joints: THREE.Points[]; truth: THREE.LineSegments[]; traj: THREE.Line[]; arrows: THREE.ArrowHelper[]; root?: THREE.Group }>({ skel: [], joints: [], truth: [], traj: [], arrows: [] });
  const [dsId, setDsId] = useState("walk"), [state, setState] = useState<"idle" | "running" | "done" | "error">("idle"), [progress, setProgress] = useState({ stage: "", fraction: 0 }), [error, setError] = useState(""), [data, setData] = useState<Done | null>(null);
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [mode, setMode] = useState<Mode>("both"), [colour, setColour] = useState<Colour>("height"), [showJoints, setShowJoints] = useState(true), [showTraj, setShowTraj] = useState(true), [showTruth, setShowTruth] = useState(false), [ptSize, setPtSize] = useState(2), [person, setPerson] = useState(0);

  useEffect(() => { if (!host.current) return; const v = new PcViewer(host.current); viewer.current = v; const g = new THREE.GridHelper(8, 16, 0x334155, 0x1e293b); g.position.set(0.2, 0, 0.7); v.left.add(g); v.fit(new THREE.Box3(new THREE.Vector3(-2.6, 0, -2.6), new THREE.Vector3(3, 2.4, 4)), new THREE.Vector3(1.1, 0.5, 1.3)); return () => { v.dispose(); viewer.current = null; }; }, []);
  useEffect(() => () => worker.current?.terminate(), []);
  const load = (id: string) => {
    worker.current?.terminate(); const rid = ++runId.current, w = new Worker(new URL("../../lib/pose3d/worker.ts", import.meta.url), { type: "module" }); worker.current = w; setState("running"); setError(""); setPlaying(false); setProgress({ stage: "Starting", fraction: 0 });
    w.onerror = (e) => { setState("error"); setError(e.message || "The worker failed."); };
    w.onmessage = (ev) => { const m = ev.data; if (m.id !== rid) return; if (m.type === "progress") setProgress({ stage: m.stage, fraction: m.fraction }); else if (m.type === "done") { setData(m as Done); setFrame(0); setPerson(0); setState("done"); setPlaying(true); w.terminate(); } else if (m.type === "error") { setState("error"); setError(m.message); w.terminate(); } };
    w.postMessage({ id: rid, dataset: id });
  };
  useEffect(() => { load("walk"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ---- playback
  useEffect(() => { if (!playing || !data) return; const fps = data.dataset.fps * speed, n = data.frames.length; const t = setInterval(() => setFrame((f) => (f + 1) % n), 1000 / fps); return () => clearInterval(t); }, [playing, data, speed]);

  // ---- scene objects (built once per dataset)
  useEffect(() => {
    const v = viewer.current; if (!v || !data) return; const o = objs.current;
    const clear = () => { for (const k of ["skel", "joints", "truth", "traj", "arrows"] as const) { for (const x of o[k] as THREE.Object3D[]) { x.parent?.remove(x); (x as THREE.Mesh).geometry?.dispose?.(); } o[k] = [] as never; } if (o.points) { o.points.parent?.remove(o.points); o.points.geometry.dispose(); o.points = undefined; } };
    clear(); const maxN = Math.max(...data.frames.map((f) => f.points.length / 3)), g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxN * 3), 3)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(maxN * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true })); pts.frustumCulled = false; v.left.add(pts); o.points = pts;
    const people = Math.max(...data.estimates.map((e) => e.people.length)), ids = data.analyses.map((a) => a.id);
    for (let p = 0; p < Math.max(people, ids.length); p++) {
      const bones = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PCOL(p), linewidth: 2 })); bones.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BONE_IDX.length * 6), 3)); bones.frustumCulled = false; v.left.add(bones); o.skel.push(bones);
      const jp = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true })); jp.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 3), 3)); jp.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(16 * 3), 3)); jp.frustumCulled = false; v.left.add(jp); o.joints.push(jp);
      const tl = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xfacc15, dashSize: 0.04, gapSize: 0.03 })); tl.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BONE_IDX.length * 6), 3)); tl.frustumCulled = false; v.left.add(tl); o.truth.push(tl);
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.5, 0xf8fafc, 0.12, 0.07); arrow.visible = false; v.left.add(arrow); o.arrows.push(arrow);
      for (const [jn, col] of [[J.head, 0xfde68a], [J.l_wrist, 0x4ade80], [J.r_wrist, 0xf87171], [J.l_ankle, 0x22d3ee], [J.r_ankle, 0xfb923c], [J.pelvis, 0xffffff]] as [number, number][]) { const a = data.analyses[p]; if (!a) continue; const tj = a.analysis.trajectories[jn], pos = new Float32Array(tj.length * 3); tj.forEach((q, i) => pos.set(q, i * 3)); const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 })); ln.frustumCulled = false; v.left.add(ln); o.traj.push(ln); }
    }
    v.invalidate(); return clear;
  }, [data]);

  // ---- per-frame update
  const est = data?.estimates[frame], fr = data?.frames[frame];
  useEffect(() => {
    const v = viewer.current, o = objs.current; if (!v || !data || !est || !fr || !o.points) return; const n = fr.points.length / 3, pos = o.points.geometry.getAttribute("position") as THREE.BufferAttribute, col = o.points.geometry.getAttribute("color") as THREE.BufferAttribute;
    pos.array.set(fr.points); const c = col.array as Float32Array;
    for (let i = 0; i < n; i++) { let r = 0.6, g = 0.7, b = 0.9; if (colour === "height") { const q = ramp(Math.min(1, fr.points[i * 3 + 1] / 2)); [r, g, b] = q; } else if (colour === "person") { const pid = est.clusterOf[i] >= 0 ? est.clusterPerson[est.clusterOf[i]] : -2; if (pid >= 0) { const hex = PCOL(pid); r = ((hex >> 16) & 255) / 255; g = ((hex >> 8) & 255) / 255; b = (hex & 255) / 255; } else if (pid === -1) { r = 0.9; g = 0.3; b = 0.3; } else { r = 0.25; g = 0.3; b = 0.4; } } else { const q = ramp(Math.min(1, (est.residual[i] || 0) / 0.05)); [r, g, b] = est.clusterOf[i] >= 0 && est.clusterPerson[est.clusterOf[i]] >= 0 ? q : [0.2, 0.25, 0.32]; } c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
    pos.needsUpdate = true; col.needsUpdate = true; o.points.geometry.setDrawRange(0, n); (o.points.material as THREE.PointsMaterial).size = ptSize; o.points.visible = mode !== "skeleton";
    o.skel.forEach((s, p) => { const person = est.people[p]; s.visible = !!person && mode !== "points"; if (!person) return; const a = (s.geometry.getAttribute("position") as THREE.BufferAttribute); BONE_IDX.forEach(([x, y], k) => { a.array[k * 6] = person.joints[x][0]; a.array[k * 6 + 1] = person.joints[x][1]; a.array[k * 6 + 2] = person.joints[x][2]; a.array[k * 6 + 3] = person.joints[y][0]; a.array[k * 6 + 4] = person.joints[y][1]; a.array[k * 6 + 5] = person.joints[y][2]; }); a.needsUpdate = true; (s.material as THREE.LineBasicMaterial).color.setHex(PCOL(person.id)); });
    o.joints.forEach((jp, p) => { const person = est.people[p]; jp.visible = !!person && showJoints && mode !== "points"; if (!person) return; const a = jp.geometry.getAttribute("position") as THREE.BufferAttribute, cc = jp.geometry.getAttribute("color") as THREE.BufferAttribute; JOINTS.forEach((name, k) => { a.array[k * 3] = person.joints[k][0]; a.array[k * 3 + 1] = person.joints[k][1]; a.array[k * 3 + 2] = person.joints[k][2]; const left = name.startsWith("l_"), right = name.startsWith("r_"), rgb = left ? [0.29, 0.87, 0.5] : right ? [0.97, 0.44, 0.44] : [0.99, 0.9, 0.54]; cc.array[k * 3] = rgb[0]; cc.array[k * 3 + 1] = rgb[1]; cc.array[k * 3 + 2] = rgb[2]; }); a.needsUpdate = true; cc.needsUpdate = true; });
    o.truth.forEach((s, p) => { const t = fr.truth[p]; s.visible = !!t && showTruth; if (!t) return; const a = s.geometry.getAttribute("position") as THREE.BufferAttribute; BONE_IDX.forEach(([x, y], k) => { a.array[k * 6] = t[x][0]; a.array[k * 6 + 1] = t[x][1]; a.array[k * 6 + 2] = t[x][2]; a.array[k * 6 + 3] = t[y][0]; a.array[k * 6 + 4] = t[y][1]; a.array[k * 6 + 5] = t[y][2]; }); a.needsUpdate = true; s.computeLineDistances(); });
    o.arrows.forEach((ar, p) => { const person = est.people[p], an = data.analyses.find((x) => x.id === person?.id)?.analysis; const d = an?.direction[frame], sp = an?.speed[frame] ?? 0; ar.visible = !!person && !!d && sp > 0.25 && showTraj; if (!person || !d) return; ar.position.set(person.joints[J.pelvis][0], 0.03, person.joints[J.pelvis][2]); ar.setDirection(new THREE.Vector3(d[0], 0, d[2]).normalize()); ar.setLength(0.3 + Math.min(1, sp) * 0.6, 0.12, 0.07); });
    o.traj.forEach((ln) => { ln.visible = showTraj; ln.geometry.setDrawRange(0, frame + 1); });
    v.invalidate();
  }, [data, est, fr, frame, mode, colour, showJoints, showTraj, showTruth, ptSize]);

  const analysis = data?.analyses[Math.min(person, (data?.analyses.length ?? 1) - 1)], an = analysis?.analysis;
  const cur = est?.people.find((p) => p.id === analysis?.id), angles: Angles | null = cur ? anglesOf(cur.joints) : null;
  const label = an?.labels[frame];
  const meanConf = est && est.people.length ? est.people.reduce((a, p) => a + p.confidence, 0) / est.people.length : 0;
  const classAcc = useMemo(() => { if (!data) return null; let right = 0, tot = 0; data.analyses.forEach((a, i) => { const m = data.dataset.people[i]?.motion; if (!m) return; right += a.analysis.labels.filter((l) => l === m).length; tot += a.analysis.labels.length; }); return tot ? (right / tot) * 100 : null; }, [data]);
  const resetCam = () => viewer.current?.fit(new THREE.Box3(new THREE.Vector3(-2.6, 0, -2.6), new THREE.Vector3(3, 2.4, 4)), new THREE.Vector3(1.1, 0.5, 1.3));
  return (
    <PcShell branding={branding} title="3D Human Pose Estimation & Motion Analysis" project={data?.dataset.label ?? "Loading sample"} status={state === "running" ? "Processing…" : state === "done" ? "Ready" : "Idle"}
      notice="Sample data: the human point clouds are generated by code from a skeletal model with sensor noise (no real recording and no real person). The skeleton you see is ESTIMATED from the points alone by fitting a body model, not read from the generator, and is scored against the generator's skeleton. No neural network is used. Accuracy applies to this synthetic data only; real depth or LiDAR data would be harder (clothing, occlusion, sensor noise)."
      footer="Working: floor removal, people detection and tracking, articulated skeleton fitting, joint angles, symmetry, range of motion, speed, trajectories, rule-based motion classification, error against the reference skeleton. Not implemented: real sensor input, neural pose models, clothing or hair, hands and feet detail, more than a few people."
      actions={<Badge ok={null}>Frame-by-frame · {data ? `${data.dataset.fps} fps` : ""}</Badge>}>
      {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" data-testid="error">{error}</div>}
      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="space-y-3">
          <section className={CARD}><h2 className={H3}>Dataset</h2>
            <select className={`${INPUT} mt-2 w-full`} value={dsId} onChange={(e) => { setDsId(e.target.value); load(e.target.value); }} data-testid="dataset">{DATASETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
            <p className="mt-2 text-[11px] text-slate-400" data-testid="ds-desc">{DATASETS.find((d) => d.id === dsId)?.description}</p>
            <p className="mt-2 text-[11px] text-slate-500">Sensor: {DATASETS.find((d) => d.id === dsId)?.sensor === "front" ? "one depth camera (only the visible side is captured)" : "multi-view rig (all sides)"}.</p>
          </section>
          <section className={CARD}><h2 className={H3}>View</h2>
            <div className="mt-2 flex flex-wrap gap-1">{(["both", "points", "skeleton"] as Mode[]).map((m) => <button key={m} className={TAB(mode === m)} onClick={() => setMode(m)} data-testid={`mode-${m}`}>{{ both: "Points + skeleton", points: "Point cloud", skeleton: "Skeleton only" }[m]}</button>)}</div>
            <label className="mt-3 block text-xs text-slate-300">Point colour<select className={`${INPUT} mt-1 w-full`} value={colour} onChange={(e) => setColour(e.target.value as Colour)} data-testid="colour"><option value="height">Height above floor</option><option value="person">Detected person (red = rejected object)</option><option value="residual">Distance to the fitted body</option></select></label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showJoints} onChange={(e) => setShowJoints(e.target.checked)} data-testid="t-joints" /> Joint markers (green left, red right)</label>
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showTraj} onChange={(e) => setShowTraj(e.target.checked)} data-testid="t-traj" /> Movement trajectories and direction</label>
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} data-testid="t-truth" /> Reference skeleton (generator, dashed yellow)</label>
            <label className="mt-2 flex items-center justify-between text-xs text-slate-300">Point size<input type="range" min={1} max={6} value={ptSize} onChange={(e) => setPtSize(Number(e.target.value))} className="w-28 accent-blue-500" /></label>
            <button className={`${BTN} mt-3 w-full`} onClick={resetCam} data-testid="reset-camera">Reset camera</button>
          </section>
          {data && data.analyses.length > 1 && <section className={CARD}><h2 className={H3}>Person</h2><div className="mt-2 flex gap-1">{data.analyses.map((a, i) => <button key={a.id} className={TAB(person === i)} onClick={() => setPerson(i)} data-testid={`person-${i}`}>Person {a.id + 1}</button>)}</div></section>}
        </aside>
        <section className="space-y-2" aria-label="3D viewer">
          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950" style={{ height: "min(62vh, 600px)", minHeight: 340 }}>
            <div ref={host} className="absolute inset-0" data-testid="viewport" />
            {state === "running" && <div className="absolute inset-x-0 bottom-0 bg-slate-900/90 p-3" role="status" data-testid="progress"><p className="text-xs text-slate-200">{progress.stage}… {Math.round(progress.fraction * 100)}%</p><div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress.fraction * 100}%` }} /></div></div>}
            {data && <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/80 px-2 py-1 text-[11px] text-slate-200" data-testid="hud">Frame {frame + 1} / {data.frames.length} · {f1(frame / data.dataset.fps, 2)} s · {est?.people.length ?? 0} person(s)</div>}
          </div>
          {data && (
            <div className={`${CARD} space-y-2`} aria-label="Timeline">
              <div className="flex flex-wrap items-center gap-2">
                <button className={GO} onClick={() => setPlaying((p) => !p)} data-testid="play">{playing ? "Pause" : "Play"}</button>
                <button className={BTN} onClick={() => { setPlaying(false); setFrame((f) => (f + data.frames.length - 1) % data.frames.length); }} data-testid="prev" aria-label="Previous frame">◀</button>
                <button className={BTN} onClick={() => { setPlaying(false); setFrame((f) => (f + 1) % data.frames.length); }} data-testid="next" aria-label="Next frame">▶</button>
                <input type="range" min={0} max={data.frames.length - 1} value={frame} onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }} className="min-w-[200px] flex-1 accent-blue-500" aria-label="Timeline" data-testid="timeline" />
                <label className="flex items-center gap-1 text-xs text-slate-300">Speed<select className={INPUT} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} data-testid="speed">{[0.25, 0.5, 1, 2].map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
              </div>
              {an && <div className="flex h-3 overflow-hidden rounded" data-testid="strip" title="Motion class per frame">{an.labels.map((l, i) => <span key={i} onClick={() => { setPlaying(false); setFrame(i); }} className="flex-1 cursor-pointer" style={{ background: MOTION_COLOR[l], outline: i === frame ? "2px solid #fff" : "none" }} />)}</div>}
              <p className="text-[11px] text-slate-500">Motion class per frame: {Object.entries(MOTION_COLOR).map(([k, c]) => <span key={k} className="mr-2"><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: c }} />{motionLabel(k as never)}</span>)}</p>
            </div>)}
        </section>
        <aside className="space-y-3" aria-label="Analysis">
          {!data && <section className={CARD}><p className="text-sm text-slate-400" data-testid="no-data">Preparing the sample…</p></section>}
          {data && est && an && (<>
            <section className={CARD} data-testid="analytics"><h2 className={H3}>Analytics</h2>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-400">People detected</dt><dd data-testid="a-people">{est.people.length}</dd>
                <dt className="text-slate-400">Joints per person</dt><dd data-testid="a-joints">{JOINTS.length}</dd>
                <dt className="text-slate-400">Pose confidence</dt><dd data-testid="a-conf">{f1(meanConf * 100, 0)}% <span className="text-slate-500">(points within 3.5 cm of the fitted body)</span></dd>
                <dt className="text-slate-400">Frame</dt><dd data-testid="a-frame">{frame + 1} / {data.frames.length}</dd>
                <dt className="text-slate-400">Motion class</dt><dd data-testid="a-class" style={{ color: MOTION_COLOR[label ?? "stand"] }}>{label ? motionLabel(label) : "—"}</dd>
                <dt className="text-slate-400">Tracking</dt><dd data-testid="a-track">{est.people.map((p) => `ID ${p.id + 1}: ${p.status}`).join(", ") || "no person found"}</dd>
                <dt className="text-slate-400">Floor / rejected objects</dt><dd>{f1(est.floorY * 100, 1)} cm / {est.rejected}</dd>
                <dt className="text-slate-400">Fitting time</dt><dd>{f1(data.ms / 1000, 1)} s for {data.frames.length} frames</dd>
              </dl></section>
            <section className={CARD} data-testid="bio"><h2 className={H3}>Biomechanics {data.analyses.length > 1 && `· person ${(analysis?.id ?? 0) + 1}`}</h2>
              {angles && <table className="mt-2 w-full text-left text-[11px]" data-testid="angles"><tbody>{(Object.keys(ANGLE_LABEL) as (keyof Angles)[]).map((k) => { const r = an.rom.find((x) => x.key === k)!; return <tr key={k} className="border-t border-slate-800"><td className="py-1 pr-2 text-slate-400">{ANGLE_LABEL[k]}</td><td className="w-16 tabular-nums text-slate-100" data-testid={`ang-${k}`}>{f1(angles[k], 0)}°</td><td className="w-24"><div className="h-1.5 rounded bg-slate-800"><div className="h-1.5 rounded bg-blue-500" style={{ width: `${Math.min(100, (angles[k] / Math.max(10, r.max)) * 100)}%` }} /></div></td><td className="w-20 text-right tabular-nums text-slate-500">ROM {f1(r.range, 0)}°</td></tr>; })}</tbody></table>}
              <div className="mt-3 space-y-2"><Spark id="sp-speed" values={an.speed} frame={frame} label="Pelvis speed" unit="m/s" /><Spark id="sp-wrist" values={an.wristSpeed[1].map((v, i) => Math.max(v, an.wristSpeed[0][i]))} frame={frame} label="Fastest wrist" unit="m/s" color="#f59e0b" /></div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><dt className="text-slate-400">Posture: mean trunk lean</dt><dd>{f1(an.posture.trunkLeanMean, 1)}°</dd><dt className="text-slate-400">Distance moved</dt><dd data-testid="b-dist">{f1(an.distance, 2)} m</dd><dt className="text-slate-400">Mean / max speed</dt><dd>{f1(an.meanSpeed, 2)} / {f1(an.maxSpeed, 2)} m/s</dd></dl>
              <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Movement symmetry (left vs right range of motion)</h3>
              <ul className="mt-1 space-y-1 text-xs" data-testid="symmetry">{an.symmetry.map((s) => <li key={s.pair} className="flex items-center gap-2"><span className="w-20 text-slate-400">{s.pair}</span><span className="h-1.5 flex-1 rounded bg-slate-800"><span className="block h-1.5 rounded bg-green-500" style={{ width: `${s.percent}%` }} /></span><span className="w-10 text-right tabular-nums">{f1(s.percent, 0)}%</span></li>)}</ul>
            </section>
            <section className={CARD} data-testid="accuracy"><h2 className={H3}>Accuracy against the reference skeleton</h2>
              <p className="mt-2 text-sm text-slate-200">Mean joint error <b data-testid="mpjpe">{f1(data.accuracy.mean * 100, 1)} cm</b> over {data.accuracy.matched} person-frames{data.accuracy.missed ? `, ${data.accuracy.missed} missed` : ""}.</p>
              <ul className="mt-2 space-y-1 text-[11px]">{JOINTS.map((n, k) => <li key={n} className="flex items-center gap-2"><span className="w-24 text-slate-400">{JOINT_LABEL[n]}</span><span className="h-1.5 flex-1 rounded bg-slate-800"><span className="block h-1.5 rounded bg-amber-400" style={{ width: `${Math.min(100, (data.accuracy.perJoint[k] / 0.2) * 100)}%` }} /></span><span className="w-12 text-right tabular-nums">{f1(data.accuracy.perJoint[k] * 100, 1)} cm</span></li>)}</ul>
              {classAcc !== null && <p className="mt-2 text-[11px] text-slate-400">Motion class agrees with the generated motion on {f1(classAcc, 0)}% of frames (a squat or jump also contains standing and transition frames).</p>}
              <p className="mt-2 text-[11px] text-slate-500">Hand-fitted body model on synthetic points: expect larger errors on real sensor data.</p>
            </section>
          </>)}
        </aside>
      </div>
    </PcShell>
  );
}
