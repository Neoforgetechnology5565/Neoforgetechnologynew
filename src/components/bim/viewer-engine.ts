"use client";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { colorFor } from "@/lib/bim/colors";
import type { MeshEl } from "@/lib/bim/model";

export type ViewName = "front" | "rear" | "left" | "right" | "top" | "iso";
export interface PickInfo { id: string | null; cat?: string; point?: { x: number; y: number; z: number }; shift: boolean }
const EDGE_CATS = /^(wall|slab|roof|column|door|window|stair)/;

/** Imperative three.js engine for the BIM viewer. Model coordinates are Z-up metres; the model group is rotated into three's Y-up frame. */
export class BimScene {
  scene = new THREE.Scene(); renderer: THREE.WebGLRenderer; persp = new THREE.PerspectiveCamera(45, 1, 0.05, 2000); ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 2000); camera: THREE.Camera = this.persp;
  controls!: OrbitControls; root = new THREE.Group(); byId = new Map<string, THREE.Mesh[]>(); meshes: THREE.Mesh[] = []; edges = new Map<THREE.Mesh, THREE.LineSegments>();
  bounds = new THREE.Box3(); mode: "orbit" | "walk" = "orbit"; ghost = false; selected = new Set<string>(); measureOn = false; private measurePts: THREE.Vector3[] = []; private measureObjs = new THREE.Group();
  private raf = 0; private dirty = true; private alive = true; private ro: ResizeObserver; private keys = new Set<string>(); private yaw = 0; private pitch = 0; private last = 0; private down: { x: number; y: number; t: number } | null = null; private dragging = false; private lookBase = { x: 0, y: 0 };
  private mats = new Map<string, THREE.MeshStandardMaterial>(); private hi = new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0x6b4a00, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  private clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); private gridHelper: THREE.GridHelper | null = null; walkEye = 1.6;
  onPick: (p: PickInfo) => void = () => undefined; onMeasure: (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number } | null) => void = () => undefined; onWalkState: (v: boolean) => void = () => undefined;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false }); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.localClippingEnabled = false;
    const el = this.renderer.domElement; el.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none"; el.tabIndex = 0; host.prepend(el);
    this.scene.background = new THREE.Color(0x151a21); this.root.rotation.x = -Math.PI / 2; this.scene.add(this.root, this.measureObjs);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 1.3); d.position.set(30, 60, 40); this.scene.add(d); const d2 = new THREE.DirectionalLight(0xffffff, 0.4); d2.position.set(-30, 20, -40); this.scene.add(d2);
    this.makeControls(); this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    el.addEventListener("pointerdown", this.pd); el.addEventListener("pointermove", this.pm); el.addEventListener("pointerup", this.pu); window.addEventListener("keydown", this.kd); window.addEventListener("keyup", this.ku); el.addEventListener("blur", () => this.keys.clear());
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
  }
  private makeControls() { this.controls?.dispose(); this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = false; this.controls.screenSpacePanning = true; this.controls.addEventListener("change", () => this.render()); this.controls.enabled = this.mode === "orbit"; }
  render() { this.dirty = true; }
  private resize() { const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1; this.renderer.setSize(w, h, false); this.persp.aspect = w / h; this.persp.updateProjectionMatrix(); this.fitOrtho(); this.render(); }
  private fitOrtho() { const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1; const dist = this.camera === this.ortho ? this.ortho.userData.size ?? 10 : 10; const a = w / h; this.ortho.left = -dist * a; this.ortho.right = dist * a; this.ortho.top = dist; this.ortho.bottom = -dist; this.ortho.updateProjectionMatrix(); }

  load(meshes: MeshEl[]) {
    for (const m of this.meshes) { m.geometry.dispose(); } for (const l of this.edges.values()) { l.geometry.dispose(); } this.root.clear(); this.byId.clear(); this.meshes = []; this.edges.clear(); this.mats.forEach((m) => m.dispose()); this.mats.clear();
    let tris = 0; for (const m of meshes) tris += m.idx.length / 3; const withEdges = tris < 160000;
    for (const m of meshes) { if (!m.idx.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(m.pos, 3)); g.setIndex(m.idx); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, this.matFor(m)); const mat0 = this.matFor(m); mesh.userData = { id: m.id, cat: m.cat, sys: m.sys, level: m.level, name: m.name, mat: mat0 }; mesh.matrixAutoUpdate = false; this.root.add(mesh); this.meshes.push(mesh); (this.byId.get(m.id) ?? this.byId.set(m.id, []).get(m.id)!).push(mesh);
      if (withEdges && EDGE_CATS.test(m.cat)) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 35), new THREE.LineBasicMaterial({ color: m.cat.startsWith("window") ? 0x9ad0ff : 0x20242b, transparent: true, opacity: 0.6 })); e.matrixAutoUpdate = false; this.root.add(e); this.edges.set(mesh, e); } }
    this.root.updateMatrixWorld(true); this.bounds = new THREE.Box3().setFromObject(this.root); this.buildGrid(); this.fit(); this.render();
  }
  private matFor(m: MeshEl) { const key = `${m.cat}|${m.sys ?? ""}`; let mat = this.mats.get(key); if (!mat) { const c = colorFor(m); const transp = m.cat === "window" || m.cat === "space"; mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), roughness: 0.85, metalness: m.cat.startsWith("mep") ? 0.2 : 0, side: THREE.DoubleSide, transparent: transp, opacity: m.cat === "window" ? 0.45 : m.cat === "space" ? 0.35 : 1, depthWrite: !transp }); mat.userData.baseOpacity = mat.opacity; this.mats.set(key, mat); } return mat; }
  private buildGrid() { if (this.gridHelper) { this.scene.remove(this.gridHelper); this.gridHelper.geometry.dispose(); } const s = this.bounds.getSize(new THREE.Vector3()); const size = Math.max(10, Math.ceil(Math.max(s.x, s.z) * 2.2 / 5) * 5); this.gridHelper = new THREE.GridHelper(size, size, 0x3a4250, 0x262d38); const c = this.bounds.getCenter(new THREE.Vector3()); this.gridHelper.position.set(c.x, this.bounds.min.y - 0.01, c.z); this.scene.add(this.gridHelper); }

  setVisible(pred: (u: { id: string; cat: string; sys?: string; level?: string }) => boolean) { const counts: Record<string, number> = {}; for (const m of this.meshes) { const v = pred(m.userData as never); m.visible = v; const e = this.edges.get(m); if (e) e.visible = v; if (v) counts[m.userData.cat] = (counts[m.userData.cat] ?? 0) + 1; } this.host.dataset.visible = JSON.stringify(counts); this.render(); }
  /** Make architecture translucent so MEP can be read through it. */
  setGhost(on: boolean) { this.ghost = on; this.mats.forEach((mat, key) => { const arch = !key.startsWith("mep") && !key.startsWith("space"); if (!arch) return; const base = mat.userData.baseOpacity ?? 1; mat.transparent = on || base < 1; mat.opacity = on ? Math.min(base, 0.16) : base; mat.depthWrite = !(on || base < 1); mat.needsUpdate = true; }); this.render(); }
  select(ids: string[]) { this.host.dataset.selected = ids.join(","); for (const id of this.selected) for (const m of this.byId.get(id) ?? []) m.material = m.userData.mat as THREE.Material; this.selected = new Set(ids); for (const id of ids) for (const m of this.byId.get(id) ?? []) m.material = this.hi; this.render(); }
  bboxOf(ids: string[]) { const b = new THREE.Box3(); for (const id of ids) for (const m of this.byId.get(id) ?? []) b.expandByObject(m); return b; }
  focus(ids: string[]) { const b = this.bboxOf(ids); if (!b.isEmpty()) this.frame(b); }
  fit() { const vis = new THREE.Box3(); for (const m of this.meshes) if (m.visible) vis.expandByObject(m); this.frame(vis.isEmpty() ? this.bounds : vis); }
  private frame(b: THREE.Box3) { if (b.isEmpty()) return; const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()); const r = Math.max(s.x, s.y, s.z) * 0.9 + 1; if (this.mode === "walk") this.setMode("orbit"); this.controls.target.copy(c); this.camera.position.copy(c).add(new THREE.Vector3(r * 1.1, r * 0.9, r * 1.2)); if (this.camera === this.ortho) { this.ortho.userData.size = r; this.fitOrtho(); } this.persp.near = Math.max(0.05, r / 500); this.persp.far = r * 40; this.persp.updateProjectionMatrix(); this.controls.update(); this.render(); }
  setView(v: ViewName) { const b = this.bounds; const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()); const r = Math.max(s.x, s.y, s.z) * 1.4 + 2; if (this.mode === "walk") this.setMode("orbit"); const dir: Record<ViewName, [number, number, number]> = { front: [0, 0.05, 1], rear: [0, 0.05, -1], left: [-1, 0.05, 0], right: [1, 0.05, 0], top: [0, 1, 0.0001], iso: [0.8, 0.7, 1] }; const d = new THREE.Vector3(...dir[v]).normalize(); this.controls.target.copy(c); this.camera.position.copy(c).addScaledVector(d, r); if (this.camera === this.ortho) { this.ortho.userData.size = r * 0.55; this.fitOrtho(); } this.controls.update(); this.render(); }
  /** Camera in model coordinates (Z up). */
  getCamera() { const p = this.camera.position, t = this.controls.target; return { pos: [p.x, -p.z, p.y] as [number, number, number], target: [t.x, -t.z, t.y] as [number, number, number], ortho: this.camera === this.ortho }; }
  setCamera(c: { pos: number[]; target: number[]; ortho: boolean }) { this.setOrtho(c.ortho); this.setMode("orbit"); this.camera.position.set(c.pos[0], c.pos[2], -c.pos[1]); this.controls.target.set(c.target[0], c.target[2], -c.target[1]); this.controls.update(); this.render(); }
  setOrtho(on: boolean) { if ((this.camera === this.ortho) === on) return; const t = this.controls.target.clone(); const off = this.camera.position.clone().sub(t); const dist = off.length(); const prev = this.camera; this.camera = on ? this.ortho : this.persp; this.camera.position.copy(t).add(off); this.camera.quaternion.copy(prev.quaternion); if (on) { this.ortho.userData.size = dist * Math.tan((this.persp.fov * Math.PI) / 360); } this.fitOrtho(); this.makeControls(); this.controls.target.copy(t); this.controls.update(); this.render(); }
  get isOrtho() { return this.camera === this.ortho; }
  /** axis: "elevation" (horizontal cut), "x" or "y" (plan axes). offset in metres from the model minimum. */
  setSection(axis: "elevation" | "x" | "y" | null, offset = 0, flip = false) {
    if (!axis) { this.renderer.clippingPlanes = []; this.render(); return; } const b = this.bounds; const n = new THREE.Vector3(); let c: number;
    // three keeps the side where normal·p + constant >= 0
    if (axis === "elevation") { const p = b.min.y + offset; n.set(0, -1, 0); c = p; if (flip) { n.negate(); c = -p; } } else if (axis === "x") { const p = b.min.x + offset; n.set(-1, 0, 0); c = p; if (flip) { n.negate(); c = -p; } } else { const p = -b.max.z + offset; n.set(0, 0, 1); c = p; if (flip) { n.negate(); c = -p; } }
    this.clip.normal.copy(n); this.clip.constant = c; this.renderer.clippingPlanes = [this.clip]; this.render();
  }
  sectionRange(axis: "elevation" | "x" | "y") { const s = this.bounds.getSize(new THREE.Vector3()); return axis === "elevation" ? s.y : axis === "x" ? s.x : s.z; }

  /* walkthrough */
  setMode(m: "orbit" | "walk") { this.mode = m; this.host.dataset.mode = m; this.controls.enabled = m === "orbit"; this.onWalkState(m === "walk"); if (m === "walk") { this.setOrtho(false); this.persp.near = 0.05; this.persp.updateProjectionMatrix(); this.renderer.domElement.focus(); } this.render(); }
  /** Put the camera inside at plan position (x, y) on a floor at elevation z, looking along heading (radians in plan). */
  walkTo(x: number, y: number, z: number, heading = 0) { this.setMode("walk"); this.camera.position.set(x, z + this.walkEye, -y); this.yaw = -heading + Math.PI / 2; this.pitch = 0; this.applyLook(); this.render(); }
  walkMove(forward: number, strafe: number) { const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); this.camera.position.addScaledVector(f, forward).addScaledVector(r, strafe); this.render(); }
  walkLook(dyaw: number, dpitch: number) { this.yaw += dyaw; this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dpitch)); this.applyLook(); this.render(); }
  private applyLook() { this.camera.rotation.order = "YXZ"; this.camera.rotation.set(this.pitch, this.yaw, 0); }
  private kd = (e: KeyboardEvent) => { if (this.mode !== "walk" || (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return; const k = e.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) { this.keys.add(k); e.preventDefault(); this.render(); } };
  private ku = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };

  /* picking and measuring */
  private pd = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; this.lookBase = { x: e.clientX, y: e.clientY }; this.dragging = false; };
  private pm = (e: PointerEvent) => { if (this.mode === "walk" && this.down && e.buttons) { this.dragging = true; this.walkLook(-(e.clientX - this.lookBase.x) * 0.004, -(e.clientY - this.lookBase.y) * 0.004); this.lookBase = { x: e.clientX, y: e.clientY }; } };
  private pu = (e: PointerEvent) => { const d = this.down; this.down = null; if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || this.dragging) return; const hit = this.pick(e.clientX, e.clientY); if (this.measureOn) { if (hit) this.addMeasure(hit.point); return; } this.onPick({ id: hit ? (hit.object.userData.id as string) : null, cat: hit?.object.userData.cat, point: hit ? this.toModel(hit.point) : undefined, shift: e.shiftKey }); };
  private pick(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect(); const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const pickable = this.meshes.filter((m) => m.visible && (m.userData.cat !== "space" || this.selected.has(m.userData.id))); const clip = this.renderer.clippingPlanes?.[0];
    return ray.intersectObjects(pickable, false).find((h) => !clip || clip.distanceToPoint(h.point) >= 0);
  }
  toModel(p: THREE.Vector3) { return { x: p.x, y: -p.z, z: p.y }; }
  setMeasure(on: boolean) { this.measureOn = on; if (!on) this.clearMeasure(); this.renderer.domElement.style.cursor = on ? "crosshair" : ""; }
  clearMeasure() { this.measurePts = []; this.measureObjs.clear(); this.render(); }
  private addMeasure(p: THREE.Vector3) { if (this.measurePts.length >= 2) this.clearMeasure(); this.measurePts.push(p.clone()); const s = this.bounds.getSize(new THREE.Vector3()); const rad = Math.max(0.03, Math.max(s.x, s.z) * 0.006); const dot = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff4d4d, depthTest: false })); dot.position.copy(p); dot.renderOrder = 20; this.measureObjs.add(dot);
    if (this.measurePts.length === 2) { const g = new THREE.BufferGeometry().setFromPoints(this.measurePts); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff4d4d, depthTest: false })); l.renderOrder = 20; this.measureObjs.add(l); this.onMeasure(this.toModel(this.measurePts[0]), this.toModel(this.measurePts[1])); } else this.onMeasure(this.toModel(p), null); this.render(); }
  /** World → screen for overlay labels. */
  project(x: number, y: number, z: number) { const v = new THREE.Vector3(x, z, -y).project(this.camera); const r = this.renderer.domElement.getBoundingClientRect(); return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, visible: v.z < 1 }; }

  private loop(t: number) {
    if (!this.alive) return; const dt = Math.min(0.1, (t - this.last) / 1000 || 0.016); this.last = t;
    if (this.mode === "walk" && this.keys.size) { const sp = (this.keys.has("shift") ? 4 : 1.8) * dt; const fw = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0), st = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0), tn = (this.keys.has("arrowleft") ? 1 : 0) - (this.keys.has("arrowright") ? 1 : 0); if (fw || st) this.walkMove(fw * sp, st * sp); if (tn) this.walkLook(tn * dt * 1.6, 0); }
    if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); } this.raf = requestAnimationFrame(this.loop);
  }
  dispose() { this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect(); this.controls.dispose(); window.removeEventListener("keydown", this.kd); window.removeEventListener("keyup", this.ku); this.meshes.forEach((m) => m.geometry.dispose()); this.edges.forEach((l) => l.geometry.dispose()); this.mats.forEach((m) => m.dispose()); this.hi.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
