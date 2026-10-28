"use client";
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { CamerasJson, Layer, Vec3 } from "@/lib/spatial/types";

export type ColorMode = "rgb" | "height" | "flat";
export type Tool = "orbit" | "distance" | "angle" | "calibrate";
export interface Source { url: string; format: string }
export interface LoadedInfo { count?: number; vertices?: number; faces?: number; bbox?: { min: Vec3; max: Vec3 }; hasColors?: boolean }
export interface ViewerHandle { reset(): void; focusCamera(name: string): void }
interface Props {
  sparse?: Source; dense?: Source; mesh?: Source; cameras?: CamerasJson | null; selectedCamera: string | null; onPickCamera: (name: string) => void; layers: Record<Layer, boolean>;
  pointSize: number; colorMode: ColorMode; wireframe: boolean; meshOpacity: number; tool: Tool; picks: Vec3[]; onPick: (p: Vec3) => void; up: Vec3 | null; onLoaded: (id: "sparse" | "dense" | "mesh", i: LoadedInfo | null, err?: string) => void;
}
const PICK_COLORS = [0xfacc15, 0x22d3ee, 0xf472b6];

const checked = (r: { geo: THREE.BufferGeometry; isMesh: boolean }) => { const a = r.geo.getAttribute("position"); if (!a || a.count === 0) throw new Error("The file contains no vertices."); const arr = a.array as ArrayLike<number>; for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error("The file contains invalid coordinates (not-a-number values), so it cannot be shown."); return r; };
async function loadGeometry(src: Source): Promise<{ geo: THREE.BufferGeometry; isMesh: boolean; object?: THREE.Object3D }> { return checked(await loadGeometryRaw(src)); }
async function loadGeometryRaw(src: Source): Promise<{ geo: THREE.BufferGeometry; isMesh: boolean; object?: THREE.Object3D }> {
  const f = src.format.toLowerCase();
  const buf = await (await fetch(src.url)).arrayBuffer();
  if (f === "ply") { const g = new PLYLoader().parse(buf); return { geo: g, isMesh: !!g.index && g.index.count > 0 }; }
  if (f === "pcd") { const p = new PCDLoader().parse(buf); return { geo: p.geometry, isMesh: false }; }
  if (f === "stl") return { geo: new STLLoader().parse(buf), isMesh: true };
  if (f === "obj") { const o = new OBJLoader().parse(new TextDecoder().decode(buf)); let g: THREE.BufferGeometry | null = null; o.traverse((c) => { if (!g && (c as THREE.Mesh).isMesh) g = (c as THREE.Mesh).geometry; }); if (!g) throw new Error("The OBJ file contains no mesh."); return { geo: g, isMesh: true }; }
  if (f === "glb") { const gl = await new GLTFLoader().parseAsync(buf, ""); let g: THREE.BufferGeometry | null = null; gl.scene.traverse((c) => { if (!g && (c as THREE.Mesh).isMesh) g = (c as THREE.Mesh).geometry; }); if (!g) throw new Error("The GLB contains no mesh."); return { geo: g, isMesh: true }; }
  throw new Error(`Unsupported format ${f}`);
}

const SpatialViewer = forwardRef<ViewerHandle, Props>(function SpatialViewer(p, ref) {
  const host = useRef<HTMLDivElement>(null); const props = useRef(p); props.current = p;
  const S = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; root: THREE.Group; groups: Record<string, THREE.Group>; gizmo: THREE.Scene; gcam: THREE.PerspectiveCamera; dirty: boolean; size: number; ro: ResizeObserver; raf: number; pts: Record<string, THREE.Points | undefined>; mesh?: THREE.Mesh; camObjs: Record<string, THREE.LineSegments> } | null>(null);

  // scene setup --------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const el = host.current!; const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setClearColor(0x0b1220); el.appendChild(r.domElement); r.domElement.style.display = "block"; r.domElement.style.position = "absolute"; r.domElement.style.inset = "0";
    const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, 1, 0.01, 1e5); cam.position.set(2, 1.5, 3); const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true;
    const root = new THREE.Group(); scene.add(root); const groups: Record<string, THREE.Group> = {}; for (const n of ["cloud", "dense", "mesh", "trajectory", "cameras", "bbox", "axes", "grid", "picks"]) { groups[n] = new THREE.Group(); root.add(groups[n]); }
    scene.add(new THREE.AmbientLight(0xffffff, 0.8)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(3, 5, 4); scene.add(dl); const dl2 = new THREE.DirectionalLight(0xffffff, 0.6); dl2.position.set(-3, -2, -4); scene.add(dl2);
    const gizmo = new THREE.Scene(); gizmo.add(new THREE.AxesHelper(1)); const gcam = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
    const st = { r, scene, cam, ctl, root, groups, gizmo, gcam, dirty: true, size: 1, raf: 0, pts: {} as Record<string, THREE.Points | undefined>, camObjs: {} as Record<string, THREE.LineSegments>, ro: null as unknown as ResizeObserver };
    S.current = st as never; ctl.addEventListener("change", () => { st.dirty = true; });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); st.dirty = true; }; st.ro = new ResizeObserver(resize); st.ro.observe(el); resize();
    const loop = () => { st.raf = requestAnimationFrame(loop); ctl.update(); if (!st.dirty) return; st.dirty = false; const w = el.clientWidth, h = el.clientHeight; r.setScissorTest(false); r.setViewport(0, 0, w, h); r.render(scene, cam);
      const g = Math.round(Math.min(110, w * 0.25)); r.setScissorTest(true); r.setViewport(8, 8, g, g); r.setScissor(8, 8, g, g); gcam.position.copy(cam.position).sub(ctl.target).setLength(3); gcam.quaternion.copy(cam.quaternion); r.clearDepth(); r.render(gizmo, gcam); r.setScissorTest(false); };
    loop();
    return () => { cancelAnimationFrame(st.raf); st.ro.disconnect(); ctl.dispose(); r.dispose(); el.removeChild(r.domElement); S.current = null; };
  }, []);

  const fitTo = (box: THREE.Box3) => { const s = S.current; if (!s || box.isEmpty()) return; const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3()); const d = Math.max(size.length(), 1e-6); s.size = d; const w = s.root.localToWorld(c.clone()); s.ctl.target.copy(w); s.cam.near = d / 1000; s.cam.far = d * 100; s.cam.updateProjectionMatrix(); s.cam.position.copy(w).add(new THREE.Vector3(0.9, 0.6, 1.1).normalize().multiplyScalar(d * 1.1)); s.ctl.update(); s.dirty = true; };
  const sceneBox = () => { const s = S.current!; s.root.updateMatrixWorld(true); const b = new THREE.Box3(); for (const n of ["cloud", "dense", "mesh"]) s.groups[n].children.forEach((o) => { const g = (o as THREE.Mesh).geometry; if (g) { g.computeBoundingBox(); b.union(g.boundingBox!); } }); return b; };
  useImperativeHandle(ref, () => ({ reset: () => fitTo(sceneBox()), focusCamera: (name: string) => { const s = S.current, o = s?.camObjs[name]; if (!s || !o) return; const w = s.root.localToWorld(o.position.clone()); s.ctl.target.copy(w); s.dirty = true; } }));

  // up vector -> +Y ---------------------------------------------------------------------------------------------------------------
  useEffect(() => { const s = S.current; if (!s) return; const u = p.up ? new THREE.Vector3(...p.up).normalize() : new THREE.Vector3(0, 1, 0); s.root.quaternion.setFromUnitVectors(u, new THREE.Vector3(0, 1, 0)); s.dirty = true; }, [p.up]);

  // data ----------------------------------------------------------------------------------------------------------------------------
  const clear = (g: THREE.Group) => { g.children.slice().forEach((c) => { g.remove(c); (c as THREE.Mesh).geometry?.dispose(); }); };
  const colorize = (geo: THREE.BufferGeometry, mode: ColorMode) => {
    const pos = geo.getAttribute("position"); const col = geo.getAttribute("color"); const n = pos.count; const out = new Float32Array(n * 3);
    if (mode === "rgb" && col) { for (let i = 0; i < n * 3; i++) out[i] = col.array[i] / (col.array instanceof Uint8Array ? 255 : 1); }
    else if (mode === "height") { const u = props.current.up ? new THREE.Vector3(...props.current.up).normalize() : new THREE.Vector3(0, 1, 0); let lo = Infinity, hi = -Infinity; const h = new Float32Array(n); for (let i = 0; i < n; i++) { h[i] = pos.getX(i) * u.x + pos.getY(i) * u.y + pos.getZ(i) * u.z; lo = Math.min(lo, h[i]); hi = Math.max(hi, h[i]); } const c = new THREE.Color(); for (let i = 0; i < n; i++) { c.setHSL(0.66 - 0.66 * ((h[i] - lo) / Math.max(hi - lo, 1e-9)), 0.85, 0.55); out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; } }
    else for (let i = 0; i < n; i++) { out[i * 3] = 0.78; out[i * 3 + 1] = 0.86; out[i * 3 + 2] = 0.95; }
    geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
  };
  const info = (geo: THREE.BufferGeometry, mesh: boolean): LoadedInfo => { geo.computeBoundingBox(); const b = geo.boundingBox!; return { count: geo.getAttribute("position").count, vertices: geo.getAttribute("position").count, faces: mesh ? (geo.index ? geo.index.count / 3 : geo.getAttribute("position").count / 3) : undefined, bbox: { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }, hasColors: !!geo.getAttribute("color") }; };
  const loadCloud = (id: "sparse" | "dense", src: Source | undefined) => {
    const s = S.current; if (!s) return; const g = s.groups[id === "sparse" ? "cloud" : "dense"]; clear(g); s.pts[id] = undefined; if (!src) { props.current.onLoaded(id, null); return; }
    loadGeometry(src).then(({ geo, isMesh }) => { if (!S.current) return; if (isMesh) { throw new Error("This file is a mesh, not a point cloud."); } const hadColors = !!geo.getAttribute("color"); const raw = geo.clone(); colorize(geo, hadColors ? "rgb" : "height"); (geo as THREE.BufferGeometry & { _raw?: THREE.BufferGeometry })._raw = raw;
      const m = new THREE.PointsMaterial({ size: props.current.pointSize, vertexColors: true, sizeAttenuation: false }); const pts = new THREE.Points(geo, m); pts.frustumCulled = false; g.add(pts); s.pts[id] = pts; colorize(geo, props.current.colorMode === "rgb" && !hadColors ? "height" : props.current.colorMode); props.current.onLoaded(id, info(geo, false)); fitTo(sceneBox()); }).catch((e) => props.current.onLoaded(id, null, e instanceof Error ? e.message : "Could not load."));
  };
  useEffect(() => loadCloud("sparse", p.sparse), [p.sparse?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => loadCloud("dense", p.dense), [p.dense?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = S.current; if (!s) return; clear(s.groups.mesh); s.mesh = undefined; if (!p.mesh) { props.current.onLoaded("mesh", null); return; }
    loadGeometry(p.mesh).then(({ geo, isMesh }) => { if (!S.current) return; if (!isMesh) throw new Error("This file has no faces."); if (!geo.getAttribute("normal")) geo.computeVertexNormals(); const hasCol = !!geo.getAttribute("color"); const mat = new THREE.MeshStandardMaterial({ color: hasCol ? 0xffffff : 0xb8c4d6, vertexColors: hasCol, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, transparent: true, opacity: props.current.meshOpacity, wireframe: props.current.wireframe });
      const m = new THREE.Mesh(geo, mat); s.groups.mesh.add(m); s.mesh = m; props.current.onLoaded("mesh", info(geo, true)); fitTo(sceneBox()); }).catch((e) => props.current.onLoaded("mesh", null, e instanceof Error ? e.message : "Could not load."));
  }, [p.mesh?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // cameras, trajectory, bbox, axes ---------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const s = S.current; if (!s) return; clear(s.groups.cameras); clear(s.groups.trajectory); s.camObjs = {}; const c = p.cameras; if (!c || !c.registered.length) { s.dirty = true; return; }
    const box = sceneBox(); const diag = box.isEmpty() ? Math.max(1, new THREE.Box3().setFromPoints(c.registered.map((r) => new THREE.Vector3(...r.center))).getSize(new THREE.Vector3()).length()) : box.getSize(new THREE.Vector3()).length(); const sz = diag * 0.018;
    for (const r of c.registered) {
      const C = new THREE.Vector3(...r.center), R = r.rotation_cam_from_world; const x = new THREE.Vector3(...R[0]), y = new THREE.Vector3(...R[1]), z = new THREE.Vector3(...R[2]); const fx = r.camera.params[0], w = r.camera.width, h = r.camera.height; const tx = w / 2 / fx, ty = h / 2 / fx;
      const corner = (a: number, b: number) => z.clone().add(x.clone().multiplyScalar(a * tx)).add(y.clone().multiplyScalar(b * ty)).multiplyScalar(sz);
      const k = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]; const verts: number[] = []; const o = new THREE.Vector3(); const push = (a: THREE.Vector3, b: THREE.Vector3) => verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (let i = 0; i < 4; i++) { push(o, k[i]); push(k[i], k[(i + 1) % 4]); }
      const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(verts, 3)); const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: r.name === props.current.selectedCamera ? 0xfacc15 : 0x38bdf8 })); ls.position.copy(C); ls.userData.name = r.name; s.groups.cameras.add(ls); s.camObjs[r.name] = ls;
    }
    const order = [...c.registered].sort((a, b) => (a.frame_index ?? 0) - (b.frame_index ?? 0)); s.groups.trajectory.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(order.map((r) => new THREE.Vector3(...r.center))), new THREE.LineBasicMaterial({ color: 0xf97316 })));
    s.dirty = true;
  }, [p.cameras, p.sparse?.url, p.dense?.url, p.mesh?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const s = S.current; if (!s) return; for (const [n, o] of Object.entries(s.camObjs)) (o.material as THREE.LineBasicMaterial).color.set(n === p.selectedCamera ? 0xfacc15 : 0x38bdf8); s.dirty = true; }, [p.selectedCamera]);
  useEffect(() => {
    const s = S.current; if (!s) return; for (const n of ["bbox", "axes", "grid"]) clear(s.groups[n]); const b = sceneBox(); if (b.isEmpty()) return; const size = b.getSize(new THREE.Vector3()); const d = size.length();
    s.groups.bbox.add(new THREE.Box3Helper(b, new THREE.Color(0x94a3b8))); const ax = new THREE.AxesHelper(d * 0.25); ax.position.copy(b.min); s.groups.axes.add(ax);
    const grid = new THREE.GridHelper(d * 1.5, 20, 0x475569, 0x1e293b); const u = p.up ? new THREE.Vector3(...p.up).normalize() : new THREE.Vector3(0, 1, 0); const upAxis = new THREE.Vector3(0, 1, 0); grid.quaternion.setFromUnitVectors(upAxis, u); const half = (Math.abs(u.x) * size.x + Math.abs(u.y) * size.y + Math.abs(u.z) * size.z) / 2; grid.position.copy(b.getCenter(new THREE.Vector3())).addScaledVector(u, -half); s.groups.grid.add(grid); s.dirty = true;
  }, [p.sparse?.url, p.dense?.url, p.mesh?.url, p.up]); // eslint-disable-line react-hooks/exhaustive-deps

  // layers and look -------------------------------------------------------------------------------------------------------------------------
  useEffect(() => { const s = S.current; if (!s) return; const L = p.layers; s.groups.cloud.visible = L.cloud; s.groups.dense.visible = L.dense; s.groups.mesh.visible = L.mesh; s.groups.trajectory.visible = L.trajectory; s.groups.cameras.visible = L.cameras; s.groups.bbox.visible = L.bbox; s.groups.axes.visible = L.axes; s.groups.grid.visible = L.grid; s.gizmo.visible = L.axes; s.dirty = true; }, [p.layers]);
  useEffect(() => { const s = S.current; if (!s) return; for (const o of Object.values(s.pts)) if (o) (o.material as THREE.PointsMaterial).size = p.pointSize; s.dirty = true; }, [p.pointSize]);
  useEffect(() => { const s = S.current; if (!s) return; for (const [id, o] of Object.entries(s.pts)) if (o) { const g = o.geometry as THREE.BufferGeometry & { _raw?: THREE.BufferGeometry }; const had = !!g._raw?.getAttribute("color"); colorize(g, p.colorMode === "rgb" && !had ? "height" : p.colorMode); if (p.colorMode === "rgb" && had && g._raw) { const c = g._raw.getAttribute("color"); const out = new Float32Array(c.count * 3); for (let i = 0; i < out.length; i++) out[i] = c.array[i] / (c.array instanceof Uint8Array ? 255 : 1); g.setAttribute("color", new THREE.BufferAttribute(out, 3)); } void id; } s.dirty = true; }, [p.colorMode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const s = S.current; if (!s?.mesh) return; const m = s.mesh.material as THREE.MeshStandardMaterial; m.wireframe = p.wireframe; m.opacity = p.meshOpacity; m.transparent = p.meshOpacity < 1; m.needsUpdate = true; s.dirty = true; }, [p.wireframe, p.meshOpacity]);

  // pick markers ------------------------------------------------------------------------------------------------------------------------------
  useEffect(() => { const s = S.current; if (!s) return; clear(s.groups.picks); const r = s.size * 0.008; p.picks.forEach((q, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ color: PICK_COLORS[i % 3] })); m.position.set(...q); s.groups.picks.add(m); });
    if (p.picks.length >= 2) s.groups.picks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p.picks.map((q) => new THREE.Vector3(...q))), new THREE.LineBasicMaterial({ color: 0xfacc15 }))); s.dirty = true; }, [p.picks]);
  const click = (e: React.PointerEvent) => {
    const s = S.current; if (!s || e.button !== 0) return; const d0 = down.current; if (!d0 || Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 4) return;
    const r = s.r.domElement.getBoundingClientRect(); const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, s.cam); rc.params.Points = { threshold: s.size * 0.01 }; s.root.updateMatrixWorld(true);
    if (props.current.tool === "orbit") { const hit = rc.intersectObjects(Object.values(s.camObjs), false)[0]; if (hit) props.current.onPickCamera(hit.object.userData.name); return; }
    const targets: THREE.Object3D[] = [...Object.values(s.pts).filter((o): o is THREE.Points => !!o && o.parent!.visible), ...(s.mesh && s.groups.mesh.visible ? [s.mesh] : [])]; const hit = rc.intersectObjects(targets, false)[0]; if (!hit) return;
    const local = s.root.worldToLocal(hit.point.clone()); props.current.onPick([local.x, local.y, local.z]);
  };
  const down = useRef<{ x: number; y: number } | null>(null);
  return <div ref={host} className={`relative h-full min-h-[22rem] w-full overflow-hidden rounded-lg bg-[#0b1220] ${p.tool === "orbit" ? "cursor-grab" : "cursor-crosshair"}`} data-testid="viewport" onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={click} />;
});
export default SpatialViewer;
