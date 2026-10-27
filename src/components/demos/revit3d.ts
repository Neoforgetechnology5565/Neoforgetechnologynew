import * as THREE from "three";
import { ELEV, type Cat, type El } from "@/lib/demo-revit-data";

export const BRAND = 0x55b52b;
export const AMBER = 0xf59e0b;
export const BASE: Record<Cat, number> = { Walls: 0xcfd3d0, Doors: 0xb07a3c, Windows: 0x7fc4e6, Columns: 0xe9ece9, Floors: 0x7b8580 };

export interface Built { group: THREE.Group; byId: Map<string, THREE.Mesh[]>; mats: Map<string, THREE.MeshStandardMaterial[]>; edges: THREE.LineSegments[] }

const SILL = 0.9;

function wallGeometry(len: number, h: number, t: number, opening?: { w: number; h: number; door: boolean }) {
  const s = new THREE.Shape();
  if (opening?.door) {
    const a = len / 2 - opening.w / 2, b = len / 2 + opening.w / 2, dh = Math.min(opening.h, h - 0.1);
    s.moveTo(0, 0); s.lineTo(a, 0); s.lineTo(a, dh); s.lineTo(b, dh); s.lineTo(b, 0); s.lineTo(len, 0); s.lineTo(len, h); s.lineTo(0, h); s.lineTo(0, 0);
  } else {
    s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, h); s.lineTo(0, h); s.lineTo(0, 0);
    if (opening) {
      const hole = new THREE.Path();
      const a = len / 2 - opening.w / 2, b = len / 2 + opening.w / 2, top = Math.min(SILL + opening.h, h - 0.1);
      hole.moveTo(a, SILL); hole.lineTo(a, top); hole.lineTo(b, top); hole.lineTo(b, SILL); hole.lineTo(a, SILL);
      s.holes.push(hole);
    }
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(-len / 2, 0, -t / 2);
  return g;
}

/** Builds the whole sample building from the element list (walls get real openings for their doors and windows). */
export function buildBuilding(els: El[]): Built {
  const group = new THREE.Group();
  const byId = new Map<string, THREE.Mesh[]>();
  const mats = new Map<string, THREE.MeshStandardMaterial[]>();
  const edges: THREE.LineSegments[] = [];
  const add = (e: El, mesh: THREE.Mesh, edgeLines = true) => {
    mesh.userData.id = e.id; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    (byId.get(e.id) ?? byId.set(e.id, []).get(e.id)!).push(mesh);
    (mats.get(e.id) ?? mats.set(e.id, []).get(e.id)!).push(mesh.material as THREE.MeshStandardMaterial);
    if (edgeLines) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: 0x2b302d, transparent: true, opacity: 0.55 }));
      l.position.copy(mesh.position); l.rotation.copy(mesh.rotation); l.userData.edgeOf = e.id;
      group.add(l); edges.push(l);
    }
  };
  const mat = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.02, ...o });
  const hosted = new Map<string, El>();
  for (const e of els) if ((e.cat === "Doors" || e.cat === "Windows") && e.host) hosted.set(e.host, e);

  for (const e of els) {
    const y0 = ELEV[e.level] ?? 0, s = e.shape;
    if (e.cat === "Floors") {
      const m = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.25, 14.6), mat(BASE.Floors, { roughness: 0.95 }));
      m.position.set(12, y0 - 0.125, 7); add(e, m);
    } else if (e.cat === "Columns") {
      const m = new THREE.Mesh(new THREE.BoxGeometry(e.width, e.height, e.width), mat(BASE.Columns));
      m.position.set(s.cx!, y0 + e.height / 2, s.cy!); add(e, m);
    } else if (e.cat === "Walls") {
      const op = hosted.get(e.id);
      const g = wallGeometry(e.length, e.height, e.thickness, op ? { w: op.width, h: op.height, door: op.cat === "Doors" } : undefined);
      const m = new THREE.Mesh(g, mat(e.exterior ? 0xd8c9b4 : BASE.Walls));
      const dx = s.x2! - s.x1!, dz = s.y2! - s.y1!;
      m.rotation.y = -Math.atan2(dz, dx);
      m.position.set((s.x1! + s.x2!) / 2, y0, (s.y1! + s.y2!) / 2); add(e, m);
    } else {
      const host = els.find((x) => x.id === e.host);
      const t = host?.thickness ?? 0.2;
      const rot = s.horiz ? 0 : -Math.PI / 2;
      const door = e.cat === "Doors";
      const glazed = !door || e.type.includes("Glazed");
      const w = e.width, h = Math.min(e.height, 3.0);
      const bottom = door ? 0 : SILL;
      // pane / leaf
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, h - 0.08, glazed ? 0.03 : 0.05), glazed ? mat(0x8cc9e8, { transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 }) : mat(BASE.Doors, { roughness: 0.6 }));
      pane.position.set(s.cx!, y0 + bottom + h / 2, s.cy!); pane.rotation.y = rot; add(e, pane, false);
      // frame (four thin bars)
      const fm = mat(door && !glazed ? 0x6b4a24 : 0x2c3a33, { roughness: 0.5, metalness: 0.3 });
      const bars: [number, number, number, number][] = [[w, 0.05, 0, h / 2 - 0.025], [w, 0.05, 0, -h / 2 + 0.025], [0.05, h, -w / 2 + 0.025, 0], [0.05, h, w / 2 - 0.025, 0]];
      if (door) bars.splice(1, 1);
      for (const [bw, bh, ox, oy] of bars) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t + 0.02), fm);
        const cos = Math.cos(rot), sin = Math.sin(rot);
        b.position.set(s.cx! + ox * cos, y0 + bottom + h / 2 + oy, s.cy! - ox * sin); b.rotation.y = rot; add(e, b, false);
      }
    }
  }
  return { group, byId, mats, edges };
}

/** Roof, parapet, ground and site grid. Decorative, not selectable. */
export function buildSite(scene: THREE.Scene) {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x16201a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.26; ground.receiveShadow = true; g.add(ground);
  const grid = new THREE.GridHelper(120, 60, 0x2f4a37, 0x1f2d24); grid.position.y = -0.25; g.add(grid);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.3, 14.6), new THREE.MeshStandardMaterial({ color: 0x59615c, roughness: 0.9 }));
  roof.position.set(12, 6.55, 7); roof.castShadow = true; roof.receiveShadow = true; roof.userData.site = true; g.add(roof);
  const pm = new THREE.MeshStandardMaterial({ color: 0xb9beba, roughness: 0.9 });
  for (const [w, d, x, z] of [[24.6, 0.25, 12, -0.15], [24.6, 0.25, 12, 14.15], [0.25, 14.6, -0.15, 7], [0.25, 14.6, 24.15, 7]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), pm); p.position.set(x, 7.0, z); p.castShadow = true; g.add(p);
  }
  scene.add(g);
  return g;
}
