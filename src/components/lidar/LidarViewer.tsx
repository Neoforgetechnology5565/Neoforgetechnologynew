"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LABELS, LABEL_COLOR, type ColorMode, type Measurement, type PointData, type Vec3, type Wire } from "@/lib/lidar/types";

export interface ViewerHandle { reset(): void; view(kind: "top" | "side"): void; focus(p: Vec3): void; snapshot(): string }
interface Props {
  data: PointData | null; colorMode: ColorMode; pointSize: number; background: string; layers: Record<number, boolean>; showBBox: boolean; showGrid: boolean;
  wires: Wire[]; selectedWire: string | null; onSelectWire: (id: string | null) => void; picks: Vec3[]; tool: "orbit" | "pick"; onPick: (p: Vec3) => void; measurement: Measurement | null;
}
const hex = (s: string) => new THREE.Color(s);
const RAMP = ["#1d4ed8", "#06b6d4", "#22c55e", "#facc15", "#ef4444"].map(hex);
function ramp(t: number, out: THREE.Color) { const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1); const i = Math.min(RAMP.length - 2, Math.floor(x)); return out.copy(RAMP[i]).lerp(RAMP[i + 1], x - i); }

/** Z-up point-cloud viewport. Points are in local coordinates (world minus an origin) because float32 cannot hold UTM-sized values; picks are returned in world coordinates. */
const LidarViewer = forwardRef<ViewerHandle, Props>(function LidarViewer(p, ref) {
  const host = useRef<HTMLDivElement>(null); const props = useRef(p); props.current = p;
  const S = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; clouds: THREE.Group; overlay: THREE.Group; wires: THREE.Group; picks: THREE.Group; bbox: THREE.Group; grid: THREE.Group; ray: THREE.Raycaster; dirty: boolean; size: number; raf: number; ro: ResizeObserver; groupsByLabel: Record<number, { pts: THREE.Points; idx: Uint32Array }> } | null>(null);

  useEffect(() => {
    const el = host.current!; const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.domElement.style.display = "block"; r.domElement.style.width = "100%"; r.domElement.style.height = "100%"; el.appendChild(r.domElement);
    const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1e6); cam.up.set(0, 0, 1); cam.position.set(60, -80, 60);
    const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.screenSpacePanning = true;
    const mk = () => { const g = new THREE.Group(); scene.add(g); return g; };
    const clouds = mk(), overlay = mk(), wires = mk(), picks = mk(), bbox = mk(), grid = mk();
    const ray = new THREE.Raycaster(); const st = { r, scene, cam, ctl, clouds, overlay, wires, picks, bbox, grid, ray, dirty: true, size: 100, raf: 0, ro: null as unknown as ResizeObserver, groupsByLabel: {} as never };
    S.current = st; ctl.addEventListener("change", () => { st.dirty = true; });
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); st.dirty = true; };
    st.ro = new ResizeObserver(resize); st.ro.observe(el); resize();
    const loop = () => { st.raf = requestAnimationFrame(loop); ctl.update(); if (!st.dirty) return; st.dirty = false; r.render(scene, cam); };
    loop();
    return () => { cancelAnimationFrame(st.raf); st.ro.disconnect(); ctl.dispose(); r.dispose(); el.removeChild(r.domElement); S.current = null; };
  }, []);

  const fit = () => {
    const s = S.current, d = props.current.data; if (!s || !d) return;
    const lo = new THREE.Vector3(...d.meta.local_min), hi = new THREE.Vector3(...d.meta.local_max); const c = lo.clone().add(hi).multiplyScalar(0.5); const size = hi.clone().sub(lo).length();
    s.size = Math.max(size, 1); s.ctl.target.copy(c); s.cam.position.copy(c).add(new THREE.Vector3(0.7, -1.0, 0.8).multiplyScalar(size * 0.9)); s.cam.near = Math.max(0.05, size / 5000); s.cam.far = size * 20; s.cam.updateProjectionMatrix(); s.ctl.update(); s.dirty = true;
  };
  useImperativeHandle(ref, () => ({
    reset: fit,
    view: (kind) => { const s = S.current, d = props.current.data; if (!s || !d) return; const c = new THREE.Vector3(...d.meta.local_min).add(new THREE.Vector3(...d.meta.local_max)).multiplyScalar(0.5); s.ctl.target.copy(c); s.cam.position.copy(c).add(kind === "top" ? new THREE.Vector3(0.0001, -0.001, s.size * 1.1) : new THREE.Vector3(0, -s.size * 1.2, s.size * 0.05)); s.ctl.update(); s.dirty = true; },
    focus: (w) => { const s = S.current, d = props.current.data; if (!s || !d) return; const l = new THREE.Vector3(w[0] - d.meta.origin[0], w[1] - d.meta.origin[1], w[2] - d.meta.origin[2]); const off = s.cam.position.clone().sub(s.ctl.target); s.ctl.target.copy(l); s.cam.position.copy(l).add(off.setLength(Math.min(off.length(), s.size * 0.25))); s.ctl.update(); s.dirty = true; },
    snapshot: () => { const s = S.current; if (!s) return ""; s.r.render(s.scene, s.cam); return s.r.domElement.toDataURL("image/png"); },
  }), []);

  // --- cloud geometry: one Points object per class so layers can be toggled -------------------------------------------------------
  useEffect(() => {
    const s = S.current; if (!s) return; s.clouds.clear(); s.groupsByLabel = {} as never; const d = p.data; if (!d) { s.dirty = true; return; }
    const by: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
    for (let i = 0; i < d.meta.n; i++) (by[d.label[i]] ?? by[0]).push(i);
    for (const L of LABELS) {
      const idx = Uint32Array.from(by[L]); if (!idx.length) continue; const pos = new Float32Array(idx.length * 3);
      for (let k = 0; k < idx.length; k++) { const i = idx[k]; pos[k * 3] = d.xyz[i * 3]; pos[k * 3 + 1] = d.xyz[i * 3 + 1]; pos[k * 3 + 2] = d.xyz[i * 3 + 2]; }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(idx.length * 3), 3));
      const m = new THREE.PointsMaterial({ size: props.current.pointSize, sizeAttenuation: false, vertexColors: true }); const pts = new THREE.Points(g, m); pts.frustumCulled = false; s.clouds.add(pts); (s.groupsByLabel as Record<number, { pts: THREE.Points; idx: Uint32Array }>)[L] = { pts, idx };
    }
    // bounding box and ground grid
    s.bbox.clear(); s.grid.clear(); const lo = new THREE.Vector3(...d.meta.local_min), hi = new THREE.Vector3(...d.meta.local_max);
    s.bbox.add(new THREE.Box3Helper(new THREE.Box3(lo, hi), new THREE.Color("#fbbf24")));
    const gh = new THREE.GridHelper(Math.max(hi.x - lo.x, hi.y - lo.y), 20, 0x475569, 0x1e293b); gh.rotation.x = Math.PI / 2; gh.position.set((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z); s.grid.add(gh);
    fit(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.data]);

  // --- colours -----------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const s = S.current, d = p.data; if (!s || !d) return; const c = new THREE.Color();
    const zlo = d.meta.local_min[2], zhi = d.meta.local_max[2];
    let hhi = 1; if (d.hag) { let m = 0; for (let i = 0; i < d.hag.length; i += 7) if (d.hag[i] > m) m = d.hag[i]; hhi = Math.max(1, Math.min(m, 40)); }
    let ilo = 0, ihi = 1; if (d.meta.intensity_range) { ilo = d.meta.intensity_range[0]; ihi = Math.max(ilo + 1, d.meta.intensity_range[1]); }
    for (const [lab, grp] of Object.entries(s.groupsByLabel as Record<string, { pts: THREE.Points; idx: Uint32Array }>)) {
      const col = grp.pts.geometry.getAttribute("color") as THREE.BufferAttribute; const L = Number(lab);
      for (let k = 0; k < grp.idx.length; k++) {
        const i = grp.idx[k]; let ok = true;
        if (p.colorMode === "classification") c.set(LABEL_COLOR[L]);
        else if (p.colorMode === "height") ramp((d.xyz[i * 3 + 2] - zlo) / Math.max(zhi - zlo, 1e-6), c);
        else if (p.colorMode === "hag" && d.hag) ramp(d.hag[i] / hhi, c);
        else if (p.colorMode === "rgb" && d.rgb) c.setRGB(d.rgb[i * 3] / 255, d.rgb[i * 3 + 1] / 255, d.rgb[i * 3 + 2] / 255);
        else if (p.colorMode === "intensity" && d.intensity) { const t = (d.intensity[i] - ilo) / (ihi - ilo); c.setRGB(t, t, t); }
        else ok = false;
        if (!ok) c.set("#cbd5e1");
        col.setXYZ(k, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
    s.dirty = true;
  }, [p.data, p.colorMode]);

  useEffect(() => { const s = S.current; if (!s) return; for (const g of Object.values(s.groupsByLabel as Record<string, { pts: THREE.Points }>)) (g.pts.material as THREE.PointsMaterial).size = p.pointSize; s.dirty = true; }, [p.pointSize, p.data]);
  useEffect(() => { const s = S.current; if (!s) return; s.r.setClearColor(new THREE.Color(p.background)); s.dirty = true; }, [p.background]);
  useEffect(() => { const s = S.current; if (!s) return; for (const [lab, g] of Object.entries(s.groupsByLabel as Record<string, { pts: THREE.Points }>)) g.pts.visible = p.layers[Number(lab)] !== false; s.dirty = true; }, [p.layers, p.data]);
  useEffect(() => { const s = S.current; if (!s) return; s.bbox.visible = p.showBBox; s.grid.visible = p.showGrid; s.dirty = true; }, [p.showBBox, p.showGrid, p.data]);

  // --- wires, picks, measurement overlay ----------------------------------------------------------------------------------------
  useEffect(() => {
    const s = S.current, d = p.data; if (!s) return; s.wires.clear(); if (!d) { s.dirty = true; return; }
    for (const w of p.wires) {
      if (!w.curve || w.curve.length < 2) continue; const sel = p.selectedWire === w.id; const pts = w.curve.map((v) => new THREE.Vector3(v[0] - d.meta.origin[0], v[1] - d.meta.origin[1], v[2] - d.meta.origin[2]));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: sel ? "#fde047" : "#f43f5e" })); line.userData = { id: w.id }; s.wires.add(line);
      if (sel) for (const e of [pts[0], pts[pts.length - 1]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(s.size / 300, 12, 12), new THREE.MeshBasicMaterial({ color: "#fde047" })); m.position.copy(e); s.wires.add(m); }
    }
    s.dirty = true;
  }, [p.wires, p.selectedWire, p.data]);
  useEffect(() => {
    const s = S.current, d = p.data; if (!s) return; s.picks.clear(); if (!d) return; const rad = s.size / 400; const cols = ["#facc15", "#22d3ee", "#f472b6"];
    p.picks.forEach((w, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 14, 14), new THREE.MeshBasicMaterial({ color: cols[i % 3] })); m.position.set(w[0] - d.meta.origin[0], w[1] - d.meta.origin[1], w[2] - d.meta.origin[2]); m.renderOrder = 5; (m.material as THREE.Material).depthTest = false; s.picks.add(m); });
    if (p.measurement) { const [a, b] = p.measurement.closest_points; const L = [a, b].map((v) => new THREE.Vector3(v[0] - d.meta.origin[0], v[1] - d.meta.origin[1], v[2] - d.meta.origin[2])); const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(L), new THREE.LineBasicMaterial({ color: "#38bdf8", depthTest: false })); ln.renderOrder = 6; s.picks.add(ln); for (const e of L) { const m = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.8, 12, 12), new THREE.MeshBasicMaterial({ color: "#38bdf8", depthTest: false })); m.position.copy(e); m.renderOrder = 6; s.picks.add(m); } }
    s.dirty = true;
  }, [p.picks, p.measurement, p.data]);

  // --- picking -----------------------------------------------------------------------------------------------------------------
  const down = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { down.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const s = S.current, d = props.current.data, dn = down.current; down.current = null; if (!s || !d || !dn) return; if (Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 4) return; // a drag is not a click
    const el = host.current!; const r = el.getBoundingClientRect(); const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); s.ray.setFromCamera(ndc, s.cam);
    // wires first (selecting a structure), then points
    s.ray.params.Line = { threshold: s.size / 250 } as never;
    const wh = s.ray.intersectObjects(s.wires.children.filter((o) => (o as THREE.Line).isLine), false);
    if (props.current.tool !== "pick") { props.current.onSelectWire(wh[0] ? (wh[0].object.userData.id as string) : null); return; }
    // nearest displayed point to the pick ray in screen space (more reliable than a Points raycast with a fixed threshold)
    let best = -1, bestD = 1e18, bestLabel = 0; const v = new THREE.Vector3(); const lim = 14 * 14;
    const w = r.width, h = r.height, mx = e.clientX - r.left, my = e.clientY - r.top;
    for (const [lab, g] of Object.entries(s.groupsByLabel as Record<string, { pts: THREE.Points; idx: Uint32Array }>)) {
      if (!g.pts.visible) continue; const pos = g.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) { v.set(pos.getX(k), pos.getY(k), pos.getZ(k)).project(s.cam); if (v.z < -1 || v.z > 1) continue; const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h; const dd = (sx - mx) ** 2 + (sy - my) ** 2; if (dd < lim && v.z < bestD) { bestD = v.z; best = g.idx[k]; bestLabel = Number(lab); } }
    }
    void bestLabel; if (best >= 0) props.current.onPick([d.xyz[best * 3] + d.meta.origin[0], d.xyz[best * 3 + 1] + d.meta.origin[1], d.xyz[best * 3 + 2] + d.meta.origin[2]]);
  };
  return <div ref={host} className="relative h-full w-full touch-none" data-testid="viewport" onPointerDown={onDown} onPointerUp={onUp} style={{ cursor: p.tool === "pick" ? "crosshair" : "grab" }} />;
});
export default LidarViewer;
