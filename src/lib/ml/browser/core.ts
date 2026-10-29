"use client";
/** Shared pieces of the in-browser ML engine: model loading (ONNX Runtime Web, WASM), image decoding and drawing, uploads and samples. Nothing leaves the page. */
import { MlApiError, type Sample } from "../api";

export const err = (status: number, msg: string): never => { throw new MlApiError(status, msg); };
export const LIMITS = { max_image_mb: 15, max_megapixels: 25, max_video_mb: 80, max_video_seconds: 60, max_frames: 300, max_csv_mb: 5, max_csv_rows: 50000, max_doc_mb: 15 };
type Ort = typeof import("onnxruntime-web/wasm");
let ortP: Promise<Ort> | null = null;
const getOrt = () => (ortP ??= import("onnxruntime-web/wasm").then((o) => { o.env.wasm.wasmPaths = "/vehicle/ort/"; o.env.wasm.numThreads = 1; o.env.wasm.proxy = false; return o; }));
const sessions = new Map<string, Promise<import("onnxruntime-web/wasm").InferenceSession>>();
export async function session(url: string) {
  let p = sessions.get(url);
  if (!p) { p = getOrt().then((o) => o.InferenceSession.create(url, { executionProviders: ["wasm"], graphOptimizationLevel: "all" })); sessions.set(url, p); p.catch(() => sessions.delete(url)); }
  try { return await p; } catch { return err(503, "The model could not be loaded in this browser. Check your connection and try again."); }
}
export async function run(url: string, feeds: Record<string, { data: Float32Array; dims: number[] }>) {
  const o = await getOrt(), s = await session(url), f: Record<string, import("onnxruntime-web/wasm").Tensor> = {};
  for (const [k, v] of Object.entries(feeds)) f[k] = new o.Tensor("float32", v.data, v.dims);
  const out = await s.run(f); return { out, s };
}
export const inputName = async (url: string) => (await session(url)).inputNames[0];
export const models = { mobilenet: "/ml/models/mobilenet_v2.onnx", features: "/ml/models/mobilenet_v2_features.onnx", deeplab: "/ml/models/deeplab_v3.onnx", pose: "/ml/models/blazepose_full.onnx", yolox: "/models/vehicle/yolox_tiny.onnx" };

/* ───────── files and samples ───────── */
export const fileOf = (f: FormData, k: string) => { const v = f.get(k); return v instanceof File ? v : null; };
export const strOf = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : null; };
export const numOf = (f: FormData, k: string, d: number) => { const v = strOf(f, k); if (v === null || v === "") return d; const n = Number(v); return Number.isFinite(n) ? n : err(400, `${k} must be a number.`); };
let manifest: (Sample & { file: string; file_web?: string })[] | null = null;
export async function samples(): Promise<(Sample & { file: string; file_web?: string })[]> { if (!manifest) { try { manifest = (await (await fetch("/ml/samples/manifest.json")).json()).samples; } catch { manifest = []; } } return manifest!; }
export async function sampleBlob(id: string, kind: string): Promise<{ blob: Blob; item: Sample & { file: string } }> {
  const item = (await samples()).find((x) => x.id === id && x.kind === kind); if (!item) return err(404, "Unknown sample.");
  const r = await fetch(`/ml/samples/${item.file_web ?? item.file}`); if (!r.ok) return err(404, "Unknown sample."); return { blob: await r.blob(), item };
}
export async function sniff(b: Blob): Promise<string | null> {
  const h = new Uint8Array(await b.slice(0, 16).arrayBuffer()), s = (i: number, t: string) => t.split("").every((c, k) => h[i + k] === c.charCodeAt(0));
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpg"; if (h[0] === 0x89 && s(1, "PNG")) return "png"; if (s(0, "RIFF") && s(8, "WEBP")) return "webp"; if (s(0, "%PDF-")) return "pdf";
  if ((s(0, "II") && h[2] === 42) || (s(0, "MM") && h[3] === 42)) return "tiff"; if (s(4, "ftyp") || (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) || (s(0, "RIFF") && s(8, "AVI "))) return "video"; return null;
}
export async function readUpload(file: File, maxMb: number, allowed: string[], what: string): Promise<{ blob: File; kind: string }> {
  if (!file.size) err(400, "The file is empty."); if (file.size > maxMb * 1e6) err(413, `The file is larger than the ${maxMb} MB limit.`);
  const kind = await sniff(file); if (!kind || !allowed.includes(kind)) err(415, `Unsupported file type. Upload ${what}.`); return { blob: file, kind: kind! };
}
export const cleanName = (n: string) => n.replace(/[^\w.\- ]/g, "_").slice(-80) || "file";

/* ───────── images ───────── */
export type Cvs = HTMLCanvasElement;
export const mk = (w: number, h: number): Cvs => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
export const ctx2 = (c: Cvs) => c.getContext("2d", { willReadFrequently: true })!;
export async function decodeImage(blob: Blob, maxMp = LIMITS.max_megapixels): Promise<Cvs> {
  let bm: ImageBitmap;
  try { bm = await createImageBitmap(blob, { imageOrientation: "from-image" }); } catch { return err(422, (await sniff(blob)) === "tiff" ? "This browser cannot open TIFF images. Convert the image to PNG or JPEG and try again." : "The image could not be decoded. The file may be damaged."); }
  if (bm.width * bm.height > maxMp * 1e6) { bm.close(); err(422, `The image is ${bm.width}x${bm.height} pixels; the limit is ${maxMp} megapixels.`); }
  const c = mk(bm.width, bm.height), g = ctx2(c); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0); bm.close(); return c;
}
export const toUrl = (c: Cvs, mime = "image/jpeg", q = 0.9) => c.toDataURL(mime, q);
export const scaled = (c: Cvs, w: number, h: number): Cvs => { const o = mk(w, h), g = ctx2(o); g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, o.width, o.height); return o; };
export const pixels = (c: Cvs) => ctx2(c).getImageData(0, 0, c.width, c.height);
export const COLORS = ["#3cb44b", "#e6194b", "#ffe119", "#0082c8", "#f58231", "#911eb4", "#46f0f0", "#f032e6"];
export const PALETTE: [number, number, number][] = [[0, 0, 0], [230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 240, 240], [240, 50, 230], [210, 245, 60], [250, 190, 212], [0, 128, 128], [220, 190, 255], [170, 110, 40], [255, 250, 200], [128, 0, 0], [170, 255, 195], [128, 128, 0], [255, 215, 180], [0, 0, 128], [128, 128, 128]];
export const COCO = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];
export const VOC = ["background", "aeroplane", "bicycle", "bird", "boat", "bottle", "bus", "car", "cat", "chair", "cow", "dining table", "dog", "horse", "motorbike", "person", "potted plant", "sheep", "sofa", "train", "tv monitor"];
export const INFO = {
  classifier: { name: "MobileNetV2 (ImageNet, 1000 classes)", source: "Keras Applications weights (Google), converted to ONNX; runs in your browser (ONNX Runtime Web)", licence: "Apache-2.0" },
  detector: { name: "YOLOX-tiny (COCO, 80 classes)", source: "Megvii YOLOX 0.1.1rc0 release, unmodified ONNX; runs in your browser (ONNX Runtime Web)", licence: "Apache-2.0" },
  segmenter: { name: "DeepLabV3 MobileNetV2 (PASCAL VOC, 21 classes, 257x257 input)", source: "Google MediaPipe image_segmenter deeplab_v3, converted to ONNX; runs in your browser", licence: "Apache-2.0" },
  pose: { name: "BlazePose full (33 keypoints) on YOLOX person boxes", source: "MediaPipe pose_landmark_full, converted to ONNX; runs in your browser", licence: "Apache-2.0" },
};
export const sampleFileOf = (id: string) => { const x = manifest?.find((s) => s.id === id); return x ? (x.file_web ?? x.file) : `${id}`; };
