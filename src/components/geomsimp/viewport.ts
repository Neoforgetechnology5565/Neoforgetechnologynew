import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Aggregate } from "@/lib/geomsimp/engine";
import type { Cat, Elem, Solid, Surf, ZoneP } from "@/lib/geomsimp/types";

export type Mode = "original" | "extracted" | "simplified" | "analysis";
export const CAT_COLOR: Record<Cat, string> = { wall: "#4f8cff", window: "#22d3ee", door: "#f59e0b", floor: "#94a3b8", roof: "#a78bfa", partition: "#2dd4bf", shading: "#84cc16" };
export const USE_COLOR: Record<string, string> = { Office: "#38bdf8", Meeting: "#f472b6", Circulation: "#facc15", Reception: "#fb923c", Showroom: "#a3e635" };
const PART: Record<string, string> = { brick: "#a65b43", plaster: "#e8e4da", block: "#b9b6ad", insulation: "#e9d36a", glass: "#8fc3e0", frame: "#3a3f47", mullion: "#3a3f47", sill: "#d6d2c6", leaf: "#7a5b3c", handle: "#b8b8b8", threshold: "#888888", slab: "#9a9a9a", screed: "#bdbdb0", finish: "#c9b79a", deck: "#8a8a8a", membrane: "#2b2f35", parapet: "#b0b0a8", board: "#f1efe8", stud: "#c8b28a", overhang: "#c9c9d2", trunk: "#6b4a2f", canopy: "#4f9a4a", body: "#c9ced6", plant: "#a9afb8", band: "#7f9db8", insulationx: "#e9d36a" };
const BOUNDARY: Record<Surf["boundary"], string> = { external: "#4f8cff", internal: "#94a3b8", ground: "#b45309", roof: "#a78bfa", shading: "#84cc16" };

export interface ViewProps {
  elems: Elem[]; agg: Aggregate | null; mode: Mode; compare: boolean;
  cats: Record<Cat, boolean>; levels: boolean[]; hidden: string[];
  ghost: boolean; labels: boolean; zonesOn: boolean; zones: ZoneP[]; extracted: boolean;
  selIds: string[]; selZone: string | null; opacity: number;
}
export interface ViewCallbacks { onPick: (id: string | null) => void; onHover: (id: string | null, x: number, y: number) => void }

interface Range { start: number; id: string }
const idAt = (ranges: Range[], tri: number) => { let lo = 0, hi = ranges.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ranges[mid].start <= tri) lo = mid; else hi = mid - 1; } return ranges[lo]?.id ?? null; };
const hashCache = new WeakMap<Elem[], string>();
/** Cheap fingerprint of all solid geometry, so the meshes are rebuilt only when the model really changed. */
const geomHash = (elems: Elem[]) => { let h = hashCache.get(elems); if (h === undefined) { let a = 0, n = 0; for (const e of elems) for (const s of e.solids) { a += s.c[0] * 1.3 + s.c[1] * 2.1 + s.c[2] * 3.7 + s.s[0] + s.s[1] * 2 + s.s[2] * 3 + (s.rx ?? 0); n++; } h = `${n}:${a.toFixed(4)}`; hashCache.set(elems, h); } return h; };
const dispose = (o: THREE.Object3D) => o.traverse((c) => { const m = c as THREE.Mesh; m.geometry?.dispose?.(); });

function solidGeometry(s: Solid, color: THREE.Color): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = s.k === "box" ? new THREE.BoxGeometry(s.s[0], s.s[1], s.s[2]) : s.k === "cyl" ? new THREE.CylinderGeometry(s.s[0], s.s[0], s.s[1], 16, 1) : new THREE.SphereGeometry(s.s[0], 16, 10);
  g = g.toNonIndexed(); g.deleteAttribute("uv");
  if (s.rx) g.rotateX(s.rx);
  g.translate(s.c[0], s.c[1], s.c[2]);
  const n = g.getAttribute("position").count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

export class GeomViewport {
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene(); private camera: THREE.PerspectiveCamera; private controls: OrbitControls;
  private solid = new THREE.Group(); private simp = new THREE.Group(); private ghost = new THREE.Group(); private zones = new THREE.Group(); private sel = new THREE.Group();
  private solidMeshes: { mesh: THREE.Mesh; ranges: Range[] }[] = []; private simpMesh: { mesh: THREE.Mesh; ranges: Range[] } | null = null;
  private props!: ViewProps; private sigs = { solid: "", simp: "", zones: "", sel: "", ghost: "" };
  private raf = 0; private ro: ResizeObserver; private labelEls: { el: HTMLDivElement; p: THREE.Vector3 }[] = []; private labelHost: HTMLDivElement; private divider: HTMLDivElement;
  private ray = new THREE.Raycaster(); private down: [number, number] | null = null; private dead = false;

  constructor(private host: HTMLElement, private cb: ViewCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setClearColor("#0b1220");
    const cv = this.renderer.domElement; cv.style.cssText = "display:block;width:100%;height:100%;touch-action:none"; cv.setAttribute("data-testid", "viewport-canvas"); host.appendChild(cv);
    this.labelHost = document.createElement("div"); this.labelHost.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden"; host.appendChild(this.labelHost);
    this.divider = document.createElement("div"); this.divider.style.cssText = "position:absolute;top:0;bottom:0;left:50%;width:2px;background:#22d3ee;display:none;pointer-events:none"; host.appendChild(this.divider);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600); this.camera.position.set(34, 22, 40);
    this.controls = new OrbitControls(this.camera, cv); this.controls.target.set(0, 5, 0); this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.minDistance = 6; this.controls.maxDistance = 160; this.controls.update();
    this.controls.addEventListener("change", () => this.request());
    const hemi = new THREE.HemisphereLight("#dbeafe", "#334155", 1.15), sun = new THREE.DirectionalLight("#ffffff", 1.6); sun.position.set(-30, 50, 40);
    for (const l of [hemi, sun]) { l.layers.enableAll(); this.scene.add(l); }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 64), new THREE.MeshBasicMaterial({ color: "#0f1b2d" })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.32; ground.layers.enableAll();
    const grid = new THREE.GridHelper(180, 36, "#1e3a5f", "#16263d"); grid.position.y = -0.3; grid.layers.enableAll(); this.scene.add(ground, grid);
    for (const g of [this.zones, this.sel]) { g.layers.enable(1); g.layers.enable(2); g.traverse((o) => o.layers.enable(1)); }
    this.solid.layers.set(1); this.simp.layers.set(2); this.ghost.layers.set(3);
    this.scene.add(this.solid, this.simp, this.ghost, this.zones, this.sel);
    this.ro = new ResizeObserver(() => this.request()); this.ro.observe(host);
    cv.addEventListener("pointerdown", (e) => { this.down = [e.clientX, e.clientY]; });
    cv.addEventListener("pointerup", (e) => { if (this.down && Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) < 5) this.cb.onPick(this.pick(e.clientX, e.clientY)); this.down = null; });
    cv.addEventListener("pointermove", (e) => { if (e.buttons) return; this.cb.onHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY); });
    cv.addEventListener("pointerleave", () => this.cb.onHover(null, 0, 0));
  }

  /* ----- scene building ----- */
  private elemVisible(e: Elem) { const p = this.props; return p.cats[e.cat] && !p.hidden.includes(e.id) && (e.level < 0 || p.levels[Math.min(e.level, 3)]); }
  private surfVisible(s: Surf) { const p = this.props; return p.cats[s.cat] && !p.hidden.includes(s.elem) && (s.level < 0 || p.levels[Math.min(s.level, 3)]); }

  private buildSolids() {
    const p = this.props, mode = p.mode === "original" ? "o" : "x";
    const sig = [mode, p.extracted, geomHash(p.elems), p.hidden.join(), p.levels.join(), Object.values(p.cats).join()].join("|");
    if (sig === this.sigs.solid) return; this.sigs.solid = sig;
    for (const m of this.solidMeshes) { this.solid.remove(m.mesh); m.mesh.geometry.dispose(); } this.solidMeshes = [];
    const opaque: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], oR: Range[] = [], gR: Range[] = []; let oT = 0, gT = 0;
    const dim = new THREE.Color("#3a4658");
    for (const e of p.elems) {
      if (!this.elemVisible(e)) continue;
      const base = new THREE.Color(CAT_COLOR[e.cat]);
      let oStart = -1, gStart = -1;
      for (const s of e.solids) {
        const isGlass = s.part === "glass" && mode === "o";
        const c = mode === "o" ? new THREE.Color(PART[s.part] ?? "#aaaaaa") : p.extracted ? base.clone().multiplyScalar(s.part === "frame" || s.part === "insulation" || s.part === "slab" || s.part === "body" ? 0.7 : 1) : dim;
        const g = solidGeometry(s, c), tris = g.getAttribute("position").count / 3;
        if (isGlass) { if (gStart < 0) { gStart = gT; gR.push({ start: gT, id: e.id }); } glass.push(g); gT += tris; } else { if (oStart < 0) { oStart = oT; oR.push({ start: oT, id: e.id }); } opaque.push(g); oT += tris; }
        if (isGlass && oStart >= 0) { /* element ranges stay contiguous per mesh */ }
      }
    }
    // an element can have solids in both meshes: ranges above are per element start; contiguous because solids of one element are added together
    if (opaque.length) { const m = new THREE.Mesh(mergeGeometries(opaque, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 })); m.layers.set(1); this.solid.add(m); this.solidMeshes.push({ mesh: m, ranges: oR }); opaque.forEach((g) => g.dispose()); }
    if (glass.length) { const m = new THREE.Mesh(mergeGeometries(glass, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.3, depthWrite: false })); m.layers.set(1); this.solid.add(m); this.solidMeshes.push({ mesh: m, ranges: gR }); glass.forEach((g) => g.dispose()); }
  }

  private buildSimp() {
    const p = this.props, agg = p.agg;
    const sig = [p.mode, p.opacity, agg ? agg.surfaces.length + ":" + agg.surfaces.map((s) => s.area).join(",").length + ":" + agg.surfaces.reduce((n, s) => n + s.area, 0).toFixed(3) + ":" + agg.surfaces.reduce((n, s) => n + s.verts[0][0] + s.verts[0][1] + s.verts[0][2], 0).toFixed(3) : "none", p.hidden.join(), p.levels.join(), Object.values(p.cats).join()].join("|");
    if (sig === this.sigs.simp) return; this.sigs.simp = sig;
    for (const c of [...this.simp.children]) { this.simp.remove(c); dispose(c); } this.simpMesh = null;
    if (!agg) return;
    const pos: number[] = [], col: number[] = [], edge: number[] = [], ranges: Range[] = []; let tri = 0;
    for (const s of agg.surfaces) {
      if (!this.surfVisible(s)) continue;
      const c = new THREE.Color(p.mode === "analysis" ? (s.cat === "window" ? CAT_COLOR.window : s.cat === "door" ? CAT_COLOR.door : BOUNDARY[s.boundary]) : CAT_COLOR[s.cat]);
      const off = s.parent ? 0.025 : 0, v = s.verts.map((q) => [q[0] + s.normal[0] * off, q[1] + s.normal[1] * off, q[2] + s.normal[2] * off]);
      ranges.push({ start: tri, id: s.id });
      for (let i = 1; i < v.length - 1; i++) { for (const q of [v[0], v[i], v[i + 1]]) { pos.push(q[0], q[1], q[2]); col.push(c.r, c.g, c.b); } tri++; }
      for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; edge.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: p.mode === "analysis" ? Math.min(0.92, p.opacity + 0.22) : p.opacity, side: THREE.DoubleSide, depthWrite: false })); mesh.layers.set(2); this.simp.add(mesh); this.simpMesh = { mesh, ranges };
    const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.Float32BufferAttribute(edge, 3)); const el = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: "#e2e8f0", transparent: true, opacity: 0.75 })); el.layers.set(2); this.simp.add(el);
    const lp: number[] = []; for (const l of agg.lines) { lp.push(...l.a, ...l.b); }
    if (lp.length) { const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3)); const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: "#fbbf24" })); ls.layers.set(2); this.simp.add(ls); }
  }

  /** Technical wireframe of the original, drawn over the analytical model so the two can be compared in place. */
  private buildGhost() {
    const p = this.props, sig = [p.ghost && (p.mode === "simplified" || p.mode === "analysis"), geomHash(p.elems), p.hidden.join(), p.levels.join(), Object.values(p.cats).join()].join("|");
    if (sig === this.sigs.ghost) return; this.sigs.ghost = sig;
    for (const c of [...this.ghost.children]) { this.ghost.remove(c); dispose(c); }
    if (!p.ghost || (p.mode !== "simplified" && p.mode !== "analysis")) return;
    const gs: THREE.BufferGeometry[] = []; for (const e of p.elems) { if (!this.elemVisible(e)) continue; for (const s of e.solids) if (s.part !== "plant") gs.push(solidGeometry(s, new THREE.Color("#64748b"))); }
    if (!gs.length) return; const m = new THREE.Mesh(mergeGeometries(gs, false)!, new THREE.MeshBasicMaterial({ color: "#64748b", wireframe: true, transparent: true, opacity: 0.18 })); m.layers.set(3); this.ghost.add(m); gs.forEach((g) => g.dispose());
  }

  private buildZones() {
    const p = this.props, sig = [p.zonesOn, p.selZone, p.zones.map((z) => [z.id, z.x0, z.x1, z.z0, z.z1].join()).join(";"), p.levels.join()].join("|");
    if (sig === this.sigs.zones) return; this.sigs.zones = sig;
    for (const c of [...this.zones.children]) { this.zones.remove(c); dispose(c); }
    if (!p.zonesOn) return;
    for (const z of p.zones) {
      if (!p.levels[z.level]) continue;
      const h = 3.2, g = new THREE.BoxGeometry(z.x1 - z.x0 - 0.06, h - 0.06, z.z1 - z.z0 - 0.06), on = p.selZone === z.id;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: USE_COLOR[z.use] ?? "#38bdf8", transparent: true, opacity: on ? 0.55 : 0.16, depthWrite: false })); m.position.set((z.x0 + z.x1) / 2, z.level * 3.5 + h / 2, (z.z0 + z.z1) / 2);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: on ? "#ffffff" : USE_COLOR[z.use] ?? "#38bdf8" })); e.position.copy(m.position);
      for (const o of [m, e]) { o.layers.set(1); o.layers.enable(2); this.zones.add(o); }
    }
  }

  private buildSel() {
    const p = this.props, sig = [p.mode, p.selIds.join(), geomHash(p.elems), p.agg ? p.agg.surfaces.length + ":" + p.agg.surfaces.reduce((n, q) => n + q.area, 0).toFixed(3) : 0].join("|");
    if (sig === this.sigs.sel) return; this.sigs.sel = sig;
    for (const c of [...this.sel.children]) { this.sel.remove(c); dispose(c); }
    if (!p.selIds.length) return;
    const mat = new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.8, depthTest: false }), lineMat = new THREE.LineBasicMaterial({ color: "#ffffff", depthTest: false });
    const add = (o: THREE.Object3D) => { o.renderOrder = 10; o.layers.set(1); o.layers.enable(2); this.sel.add(o); };
    if (p.mode === "original" || p.mode === "extracted" || !p.agg) {
      const gs: THREE.BufferGeometry[] = []; for (const e of p.elems) if (p.selIds.includes(e.id)) for (const s of e.solids) gs.push(solidGeometry(s, new THREE.Color("#22d3ee")));
      if (gs.length) { add(new THREE.Mesh(mergeGeometries(gs, false)!, mat)); gs.forEach((g) => g.dispose()); }
    } else {
      const pos: number[] = [], ed: number[] = [];
      for (const s of p.agg.surfaces) if (p.selIds.includes(s.id) || p.selIds.includes(s.elem)) {
        const v = s.verts.map((q) => [q[0] + s.normal[0] * 0.05, q[1] + s.normal[1] * 0.05, q[2] + s.normal[2] * 0.05]);
        for (let i = 1; i < v.length - 1; i++) for (const q of [v[0], v[i], v[i + 1]]) pos.push(q[0], q[1], q[2]);
        for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; ed.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
      }
      if (pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); const m = new THREE.Mesh(g, mat.clone()); (m.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide; add(m); const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.Float32BufferAttribute(ed, 3)); add(new THREE.LineSegments(eg, lineMat)); }
    }
  }

  private buildLabels() {
    for (const l of this.labelEls) l.el.remove(); this.labelEls = [];
    const p = this.props; if (!p.labels || p.compare || (p.mode !== "simplified" && p.mode !== "analysis") || !p.agg) return;
    const mk = (text: string, pt: THREE.Vector3, color: string) => { const el = document.createElement("div"); el.textContent = text; el.style.cssText = `position:absolute;transform:translate(-50%,-50%);font:600 10px ui-monospace,monospace;color:${color};background:rgba(11,18,32,.72);border:1px solid ${color}55;padding:0 3px;border-radius:3px;white-space:nowrap`; this.labelHost.appendChild(el); this.labelEls.push({ el, p: pt }); };
    for (const s of p.agg.surfaces) {
      if (!this.surfVisible(s) || s.cat === "window" || s.cat === "door" || (s.cat === "partition" && s.level !== 0 && p.levels.filter(Boolean).length > 1)) continue;
      const c = s.verts.reduce((a, v) => [a[0] + v[0] / s.verts.length, a[1] + v[1] / s.verts.length, a[2] + v[2] / s.verts.length], [0, 0, 0]);
      mk(p.mode === "analysis" ? `${s.id} · ${s.area.toFixed(1)} m²${s.azimuth !== null ? ` · ${s.azimuth}°` : ""}` : s.id, new THREE.Vector3(c[0], c[1], c[2]), CAT_COLOR[s.cat]);
    }
    if (p.zonesOn) for (const z of p.zones) if (p.levels[z.level]) mk(z.id, new THREE.Vector3((z.x0 + z.x1) / 2, z.level * 3.5 + 1.6, (z.z0 + z.z1) / 2), USE_COLOR[z.use] ?? "#38bdf8");
  }

  update(p: ViewProps) {
    const labelsChanged = !this.props || p.labels !== this.props.labels || p.agg !== this.props.agg || p.mode !== this.props.mode || p.compare !== this.props.compare || p.zonesOn !== this.props.zonesOn || p.levels.join() !== this.props.levels.join() || p.hidden.join() !== this.props.hidden.join();
    this.props = p; this.buildSolids(); this.buildSimp(); this.buildGhost(); this.buildZones(); this.buildSel(); if (labelsChanged) this.buildLabels();
    this.divider.style.display = p.compare ? "block" : "none"; this.request();
  }

  /* ----- camera helpers ----- */
  view(kind: "iso" | "top" | "front" | "side" | "fit") {
    const t = this.controls.target; t.set(0, 5, 0);
    const d = { iso: [34, 22, 40], top: [0.01, 62, 0.01], front: [0, 7, 60], side: [60, 7, 0], fit: [34, 22, 40] }[kind];
    this.camera.position.set(d[0], d[1], d[2]); this.controls.update(); this.request();
  }
  zoom(f: number) { const d = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f); this.camera.position.copy(this.controls.target).add(d); this.controls.update(); this.request(); }

  /** Client coordinates of the centre of an element (for tests and for focusing); null when it is off screen. */
  screenOf(id: string): { x: number; y: number } | null {
    const p = this.props, e = p.elems.find((x) => x.id === id); const surf = p.agg?.surfaces.find((s) => s.id === id || s.elem === id);
    let c: THREE.Vector3 | null = null;
    if ((p.mode === "simplified" || p.mode === "analysis") && surf) { const n = surf.verts.length; c = new THREE.Vector3(surf.verts.reduce((a, v) => a + v[0], 0) / n, surf.verts.reduce((a, v) => a + v[1], 0) / n, surf.verts.reduce((a, v) => a + v[2], 0) / n); }
    else if (e) { const b = new THREE.Box3(); for (const s of e.solids) { const k = new THREE.Vector3(...s.c); b.expandByPoint(k); } const x = new THREE.Vector3(); b.getCenter(x); c = x; }
    if (!c) return null; const r = this.renderer.domElement.getBoundingClientRect(), half = p.compare ? 0.5 : 1;
    this.camera.aspect = (r.width * half) / r.height; this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    const q = c.clone().project(this.camera); if (Math.abs(q.x) > 1 || Math.abs(q.y) > 1) return null;
    return { x: r.left + ((q.x + 1) / 2) * r.width * half + (p.compare ? r.width * 0.5 : 0), y: r.top + ((1 - q.y) / 2) * r.height };
  }

  private pick(cx: number, cy: number): string | null {
    const p = this.props; if (!p) return null;
    const r = this.renderer.domElement.getBoundingClientRect(); let nx = (cx - r.left) / r.width, side = 0;
    if (p.compare) { side = nx > 0.5 ? 1 : 0; nx = (nx - side * 0.5) * 2; }
    this.camera.aspect = (r.width * (p.compare ? 0.5 : 1)) / r.height; this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1)), this.camera);
    const simplified = p.compare ? side === 1 : p.mode === "simplified" || p.mode === "analysis";
    const targets = simplified ? (this.simpMesh ? [this.simpMesh] : []) : this.solidMeshes;
    let best: { d: number; id: string | null } | null = null;
    for (const t of targets) {
      this.ray.layers.set(simplified ? 2 : 1);
      const hit = this.ray.intersectObject(t.mesh, false)[0]; if (hit && hit.faceIndex != null && (!best || hit.distance < best.d)) best = { d: hit.distance, id: idAt(t.ranges, hit.faceIndex) };
    }
    return best?.id ?? null;
  }

  /* ----- render ----- */
  request() { if (this.dead || this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); }); }
  private render() {
    if (this.dead || !this.props) return;
    const p = this.props, w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const draw = (x: number, ww: number, layers: number[]) => {
      this.renderer.setViewport(x, 0, ww, h); this.renderer.setScissor(x, 0, ww, h); this.renderer.setScissorTest(true);
      this.camera.aspect = ww / h; this.camera.updateProjectionMatrix(); this.camera.layers.disableAll(); layers.forEach((l) => this.camera.layers.enable(l)); this.renderer.render(this.scene, this.camera);
    };
    this.renderer.clear();
    const simpLayers = p.ghost ? [2, 3, 0] : [2, 0];
    if (p.compare) { draw(0, Math.floor(w / 2), [1, 0]); draw(Math.floor(w / 2), w - Math.floor(w / 2), simpLayers); }
    else draw(0, w, p.mode === "simplified" || p.mode === "analysis" ? simpLayers : [1, 0]);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    for (const l of this.labelEls) { const q = l.p.clone().project(this.camera), vis = q.z < 1 && Math.abs(q.x) < 1.05 && Math.abs(q.y) < 1.05; l.el.style.display = vis ? "block" : "none"; if (vis) { l.el.style.left = `${((q.x + 1) / 2) * w}px`; l.el.style.top = `${((1 - q.y) / 2) * h}px`; } }
  }

  destroy() { this.dead = true; cancelAnimationFrame(this.raf); this.ro.disconnect(); this.controls.dispose(); for (const g of [this.solid, this.simp, this.ghost, this.zones, this.sel]) dispose(g); this.renderer.dispose(); this.renderer.domElement.remove(); this.labelHost.remove(); this.divider.remove(); }
}
