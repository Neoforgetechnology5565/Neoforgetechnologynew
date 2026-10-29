"use client";
/** Classification, detection, segmentation and pose in the browser. Same pre- and post-processing as services/ml-lab/app/models.py. */
import { COCO, COLORS, ctx2, decodeImage, err, fileOf, INFO, inputName, LIMITS, mk, models, numOf, PALETTE, pixels, readUpload, run, sampleBlob, scaled, session, strOf, toUrl, VOC, cleanName, type Cvs } from "./core";

/* ───────── input ───────── */
export async function imageInput(f: FormData): Promise<{ img: Cvs; name: string }> {
  const file = fileOf(f, "file"), sid = strOf(f, "sample_id"); if ((file === null) === (sid === null)) err(400, "Send either an image file or a sample_id.");
  if (sid !== null) { const { blob, item } = await sampleBlob(sid, "image"); return { img: await decodeImage(blob), name: item.file }; }
  const u = await readUpload(file!, LIMITS.max_image_mb, ["jpg", "png", "webp", "tiff"], "a JPEG, PNG, WebP or TIFF image"); return { img: await decodeImage(u.blob), name: cleanName(file!.name) };
}

/* ───────── classification ───────── */
let names: string[] | null = null;
const classNames = async (): Promise<string[]> => {
  if (!names) { const j = (await (await fetch("/ml/models/imagenet_class_index.json")).json()) as Record<string, [string, string]>; names = Array.from({ length: 1000 }, (_, i) => j[String(i)][1].replace(/_/g, " ")); }
  return names;
};
function prep224(img: Cvs): Float32Array {
  const s = 256 / Math.min(img.width, img.height), w = Math.max(224, Math.round(img.width * s)), h = Math.max(224, Math.round(img.height * s)), r = scaled(img, w, h), x0 = (w - 224) >> 1, y0 = (h - 224) >> 1;
  const d = ctx2(r).getImageData(x0, y0, 224, 224).data, o = new Float32Array(224 * 224 * 3); for (let i = 0; i < 224 * 224; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = d[i * 4 + c] / 127.5 - 1; return o;
}
export async function embed(img: Cvs): Promise<Float32Array> {
  const { out, s } = await run(models.features, { [await inputName(models.features)]: { data: prep224(img), dims: [1, 224, 224, 3] } }), v = out[s.outputNames[0]].data as Float32Array; let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) + 1e-9; return v.map((x) => x / n);
}
export async function classify(f: FormData) {
  const k = numOf(f, "top_k", 5); if (k < 1 || k > 10) err(400, "top_k must be between 1 and 10.");
  const { img, name } = await imageInput(f), nm = await classNames(), t = performance.now();
  const { out, s } = await run(models.mobilenet, { [await inputName(models.mobilenet)]: { data: prep224(img), dims: [1, 224, 224, 3] } }), p = out[s.outputNames[0]].data as Float32Array;
  const top = Array.from(p.keys()).sort((a, b) => p[b] - p[a]).slice(0, k).map((i) => ({ label: nm[i], class_index: i, probability: p[i] }));
  return { filename: name, width: img.width, height: img.height, predictions: top, seconds: Math.round((performance.now() - t)) / 1000, model: INFO.classifier, note: "Probabilities are the model's softmax outputs over 1000 ImageNet classes. They are not calibrated, and an image of something outside those classes still gets labels." };
}

/* ───────── detection ───────── */
export interface Det { box: [number, number, number, number]; label: string; class_index: number; score: number }
const SIZE = 416;
const grid = (() => { const g: number[] = [], st: number[] = []; for (const s of [8, 16, 32]) { const n = SIZE / s; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.push(x, y); st.push(s); } } return { g: new Float32Array(g), st: new Float32Array(st) }; })();
function nmsIdx(b: number[][], s: number[], thr: number) { const order = s.map((_, i) => i).sort((x, y) => s[y] - s[x]), keep: number[] = []; while (order.length) { const i = order.shift()!; keep.push(i); const a = b[i], aa = (a[2] - a[0]) * (a[3] - a[1]); for (let k = order.length - 1; k >= 0; k--) { const q = b[order[k]], w = Math.max(0, Math.min(a[2], q[2]) - Math.max(a[0], q[0])), h = Math.max(0, Math.min(a[3], q[3]) - Math.max(a[1], q[1])), it = w * h; if (it / (aa + (q[2] - q[0]) * (q[3] - q[1]) - it + 1e-9) > thr) order.splice(k, 1); } } return keep; }
export async function detectCanvas(src: CanvasImageSource, w: number, h: number, thr = 0.3, onlyPerson = false, nms = 0.45): Promise<Det[]> {
  const r = Math.min(SIZE / h, SIZE / w), nw = Math.round(w * r), nh = Math.round(h * r), c = mk(SIZE, SIZE), g = ctx2(c); g.fillStyle = "rgb(114,114,114)"; g.fillRect(0, 0, SIZE, SIZE); g.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
  const px = g.getImageData(0, 0, SIZE, SIZE).data, plane = SIZE * SIZE, inp = new Float32Array(3 * plane); for (let i = 0; i < plane; i++) { inp[i] = px[i * 4 + 2]; inp[plane + i] = px[i * 4 + 1]; inp[2 * plane + i] = px[i * 4]; }
  const { out, s } = await run(models.yolox, { [await inputName(models.yolox)]: { data: inp, dims: [1, 3, SIZE, SIZE] } }), o = out[s.outputNames[0]].data as Float32Array, n = o.length / 85;
  const cand: { box: number[]; score: number; c: number }[] = [];
  for (let i = 0; i < n; i++) {
    const b = i * 85, obj = o[b + 4]; if (obj < thr) continue; let ci = 0, cs = o[b + 5]; if (!onlyPerson) for (let k = 1; k < 80; k++) if (o[b + 5 + k] > cs) { cs = o[b + 5 + k]; ci = k; } const sc = obj * cs; if (sc < thr) continue;
    const cx = (o[b] + grid.g[2 * i]) * grid.st[i], cy = (o[b + 1] + grid.g[2 * i + 1]) * grid.st[i], bw = Math.exp(o[b + 2]) * grid.st[i], bh = Math.exp(o[b + 3]) * grid.st[i];
    cand.push({ box: [Math.max(0, (cx - bw / 2) / r), Math.max(0, (cy - bh / 2) / r), Math.min(w, (cx + bw / 2) / r), Math.min(h, (cy + bh / 2) / r)], score: sc, c: ci });
  }
  const res: Det[] = []; for (let ci = 0; ci < 80; ci++) { const m = cand.filter((x) => x.c === ci); if (!m.length) continue; for (const k of nmsIdx(m.map((x) => x.box), m.map((x) => x.score), nms)) res.push({ box: m[k].box.map((v) => Math.round(v * 10) / 10) as Det["box"], label: COCO[ci], class_index: ci, score: m[k].score }); }
  return res.sort((a, b) => b.score - a.score);
}
export function drawDet(src: CanvasImageSource, w: number, h: number, dets: Det[]): Cvs {
  const c = mk(w, h), g = ctx2(c); g.drawImage(src, 0, 0, w, h); g.font = `bold ${Math.max(12, w / 60)}px Georgia`; g.lineWidth = Math.max(2, w / 400);
  for (const d of dets) { const col = COLORS[d.class_index % COLORS.length], [x1, y1, x2, y2] = d.box, t = `${d.label} ${d.score.toFixed(2)}`; g.strokeStyle = col; g.strokeRect(x1, y1, x2 - x1, y2 - y1); const tw = g.measureText(t).width + 6, th = Math.max(14, w / 55); g.fillStyle = col; g.fillRect(x1, Math.max(0, y1 - th - 2), tw, th + 2); g.fillStyle = "#000"; g.fillText(t, x1 + 3, Math.max(th - 2, y1 - 5)); }
  return c;
}
export async function detectImage(f: FormData) {
  const thr = numOf(f, "threshold", 0.35); if (thr < 0.05 || thr > 0.95) err(400, "threshold must be between 0.05 and 0.95.");
  const { img, name } = await imageInput(f), t = performance.now(), dets = await detectCanvas(img, img.width, img.height, thr), counts: Record<string, number> = {}; for (const d of dets) counts[d.label] = (counts[d.label] ?? 0) + 1;
  return { filename: name, width: img.width, height: img.height, detections: dets, counts, threshold: thr, seconds: Math.round(performance.now() - t) / 1000, model: INFO.detector, annotated: toUrl(drawDet(img, img.width, img.height, dets)), note: "COCO's 80 classes only. Objects outside them are not detected; small, blurred or partly hidden objects are often missed." };
}

/* ───────── segmentation ───────── */
export async function segment(f: FormData) {
  const opacity = numOf(f, "opacity", 0.5); if (opacity < 0 || opacity > 1) err(400, "opacity must be between 0 and 1.");
  const { img, name } = await imageInput(f), t = performance.now(), W = img.width, H = img.height, k = Math.min(1, 1400 / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k), work = k < 1 ? scaled(img, w, h) : img;
  const sm = scaled(img, 257, 257), d = ctx2(sm).getImageData(0, 0, 257, 257).data, inp = new Float32Array(257 * 257 * 3); for (let i = 0; i < 257 * 257; i++) for (let c = 0; c < 3; c++) inp[i * 3 + c] = (d[i * 4 + c] - 127.5) / 127.5;
  const { out, s } = await run(models.deeplab, { [await inputName(models.deeplab)]: { data: inp, dims: [1, 257, 257, 3] } }), lg = out[s.outputNames[0]].data as Float32Array, C = 21, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const fy = Math.min(256, Math.max(0, ((y + 0.5) * 257) / h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(256, y0 + 1), wy = fy - y0;
    for (let x = 0; x < w; x++) { const fx = Math.min(256, Math.max(0, ((x + 0.5) * 257) / w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(256, x0 + 1), wx = fx - x0; let best = 0, bv = -Infinity;
      for (let c = 0; c < C; c++) { const v = (lg[(y0 * 257 + x0) * C + c] * (1 - wx) + lg[(y0 * 257 + x1) * C + c] * wx) * (1 - wy) + (lg[(y1 * 257 + x0) * C + c] * (1 - wx) + lg[(y1 * 257 + x1) * C + c] * wx) * wy; if (v > bv) { bv = v; best = c; } } m[y * w + x] = best; } }
  const cnt = new Array(C).fill(0); for (const v of m) cnt[v]++;
  const classes = cnt.map((n, i) => ({ index: i, label: VOC[i], pixels: n, share: n / m.length, colour: "#" + PALETTE[i].map((v) => v.toString(16).padStart(2, "0")).join("") })).filter((c) => c.pixels > 0).sort((a, b) => b.pixels - a.pixels);
  const base = pixels(work), maskC = mk(w, h), idxC = mk(w, h), ovC = mk(w, h), mi = ctx2(maskC).createImageData(w, h), ii = ctx2(idxC).createImageData(w, h), oi = ctx2(ovC).createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const c = m[i], [r, g, b] = PALETTE[c]; mi.data.set([r, g, b, c > 0 ? 255 : 0], i * 4); ii.data.set([c, c, c, 255], i * 4); for (let q = 0; q < 3; q++) oi.data[i * 4 + q] = c > 0 ? base.data[i * 4 + q] * (1 - opacity) + PALETTE[c][q] * opacity : base.data[i * 4 + q]; oi.data[i * 4 + 3] = 255; }
  ctx2(maskC).putImageData(mi, 0, 0); ctx2(idxC).putImageData(ii, 0, 0); ctx2(ovC).putImageData(oi, 0, 0);
  return { filename: name, width: W, height: H, classes, known_classes: VOC, seconds: Math.round(performance.now() - t) / 1000, model: INFO.segmenter, mask_png: toUrl(maskC, "image/png"), index_mask_png: toUrl(idxC, "image/png"), overlay: toUrl(ovC), original: toUrl(work),
    note: "Semantic segmentation into the 21 PASCAL VOC classes (20 object classes + background). Everything outside those classes is labelled background or the nearest class. The model runs at 257x257 and its mask is upscaled, so edges are coarse." };
}

/* ───────── pose ───────── */
export const POSE_NAMES = ["nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer", "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel", "left_foot_index", "right_foot_index"];
const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];
export async function poseOne(src: CanvasImageSource, box: number[]) {
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, side = Math.max(box[2] - box[0], box[3] - box[1]) * 1.25, x0 = cx - side / 2, y0 = cy - side / 2, k = 256 / side, c = mk(256, 256), g = ctx2(c);
  g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256); g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); g.drawImage(src, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
  const d = g.getImageData(0, 0, 256, 256).data, inp = new Float32Array(256 * 256 * 3); for (let i = 0; i < 256 * 256; i++) for (let q = 0; q < 3; q++) inp[i * 3 + q] = d[i * 4 + q] / 255;
  const { out, s } = await run(models.pose, { [await inputName(models.pose)]: { data: inp, dims: [1, 256, 256, 3] } }), lm = out[s.outputNames[0]].data as Float32Array, pres = (out[s.outputNames[1]].data as Float32Array)[0];
  const kp = POSE_NAMES.map((name, i) => ({ name, x: Math.round((lm[i * 5] * side / 256 + x0) * 10) / 10, y: Math.round((lm[i * 5 + 1] * side / 256 + y0) * 10) / 10, visibility: Math.round((1 / (1 + Math.exp(-lm[i * 5 + 3]))) * 1000) / 1000 }));
  return { kp, pres };
}
const angle = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => { const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y], n = Math.hypot(...v1) * Math.hypot(...v2); return n < 1e-6 ? null : (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n))) * 180) / Math.PI; };
export interface PosePerson { box: number[]; score: number; pose_presence?: number; keypoints: { name: string; x: number; y: number; visibility: number }[] | null; joint_angles_degrees?: Record<string, number>; note?: string }
export async function poseFrame(src: CanvasImageSource, w: number, h: number, thr: number): Promise<PosePerson[]> {
  const dets = (await detectCanvas(src, w, h, thr, true)).slice(0, 8), out: PosePerson[] = [];
  for (const d of dets) {
    if (d.box[3] - d.box[1] < 40) { out.push({ box: d.box, score: d.score, keypoints: null, note: "person too small for pose estimation (under 40 px tall)" }); continue; }
    const { kp, pres } = await poseOne(src, d.box), ang: Record<string, number> = {};
    for (const [nm, [a, b, c]] of Object.entries({ left_elbow: [11, 13, 15], right_elbow: [12, 14, 16], left_knee: [23, 25, 27], right_knee: [24, 26, 28], left_hip: [11, 23, 25], right_hip: [12, 24, 26] })) if ([a, b, c].every((i) => kp[i].visibility >= 0.5)) { const v = angle(kp[a], kp[b], kp[c]); if (v !== null) ang[nm] = Math.round(v * 10) / 10; }
    out.push({ box: d.box, score: d.score, pose_presence: pres, keypoints: kp, joint_angles_degrees: ang });
  }
  return out;
}
export function drawPose(src: CanvasImageSource, w: number, h: number, persons: PosePerson[]): Cvs {
  const c = mk(w, h), g = ctx2(c); g.drawImage(src, 0, 0, w, h); g.lineWidth = Math.max(2, w / 400); g.lineCap = "round";
  persons.forEach((p, n) => { const col = COLORS[n % COLORS.length]; g.strokeStyle = col; g.strokeRect(p.box[0], p.box[1], p.box[2] - p.box[0], p.box[3] - p.box[1]); if (!p.keypoints) return; const k = p.keypoints;
    for (const [a, b] of BONES) if (k[a].visibility >= 0.4 && k[b].visibility >= 0.4) { g.beginPath(); g.moveTo(k[a].x, k[a].y); g.lineTo(k[b].x, k[b].y); g.stroke(); }
    g.fillStyle = "#fff"; for (const i of [0, ...Array.from({ length: 18 }, (_, j) => j + 11)]) if (k[i].visibility >= 0.4) { g.beginPath(); g.arc(k[i].x, k[i].y, Math.max(3, w / 300), 0, 7); g.fill(); } });
  return c;
}
export async function poseImage(f: FormData) {
  const thr = numOf(f, "threshold", 0.35); if (thr < 0.1 || thr > 0.9) err(400, "threshold must be between 0.1 and 0.9."); await session(models.pose);
  const { img, name } = await imageInput(f), t = performance.now(), persons = await poseFrame(img, img.width, img.height, thr);
  return { filename: name, width: img.width, height: img.height, persons, seconds: Math.round(performance.now() - t) / 1000, model: INFO.pose, annotated: toUrl(drawPose(img, img.width, img.height, persons)), message: persons.length ? null : "No person was detected in this image, so there is no pose to show.", note: "Keypoints are estimates of body-joint positions. A pose alone does not tell what someone is doing, intends or feels, and no activity label is produced." };
}
