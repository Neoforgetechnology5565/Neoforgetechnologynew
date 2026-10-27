import * as THREE from "three";
import type { Bim } from "@/lib/demo-c2b-data";

export const BRAND = 0x55b52b, AMBER = 0xf59e0b;
export interface C2b { group: THREE.Group; byId: Map<string, THREE.Mesh[]>; centre: THREE.Vector3; size: THREE.Vector3 }

/** Builds the generated BIM elements as a simple solid model (walls, openings with frames, columns, slab and translucent rooms). */
export function buildBimModel(bim: Bim[], storey: number): C2b {
  const group = new THREE.Group(), byId = new Map<string, THREE.Mesh[]>();
  const std = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const add = (id: string, m: THREE.Mesh, shadow = true) => { m.userData.id = id; m.castShadow = shadow; m.receiveShadow = true; group.add(m); (byId.get(id) ?? byId.set(id, []).get(id)!).push(m); return m; };
  const box = (w: number, h: number, d: number, mat: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const hostOf = (id?: string) => bim.find((b) => b.id === id);
  for (const b of bim) {
    if (b.cat === "Walls") {
      const m = box(b.length, b.height, b.thickness, std(b.exterior ? 0xd8c9b4 : 0xcfd3d0)); m.position.set(b.cx, b.height / 2, b.cy); m.rotation.y = -Math.atan2(b.y2 - b.y1, b.x2 - b.x1); add(b.id, m);
    } else if (b.cat === "Floors") {
      const m = box(b.width + 0.3, 0.25, b.length + 0.3, std(0x7b8580, { roughness: 0.95 })); m.position.set(b.cx, -0.125, b.cy); add(b.id, m);
    } else if (b.cat === "Columns") {
      const m = box(b.width, storey, b.thickness, std(0xe9ece9)); m.position.set(b.cx, storey / 2, b.cy); add(b.id, m);
    } else if (b.cat === "Rooms") {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.length), new THREE.MeshBasicMaterial({ color: BRAND, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(b.cx, 0.04, b.cy); add(b.id, m, false);
    } else {
      const horiz = (b as Bim & { horiz?: boolean }).horiz !== false, rot = horiz ? 0 : Math.PI / 2, t = hostOf(b.host)?.thickness ?? 0.2, door = b.cat === "Doors", w = b.width;
      const wallMat = std(hostOf(b.host)?.exterior ? 0xd8c9b4 : 0xcfd3d0), frame = std(0x2c3a33, { metalness: 0.3, roughness: 0.5 });
      const put = (id: string, m: THREE.Mesh, y: number) => { m.position.set(b.cx, y, b.cy); m.rotation.y = rot; return add(id, m, false); };
      if (door) { put(b.id, box(w - 0.08, 2.1, 0.06, std(b.name === "Double door" ? 0x8cc9e8 : 0xb07a3c, b.name === "Double door" ? { transparent: true, opacity: 0.5 } : {})), 1.05); put(b.id, box(w, storey - 2.1, t, wallMat), 2.1 + (storey - 2.1) / 2).castShadow = true; for (const sx of [-1, 1]) { const f = box(0.06, 2.1, t + 0.02, frame); f.position.set(b.cx + (horiz ? sx * (w / 2 - 0.03) : 0), 1.05, b.cy + (horiz ? 0 : sx * (w / 2 - 0.03))); f.rotation.y = rot; add(b.id, f, false); } }
      else { put(b.id, box(w, 0.9, t, wallMat), 0.45); put(b.id, box(w, storey - 2.4, t, wallMat), 2.4 + (storey - 2.4) / 2); put(b.id, box(w - 0.08, 1.5, 0.03, std(0x8cc9e8, { transparent: true, opacity: 0.45, roughness: 0.1 })), 1.65); for (const [bw, bh, y] of [[w, 0.05, 0.92], [w, 0.05, 2.38]] as const) put(b.id, box(bw, bh, t + 0.02, frame), y); }
    }
  }
  const bb = new THREE.Box3().setFromObject(group); const size = bb.getSize(new THREE.Vector3()), centre = bb.getCenter(new THREE.Vector3());
  return { group, byId, centre, size };
}
export function buildGround(scene: THREE.Scene) {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ color: 0x16201a, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.26; ground.receiveShadow = true; g.add(ground);
  const grid = new THREE.GridHelper(120, 60, 0x2f4a37, 0x1f2d24); grid.position.y = -0.25; g.add(grid); scene.add(g);
}
