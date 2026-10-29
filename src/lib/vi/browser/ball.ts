/** Browser port of ball.py: colour/motion candidates and a gated tracker. Only detected positions are reported; gaps stay gaps. */
import type { BallPt } from "./analytics";
export interface Cand { x: number; y: number; r: number; src: "yolox" | "colour"; conf: number }

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 30; if (h < 0) h += 180; } // OpenCV scale: H 0-180
  return [h, mx ? (d / mx) * 255 : 0, mx];
}
/** `data` is RGBA of a (possibly downscaled) frame; `scale` maps its pixels back to source pixels. */
export function colourCandidates(data: Uint8ClampedArray, w: number, h: number, kind: "orange" | "white", prevGray: Uint8Array | null, minR: number, maxR: number, scale: number): { cands: Cand[]; gray: Uint8Array } {
  const gray = new Uint8Array(w * h), mask = new Uint8Array(w * h), mov = new Uint8Array(w * h);
  if (kind === "white" && prevGray) { // motion mask, dilated 3x3 like the server
    const raw = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) raw[i] = Math.abs(((0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) | 0) - prevGray[i]) > 22 ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let dy = -1; dy <= 1 && !m; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < w && yy >= 0 && yy < h && raw[yy * w + xx]) { m = 1; break; } } mov[y * w + x] = m; }
  }
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], gv = (0.299 * r + 0.587 * g + 0.114 * b) | 0; gray[i] = gv; const [H, S, V] = hsv(r, g, b);
    if (kind === "orange") mask[i] = H >= 8 && H <= 20 && S >= 150 && V >= 90 ? 1 : 0; else mask[i] = S <= 60 && V >= 190 && mov[i] ? 1 : 0;
  }
  const seen = new Uint8Array(w * h), cands: Cand[] = [], stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue; stack.length = 0; stack.push(s); seen[s] = 1; let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (stack.length) { const p = stack.pop()!, x = p % w, y = (p / w) | 0; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) if (q >= 0 && q < w * h && mask[q] && !seen[q] && Math.abs((q % w) - x) <= 1) { seen[q] = 1; stack.push(q); } }
    if (n < 3) continue; const r = Math.sqrt(n / Math.PI) / scale; if (r < minR || r > maxR) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = n / (bw * bh), asp = Math.min(bw, bh) / Math.max(bw, bh); // a disc fills about 0.78 of its box
    if (fill < 0.45 || asp < 0.45) continue;
    cands.push({ x: sx / n / scale, y: sy / n / scale, r, src: "colour", conf: Math.round(Math.min(1, fill / 0.78) * 1000) / 1000 });
  }
  return { cands, gray };
}

export class BallTracker {
  pos: [number, number] | null = null; vel: [number, number] = [0, 0]; miss = 0; chains: Cand[][] = [];
  constructor(private dt: number, private maxSpeed: number, private gate: number, private maxMiss = 4) {}
  private pt(t: number, c: Cand): BallPt { return { t: Math.round(t * 1000) / 1000, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, src: c.src, conf: c.conf }; }
  update(t: number, cands0: Cand[], seeds?: Cand[]): BallPt | null {
    if (!this.pos) {
      const cands = seeds ?? cands0, nxt: Cand[][] = [], used = new Set<number>();
      for (const ch of this.chains) { let best = -1, bd = Infinity; cands.forEach((c, k) => { const d = Math.hypot(c.x - ch[ch.length - 1].x, c.y - ch[ch.length - 1].y); if (d <= this.maxSpeed * this.dt && d < bd && !used.has(k)) { best = k; bd = d; } }); if (best >= 0) { used.add(best); nxt.push([...ch, cands[best]]); } }
      cands.forEach((c, k) => { if (!used.has(k)) nxt.push([c]); });
      this.chains = nxt.filter((c) => c.length <= 3).slice(0, 12); const ok = nxt.filter((c) => c.length >= 3); if (!ok.length) return null;
      const ch = ok.reduce((a, b) => (a.reduce((s, x) => s + x.conf, 0) >= b.reduce((s, x) => s + x.conf, 0) ? a : b)), a = ch[ch.length - 2], b = ch[ch.length - 1];
      this.chains = []; this.pos = [b.x, b.y]; this.vel = [(b.x - a.x) / this.dt, (b.y - a.y) / this.dt]; this.miss = 0; return this.pt(t, b);
    }
    const k = this.miss + 1, pred = [this.pos[0] + this.vel[0] * this.dt * k, this.pos[1] + this.vel[1] * this.dt * k], gate = this.gate * (1 + 0.5 * this.miss);
    let best: Cand | null = null, bd = Infinity;
    for (const c of cands0) { const d = Math.hypot(c.x - pred[0], c.y - pred[1]) - (c.src === "yolox" ? 3 : 0); if (d < gate && d < bd) { best = c; bd = d; } }
    if (!best) { // a strike or bounce reverses the motion: accept the nearest candidate close to the last position
      let nd = Infinity; for (const c of cands0) { const d = Math.hypot(c.x - this.pos[0], c.y - this.pos[1]); if (d <= this.gate * 2.5 * (1 + 0.25 * this.miss) && d < nd) { best = c; nd = d; } }
      if (best) this.vel = [0, 0];
    }
    if (!best) { this.miss++; if (this.miss > this.maxMiss) { this.pos = null; this.chains = []; } return null; }
    const v: [number, number] = [(best.x - this.pos[0]) / (this.dt * k), (best.y - this.pos[1]) / (this.dt * k)];
    this.vel = this.vel[0] || this.vel[1] ? [0.6 * v[0] + 0.4 * this.vel[0], 0.6 * v[1] + 0.4 * this.vel[1]] : v; this.pos = [best.x, best.y]; this.miss = 0; return this.pt(t, best);
  }
}
