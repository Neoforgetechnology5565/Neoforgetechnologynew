import * as THREE from "three";
import { doorSize, rise, windowLayout, type Cfg } from "@/lib/demo-config-data";

export const BRAND = 0x55b52b;
const T = 0.3; // wall thickness

const cache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, tile: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const hit = cache.get(key); if (hit) return hit;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  draw(c.getContext("2d")!, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.repeat.set(1 / tile, 1 / tile);
  cache.set(key, t); return t;
}
const noise = (g: CanvasRenderingContext2D, s: number, base: string, amp: number, n = 2500) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { const v = Math.random() * amp; g.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${v})` : `rgba(255,255,255,${v})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
};
export function facadeMap(kind: Cfg["material"]) {
  if (kind === "brick") return tex("brick", 0.8, (g, s) => { g.fillStyle = "#c9c2b6"; g.fillRect(0, 0, s, s); const rows = 10, rh = s / rows; for (let r = 0; r < rows; r++) for (let b = 0; b < 4; b++) { const x = ((b + (r % 2) * 0.5) * s) / 4; g.fillStyle = `hsl(${12 + Math.random() * 8},${45 + Math.random() * 12}%,${38 + Math.random() * 10}%)`; g.fillRect(x + 2, r * rh + 2, s / 4 - 4, rh - 4); if (x + s / 4 > s) g.fillRect(x - s + 2, r * rh + 2, s / 4 - 4, rh - 4); } });
  if (kind === "timber") return tex("timber", 0.8, (g, s) => { for (let b = 0; b < 8; b++) { g.fillStyle = `hsl(${28 + Math.random() * 6},${42 + Math.random() * 10}%,${52 + Math.random() * 10}%)`; g.fillRect((b * s) / 8, 0, s / 8, s); for (let i = 0; i < 14; i++) { g.strokeStyle = "rgba(60,35,15,0.18)"; g.beginPath(); const x = (b * s) / 8 + Math.random() * (s / 8); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 4, s); g.stroke(); } g.fillStyle = "rgba(30,15,5,0.55)"; g.fillRect((b * s) / 8, 0, 2, s); } });
  if (kind === "concrete") return tex("concrete", 1.6, (g, s) => { noise(g, s, "#c9cbc6", 0.12, 5000); for (let y = 0; y < s; y += 32) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, y, s, 1.5); } });
  if (kind === "metal") return tex("metal", 1.6, (g, s) => { noise(g, s, "#e4e7e9", 0.05, 1200); for (let x = 0; x < s; x += 32) { g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(x, 0, 2, s); g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x + 2, 0, 2, s); } });
  return tex("render", 2, (g, s) => noise(g, s, "#f4f2ec", 0.06, 3500));
}
export function roofMap(kind: Cfg["roofFinish"]) {
  if (kind === "slate") return tex("slate", 0.9, (g, s) => { g.fillStyle = "#3a3f44"; g.fillRect(0, 0, s, s); const rows = 10, rh = s / rows; for (let r = 0; r < rows; r++) for (let b = 0; b < 6; b++) { const x = ((b + (r % 2) * 0.5) * s) / 6; g.fillStyle = `hsl(210,6%,${24 + Math.random() * 12}%)`; g.fillRect(x + 1, r * rh + 1, s / 6 - 2, rh - 2); } });
  if (kind === "terracotta") return tex("terra", 0.9, (g, s) => { for (let r = 0; r < 8; r++) { g.fillStyle = `hsl(${14 + Math.random() * 6},${55 + Math.random() * 10}%,${42 + Math.random() * 8}%)`; g.fillRect(0, (r * s) / 8, s, s / 8 - 2); for (let x = 0; x < s; x += 32) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, (r * s) / 8, 2, s / 8); } } });
  if (kind === "zinc") return tex("zinc", 1.2, (g, s) => { noise(g, s, "#8a949a", 0.06, 1500); for (let x = 0; x < s; x += 28) { g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(x, 0, 2, s); g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x + 2, 0, 1.5, s); } });
  return tex("green", 1.2, (g, s) => noise(g, s, "#5f8a3c", 0.22, 6000));
}

export interface House { group: THREE.Group; parts: Record<string, string> }

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02, ...o });

export function buildHouse(cfg: Cfg): House {
  const group = new THREE.Group();
  const parts: Record<string, string> = {};
  const H = cfg.floors * cfg.floorHeight, W = cfg.width, L = cfg.length, fh = cfg.floorHeight;
  const fm = std({ map: facadeMap(cfg.material), color: new THREE.Color(cfg.color), roughness: cfg.material === "metal" ? 0.45 : 0.9, metalness: cfg.material === "metal" ? 0.35 : 0 });
  const rm = std({ map: roofMap(cfg.roofFinish), roughness: cfg.roofFinish === "zinc" ? 0.5 : 0.9, metalness: cfg.roofFinish === "zinc" ? 0.35 : 0 });
  const glass = std({ color: 0x9fd0e8, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.2 });
  const frame = std({ color: 0x24302b, roughness: 0.5, metalness: 0.3 });
  const dark = std({ color: 0x15191a, roughness: 1 });
  const add = (m: THREE.Mesh, id: string, label: string, parent: THREE.Object3D = group, shadow = true) => {
    m.userData.id = id; m.castShadow = shadow; m.receiveShadow = true; parts[id] = label;
    m.material = (m.material as THREE.Material).clone();
    parent.add(m); return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const edges = (m: THREE.Mesh, parent: THREE.Object3D = group, op = 0.35) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), new THREE.LineBasicMaterial({ color: 0x1b221e, transparent: true, opacity: op })); l.position.copy(m.position); l.rotation.copy(m.rotation); l.scale.copy(m.scale); l.userData.edge = true; parent.add(l); };

  // ground, plinth, interior, slabs
  const plinth = box(W + 0.3, 0.2, L + 0.3, std({ color: 0x8b908c })); plinth.position.y = -0.1; add(plinth, "plinth", "Plinth");
  const inner = box(W - 0.4, H, L - 0.4, dark); inner.position.y = H / 2; add(inner, "interior", "Interior volume", group, false);
  for (let f = 0; f <= cfg.floors; f++) { const s = box(W - 0.6, 0.2, L - 0.6, std({ color: 0xcdd1cc })); s.position.y = f * fh + (f === 0 ? 0.05 : -0.1 * (f === cfg.floors ? 1 : 0)); add(s, "slabs", "Floor slabs", group, false); }

  // façades with real openings
  const dz = doorSize(cfg.door);
  const makeFacade = (id: string, label: string, len: number, pos: THREE.Vector3, rotY: number, front: boolean) => {
    const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotY; group.add(g);
    const wl = windowLayout(cfg, len);
    const U = (u: number) => u - len / 2;
    const s = new THREE.Shape();
    if (front) { const a = len / 2 - dz.w / 2, b = len / 2 + dz.w / 2; s.moveTo(U(0), 0); s.lineTo(U(a), 0); s.lineTo(U(a), dz.h); s.lineTo(U(b), dz.h); s.lineTo(U(b), 0); s.lineTo(U(len), 0); }
    else { s.moveTo(U(0), 0); s.lineTo(U(len), 0); }
    s.lineTo(U(len), H); s.lineTo(U(0), H); s.lineTo(U(0), 0);
    const holes: { u: number; v: number; w: number; h: number; door?: boolean }[] = [];
    for (let f = 0; f < cfg.floors; f++) {
      if (wl.count) {
        const bay = len / wl.count;
        for (let i = 0; i < wl.count; i++) {
          const u = (i + 0.5) * bay;
          if (front && f === 0 && Math.abs(u - len / 2) < dz.w / 2 + wl.w / 2 + 0.25) continue;
          if (front && f > 0 && cfg.balcony && Math.abs(u - len / 2) < bay / 2 + 0.01) continue;
          const h = Math.min(wl.h, fh - wl.sill - 0.3);
          if (h > 0.3) holes.push({ u, v: f * fh + wl.sill, w: wl.w, h });
        }
      }
      if (front && f > 0 && cfg.balcony) holes.push({ u: len / 2, v: f * fh + 0.05, w: 1.2, h: 2.2, door: true });
    }
    for (const h of holes) { const p = new THREE.Path(); p.moveTo(U(h.u - h.w / 2), h.v); p.lineTo(U(h.u - h.w / 2), h.v + h.h); p.lineTo(U(h.u + h.w / 2), h.v + h.h); p.lineTo(U(h.u + h.w / 2), h.v); p.lineTo(U(h.u - h.w / 2), h.v); s.holes.push(p); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false }); geo.translate(0, 0, -T);
    const wall = new THREE.Mesh(geo, fm); add(wall, id, label, g); edges(wall, g, 0.18);
    for (const h of holes) {
      const pane = box(h.w - 0.1, h.h - 0.1, 0.03, glass); pane.position.set(U(h.u), h.v + h.h / 2, -T / 2); add(pane, "windows", h.door ? "Balcony doors" : "Windows", g, false);
      for (const [bw, bh, ox, oy] of [[h.w, 0.06, 0, h.h / 2 - 0.03], [h.w, 0.06, 0, -h.h / 2 + 0.03], [0.06, h.h, -h.w / 2 + 0.03, 0], [0.06, h.h, h.w / 2 - 0.03, 0]] as const) { const b = box(bw, bh, T + 0.04, frame); b.position.set(U(h.u) + ox, h.v + h.h / 2 + oy, -T / 2); add(b, "windows", h.door ? "Balcony doors" : "Windows", g, false); }
      if (!h.door) { const sill = box(h.w + 0.12, 0.05, 0.12, std({ color: 0xcfd3d0 })); sill.position.set(U(h.u), h.v - 0.02, 0.04); add(sill, "windows", "Windows", g, false); }
    }
    if (front) {
      const glazedDoor = cfg.door !== "single";
      const leaf = box(dz.w - 0.1, dz.h - 0.05, glazedDoor ? 0.04 : 0.06, glazedDoor ? glass : std({ color: 0x3b4a44, roughness: 0.5 })); leaf.position.set(0, dz.h / 2, -T / 2); add(leaf, "door", "Entrance door", g, false);
      for (const [bw, bh, ox, oy] of [[dz.w, 0.07, 0, dz.h - 0.035], [0.07, dz.h, -dz.w / 2 + 0.035, dz.h / 2], [0.07, dz.h, dz.w / 2 - 0.035, dz.h / 2]] as const) { const b = box(bw, bh, T + 0.04, frame); b.position.set(ox, oy === dz.h / 2 ? oy : oy, -T / 2); add(b, "door", "Entrance door", g, false); }
      if (cfg.door !== "single") { const mid = box(0.05, dz.h, 0.06, frame); mid.position.set(0, dz.h / 2, -T / 2); add(mid, "door", "Entrance door", g, false); }
      const step = box(dz.w + 0.8, 0.12, 0.7, std({ color: 0x9aa09b })); step.position.set(0, 0.0, 0.35); add(step, "door", "Entrance door", g);
    }
    return g;
  };
  const sideLen = L - 2 * T;
  makeFacade("front", "Front façade", W, new THREE.Vector3(0, 0, L / 2), 0, true);
  makeFacade("back", "Rear façade", W, new THREE.Vector3(0, 0, -L / 2), Math.PI, false);
  makeFacade("left", "Left façade", sideLen, new THREE.Vector3(-W / 2, 0, 0), -Math.PI / 2, false);
  makeFacade("right", "Right façade", sideLen, new THREE.Vector3(W / 2, 0, 0), Math.PI / 2, false);

  // roof
  const ov = 0.5, p = (cfg.pitch * Math.PI) / 180, hw = W / 2 + ov, r = rise(cfg);
  if (cfg.roof === "flat") {
    const slab = box(W + 2 * ov, 0.25, L + 2 * ov, rm); slab.position.y = H + 0.125; add(slab, "roof", "Roof"); edges(slab);
    for (const [w, d, x, z] of [[W + 2 * ov, 0.2, 0, L / 2 + ov - 0.1], [W + 2 * ov, 0.2, 0, -(L / 2 + ov - 0.1)], [0.2, L + 2 * ov, W / 2 + ov - 0.1, 0], [0.2, L + 2 * ov, -(W / 2 + ov - 0.1), 0]] as const) { const pm = box(w, 0.35, d, fm); pm.position.set(x, H + 0.4, z); add(pm, "roof", "Roof"); }
  } else if (cfg.roof === "gable") {
    const sl = hw / Math.cos(p);
    for (const sgn of [-1, 1]) { const sp = box(sl, 0.16, L + 2 * ov, rm); sp.position.set(sgn * hw / 2, H + r / 2 + 0.08, 0); sp.rotation.z = -sgn * p; add(sp, "roof", "Roof"); edges(sp); }
    for (const sgn of [-1, 1]) { const tri = new THREE.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, (W / 2) * Math.tan(p)); tri.lineTo(-W / 2, 0); const gg = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false }); gg.translate(0, 0, -T); const m = new THREE.Mesh(gg, fm); m.position.set(0, H, sgn * (L / 2)); if (sgn < 0) m.rotation.y = Math.PI; add(m, sgn > 0 ? "front" : "back", sgn > 0 ? "Front façade" : "Rear façade"); }
  } else if (cfg.roof === "shed") {
    const sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, r); sh.lineTo(-hw, 0.3); sh.lineTo(-hw, 0);
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: L + 2 * ov, bevelEnabled: false }); g2.translate(0, 0, -(L + 2 * ov) / 2);
    const m = new THREE.Mesh(g2, rm); m.position.y = H; add(m, "roof", "Roof"); edges(m);
  } else {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, r, 4), rm); cone.rotation.y = Math.PI / 4; cone.scale.set(hw * Math.SQRT2, 1, (L / 2 + ov) * Math.SQRT2); cone.position.y = H + r / 2; add(cone, "roof", "Roof"); edges(cone);
  }

  // components
  if (cfg.balcony && cfg.floors > 1) for (let f = 1; f < cfg.floors; f++) {
    const slab = box(2.8, 0.16, 1.3, std({ color: 0xc9cdc8 })); slab.position.set(0, f * fh - 0.08, L / 2 + 0.65); add(slab, "balcony", "Balcony");
    const rail = box(2.8, 1.0, 0.03, glass); rail.position.set(0, f * fh + 0.5, L / 2 + 1.28); add(rail, "balcony", "Balcony", group, false);
    for (const sx of [-1.4, 1.4]) { const sr = box(0.03, 1.0, 1.3, glass); sr.position.set(sx, f * fh + 0.5, L / 2 + 0.65); add(sr, "balcony", "Balcony", group, false); }
    const top = box(2.84, 0.05, 0.06, frame); top.position.set(0, f * fh + 1.02, L / 2 + 1.28); add(top, "balcony", "Balcony", group, false);
  }
  if (cfg.porch) {
    const cw = dz.w + 1.6, c = box(cw, 0.14, 1.5, fm); c.position.set(0, dz.h + 0.35, L / 2 + 0.75); add(c, "porch", "Porch canopy");
    for (const sx of [-cw / 2 + 0.12, cw / 2 - 0.12]) { const po = box(0.1, dz.h + 0.3, 0.1, frame); po.position.set(sx, (dz.h + 0.3) / 2, L / 2 + 1.35); add(po, "porch", "Porch canopy", group, false); }
  }
  if (cfg.chimney) { const ch = rise(cfg) + 1.0, m = box(0.7, ch, 0.7, std({ color: 0x9a6a52, map: facadeMap("brick") })); m.position.set(W / 4, H + ch / 2, -L / 4); add(m, "chimney", "Chimney"); const cap = box(0.85, 0.1, 0.85, std({ color: 0x777777 })); cap.position.set(W / 4, H + ch + 0.05, -L / 4); add(cap, "chimney", "Chimney"); }
  if (cfg.solar && cfg.roof !== "hip") {
    const pm = std({ color: 0x1c2f4d, roughness: 0.25, metalness: 0.6 });
    const rows = Math.floor((L - 1) / 1.7);
    const mkPanel = (x: number, y: number, rz: number, z: number) => { const m = box(1.0, 0.05, 1.6, pm); m.position.set(x, y, z); m.rotation.z = rz; add(m, "solar", "Solar panels"); };
    if (cfg.roof === "gable") { const SL = hw / Math.cos(p), cols = Math.floor((SL - 0.8) / 1.1); for (let j = 0; j < cols; j++) { const d = 0.5 + (j + 0.5) * 1.1; for (let i = 0; i < rows; i++) mkPanel(hw - d * Math.cos(p), H + d * Math.sin(p) + 0.2, -p, (i - (rows - 1) / 2) * 1.7); } }
    else if (cfg.roof === "shed") { const SL = (2 * hw) / Math.cos(p), cols = Math.floor((SL - 0.8) / 1.1); for (let j = 0; j < cols; j++) { const d = 0.6 + (j + 0.5) * 1.1; for (let i = 0; i < rows; i++) mkPanel(-hw + d * Math.cos(p), H + 0.3 + d * Math.sin(p) + 0.12, p, (i - (rows - 1) / 2) * 1.7); } }
    else { const cols = Math.floor((W - 1) / 1.1); for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) mkPanel((j - (cols - 1) / 2) * 1.1, H + 0.55, -0.2, (i - (rows - 1) / 2) * 1.7); }
  }
  return { group, parts };
}

/** Lawn, path, trees and sky. Not part of the exported model. */
export function buildSurroundings(scene: THREE.Scene, W: number, L: number) {
  const g = new THREE.Group();
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(60, 48), std({ color: 0x7ea766, roughness: 1 })); lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.21; lawn.receiveShadow = true; g.add(lawn);
  const path = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 9), std({ color: 0xb8b7b0 })); path.position.set(0, -0.19, L / 2 + 4.5); path.receiveShadow = true; g.add(path);
  const tree = (x: number, z: number, s: number) => { const t = new THREE.Group(); const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 2 * s, 8), std({ color: 0x6b4a2a })); trunk.position.y = s; trunk.castShadow = true; t.add(trunk); const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * s, 1), std({ color: 0x3f7a3a })); c1.position.y = 2.6 * s; c1.castShadow = true; t.add(c1); const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * s, 1), std({ color: 0x4f8f46 })); c2.position.set(0.7 * s, 3.3 * s, 0.2 * s); c2.castShadow = true; t.add(c2); t.position.set(x, -0.2, z); g.add(t); };
  tree(W / 2 + 4, L / 2 + 3, 1.1); tree(-W / 2 - 5, -L / 4, 1.4); tree(W / 2 + 6, -L / 2 - 2, 1); tree(-W / 2 - 3.5, L / 2 + 5, 0.9);
  scene.add(g); return g;
}
