import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Small reusable 3D viewer for the point-cloud demos (26-28): orbit/zoom/pan, two scenes for side-by-side comparison with a draggable divider,
 * picking, and on-demand rendering. Geometry is given in LOCAL coordinates (subtract a dataset origin first) so large world coordinates keep float32 precision.
 */
export class PcViewer {
  readonly renderer: THREE.WebGLRenderer; readonly camera: THREE.PerspectiveCamera; readonly controls: OrbitControls;
  readonly left = new THREE.Scene(); readonly right = new THREE.Scene();
  compare = false; split = 0.5; private dirty = true; private raf = 0; private ro: ResizeObserver; private disposed = false; private w = 1; private h = 1;
  readonly ray = new THREE.Raycaster(); private onPick?: (e: PointerEvent, hit: THREE.Intersection | null) => void; private pickTargets: () => THREE.Object3D[] = () => []; private down: { x: number; y: number } | null = null;
  constructor(private el: HTMLElement, opts: { up?: "y" | "z"; background?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false }); this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.renderer.setClearColor(opts.background ?? 0x0b1220, 1); this.renderer.autoClear = false;
    el.appendChild(this.renderer.domElement); this.renderer.domElement.style.display = "block"; this.renderer.domElement.style.touchAction = "none";
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000); if (opts.up === "z") this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.dampingFactor = 0.12; this.controls.addEventListener("change", () => (this.dirty = true));
    for (const s of [this.left, this.right]) { s.add(new THREE.AmbientLight(0xffffff, 0.55)); const d = new THREE.DirectionalLight(0xffffff, 1.1); d.position.set(3, 6, 5); s.add(d); const d2 = new THREE.DirectionalLight(0x9db4ff, 0.4); d2.position.set(-4, 2, -3); s.add(d2); }
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); this.resize();
    const dom = this.renderer.domElement; dom.addEventListener("pointerdown", (e) => { this.down = { x: e.clientX, y: e.clientY }; }); dom.addEventListener("pointerup", (e) => { if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4) { this.down = null; return; } this.down = null; if (this.onPick) this.onPick(e, this.pick(e)); });
    (window as unknown as { __pcViewer?: PcViewer }).__pcViewer = this; // handle used by the browser tests to read back the rendered picture
    const loop = () => { if (this.disposed) return; this.raf = requestAnimationFrame(loop); this.controls.update(); if (this.dirty) { this.dirty = false; this.draw(); } }; loop();
  }
  invalidate() { this.dirty = true; }
  setPicking(targets: () => THREE.Object3D[], cb: (e: PointerEvent, hit: THREE.Intersection | null) => void) { this.pickTargets = targets; this.onPick = cb; }
  pick(e: PointerEvent): THREE.Intersection | null {
    const r = this.renderer.domElement.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
    if (this.compare) { x = x < this.split ? x / this.split : (x - this.split) / (1 - this.split); }
    this.ray.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), this.camera); this.ray.params.Points = { threshold: this.pointPickRadius }; const hits = this.ray.intersectObjects(this.pickTargets(), false); return hits[0] ?? null;
  }
  pointPickRadius = 0.05;
  resize() { const r = this.el.getBoundingClientRect(); this.w = Math.max(1, Math.floor(r.width)); this.h = Math.max(1, Math.floor(r.height)); this.renderer.setSize(this.w, this.h, false); this.renderer.domElement.style.width = this.w + "px"; this.renderer.domElement.style.height = this.h + "px"; this.camera.aspect = (this.compare ? this.w * this.split : this.w) / this.h; this.camera.updateProjectionMatrix(); this.dirty = true; }
  private draw() {
    const r = this.renderer, W = this.w, H = this.h; r.setScissorTest(true); r.clear();
    if (!this.compare) { r.setViewport(0, 0, W, H); r.setScissor(0, 0, W, H); this.camera.aspect = W / H; this.camera.updateProjectionMatrix(); r.render(this.left, this.camera); }
    else { const lw = Math.round(W * this.split); this.camera.aspect = lw / H; this.camera.updateProjectionMatrix(); r.setViewport(0, 0, lw, H); r.setScissor(0, 0, lw, H); r.render(this.left, this.camera); r.setViewport(lw, 0, W - lw, H); r.setScissor(lw, 0, W - lw, H); this.camera.aspect = (W - lw) / H; this.camera.updateProjectionMatrix(); r.render(this.right, this.camera); }
    r.setScissorTest(false);
  }
  setCompare(on: boolean, split = 0.5) { this.compare = on; this.split = split; this.resize(); }
  /** Frame a bounding box: camera looks at its centre from the front (+Z, Y up) or from the given direction. */
  fit(box: THREE.Box3, dir = new THREE.Vector3(0.6, 0.35, 1)) {
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), rad = Math.max(0.01, s.length() / 2), dist = rad / Math.tan((this.camera.fov * Math.PI) / 360) * 1.15;
    this.camera.near = Math.max(0.001, rad / 200); this.camera.far = rad * 60; this.camera.position.copy(c).add(dir.clone().normalize().multiplyScalar(dist)); this.controls.target.copy(c); this.controls.update(); this.camera.updateProjectionMatrix(); this.pointPickRadius = rad / 400; this.dirty = true;
  }
  screenshot(): string { this.draw(); return this.renderer.domElement.toDataURL("image/png"); }
  dispose() { this.disposed = true; cancelAnimationFrame(this.raf); this.ro.disconnect(); this.controls.dispose(); for (const s of [this.left, this.right]) s.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()); }); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
/** Float64 world coordinates -> Float32 local coordinates relative to `origin` (so 532100.0 m style offsets do not lose precision). */
export function toLocal(pos: Float64Array, origin: [number, number, number]): Float32Array { const o = new Float32Array(pos.length); for (let i = 0; i < pos.length; i += 3) { o[i] = pos[i] - origin[0]; o[i + 1] = pos[i + 1] - origin[1]; o[i + 2] = pos[i + 2] - origin[2]; } return o; }
export function centreOf(pos: Float64Array): [number, number, number] { const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], pos[i + k]); b[k] = Math.max(b[k], pos[i + k]); } return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
/** Blue (0) to red (1) colour ramp used for deviation maps. */
export function ramp(t: number): [number, number, number] { const x = Math.max(0, Math.min(1, t)); const stops: [number, number[]][] = [[0, [0.1, 0.35, 0.9]], [0.35, [0.1, 0.8, 0.8]], [0.6, [0.5, 0.9, 0.3]], [0.8, [0.98, 0.85, 0.2]], [1, [0.95, 0.2, 0.15]]]; for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (x - a) / (b - a); return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f]; } return [0.95, 0.2, 0.15]; }
