import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Preview } from "./api";

export type ShadeMode = "solid" | "wire" | "solidwire" | "points";
export interface ViewOpts { shade: ShadeMode; colors: boolean; pointSize: number; bbox: boolean; grid: boolean; zUp: boolean; flat: boolean }
export interface Layer { key: string; label: string; data: Preview | null }
export const camShare = { listeners: new Set<() => void>(), applying: false, src: "", version: 0, pos: new THREE.Vector3(), target: new THREE.Vector3(), zoom: 1, quat: new THREE.Quaternion() };

function Layer3D({ p, origin, o, id }: { p: Preview; origin: number[]; o: ViewOpts; id: string }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
    if (p.colors) g.setAttribute("color", new THREE.BufferAttribute(Float32Array.from(p.colors, (v) => v / 255), 3));
    if (p.kind === "mesh" && p.indices) { g.setIndex(new THREE.BufferAttribute(p.indices, 1)); g.computeVertexNormals(); }
    g.computeBoundingSphere(); return g;
  }, [p]);
  useEffect(() => () => geo.dispose(), [geo]);
  const off: [number, number, number] = [p.center[0] - origin[0], p.center[1] - origin[1], p.center[2] - origin[2]]; const useCol = o.colors && !!p.colors;
  if (p.kind === "cloud" || o.shade === "points") return <points geometry={geo} position={off} frustumCulled={false}><pointsMaterial size={o.pointSize} sizeAttenuation={false} vertexColors={useCol} color={useCol ? "#ffffff" : "#9db4d8"} /></points>;
  return (<group position={off} name={id}>
    {o.shade !== "wire" && <mesh geometry={geo}><meshStandardMaterial vertexColors={useCol} color={useCol ? "#ffffff" : "#b8c4d6"} roughness={0.7} metalness={0.05} side={THREE.DoubleSide} flatShading={o.flat} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} /></mesh>}
    {(o.shade === "wire" || o.shade === "solidwire") && <mesh geometry={geo}><meshBasicMaterial wireframe color={o.shade === "wire" ? "#8fb2ff" : "#15233f"} transparent opacity={o.shade === "wire" ? 0.9 : 0.35} /></mesh>}
  </group>);
}

function Rig({ id, radius, resetKey, controlsRef }: { id: string; radius: number; resetKey: number; controlsRef: React.MutableRefObject<any> }) {
  const { camera, invalidate } = useThree();
  useEffect(() => { const d = radius / Math.tan((45 * Math.PI) / 360) * 1.15; camera.position.set(d * 0.55, d * 0.4, d * 0.85); (camera as THREE.PerspectiveCamera).near = radius / 200; (camera as THREE.PerspectiveCamera).far = radius * 80; camera.updateProjectionMatrix(); controlsRef.current?.target.set(0, 0, 0); controlsRef.current?.update(); camShare.src = id; camShare.version++; camShare.pos.copy(camera.position); camShare.target.set(0, 0, 0); camShare.quat.copy(camera.quaternion); invalidate(); }, [radius, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const seen = useRef(0);
  useEffect(() => { const f = () => invalidate(); camShare.listeners.add(f); return () => { camShare.listeners.delete(f); }; }, [invalidate]);
  useFrame(() => {  // follow another canvas' camera when it was the last one moved (bidirectional sync for compare mode)
    if (camShare.src !== id && camShare.version !== seen.current) { seen.current = camShare.version; camera.position.copy(camShare.pos); controlsRef.current?.target.copy(camShare.target); camera.quaternion.copy(camShare.quat); camShare.applying = true; controlsRef.current?.update(); camShare.applying = false; }
  });
  return null;
}

function Scene({ id, layers, origin, o, radius, resetKey, interactive }: { id: string; layers: Layer[]; origin: number[]; o: ViewOpts; radius: number; resetKey: number; interactive: boolean }) {
  const ctl = useRef<any>(null);
  const box = useMemo(() => { const l = layers.find((x) => x.data)?.data; if (!l) return null; const mn = l.bbox_min.map((v, i) => v - origin[i]), mx = l.bbox_max.map((v, i) => v - origin[i]); return new THREE.Box3(new THREE.Vector3(...mn), new THREE.Vector3(...mx)); }, [layers, origin]);
  return (<>
    <color attach="background" args={["#0b1018"]} />
    <ambientLight intensity={0.6} /><directionalLight position={[3, 5, 4]} intensity={1.6} /><directionalLight position={[-4, -2, -3]} intensity={0.5} color="#8fb0ff" />
    <group rotation={o.zUp ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
      {layers.map((l) => l.data && <Layer3D key={l.key} p={l.data} origin={origin} o={o} id={l.key} />)}
      {o.bbox && box && <box3Helper args={[box, new THREE.Color("#4f8cff")]} />}
    </group>
    {o.grid && <gridHelper args={[radius * 4, 24, "#26324a", "#161e2e"]} position={[0, -radius * (o.zUp ? 1.0 : 1.0) * 0.0 - radius, 0]} />}
    <OrbitControls ref={ctl} makeDefault enabled={interactive} enableDamping dampingFactor={0.12} onChange={(e) => { if (camShare.applying) return; const c = (e as any).target.object as THREE.Camera; camShare.src = id; camShare.version++; camShare.pos.copy(c.position); camShare.target.copy((e as any).target.target); camShare.quat.copy(c.quaternion); camShare.listeners.forEach((f) => f()); }} />
    <Rig id={id} radius={radius} resetKey={resetKey} controlsRef={ctl} />
  </>);
}

function CanvasView({ id, layers, origin, o, radius, resetKey, interactive }: { id: string; layers: Layer[]; origin: number[]; o: ViewOpts; radius: number; resetKey: number; interactive: boolean }) {
  return <Canvas data-testid={`canvas-${id}`} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 45, position: [1, 1, 1], near: 0.01, far: 1000 }} dpr={[1, 1.5]} frameloop="demand"><Scene id={id} layers={layers} origin={origin} o={o} radius={radius} resetKey={resetKey} interactive={interactive} /></Canvas>;
}

export interface CompareState { mode: "single" | "slider" | "split"; a: string; b: string; pos: number }
export default function Viewport({ stages, opts, compare, setCompare, active, resetKey, loading }: { stages: Record<string, Preview | null>; opts: ViewOpts; compare: CompareState; setCompare: (c: CompareState) => void; active: string; resetKey: number; loading: boolean }) {
  const first = Object.values(stages).find(Boolean) as Preview | undefined; const origin = (stages.original ?? first)?.center ?? [0, 0, 0];
  const radius = useMemo(() => { const all = Object.values(stages).filter(Boolean) as Preview[]; if (!all.length) return 1; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; all.forEach((p) => p.bbox_min.forEach((v, i) => { mn[i] = Math.min(mn[i], v); mx[i] = Math.max(mx[i], p.bbox_max[i]); })); return Math.max(1e-9, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2); }, [stages]);
  const L = (k: string): Layer[] => [{ key: k, label: k, data: stages[k] ?? null }];
  const host = useRef<HTMLDivElement>(null);
  const drag = (e: React.PointerEvent) => { const r = host.current!.getBoundingClientRect(); const mv = (ev: PointerEvent) => setCompare({ ...compare, pos: Math.max(0.03, Math.min(0.97, (ev.clientX - r.left) / r.width)) }); const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); e.preventDefault(); };
  const empty = !first;
  return (
    <div ref={host} className="relative h-full w-full overflow-hidden bg-[#0b1018]" data-testid="viewport">
      {compare.mode === "single" && <CanvasView id="main" layers={L(active)} origin={origin} o={opts} radius={radius} resetKey={resetKey} interactive />}
      {compare.mode === "slider" && (<>
        <CanvasView id="b" layers={L(compare.b)} origin={origin} o={opts} radius={radius} resetKey={resetKey} interactive />
        <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${(1 - compare.pos) * 100}% 0 0)` }}><CanvasView id="a" layers={L(compare.a)} origin={origin} o={opts} radius={radius} resetKey={resetKey} interactive={false} /></div>
        <div className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize" style={{ left: `${compare.pos * 100}%` }} onPointerDown={drag} data-testid="compare-handle" role="slider" aria-label="Comparison divider" aria-valuenow={Math.round(compare.pos * 100)}><div className="mx-auto h-full w-0.5 bg-white/80" /><div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink-900/80 text-center text-[10px] leading-6 text-white">⇔</div></div>
        <span className="absolute left-2 top-2 rounded bg-ink-900/85 px-2 py-0.5 text-[11px] text-white" data-testid="label-a">{compare.a}</span><span className="absolute right-2 top-2 rounded bg-ink-900/85 px-2 py-0.5 text-[11px] text-white" data-testid="label-b">{compare.b}</span>
      </>)}
      {compare.mode === "split" && (<div className="grid h-full grid-cols-2 gap-px bg-ink-700">
        <div className="relative"><CanvasView id="a" layers={L(compare.a)} origin={origin} o={opts} radius={radius} resetKey={resetKey} interactive /><span className="absolute left-2 top-2 rounded bg-ink-900/85 px-2 py-0.5 text-[11px] text-white" data-testid="label-a">{compare.a}</span></div>
        <div className="relative"><CanvasView id="b" layers={L(compare.b)} origin={origin} o={opts} radius={radius} resetKey={resetKey} interactive /><span className="absolute left-2 top-2 rounded bg-ink-900/85 px-2 py-0.5 text-[11px] text-white" data-testid="label-b">{compare.b}</span></div></div>)}
      {empty && !loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm text-slate-500"><div><p className="text-base text-slate-300">No data yet</p><p>Drop a point cloud or mesh here, use Import, or open the sample project.</p></div></div>}
      {loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/40 text-sm text-slate-200">Loading preview…</div>}
    </div>
  );
}
