"use client";
/** Intel's worker_safety_mobilenet (MobileNet-SSD, BSD-3-Clause) converted from Caffe to ONNX (services/ppe-monitor/scripts/convert_safety_to_onnx.py; checked against OpenCV by check_safety_onnx.py) and run with ONNX Runtime Web on a crop around each worker, as the server does with OpenCV DNN. The SSD decoding (priors, variances, per-class NMS) is Caffe's DetectionOutput written out. */
import { CLASS_OF, type PPEBox, type Box4 } from "./rules";
interface Cfg { priors: number[][]; variances: number[]; num_classes: number; confidence_threshold: number; nms_threshold: number; top_k: number; keep_top_k: number }
type Ort = typeof import("onnxruntime-web/wasm");
export class SafetyGear {
  private constructor(private ort: Ort, private s: import("onnxruntime-web/wasm").InferenceSession, private cfg: Cfg, private canvas: HTMLCanvasElement, private pad: number) {}
  static async create(pad = 0.08): Promise<SafetyGear> {
    const ort = await import("onnxruntime-web/wasm"); ort.env.wasm.wasmPaths = "/vehicle/ort/"; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const [s, cfg] = await Promise.all([ort.InferenceSession.create("/models/ppe/worker_safety_mobilenet.onnx", { executionProviders: ["wasm"], graphOptimizationLevel: "all" }), fetch("/models/ppe/priors.json").then((r) => r.json() as Promise<Cfg>)]);
    const c = document.createElement("canvas"); c.width = c.height = 224; return new SafetyGear(ort, s, cfg, c, pad);
  }
  /** Detect hard hats and vests on each worker crop. Returns PPE boxes in the frame's pixels, each tied to its worker index. */
  async detect(src: CanvasImageSource, w: number, h: number, persons: Box4[], minScore = 0.3): Promise<PPEBox[]> {
    const out: PPEBox[] = [], g = this.canvas.getContext("2d", { willReadFrequently: true })!;
    for (let wi = 0; wi < persons.length; wi++) {
      const [px1, py1, px2, py2] = persons[wi], bw = px2 - px1, bh = py2 - py1, cx1 = Math.trunc(Math.max(0, px1 - this.pad * bw)), cy1 = Math.trunc(Math.max(0, py1 - this.pad * bh)), cx2 = Math.trunc(Math.min(w, px2 + this.pad * bw)), cy2 = Math.trunc(Math.min(h, py2 + this.pad * bh)); if (cx2 - cx1 < 16 || cy2 - cy1 < 32) continue;
      g.imageSmoothingQuality = "high"; g.drawImage(src, cx1, cy1, cx2 - cx1, cy2 - cy1, 0, 0, 224, 224); const px = g.getImageData(0, 0, 224, 224).data, plane = 224 * 224, x = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) { x[i] = px[i * 4 + 2]; x[plane + i] = px[i * 4 + 1]; x[2 * plane + i] = px[i * 4]; } // raw BGR 0-255, no mean (as cv2.dnn.blobFromImage(swapRB=False))
      const res = await this.s.run({ data: new this.ort.Tensor("float32", x, [1, 3, 224, 224]) }), rows = this.decode(res.loc.data as Float32Array, res.conf.data as Float32Array), cw = cx2 - cx1, ch = cy2 - cy1;
      for (const r of rows) { const kind = CLASS_OF[r.cls]; if (!kind || r.score < minScore) continue; const x1 = cx1 + Math.max(0, r.box[0]) * cw, y1 = cy1 + Math.max(0, r.box[1]) * ch, x2 = cx1 + Math.min(1, r.box[2]) * cw, y2 = cy1 + Math.min(1, r.box[3]) * ch; if (x2 - x1 > 2 && y2 - y1 > 2) out.push({ kind, score: r.score, x1, y1, x2, y2, worker: wi }); }
    }
    return out;
  }
  decode(loc: Float32Array, conf: Float32Array): { cls: number; score: number; box: [number, number, number, number] }[] {
    const { priors, variances: v, num_classes: nc } = this.cfg, n = priors.length, boxes: [number, number, number, number][] = new Array(n);
    for (let i = 0; i < n; i++) { const p = priors[i], pw = p[2] - p[0], ph = p[3] - p[1], pcx = (p[0] + p[2]) / 2, pcy = (p[1] + p[3]) / 2, cx = v[0] * loc[i * 4] * pw + pcx, cy = v[1] * loc[i * 4 + 1] * ph + pcy, w = Math.exp(v[2] * loc[i * 4 + 2]) * pw, h = Math.exp(v[3] * loc[i * 4 + 3]) * ph; boxes[i] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]; }
    const out: { cls: number; score: number; box: [number, number, number, number] }[] = [];
    for (let c = 1; c < nc; c++) {
      const idx: number[] = []; for (let i = 0; i < n; i++) if (conf[i * nc + c] > this.cfg.confidence_threshold) idx.push(i); idx.sort((a, b) => conf[b * nc + c] - conf[a * nc + c] || a - b); const cand = idx.slice(0, this.cfg.top_k), keep: number[] = [];
      for (const i of cand) { let ok = true; for (const k of keep) { const a = boxes[i], b = boxes[k], iw = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), ih = Math.min(a[3], b[3]) - Math.max(a[1], b[1]), inter = Math.max(iw, 0) * Math.max(ih, 0); if (inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-12) > this.cfg.nms_threshold) { ok = false; break; } } if (ok) keep.push(i); }
      for (const i of keep) out.push({ cls: c, score: conf[i * nc + c], box: boxes[i] });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, this.cfg.keep_top_k);
  }
}
