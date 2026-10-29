/** Camera-motion estimation between analysed frames (port of services/sports-analyzer/app/camera.py): background corners (player boxes masked out) tracked with pyramidal Lucas–Kanade flow, a homography fitted with RANSAC, chained to the first frame of the current segment; a new segment starts when the fit is unreliable. */
import { apply3, det3, eye3, goodFeatures, inv3, lkTrack, mul3, pyramid, ransacHomography, toImg, type Img, type M3 } from "./cvlite";
const MIN_INLIERS = 25, MIN_RATIO = 0.4, WORK_WIDTH = 640;
export interface MotionState { segment: number; H: M3; inliers: number; reliable: boolean }
type Box = [number, number, number, number];
export class CameraMotion {
  readonly scale: number; readonly size: [number, number]; private prev: Img[] | null = null; state: MotionState = { segment: 0, H: eye3(), inliers: 0, reliable: true }; maxShift = 0; maxCentreShift = 0; private S: M3; private Sinv: M3; private centre: [number, number];
  constructor(width: number, height: number) { this.scale = Math.min(1, WORK_WIDTH / width); this.size = [Math.round(width * this.scale), Math.round(height * this.scale)]; this.S = [this.scale, 0, 0, 0, this.scale, 0, 0, 0, 1]; this.Sinv = inv3(this.S)!; this.centre = [width / 2, height / 2]; }
  /** `gray` is the frame at the working size (this.size). */
  update(gray: Uint8ClampedArray, boxes: Box[]): MotionState {
    const [w, h] = this.size, img = toImg(gray, w, h), pyr = pyramid(img, 3);
    if (!this.prev) { this.prev = pyr; this.state = { segment: 0, H: eye3(), inliers: 0, reliable: true }; return this.state; }
    const mask = new Uint8Array(w * h).fill(1); for (const [x1, y1, x2, y2] of boxes) { const a = Math.max(0, Math.trunc(x1 * this.scale) - 4), b = Math.max(0, Math.trunc(y1 * this.scale) - 4), c = Math.min(w - 1, Math.trunc(x2 * this.scale) + 4), d = Math.min(h - 1, Math.trunc(y2 * this.scale) + 4); for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) mask[y * w + x] = 0; }
    const pts = goodFeatures(this.prev[0], 400, 0.01, 8, mask); let ok = false, Hrel = eye3(), nIn = 0;
    if (pts.length >= 20) {
      const r = lkTrack(this.prev, pyr, pts), a: [number, number][] = [], b: [number, number][] = []; r.ok.forEach((g, i) => { if (g) { a.push(pts[i]); b.push(r.pts[i]); } });
      if (a.length >= 15) { const fit = ransacHomography(b, a, 2); if (fit) { nIn = fit.inliers.filter(Boolean).length; const d = Math.abs(fit.H[0] * fit.H[4] - fit.H[1] * fit.H[3]); ok = nIn >= MIN_INLIERS && nIn / a.length >= MIN_RATIO && fit.H.every(Number.isFinite) && d > 0.5 && d < 2 && Math.abs(det3(fit.H)) > 1e-9; Hrel = fit.H; } }
    }
    this.prev = pyr;
    if (!ok) { this.state = { segment: this.state.segment + 1, H: eye3(), inliers: nIn, reliable: false }; return this.state; }
    const corners: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]]; let moved = 0; for (const [x, y] of corners) { const [u, v] = apply3(Hrel, x, y); moved = Math.max(moved, Math.abs(u - x), Math.abs(v - y)); } if (moved < 0.35) Hrel = eye3();
    const Hfull = mul3(mul3(this.Sinv, Hrel), this.S); this.state = { segment: this.state.segment, H: mul3(this.state.H, Hfull), inliers: nIn, reliable: true }; this.maxShift = Math.max(this.maxShift, moved);
    const c = apply3(this.state.H, this.centre[0], this.centre[1]); this.maxCentreShift = Math.max(this.maxCentreShift, Math.hypot(c[0] - this.centre[0], c[1] - this.centre[1])); return this.state;
  }
}
export function warpBox(H: M3, b: Box): Box { const [x1, y1, x2, y2] = b, p = [apply3(H, x1, y1), apply3(H, x2, y1), apply3(H, x2, y2), apply3(H, x1, y2)]; return [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]; }
