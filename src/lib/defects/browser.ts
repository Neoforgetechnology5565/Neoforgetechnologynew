"use client";
/** In-browser replacement for services/defect-inspector: PatchCore-style anomaly detection (frozen ImageNet ResNet-50 up to layer 3 on ONNX Runtime Web, coreset memory of good parts,
 *  nearest-neighbour patch distance), the same quality rules, regions, human review and reports. Built-in references are the same banks as the server's (VisA, CC BY 4.0). */
import { err as mlErr, ctx2, decodeImage, mk, run, inputName, type Cvs } from "@/lib/ml/browser/core";
import { buildPdf } from "@/lib/vi/browser/pdf";
import { InspectApiError } from "./api";
import type { Decision, Health, Inspection, ModelOutput, Recommendation, ReferenceInfo, Region, Rules, SampleImage, Summary } from "./types";

const fail = (status: number, msg: string): never => { throw new InspectApiError(status, msg); };
const MODEL = "/defects/models/resnet50_l23.onnx", SIZE = 384, G = SIZE / 8, DIM = 512, BUDGET = 2000, MAX_REGIONS = 25;
const MEAN = [103.939, 116.779, 123.68]; // B, G, R (Keras ResNet50 "caffe" preprocessing)
const METHOD = "PatchCore-style anomaly detection (frozen ImageNet ResNet-50 features, coreset memory of good parts, nearest-neighbour patch distance); runs in your browser.";
const LIMITS = ["The model finds where a part looks unusual compared with good examples of the same kind of part. It does not name defect types (scratch, dent, crack…) and cannot find defects that look like normal variation.", "A reference works for one kind of part, photographed the same way. A different part, lighting or camera angle produces high scores that are not defects.", "The anomaly score is a distance, not a probability. The flag threshold is estimated from a limited number of good images; it will flag some good parts and miss some defects (see the evaluation figures per reference).", "Recommendations follow the configured rules and are not certified quality assurance. A person decides."];

/* ───────── features ───────── */
function boxFilter(a: Float32Array, h: number, w: number, c: number): Float32Array { // 3x3 mean per channel, edge replicate (scipy uniform_filter mode="nearest")
  const t = new Float32Array(a.length), o = new Float32Array(a.length), cl = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const b = (y * w + x) * c, l = (y * w + cl(x - 1, w)) * c, r = (y * w + cl(x + 1, w)) * c; for (let k = 0; k < c; k++) t[b + k] = (a[l + k] + a[b + k] + a[r + k]) / 3; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const b = (y * w + x) * c, u = (cl(y - 1, h) * w + x) * c, d = (cl(y + 1, h) * w + x) * c; for (let k = 0; k < c; k++) o[b + k] = (t[u + k] + t[b + k] + t[d + k]) / 3; }
  return o;
}
export async function features(img: Cvs): Promise<Float32Array> { // (G*G, 512)
  const s = mk(SIZE, SIZE), g = ctx2(s); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, SIZE, SIZE); const d = g.getImageData(0, 0, SIZE, SIZE).data, x = new Float32Array(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) { x[i * 3] = d[i * 4 + 2] - MEAN[0]; x[i * 3 + 1] = d[i * 4 + 1] - MEAN[1]; x[i * 3 + 2] = d[i * 4] - MEAN[2]; }
  const { out, s: sess } = await run(MODEL, { [await inputName(MODEL)]: { data: x, dims: [1, SIZE, SIZE, 3] } }), l2r = out[sess.outputNames[0]].data as Float32Array, l3r = out[sess.outputNames[1]].data as Float32Array;
  const l2 = boxFilter(l2r, G, G, 512), l3 = boxFilter(l3r, G / 2, G / 2, 1024), f = new Float32Array(G * G * DIM), h3 = G / 2;
  for (let y = 0; y < G; y++) for (let xx = 0; xx < G; xx++) {
    const o = (y * G + xx) * DIM, p = (y * G + xx) * 512; for (let k = 0; k < 256; k++) f[o + k] = (l2[p + 2 * k] + l2[p + 2 * k + 1]) / 2;
    const sy = Math.min(h3 - 1, Math.max(0, (y + 0.5) / 2 - 0.5)), sx = Math.min(h3 - 1, Math.max(0, (xx + 0.5) / 2 - 0.5)), y0 = Math.floor(sy), x0 = Math.floor(sx), y1 = Math.min(h3 - 1, y0 + 1), x1 = Math.min(h3 - 1, x0 + 1), wy = sy - y0, wx = sx - x0;
    for (let k = 0; k < 256; k++) { const at = (yy: number, x2: number) => { const q = (yy * h3 + x2) * 1024 + 4 * k; return (l3[q] + l3[q + 1] + l3[q + 2] + l3[q + 3]) / 4; }; f[o + 256 + k] = (at(y0, x0) * (1 - wx) + at(y0, x1) * wx) * (1 - wy) + (at(y1, x0) * (1 - wx) + at(y1, x1) * wx) * wy; }
  }
  return f;
}
function nnDistance(f: Float32Array, bank: Float32Array, rows: number): Float32Array {
  const n = f.length / DIM, bn = new Float32Array(rows), out = new Float32Array(n);
  for (let j = 0; j < rows; j++) { let s = 0; for (let k = 0; k < DIM; k++) s += bank[j * DIM + k] ** 2; bn[j] = s; }
  for (let i = 0; i < n; i++) {
    const o = i * DIM; let qn = 0; for (let k = 0; k < DIM; k++) qn += f[o + k] ** 2; let best = Infinity;
    for (let j = 0; j < rows; j++) { const b = j * DIM; let d0 = 0, d1 = 0, d2 = 0, d3 = 0; for (let k = 0; k < DIM; k += 4) { d0 += f[o + k] * bank[b + k]; d1 += f[o + k + 1] * bank[b + k + 1]; d2 += f[o + k + 2] * bank[b + k + 2]; d3 += f[o + k + 3] * bank[b + k + 3]; } const d = qn + bn[j] - 2 * (d0 + d1 + d2 + d3); if (d < best) best = d; }
    out[i] = Math.sqrt(Math.max(best, 0));
  }
  return out;
}
function gaussian(m: Float32Array, n: number, sigma = 4): Float32Array { // scipy gaussian_filter, truncate 4, mode reflect
  const r = Math.ceil(4 * sigma), k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma))), s = k.reduce((a, b) => a + b, 0), kk = k.map((v) => v / s), refl = (i: number) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return i; };
  const t = new Float32Array(n * n), o = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let a = 0; for (let i = -r; i <= r; i++) a += kk[i + r] * m[y * n + refl(x + i)]; t[y * n + x] = a; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let a = 0; for (let i = -r; i <= r; i++) a += kk[i + r] * t[refl(y + i) * n + x]; o[y * n + x] = a; }
  return o;
}
function resizeMap(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array { // bilinear, half-pixel centres (cv2.INTER_LINEAR)
  const o = new Float32Array(dw * dh); for (let y = 0; y < dh; y++) { const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / dh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < dw; x++) { const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / dw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), wx = fx - x0; o[y * dw + x] = (src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx) * (1 - wy) + (src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx) * wy; } }
  return o;
}
const anomalyMap = (dist: Float32Array) => gaussian(resizeMap(dist, G, G, SIZE, SIZE), SIZE);

/* ───────── rules ───────── */
export class RuleError extends Error {}
export function parseRules(d: unknown): Rules {
  const r: Rules = { max_defects: 0, min_score_ratio: 1, review_band: 0.85, min_region_area_pct: 0.01, major_area_pct: null, fail_on_major_only: false, min_reference_images: 30, wrong_part_ratio: 3 };
  if (d === null || d === undefined) return r; if (typeof d !== "object" || Array.isArray(d)) throw new RuleError("rules must be a JSON object.");
  const spec: Record<string, [boolean, number, number]> = { max_defects: [true, 0, 100], min_score_ratio: [false, 0.3, 5], review_band: [false, 0.3, 5], min_region_area_pct: [false, 0, 50], major_area_pct: [false, 0, 100], min_reference_images: [true, 1, 1000], wrong_part_ratio: [false, 1, 50] };
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (k === "fail_on_major_only") r.fail_on_major_only = Boolean(v); else if (k in spec) { if (v === null && k === "major_area_pct") { r.major_area_pct = null; continue; } const x = Number(v); if (v === "" || v === null || !Number.isFinite(x)) throw new RuleError(`${k} must be a number.`); const [int, lo, hi] = spec[k]; if (x < lo || x > hi) throw new RuleError(`${k} must be between ${lo} and ${hi}.`); (r as unknown as Record<string, number>)[k] = int ? Math.trunc(x) : x; }
    else throw new RuleError(`Unknown rule '${k.slice(0, 40)}'.`);
  }
  if (r.review_band > r.min_score_ratio) throw new RuleError("review_band must not exceed min_score_ratio.");
  return r;
}
const severity = (a: number, r: Rules) => (r.major_area_pct === null ? "not configured" : a >= r.major_area_pct ? "major" : "minor");
function decide(regions: Region[], ratio: number, r: Rules, ref: { images: number }, checks: { level: string; text: string }[]) {
  const trace: string[] = [], flagged = regions.filter((x) => x.status === "flagged"), counted = flagged.filter((x) => r.major_area_pct === null || !r.fail_on_major_only || x.severity === "major"), border = regions.filter((x) => x.status === "borderline");
  trace.push(`image score ratio ${ratio.toFixed(2)} (1.00 = reference flag threshold)`); trace.push(`${flagged.length} flagged region(s) (score ratio >= ${r.min_score_ratio}); ${counted.length} counted towards the limit of ${r.max_defects}; ${border.length} borderline`);
  const out = (recommendation: Decision, reasons: string[], rule: string) => ({ recommendation, reasons, trace: [...trace, rule] }), bad = checks.filter((c) => c.level === "review");
  if (ratio >= r.wrong_part_ratio) return out("MANUAL_REVIEW", [`The image score is ${ratio.toFixed(1)}x the reference threshold: this may be a different part, a wrong reference, or a very different image setup rather than a defect.`], "rule: score >= wrong_part_ratio -> MANUAL REVIEW");
  if (counted.length > r.max_defects) return out("FAIL", [`${counted.length} flagged region(s) exceed the allowed ${r.max_defects}.`], "rule: flagged regions > max_defects -> FAIL");
  if (bad.length) return out("MANUAL_REVIEW", bad.map((c) => c.text), "rule: image conditions differ from the reference -> MANUAL REVIEW");
  if (flagged.length && r.fail_on_major_only) return out("MANUAL_REVIEW", [`${flagged.length} flagged region(s) are below the configured 'major' size; they are within the limit but need a human look.`], "rule: minor flagged regions with fail_on_major_only -> MANUAL REVIEW");
  if (flagged.length) return out("MANUAL_REVIEW", [`${flagged.length} flagged region(s) are within the allowed ${r.max_defects}; a person should confirm.`], "rule: flagged but within max_defects -> MANUAL REVIEW");
  if (border.length || ratio >= r.review_band) return out("MANUAL_REVIEW", [`The part is close to the flag threshold (score ratio ${ratio.toFixed(2)}, review band starts at ${r.review_band}).`], "rule: within review band -> MANUAL REVIEW");
  if (ref.images < r.min_reference_images) return out("MANUAL_REVIEW", [`The reference was built from only ${ref.images} good image(s) (rule: at least ${r.min_reference_images}); a clean score cannot be trusted enough to auto-PASS.`], "rule: reference too small for auto-PASS -> MANUAL REVIEW");
  return out("PASS", ["No region reached the flag threshold and the score is below the review band."], "rule: no flagged or borderline regions -> PASS");
}

/* ───────── regions and rendering ───────── */
function regionsFrom(full: Float32Array, w: number, h: number, tau: number, r: Rules): Region[] {
  const thr = r.review_band * tau, lab = new Int32Array(w * h), regs: Region[] = [], stack: number[] = []; let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (full[s] < thr || lab[s]) continue; n++; stack.length = 0; stack.push(s); lab[s] = n; let area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, peak = 0, sum = 0; const rowMin = new Map<number, number>(), rowMax = new Map<number, number>();
    while (stack.length) { const p = stack.pop()!, x = p % w, y = (p / w) | 0, v = full[p]; area++; sx += x; sy += y; sum += v; if (v > peak) peak = v; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < (rowMin.get(y) ?? Infinity)) rowMin.set(y, x); if (x > (rowMax.get(y) ?? -Infinity)) rowMax.set(y, x);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && xx < w && yy >= 0 && yy < h) { const q = yy * w + xx; if (!lab[q] && full[q] >= thr) { lab[q] = n; stack.push(q); } } } }
    const pct = (100 * area) / (w * h); if (pct < r.min_region_area_pct) continue; const ratio = peak / tau, status = ratio >= r.min_score_ratio ? "flagged" : "borderline";
    const pts: [number, number][] = []; for (const [y, a] of rowMin) { pts.push([a, y]); pts.push([rowMax.get(y)!, y]); } const hull = convexHull(pts), step = Math.max(1, Math.ceil(hull.length / 60));
    regs.push({ id: 0, bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], centroid: [Math.round((sx / area) * 10) / 10, Math.round((sy / area) * 10) / 10], area_px: area, area_pct: Math.round(pct * 1000) / 1000, peak_score: Math.round(peak * 1000) / 1000, score_ratio: Math.round(ratio * 1000) / 1000, mean_score_ratio: Math.round((sum / area / tau) * 1000) / 1000, status, severity: status === "flagged" ? severity(pct, r) : "n/a", polygon: hull.filter((_, i) => i % step === 0), category: "unusual region (unclassified)", category_note: "This model detects where the part differs from good examples; it does not name defect types." });
  }
  regs.sort((a, b) => b.score_ratio - a.score_ratio); regs.length = Math.min(regs.length, MAX_REGIONS); regs.forEach((x, i) => { x.id = i + 1; }); return regs;
}
function convexHull(p: [number, number][]): [number, number][] {
  const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (s.length < 3) return s; const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of [...s].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
const turbo = (t: number): [number, number, number] => { const c = (a: number[]) => Math.max(0, Math.min(255, Math.round(255 * (a[0] + t * (a[1] + t * (a[2] + t * (a[3] + t * (a[4] + t * a[5])))))))); return [c([0.13572138, 4.6153926, -42.66032258, 132.13108234, -152.94239396, 59.28637943]), c([0.09140261, 2.19418839, 4.84296658, -14.18503333, 4.27729857, 2.82956604]), c([0.1066733, 12.64194608, -60.58204836, 110.36276771, -89.90310912, 27.34824973])]; };
function renderHeat(full: Float32Array, w: number, h: number, tau: number): Cvs {
  const c = mk(w, h), g = ctx2(c), im = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const r = Math.max(0, Math.min(1, full[i] / tau - 0.6)), [R, Gc, B] = turbo(r); im.data.set([R, Gc, B, r <= 0.02 ? 0 : Math.round(Math.min(1, r * 1.6) * 200)], i * 4); } g.putImageData(im, 0, 0); return c;
}
function renderAnnotated(orig: Cvs, heat: Cvs, regions: Region[]): Cvs {
  const c = mk(orig.width, orig.height), g = ctx2(c); g.drawImage(orig, 0, 0); g.globalAlpha = 0.65; g.drawImage(heat, 0, 0); g.globalAlpha = 1; const th = Math.max(2, Math.round(Math.max(c.width, c.height) / 400)), fs = Math.max(12, Math.round(Math.max(c.width, c.height) / 55)); g.lineWidth = th; g.font = `bold ${fs}px sans-serif`;
  for (const r of regions) { const [x, y, w, h] = r.bbox, col = r.status === "flagged" ? "#ef4444" : "#f59e0b", t = `#${r.id} ${r.score_ratio.toFixed(2)}x`, tw = g.measureText(t).width + 8; g.strokeStyle = col; g.strokeRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, Math.max(0, y - fs - 4), tw, fs + 4); g.fillStyle = "#fff"; g.fillText(t, x + 4, Math.max(fs, y - 4)); }
  return c;
}
function conditionChecks(img: Cvs, st: { aspect?: number; brightness?: number; sharpness?: number }) {
  const out: { level: string; code: string; text: string }[] = [], w = img.width, h = img.height;
  if (st.aspect && Math.abs(Math.log(w / h / st.aspect)) > 0.25) out.push({ level: "review", code: "aspect", text: `The image proportions (${(w / h).toFixed(2)}) differ from the reference images (${st.aspect.toFixed(2)}); it may be cropped or a different part.` });
  const sm = mk(512, Math.round((512 * h) / w)), g = ctx2(sm); g.drawImage(img, 0, 0, sm.width, sm.height); const d = g.getImageData(0, 0, sm.width, sm.height).data, gray = new Float32Array(sm.width * sm.height); let mean = 0; for (let i = 0; i < gray.length; i++) { gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; mean += gray[i]; } mean /= gray.length;
  if (st.brightness && Math.abs(mean - st.brightness) / Math.max(st.brightness, 1) > 0.4) out.push({ level: "review", code: "brightness", text: `The image brightness (${mean.toFixed(0)}) differs strongly from the reference images (${st.brightness.toFixed(0)}); lighting changes can look like defects.` });
  if (st.sharpness) { const W = sm.width, H = sm.height; let s = 0, s2 = 0, n = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const l = gray[(y - 1) * W + x] + gray[(y + 1) * W + x] + gray[y * W + x - 1] + gray[y * W + x + 1] - 4 * gray[y * W + x]; s += l; s2 += l * l; n++; } const v = s2 / n - (s / n) ** 2; if (v < 0.3 * st.sharpness) out.push({ level: "review", code: "sharpness", text: "The image is much blurrier than the reference images; small defects may be missed." }); }
  return out;
}
function evaluate(full: Float32Array, w: number, h: number, tau: number, rules: Rules, ref: { images: number }, checks: ReturnType<typeof conditionChecks>, score: number): { mo: ModelOutput; rec: Recommendation } {
  const ratio = score / tau, regions = regionsFrom(full, w, h, tau, rules), dec = decide(regions, ratio, rules, ref, checks);
  return { mo: { anomaly_score: Math.round(score * 1000) / 1000, reference_threshold: Math.round(tau * 1000) / 1000, score_ratio: Math.round(ratio * 1000) / 1000, score_meaning: "L2 distance in feature space to the nearest good-part patch (largest over the image). Not a probability. score_ratio 1.0 = the threshold estimated from good parts for this reference.", regions, image: { width: w, height: h }, condition_checks: checks },
    rec: { decision: dec.recommendation, reasons: dec.reasons, rule_trace: dec.trace, rules, disclaimer: "Automated recommendation from the configured rules; not certified quality assurance." } };
}

/* ───────── references ───────── */
interface Ref { info: ReferenceInfo & { tau: number; mu: number; sigma: number; stats: Record<string, number> }; bank: Float32Array | null; rows: number; promise?: Promise<void> }
const refs = new Map<string, Ref>(); let loaded: Promise<void> | null = null;
const f16 = (h: number) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * 2 ** -14 * (f / 1024) : s * 2 ** (e - 15) * (1 + f / 1024); };
const loadIndex = () => (loaded ??= fetch("/defects/refs/index.json").then((r) => r.json()).then((l: (Ref["info"] & { rows: number })[]) => { for (const i of l) refs.set(i.id, { info: i, bank: null, rows: i.rows }); }));
async function bankOf(r: Ref): Promise<Float32Array> { if (r.bank) return r.bank; const u = new Uint16Array(await (await fetch(`/defects/refs/${r.info.id}.f16`)).arrayBuffer()), b = new Float32Array(u.length); for (let i = 0; i < u.length; i++) b[i] = f16(u[i]); r.bank = b; return b; }
function greedyCoreset(x: Float32Array, n: number, count: number, seed = 0): number[] {
  if (count >= n) return Array.from({ length: n }, (_, i) => i); const pd = 64, rnd = mulberry(seed), P = new Float32Array(n * pd); for (let k = 0; k < DIM * pd; k++) void k;
  const proj = new Float32Array(DIM * pd); for (let i = 0; i < proj.length; i++) proj[i] = gauss(rnd) / Math.sqrt(pd); for (let i = 0; i < n; i++) for (let j = 0; j < pd; j++) { let s = 0; for (let k = 0; k < DIM; k++) s += x[i * DIM + k] * proj[k * pd + j]; P[i * pd + j] = s; }
  const d = new Float32Array(n).fill(Infinity), sel = [Math.floor(rnd() * n)]; for (let it = 1; it < count; it++) { const c = sel[sel.length - 1] * pd; let far = 0, fv = -1; for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < pd; j++) { const t = P[i * pd + j] - P[c + j]; s += t * t; } if (s < d[i]) d[i] = s; if (d[i] > fv) { fv = d[i]; far = i; } } sel.push(far); }
  return sel;
}
function mulberry(a: number) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
function bankFrom(feats: Float32Array[], budget: number): Float32Array { const per = G * G, n = feats.length * per, all = new Float32Array(n * DIM); feats.forEach((f, i) => all.set(f, i * per * DIM)); const idx = greedyCoreset(all, n, Math.min(budget, n)), b = new Float32Array(idx.length * DIM); idx.forEach((s, i) => b.set(all.subarray(s * DIM, s * DIM + DIM), i * DIM)); return b; }
async function buildCustom(id: string, name: string, imgs: Cvs[]) {
  const r = refs.get(id)!, info = r.info; try {
    const feats: Float32Array[] = []; for (const im of imgs) { feats.push(await features(im)); await new Promise((x) => setTimeout(x, 0)); } const n = feats.length, k = Math.min(5, n), held = new Float64Array(n);
    for (let f = 0; f < k; f++) { const test = Array.from({ length: n }, (_, i) => i).filter((i) => i % k === f), train = feats.filter((_, i) => i % k !== f), bank = bankFrom(train, Math.min(BUDGET, Math.floor((800 * train.length) / 4)) ); for (const i of test) { const m = anomalyMap(nnDistance(feats[i], bank, bank.length / DIM)); held[i] = Math.max(...m); await new Promise((x) => setTimeout(x, 0)); } }
    const mu = held.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(held.reduce((a, b) => a + (b - mu) ** 2, 0) / n), tau = mu + 3 * sd, bank = bankFrom(feats, BUDGET);
    const gs = imgs.map((c) => { const s = mk(512, Math.round((512 * c.height) / c.width)), g = ctx2(s); g.drawImage(c, 0, 0, s.width, s.height); const d = g.getImageData(0, 0, s.width, s.height).data, gray = new Float32Array(s.width * s.height); let m = 0; for (let i = 0; i < gray.length; i++) { gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; m += gray[i]; } let s1 = 0, s2 = 0, c2 = 0; for (let y = 1; y < s.height - 1; y++) for (let x = 1; x < s.width - 1; x++) { const l = gray[(y - 1) * s.width + x] + gray[(y + 1) * s.width + x] + gray[y * s.width + x - 1] + gray[y * s.width + x + 1] - 4 * gray[y * s.width + x]; s1 += l; s2 += l * l; c2++; } return { aspect: c.width / c.height, brightness: m / gray.length, sharpness: s2 / c2 - (s1 / c2) ** 2 }; });
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
    Object.assign(info, { tau, mu, sigma: sd, threshold: Math.round(tau * 1000) / 1000, validated: n >= 30, status: "ready", stats: { aspect: med(gs.map((g) => g.aspect)), brightness: med(gs.map((g) => g.brightness)), sharpness: med(gs.map((g) => g.sharpness)) },
      notes: [`Threshold estimated from ${k}-fold held-out good images (${n} images in total).`, ...(n < 30 ? [`Only ${n} good images: the threshold is a rough estimate. Use 30 or more, covering normal variation (position, lighting, small marks).`] : [])] }); r.bank = bank; r.rows = bank.length / DIM;
  } catch { info.status = "failed"; info.error = "The reference could not be built in this browser."; }
  void name;
}

/* ───────── inspections ───────── */
interface Rec { meta: Inspection; orig: Cvs; heat: Cvs; map: Float32Array; urls: Record<string, string>; dsMask: string | null }
const store = new Map<string, Rec>();
const url = (c: Cvs, mime = "image/jpeg", q = 0.9) => c.toDataURL(mime, q);
const thumbOf = (c: Cvs) => { const s = 256 / Math.max(c.width, c.height), t = mk(c.width * s, c.height * s); ctx2(t).drawImage(c, 0, 0, t.width, t.height); return url(t, "image/jpeg", 0.8); };
type SampleManifest = { samples: (SampleImage & { dataset_file?: string; file?: string })[]; licence: string };
let manifest: SampleManifest | null = null;
const samples = async () => (manifest ??= (await (await fetch("/defects/samples/manifest.json")).json()) as SampleManifest);
function reportPdf(m: Inspection): string {
  const mo = m.model_output, rec = m.recommendation, rv = m.review.current, t = (n: number) => new Date(n * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const secs = [{ heading: "1. Model output", text: `Anomaly score ${mo.anomaly_score} against a reference threshold of ${mo.reference_threshold} (score ratio ${mo.score_ratio}; 1.00 = threshold). ${mo.score_meaning}`, rows: mo.regions.length ? [["#", "Status", "Score ratio", "Area %", "Box x,y,w,h", "Severity"], ...mo.regions.map((r) => [String(r.id), r.status, r.score_ratio.toFixed(2), r.area_pct.toFixed(3), r.bbox.join(","), r.severity])] : undefined, lines: mo.regions.length ? ["Regions are unclassified: the model shows where the part differs from good examples, not what kind of defect it is."] : ["No unusual region reached the review band."] },
    { heading: "2. Automated recommendation", text: `${rec.decision.replace("_", " ")}: ${rec.reasons.join(" ")}`, lines: [`Rules: ${Object.entries(rec.rules).map(([k, v]) => `${k} = ${v}`).join(", ")}`, rec.disclaimer] },
    { heading: "3. Human reviewer decision", text: rv ? `${rv.decision.replace("_", " ")} by ${rv.reviewer || "reviewer"} (${rv.agrees_with_recommendation ? "agrees with" : "overrides"} the recommendation) at ${t(rv.at)}. Notes: ${rv.notes || "-"}` : "Not reviewed yet. The automated recommendation above has not been confirmed by a person." },
    { heading: "Method", text: "PatchCore-style anomaly detection with a frozen ImageNet ResNet-50 against a memory of good parts. It cannot name defect types and can flag harmless variation. This report is not a certified quality-assurance document." }];
  return URL.createObjectURL(buildPdf("Visual inspection report", `Inspection ${m.id.slice(0, 8)} · ${t(m.created_at)} · file: ${m.filename} · reference: ${m.reference.name} (${m.reference.kind})`, secs, ""));
}
const refreshUrls = (r: Rec) => { for (const k of ["pdf", "json"]) if (r.urls[k]) URL.revokeObjectURL(r.urls[k]); r.urls.pdf = reportPdf(r.meta); r.urls.json = URL.createObjectURL(new Blob([JSON.stringify(r.meta, null, 1)], { type: "application/json" })); };
const need = (id: string) => store.get(id) ?? fail(404, "Inspection not found or expired.");

export const browserInspect = () => ({
  browser: true as const,
  url: (p: string) => p.replace(/^\/api\/sample-images\/([^/]+)\/image$/, (_m, id) => `/defects/samples/${manifest?.samples.find((s) => s.id === id)?.file ?? id + ".jpg"}`),
  health: async (): Promise<Health> => { await loadIndex(); return { ok: true, backbone: "ResNet-50 layers 2+3 (ImageNet), ONNX Runtime Web (in your browser)", method: METHOD, references: refs.size, builtin_references: [...refs.values()].filter((r) => r.info.kind === "builtin").length, limits: { max_image_mb: 15, min_reference_images: 10, max_reference_images: 60, inspection_ttl_seconds: 86400 }, limitations: LIMITS }; },
  references: async () => { await loadIndex(); return { references: [...refs.values()].map((r) => pub(r)) }; },
  reference: async (id: string) => { await loadIndex(); const r = refs.get(id); return r ? pub(r) : fail(404, "Unknown reference."); },
  buildReference: async (name: string, files: File[]) => {
    await loadIndex(); if (files.length < 10) fail(400, `At least 10 good images are needed to build a reference (you sent ${files.length}).`); if (files.length > 60) fail(400, "At most 60 images can be used to build a reference.");
    const imgs: Cvs[] = []; for (const f of files) { try { imgs.push(await decodeImage(f)); } catch (e) { fail(422, (e as Error).message); } }
    const id = "c" + crypto.randomUUID().replace(/-/g, "").slice(0, 12), info = { id, name: (name || "Custom part").slice(0, 60), kind: "custom" as const, good_images: files.length, validated: false, status: "building" as const, error: null, input_size: SIZE, threshold: 0, evaluation: null, notes: [], tau: 0, mu: 0, sigma: 0, stats: {} };
    refs.set(id, { info, bank: null, rows: 0 }); void buildCustom(id, name, imgs); return pub(refs.get(id)!);
  },
  deleteReference: async (id: string) => { const r = refs.get(id); if (!r || r.info.kind !== "custom") fail(404, "Unknown or built-in reference."); refs.delete(id); return { deleted: true }; },
  samples: async () => { const m = await samples(); return { samples: m.samples.map((s) => ({ ...s, image_url: `/api/sample-images/${s.id}/image` })) }; },
  inspect: async (src: File | { sampleId: string }, referenceId: string, rules: Rules): Promise<Inspection> => {
    await loadIndex(); const ref = refs.get(referenceId); if (!ref) fail(404, "Unknown reference. Choose a part type first."); if (ref!.info.status !== "ready") fail(404, "The reference is not ready yet.");
    let rl: Rules; try { rl = parseRules(rules); } catch (e) { return fail(400, (e as Error).message); }
    let img: Cvs, filename: string, dataset: Inspection["dataset_annotation"] = null, dsMask: string | null = null;
    if (!(src instanceof File)) { const m = await samples(), it = m.samples.find((s) => s.id === src.sampleId); if (!it) fail(404, "Unknown sample."); img = await decodeImage(await (await fetch(`/defects/samples/${it!.file}`)).blob()); filename = it!.title; dataset = { label: it!.label, source: "VisA dataset annotation (not model output)", licence: "CC BY 4.0" };
      if (it!.mask) { const mk2 = await decodeImage(await (await fetch(`/defects/samples/${it!.mask}`)).blob()), sc = mk(img.width, img.height), g = ctx2(sc); g.imageSmoothingEnabled = false; g.drawImage(mk2, 0, 0, sc.width, sc.height); const d = g.getImageData(0, 0, sc.width, sc.height); for (let i = 0; i < sc.width * sc.height; i++) { const on = d.data[i * 4] > 127; d.data.set(on ? [56, 189, 248, 170] : [0, 0, 0, 0], i * 4); } g.putImageData(d, 0, 0); dsMask = url(sc, "image/png"); } }
    else { if (src.size > 15e6) fail(413, "The image is larger than the 15 MB limit."); try { img = await decodeImage(src, 36); } catch (e) { return fail(422, (e as Error).message); } filename = src.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 80) || "upload"; }
    const bank = await bankOf(ref!), t0 = performance.now(), dist = nnDistance(await features(img), bank, ref!.rows), m = anomalyMap(dist), score = Math.max(...m), full = resizeMap(m, SIZE, SIZE, img.width, img.height);
    const checks = conditionChecks(img, ref!.info.stats), { mo, rec } = evaluate(full, img.width, img.height, ref!.info.tau, rl, { images: ref!.info.good_images }, checks, score), heat = renderHeat(full, img.width, img.height, ref!.info.tau), ann = renderAnnotated(img, heat, mo.regions), id = crypto.randomUUID().replace(/-/g, "");
    const meta: Inspection = { id, created_at: Date.now() / 1000, filename, source: src instanceof File ? "upload" : "sample", reference: { id: ref!.info.id, name: ref!.info.name, kind: ref!.info.kind, good_images: ref!.info.good_images, validated: ref!.info.validated, threshold: ref!.info.threshold, evaluation: ref!.info.evaluation, notes: ref!.info.notes }, inference_ms: Math.round((performance.now() - t0) * 10) / 10, dataset_annotation: dataset, method: METHOD, limitations: LIMITS, model_output: mo, recommendation: rec, review: { history: [], current: null } };
    const rec2: Rec = { meta, orig: img, heat, map: m, urls: { original: url(img, "image/jpeg", 0.92), annotated: url(ann), heatmap: url(heat, "image/png"), thumb: thumbOf(img), ...(dsMask ? { dataset_annotation: dsMask } : {}) }, dsMask }; refreshUrls(rec2); store.set(id, rec2); while (store.size > 50) store.delete(store.keys().next().value!); return meta;
  },
  list: async () => ({ inspections: [...store.values()].reverse().map((r): Summary => ({ id: r.meta.id, created_at: r.meta.created_at, filename: r.meta.filename, source: r.meta.source, reference: r.meta.reference.name, score_ratio: r.meta.model_output.score_ratio, flagged_regions: r.meta.model_output.regions.filter((x) => x.status === "flagged").length, recommendation: r.meta.recommendation.decision, human_decision: r.meta.review.current?.decision ?? null, thumb_url: r.urls.thumb })) }),
  get: async (id: string) => need(id).meta,
  remove: async (id: string) => { need(id); store.delete(id); return { deleted: true }; },
  reevaluate: async (id: string, rules: Rules) => {
    const r = need(id); let rl: Rules; try { rl = parseRules(rules); } catch (e) { return fail(400, (e as Error).message); } const m = r.meta, full = resizeMap(r.map, SIZE, SIZE, r.orig.width, r.orig.height);
    const { mo, rec } = evaluate(full, r.orig.width, r.orig.height, m.reference.threshold, rl, { images: m.reference.good_images }, m.model_output.condition_checks, m.model_output.anomaly_score); m.model_output = mo; m.recommendation = rec; m.rules_revision = (m.rules_revision ?? 0) + 1;
    r.urls.annotated = url(renderAnnotated(r.orig, r.heat, mo.regions)); refreshUrls(r); return m;
  },
  review: async (id: string, b: { action: "confirm" | "override"; decision?: string; notes: string; reviewer: string; region_reviews: Record<string, string> }) => {
    const r = need(id), m = r.meta, rec = m.recommendation.decision; let decision: Decision;
    if (b.action === "confirm") { if (rec === "MANUAL_REVIEW") fail(400, "The recommendation is MANUAL REVIEW: choose PASS or FAIL explicitly."); decision = rec; } else if (b.action === "override") { if (!["PASS", "FAIL", "MANUAL_REVIEW"].includes(b.decision ?? "")) fail(400, "decision must be PASS, FAIL or MANUAL_REVIEW."); decision = b.decision as Decision; } else return fail(400, "action must be confirm or override.");
    const ids = new Set(m.model_output.regions.map((x) => String(x.id))), rr = b.region_reviews ?? {}; if (Object.entries(rr).some(([k, v]) => !ids.has(k) || !["confirmed", "dismissed", "pending"].includes(v))) fail(400, "region_reviews must map existing region ids to confirmed, dismissed or pending.");
    const e = { decision, action: b.action, notes: String(b.notes ?? "").slice(0, 2000), reviewer: String(b.reviewer ?? "").replace(/[^\w .@-]/g, "").slice(0, 60), at: Date.now() / 1000, agrees_with_recommendation: decision === rec, recommendation_at_review: rec, rules_revision: m.rules_revision ?? 0, region_reviews: rr as Inspection["review"]["history"][0]["region_reviews"] };
    m.review.history.push(e); m.review.current = e; refreshUrls(r); return m;
  },
  image: (id: string, kind: "original" | "annotated" | "heatmap" | "thumb" | "dataset_annotation") => store.get(id)?.urls[kind] ?? "",
  pdf: (id: string) => store.get(id)?.urls.pdf ?? "", reportJson: (id: string) => store.get(id)?.urls.json ?? "",
});
function pub(r: Ref): ReferenceInfo { const i = r.info; return { id: i.id, name: i.name, kind: i.kind, good_images: i.good_images, validated: i.validated, status: i.status, error: i.error, input_size: i.input_size, threshold: i.threshold, evaluation: i.evaluation, notes: i.notes }; }
void mlErr;
