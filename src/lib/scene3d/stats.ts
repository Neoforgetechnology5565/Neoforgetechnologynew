import { CLASSES, STRUCTURAL, type Cls, type SceneData } from "./scenes";
import type { Segmentation } from "./segment";

export interface Evaluation { accuracy: number; meanIoU: number; perClass: { cls: Cls; points: number; precision: number; recall: number; iou: number }[]; confusion: number[][]; instances: { truth: number; matched: number; byClass: { cls: Cls; truth: number; matched: number }[] } }
/** Compares a computed segmentation with the scene's reference labels (point-wise classes, plus instance matching at IoU >= 0.5 for objects, doors and windows). */
export function evaluate(scene: SceneData, seg: Segmentation): Evaluation {
  const K = CLASSES.length, conf = Array.from({ length: K }, () => new Array(K).fill(0)), n = scene.cls.length; let right = 0;
  for (let i = 0; i < n; i++) { conf[scene.cls[i]][seg.cls[i]]++; if (scene.cls[i] === seg.cls[i]) right++; }
  const perClass = CLASSES.map((c, k) => { const tp = conf[k][k], fn = conf[k].reduce((a, b) => a + b, 0) - tp, fp = conf.reduce((a, r) => a + r[k], 0) - tp, pts = tp + fn; return { cls: c, points: pts, precision: tp + fp ? tp / (tp + fp) : 0, recall: pts ? tp / pts : 0, iou: tp + fn + fp ? tp / (tp + fn + fp) : 0 }; }).filter((x) => x.points > 0);
  const gt = new Map<number, number[]>(), pr = new Map<number, number[]>(); for (let i = 0; i < n; i++) { (gt.get(scene.inst[i]) ?? gt.set(scene.inst[i], []).get(scene.inst[i])!).push(i); if (seg.inst[i] > 0) (pr.get(seg.inst[i]) ?? pr.set(seg.inst[i], []).get(seg.inst[i])!).push(i); }
  const byClass = new Map<Cls, { truth: number; matched: number }>(); let matched = 0, total = 0;
  for (const g of scene.instances) { if (STRUCTURAL.includes(g.cls)) continue; const pts = gt.get(g.id) ?? []; const count = new Map<number, number>(); for (const i of pts) if (seg.inst[i] > 0) count.set(seg.inst[i], (count.get(seg.inst[i]) ?? 0) + 1); let ok = false; for (const [pid, c] of count) { const pinst = seg.instances.find((x) => x.id === pid); const union = pts.length + (pr.get(pid)?.length ?? 0) - c; if (pinst && pinst.cls === g.cls && c / union >= 0.5) ok = true; } total++; if (ok) matched++; const e = byClass.get(g.cls) ?? { truth: 0, matched: 0 }; e.truth++; if (ok) e.matched++; byClass.set(g.cls, e); }
  return { accuracy: right / n, meanIoU: perClass.reduce((a, c) => a + c.iou, 0) / perClass.length, perClass, confusion: conf, instances: { truth: total, matched, byClass: [...byClass].map(([cls, v]) => ({ cls, ...v })) } };
}
export interface Box { min: [number, number, number]; max: [number, number, number]; center: [number, number, number]; size: [number, number, number]; points: number }
export function boxOf(pos: Float32Array, idx: ArrayLike<number>): Box { const mn: [number, number, number] = [Infinity, Infinity, Infinity], mx: [number, number, number] = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < idx.length; k++) { const i = idx[k]; for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } } return { min: mn, max: mx, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], points: idx.length }; }
export interface Relation { a: number; b: number; kind: "on top of" | "next to"; gap: number }
/** Spatial relations between objects from their boxes: stacked (one box sits on the top face of another with overlapping footprint) or next to (gap under 0.5 m). */
export function relations(boxes: Map<number, Box>, skip: Set<number>): Relation[] {
  const out: Relation[] = [], ids = [...boxes.keys()].filter((i) => !skip.has(i));
  for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) { const A = boxes.get(ids[x])!, B = boxes.get(ids[y])!; const gx = Math.max(0, Math.max(A.min[0] - B.max[0], B.min[0] - A.max[0])), gz = Math.max(0, Math.max(A.min[2] - B.max[2], B.min[2] - A.max[2])), gy = Math.max(0, Math.max(A.min[1] - B.max[1], B.min[1] - A.max[1])), gap = Math.hypot(gx, gz, gy);
    if (gx === 0 && gz === 0 && Math.abs(A.min[1] - B.max[1]) < 0.06) out.push({ a: ids[x], b: ids[y], kind: "on top of", gap: 0 }); else if (gx === 0 && gz === 0 && Math.abs(B.min[1] - A.max[1]) < 0.06) out.push({ a: ids[y], b: ids[x], kind: "on top of", gap: 0 }); else if (gap < 0.5) out.push({ a: ids[x], b: ids[y], kind: "next to", gap }); }
  return out.sort((p, q) => p.gap - q.gap);
}
