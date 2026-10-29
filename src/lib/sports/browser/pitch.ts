/** Standard football pitch model and the image→pitch homography from user-identified landmarks (port of pitch.py). Metres; origin at the top-left corner of the diagram. Landmark positions follow the IFAB Laws of the Game. */
import { convexHull } from "@/lib/roof/browser/cv";
import { apply3, det3, homography, ransacHomography, type M3 } from "./cvlite";
const PEN_D = 16.5, PEN_W = 40.32, GOAL_D = 5.5, GOAL_W = 18.32, SPOT = 11, R = 9.15, GOAL = 7.32;
export interface Landmark { id: string; x: number; y: number; label: string }
export function landmarks(length = 105, width = 68): Record<string, Landmark> {
  const L = length, W = width, cy = W / 2, out: Record<string, Landmark> = {}, add = (id: string, x: number, y: number, label: string) => { out[id] = { id, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, label }; };
  add("corner_tl", 0, 0, "Corner, top-left"); add("corner_bl", 0, W, "Corner, bottom-left"); add("corner_tr", L, 0, "Corner, top-right"); add("corner_br", L, W, "Corner, bottom-right"); add("half_top", L / 2, 0, "Halfway line meets top touchline"); add("half_bottom", L / 2, W, "Halfway line meets bottom touchline");
  add("centre_spot", L / 2, cy, "Centre spot"); add("circle_top", L / 2, cy - R, "Centre circle, top of the circle on the halfway line"); add("circle_bottom", L / 2, cy + R, "Centre circle, bottom of the circle on the halfway line"); add("circle_left", L / 2 - R, cy, "Centre circle, leftmost point"); add("circle_right", L / 2 + R, cy, "Centre circle, rightmost point");
  for (const [s, x0, sg] of [["l", 0, 1], ["r", L, -1]] as const) {
    const side = s === "l" ? "Left" : "Right";
    add(`pen_${s}_top_goalline`, x0, cy - PEN_W / 2, `${side} penalty area, top corner on goal line`); add(`pen_${s}_bottom_goalline`, x0, cy + PEN_W / 2, `${side} penalty area, bottom corner on goal line`); add(`pen_${s}_top`, x0 + sg * PEN_D, cy - PEN_W / 2, `${side} penalty area, top front corner`); add(`pen_${s}_bottom`, x0 + sg * PEN_D, cy + PEN_W / 2, `${side} penalty area, bottom front corner`);
    add(`goalarea_${s}_top_goalline`, x0, cy - GOAL_W / 2, `${side} goal area, top corner on goal line`); add(`goalarea_${s}_bottom_goalline`, x0, cy + GOAL_W / 2, `${side} goal area, bottom corner on goal line`); add(`goalarea_${s}_top`, x0 + sg * GOAL_D, cy - GOAL_W / 2, `${side} goal area, top front corner`); add(`goalarea_${s}_bottom`, x0 + sg * GOAL_D, cy + GOAL_W / 2, `${side} goal area, bottom front corner`);
    add(`spot_${s}`, x0 + sg * SPOT, cy, `${side} penalty mark`); add(`post_${s}_top`, x0, cy - GOAL / 2, `${side} goal, top post base`); add(`post_${s}_bottom`, x0, cy + GOAL / 2, `${side} goal, bottom post base`);
    const dx = PEN_D - SPOT, dy = Math.sqrt(Math.max(R * R - dx * dx, 0)); add(`arc_${s}_top`, x0 + sg * PEN_D, cy - dy, `${side} penalty arc meets penalty area line (top)`); add(`arc_${s}_bottom`, x0 + sg * PEN_D, cy + dy, `${side} penalty arc meets penalty area line (bottom)`);
  }
  return out;
}
export interface CalibrationInfo { points_used: number; rms_error_m: number; max_error_m: number; per_point_error_m: number[]; inliers: boolean[]; quality: "good" | "approximate" | "poor"; warnings: string[]; pitch_m: [number, number] }
export interface Calibration { H: M3; length: number; width: number; residual: number; maxResidual: number; n: number; inliers: boolean[]; perPoint: number[]; warnings: string[]; quality: "good" | "approximate" | "poor"; toJson(): CalibrationInfo }
export class CalibrationError extends Error {}
export function fitHomography(pairs: [number, number, number, number][], length: number, width: number): Calibration {
  if (pairs.length < 4) throw new CalibrationError("At least 4 landmarks are needed to calibrate the pitch.");
  const img = pairs.map((p) => [p[0], p[1]] as [number, number]), pit = pairs.map((p) => [p[2], p[3]] as [number, number]);
  if (pairs.some((p) => p.some((v) => !Number.isFinite(v)))) throw new CalibrationError("Landmark coordinates must be finite numbers.");
  if (new Set(pit.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`)).size < pit.length) throw new CalibrationError("Each pitch landmark can be used only once.");
  for (const [name, pts] of [["pitch", pit], ["image", img]] as const) { const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n; let a = 0, b = 0, c = 0; for (const p of pts) { a += (p[0] - mx) ** 2; b += (p[0] - mx) * (p[1] - my); c += (p[1] - my) ** 2; } const tr = a + c, d = Math.sqrt(Math.max(0, (a - c) ** 2 + 4 * b * b)), s1 = Math.sqrt((tr + d) / 2), s2 = Math.sqrt(Math.max(0, (tr - d) / 2)); if (s2 < 0.02 * Math.max(s1, 1e-9)) throw new CalibrationError(`The ${name} points lie almost on a straight line. Choose landmarks that are spread across the pitch, not along one line.`); }
  const warns: string[] = []; let H: M3 | null, inl: boolean[];
  if (pairs.length === 4) { H = homography(img, pit); inl = [true, true, true, true]; }
  else { const r = ransacHomography(img, pit, 1.5); if (!r) throw new CalibrationError("No consistent mapping could be found from these landmarks. Check that each image point is paired with the right pitch landmark."); inl = r.inliers; if (inl.filter(Boolean).length < 4) throw new CalibrationError("Fewer than 4 landmarks agree with each other. Check the pairings."); const ids = inl.map((b, i) => (b ? i : -1)).filter((i) => i >= 0); H = homography(ids.map((i) => img[i]), ids.map((i) => pit[i])); }
  if (!H || !H.every(Number.isFinite) || Math.abs(H[0] * H[4] - H[1] * H[3]) < 1e-12 || Math.abs(det3(H)) < 1e-14) throw new CalibrationError("The landmarks give a degenerate mapping. Choose landmarks that are not clustered together.");
  const err = img.map((p, i) => { const [x, y] = apply3(H!, p[0], p[1]); return Math.hypot(x - pit[i][0], y - pit[i][1]); }), used = err.filter((_, i) => inl[i]), rms = Math.sqrt(used.reduce((s, e) => s + e * e, 0) / used.length), nIn = inl.filter(Boolean).length;
  if (nIn < inl.length) warns.push(`${inl.length - nIn} landmark(s) disagreed with the others and were ignored.`); if (nIn === 4) warns.push("Exactly 4 consistent landmarks fit any 4 points perfectly, so the error shown does not measure accuracy. Use 6 or more landmarks to see a real error estimate.");
  const hull = convexHull(pit), cover = hull.length >= 3 ? Math.abs(hull.reduce((s, p, i) => { const q = hull[(i + 1) % hull.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 / (length * width) : 0; if (cover < 0.08) warns.push("The landmarks cover only a small part of the pitch; positions far from them are extrapolated and may be inaccurate.");
  const quality = rms <= 1 && nIn >= 6 && cover >= 0.12 ? "good" : rms <= 2.5 ? "approximate" : "poor"; if (quality === "poor") warns.push("The landmarks fit with a large error: the pitch mapping is poor.");
  const r3 = (v: number) => Math.round(v * 1000) / 1000, maxR = Math.max(...used);
  return { H, length, width, residual: rms, maxResidual: maxR, n: pairs.length, inliers: inl, perPoint: err, warnings: warns, quality, toJson() { return { points_used: pairs.length, rms_error_m: r3(rms), max_error_m: r3(maxR), per_point_error_m: err.map(r3), inliers: inl, quality, warnings: warns, pitch_m: [length, width] }; } };
}
export function zoneOf(x: number, y: number, length: number, width: number): number | null { if (!(x >= 0 && x <= length && y >= 0 && y <= width)) return null; return Math.min(2, Math.floor((3 * y) / width)) * 3 + Math.min(2, Math.floor((3 * x) / length)); }
