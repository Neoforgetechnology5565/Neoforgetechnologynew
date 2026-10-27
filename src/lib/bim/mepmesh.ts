import { obbFromSegment, v3 } from "./geom";
import { MeshBuilder } from "./mesh";
import { LINEAR, segmentsOf } from "./mep";
import type { MepElement, MeshEl } from "./model";

export function mepMeshes(els: MepElement[]): MeshEl[] {
  const out: MeshEl[] = [];
  for (const e of els) {
    const mb = new MeshBuilder();
    if (LINEAR.includes(e.category)) { for (const [a, b] of segmentsOf(e)) { if (e.section.shape === "round") mb.cylinder(a, b, e.section.w / 2, 12); else mb.obb(obbFromSegment(a, b, e.section.w, e.section.h)); } }
    else { const s = e.size3 ?? { x: e.section.w, y: e.section.h, z: 0.15, rotation: 0 }; const c = e.path[0]; const cr = Math.cos(s.rotation), sr = Math.sin(s.rotation);
      if ((e.category === "air-terminal" || e.category === "light" || e.category === "sprinkler") && e.section.shape === "round") mb.cylinder(v3(c.x, c.y, c.z - s.z / 2), v3(c.x, c.y, c.z + s.z / 2), s.x / 2, 16);
      else if (e.category === "fitting" && e.section.shape === "round") mb.sphere(c, s.x / 2, 8);
      else mb.obb({ c, ax: [{ x: cr, y: sr, z: 0 }, { x: -sr, y: cr, z: 0 }, { x: 0, y: 0, z: 1 }], h: [s.x / 2, s.y / 2, s.z / 2] }); }
    out.push({ id: e.id, cat: `mep-${e.category}`, sys: e.system, level: e.level, name: `${e.tag}`, ...mb.done() });
  }
  return out;
}
