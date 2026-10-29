/** PPE association and per-worker assessment rules (port of services/ppe-monitor/app/ppe.py). A missing detection is NOT treated as proof that PPE is absent: only frames with a good view of the worker count as evidence of absence. */
import type { Assessment, ItemState, PpeAssessment, PpeKind } from "../types";
export const HAT: PpeKind = "hard_hat", VEST: PpeKind = "safety_vest", KINDS: PpeKind[] = [HAT, VEST];
export const CLASS_OF: Record<number, PpeKind> = { 2: VEST, 4: HAT }; // SSD class id -> PPE kind (see docs/ppe/MODEL_AND_LICENSES.md)
const HAT_Y = [-0.12, 0.4], VEST_Y = [0.18, 0.92], VEST_MIN_W = 0.3, VEST_MIN_H = 0.12, HAT_MAX_W = 0.8, HAT_MAX_H = 0.5;
export type Box4 = [number, number, number, number];
export interface PPEBox { kind: PpeKind; score: number; x1: number; y1: number; x2: number; y2: number; worker: number }
export const iou = (a: number[], b: number[]) => { const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), inter = ix * iy; return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9); };
/** Keep PPE boxes that sit where that item would sit on that worker, drop duplicates, and give each box to exactly one worker. */
export function associate(persons: Box4[], boxes: PPEBox[], thr: number): PPEBox[] {
  const kept: PPEBox[] = [];
  for (const b of [...boxes].sort((x, y) => y.score - x.score)) {
    if (b.score < thr) continue; const [px1, py1, px2, py2] = persons[b.worker], pw = px2 - px1, ph = py2 - py1, cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2, relY = (cy - py1) / ph, relX = (cx - px1) / pw, bw = (b.x2 - b.x1) / pw, bh = (b.y2 - b.y1) / ph;
    if (!(relX >= -0.1 && relX <= 1.1)) continue; if (b.kind === HAT && !(relY >= HAT_Y[0] && relY <= HAT_Y[1] && bw <= HAT_MAX_W && bh <= HAT_MAX_H)) continue; if (b.kind === VEST && !(relY >= VEST_Y[0] && relY <= VEST_Y[1] && bw >= VEST_MIN_W && bh >= VEST_MIN_H)) continue;
    if (kept.some((k) => k.kind === b.kind && (k.worker === b.worker || iou([k.x1, k.y1, k.x2, k.y2], [b.x1, b.y1, b.x2, b.y2]) > 0.4))) continue; kept.push(b);
  }
  return kept;
}
interface Evidence { window: Record<PpeKind, number[]> }
export class Assessor {
  static DETECTED_FRACTION = 0.5; static MISSING_FRACTION = 0.12; static MIN_OBSERVATIONS = 5; readonly required: PpeKind[]; history = new Map<number, Evidence>();
  constructor(required: PpeKind[], private minPersonScore = 0.5, private minHeight = 96, private smooth = true) { this.required = KINDS.filter((k) => required.includes(k)); }
  prune(alive: Set<number>) { for (const tid of [...this.history.keys()]) if (!alive.has(tid) && this.history.size > 400) this.history.delete(tid); }
  /** Reasons the view of worker i is too poor to conclude that PPE is absent. An empty list means a reliable view. */
  reliability(i: number, persons: Box4[], scores: number[]): string[] {
    const [, y1, , y2] = persons[i], why: string[] = []; if (scores[i] < this.minPersonScore) why.push("low worker-detection confidence"); if (y2 - y1 < this.minHeight) why.push("worker too small in the frame"); if (y1 <= 2) why.push("head cut off by the frame edge");
    if (persons.some((p, j) => j !== i && iou(persons[i], p) > 0.3)) why.push("worker partly hidden by another worker"); return why;
  }
  assess(i: number, trackId: number | null, ppe: PPEBox[], badView: string[], highConf: number, confirmed: boolean): PpeAssessment {
    const items = {} as Record<PpeKind, { state: ItemState; confidence: number | null }>;
    for (const kind of KINDS) {
      const found = ppe.find((b) => b.worker === i && b.kind === kind) ?? null, seen = found !== null && found.score >= highConf; let state: ItemState;
      if (this.smooth && trackId !== null) {
        const ev = this.history.get(trackId) ?? this.history.set(trackId, { window: { hard_hat: [], safety_vest: [] } }).get(trackId)!, win = ev.window[kind];
        if (!badView.length || found !== null) { win.push(seen ? 1 : found !== null ? 0.5 : 0); if (win.length > 30) win.shift(); } // a detection is evidence even from a poor view; absence only from a good view
        const n = win.length, frac = n ? win.reduce((a, b) => a + b, 0) / n : 0;
        state = n >= Assessor.MIN_OBSERVATIONS && frac >= Assessor.DETECTED_FRACTION ? "detected" : n >= Assessor.MIN_OBSERVATIONS && frac <= Assessor.MISSING_FRACTION ? "not_detected" : "uncertain";
      } else state = seen ? "detected" : badView.length || found !== null ? "uncertain" : "not_detected";
      items[kind] = { state, confidence: found ? Math.round(found.score * 1e4) / 1e4 : null };
    }
    const states = this.required.map((k) => items[k].state); let reasons = [...badView], status: Assessment;
    if (!states.length) { status = "uncertain"; reasons.push("no PPE item is required"); } else if (states.some((s) => s === "not_detected")) status = "potential_violation"; else if (states.some((s) => s === "uncertain")) status = "uncertain"; else status = "compliant";
    if (status === "uncertain" && !reasons.length) reasons.push(trackId !== null ? "not enough consistent evidence yet" : "weak or missing evidence in this view");
    if (status === "potential_violation") { reasons = this.required.filter((k) => items[k].state === "not_detected").map((k) => `${k.replace("_", " ")} not detected`); if (badView.length) reasons.push("current view is poor (" + badView.join(", ") + "); conclusion is from earlier frames"); }
    return { status, items, reasons, reliable_view: !badView.length, confirmed };
  }
}
