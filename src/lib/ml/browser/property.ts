"use client";
/** PropertyVision AI in the browser: pretrained CLIP ViT-B/32 (int8 ONNX) classification, YOLOX detection and the scoring engine. Nothing leaves the page. */
import { CLASS_LABEL, CLASSES, scoreProperty } from "../property-score";
import { ctx2, err, mk, numOf, run, scaled, session, toUrl, inputName, type Cvs } from "./core";
import { detectCanvas, drawDet, imageInput } from "./vision";

const YOLO_URL = "/ml/models/yolox_s.onnx", YOLO_SIZE = 640;
const CLIP_URL = "/ml/models/clip_vit_b32_visual_int8.onnx", PROMPTS_URL = "/ml/models/clip_property_prompts.json";
const MEAN = [0.48145466, 0.4578275, 0.40821073], STD = [0.26862954, 0.26130258, 0.27577711];
let text: { classes: string[]; embeddings: number[][] } | null = null;
const prompts = async () => (text ??= (await (await fetch(PROMPTS_URL)).json()) as { classes: string[]; embeddings: number[][] });

/** CLIP preprocessing: shorter side to 224, centre crop, scale to 0-1, normalise, channels first. */
function prepClip(img: Cvs): Float32Array {
  const s = 224 / Math.min(img.width, img.height), w = Math.max(224, Math.round(img.width * s)), h = Math.max(224, Math.round(img.height * s)), r = scaled(img, w, h), x0 = (w - 224) >> 1, y0 = (h - 224) >> 1;
  const d = ctx2(r).getImageData(x0, y0, 224, 224).data, o = new Float32Array(3 * 224 * 224), plane = 224 * 224;
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) o[c * plane + i] = (d[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  return o;
}
export async function clipClassify(img: Cvs) {
  const T = await prompts(), { out, s } = await run(CLIP_URL, { [await inputName(CLIP_URL)]: { data: prepClip(img), dims: [1, 3, 224, 224] } }), e = out[s.outputNames[0]].data as Float32Array;
  let n = 0; for (const v of e) n += v * v; n = Math.sqrt(n) + 1e-9;
  const cos = T.embeddings.map((row) => { let a = 0; for (let i = 0; i < 512; i++) a += row[i] * (e[i] / n); return a; }), z = cos.map((c) => 100 * c), mx = Math.max(...z), ex = z.map((v) => Math.exp(v - mx)), tot = ex.reduce((a, b) => a + b, 0);
  const scores = T.classes.map((k, i) => ({ key: k, label: CLASS_LABEL[k], probability: ex[i] / tot, cosine: cos[i] })).sort((a, b) => b.probability - a.probability);
  return { label: scores[0].key, label_text: scores[0].label, probability: scores[0].probability, margin: scores[0].probability - scores[1].probability, scores };
}
/** Three plain image measurements (they describe the photograph, not the property). */
export function measurements(img: Cvs) {
  const k = Math.min(1, 640 / Math.max(img.width, img.height)), c = k < 1 ? scaled(img, Math.round(img.width * k), Math.round(img.height * k)) : img, W = c.width, H = c.height, d = ctx2(c).getImageData(0, 0, W, H).data, gray = new Float32Array(W * H);
  let green = 0, bright = 0;
  for (let i = 0; i < W * H; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], t = r + g + b + 1e-6, exg = (2 * g) / t - r / t - b / t; if (exg > 0.05) green++; const y = 0.299 * r + 0.587 * g + 0.114 * b; gray[i] = y; bright += y; }
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, l = gray[i - 1] + gray[i + 1] + gray[i - W] + gray[i + W] - 4 * gray[i]; s += l; s2 += l * l; n++; }
  const mean = s / Math.max(1, n);
  return { green_percent: (green / (W * H)) * 100, sharpness: s2 / Math.max(1, n) - mean * mean, brightness: bright / (W * H) };
}
export async function analyze(f: FormData) {
  const thr = numOf(f, "threshold", 0.35); if (thr < 0.05 || thr > 0.95) err(400, "threshold must be between 0.05 and 0.95.");
  const { img, name } = await imageInput(f, "property"), t0 = performance.now();
  const cls = await clipClassify(img), t1 = performance.now();
  const dets = await detectCanvas(img, img.width, img.height, thr, false, 0.45, { url: YOLO_URL, size: YOLO_SIZE }), t2 = performance.now();
  const meas = measurements(img), score = scoreProperty(cls, dets, meas), t3 = performance.now(), counts: Record<string, number> = {};
  for (const d of dets) counts[d.label] = (counts[d.label] ?? 0) + 1;
  const r = (a: number, b: number) => Math.round(b - a) / 1000;
  return {
    filename: name, width: img.width, height: img.height, classification: cls,
    detection: { detections: dets, counts, threshold: thr, annotated: toUrl(drawDet(img, img.width, img.height, dets)) }, measurements: meas, score,
    seconds: { classification: r(t0, t1), detection: r(t1, t2), scoring: r(t2, t3), total: r(t0, t3) },
    models: {
      classification: { name: "OpenAI CLIP ViT-B/32 (zero-shot, int8-quantised)", source: "OpenAI CLIP weights, ONNX export by Jina AI clip-as-service, dynamically quantised to int8 for the browser; runs in your browser (ONNX Runtime Web)", licence: "MIT (CLIP), Apache-2.0 (export)" },
      detection: { name: "YOLOX-S (COCO, 80 classes)", source: "Megvii YOLOX 0.1.1rc0 release, unmodified ONNX; runs in your browser (ONNX Runtime Web)", licence: "Apache-2.0" },
      scoring: { name: "Neo Forge rule-based scoring engine (experimental)", source: "src/lib/ml/property-score.ts", licence: "Original code" },
    },
    note: "Experimental demonstration. CLIP is a general-purpose model asked to choose between four descriptions; YOLOX only knows COCO's 80 object classes (no trees, fences, roofs or cracks); the score is a hand-written rule set. None of this is a valuation or an inspection.",
  };
}
void CLASSES; void mk;

/** Downloads (browser-cached) and initialises the three model files with progress, so the first analysis does not look frozen. */
export async function preload(onProgress: (p: { stage: string; percent: number }) => void): Promise<void> {
  const files = [[CLIP_URL, "image classifier (CLIP)"], [YOLO_URL, "object detector (YOLOX)"], [PROMPTS_URL, "class descriptions"]] as const;
  const sizes = await Promise.all(files.map(async ([u]) => Number((await fetch(u, { method: "HEAD" })).headers.get("content-length")) || 0)), total = sizes.reduce((a, b) => a + b, 0) || 1;
  let done = 0;
  for (const [i, [u, name]] of files.entries()) {
    const r = await fetch(u); if (!r.ok || !r.body) err(503, `Could not download the ${name} (${r.status}).`);
    const rd = r.body!.getReader(); let got = 0;
    for (;;) { const { done: d, value } = await rd.read(); if (d) break; got += value.length; onProgress({ stage: `Downloading the ${name}`, percent: Math.min(90, Math.round(((done + got) / total) * 90)) }); }
    done += sizes[i] || got;
  }
  onProgress({ stage: "Preparing the models", percent: 92 }); await session(CLIP_URL); onProgress({ stage: "Preparing the models", percent: 97 }); await session(YOLO_URL); await prompts(); onProgress({ stage: "Ready", percent: 100 });
}
