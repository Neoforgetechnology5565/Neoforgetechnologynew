"use client";
/** YOLOX (Apache-2.0) vehicle detector running in the browser with ONNX Runtime Web (WebAssembly, CPU). Same model file and same pre/post-processing as the Python service. */
import { VCLASSES, type VClass } from "./types";

export interface RawDet { x1: number; y1: number; x2: number; y2: number; score: number; cls: VClass }
const VEHICLE_COLS = [2, 3, 5, 7]; // COCO ids: car, motorcycle, bus, truck (same order as VCLASSES)

function nms(boxes: number[][], scores: number[], thr: number): number[] {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]); const keep: number[] = [];
  while (order.length) {
    const i = order.shift()!; keep.push(i); const a = boxes[i]; const areaA = (a[2] - a[0]) * (a[3] - a[1]);
    for (let k = order.length - 1; k >= 0; k--) {
      const b = boxes[order[k]]; const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), inter = w * h;
      if (inter / (areaA + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9) > thr) order.splice(k, 1);
    }
  }
  return keep;
}

export class BrowserDetector {
  private constructor(private ort: typeof import("onnxruntime-web/wasm"), private session: import("onnxruntime-web/wasm").InferenceSession, readonly size: number, private canvas: HTMLCanvasElement, private ctx: CanvasRenderingContext2D, private grids: Float32Array, private strides: Float32Array) {}
  static async create(modelUrl = "/models/vehicle/yolox_tiny.onnx", size = 416): Promise<BrowserDetector> {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = "/vehicle/ort/"; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = size; const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const g: number[] = [], s: number[] = []; for (const st of [8, 16, 32]) { const n = size / st; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.push(x, y); s.push(st); } }
    return new BrowserDetector(ort, session, size, canvas, ctx, new Float32Array(g), new Float32Array(s));
  }
  async detect(src: CanvasImageSource, w: number, h: number, conf = 0.3, nmsThr = 0.45): Promise<RawDet[]> {
    const S = this.size, r = Math.min(S / h, S / w), nw = Math.round(w * r), nh = Math.round(h * r);
    this.ctx.fillStyle = "rgb(114,114,114)"; this.ctx.fillRect(0, 0, S, S); this.ctx.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
    const px = this.ctx.getImageData(0, 0, S, S).data, plane = S * S, input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) { input[i] = px[i * 4 + 2]; input[plane + i] = px[i * 4 + 1]; input[2 * plane + i] = px[i * 4]; } // BGR, 0-255 (YOLOX convention)
    const out = await this.session.run({ [this.session.inputNames[0]]: new this.ort.Tensor("float32", input, [1, 3, S, S]) });
    const o = out[this.session.outputNames[0]].data as Float32Array, n = o.length / 85;
    const cand: { box: number[]; score: number; c: number }[] = [];
    for (let i = 0; i < n; i++) {
      const b = i * 85, obj = o[b + 4]; if (obj < conf) continue;
      let best = -1, bs = 0; for (let c = 0; c < 4; c++) { const sc = o[b + 5 + VEHICLE_COLS[c]] * obj; if (sc > bs) { bs = sc; best = c; } }
      if (best < 0 || bs < conf) continue;
      const cx = (o[b] + this.grids[2 * i]) * this.strides[i], cy = (o[b + 1] + this.grids[2 * i + 1]) * this.strides[i], bw = Math.exp(o[b + 2]) * this.strides[i], bh = Math.exp(o[b + 3]) * this.strides[i];
      cand.push({ box: [(cx - bw / 2) / r, (cy - bh / 2) / r, (cx + bw / 2) / r, (cy + bh / 2) / r], score: bs, c: best });
    }
    const dets: RawDet[] = [];
    for (let c = 0; c < 4; c++) {
      const m = cand.filter((x) => x.c === c); for (const k of nms(m.map((x) => x.box), m.map((x) => x.score), nmsThr)) {
        const b = m[k].box; const x1 = Math.max(0, b[0]), y1 = Math.max(0, b[1]), x2 = Math.min(w, b[2]), y2 = Math.min(h, b[3]);
        if (x2 - x1 >= 4 && y2 - y1 >= 4) dets.push({ x1, y1, x2, y2, score: m[k].score, cls: VCLASSES[c] });
      }
    }
    return dets.sort((a, b) => b.score - a.score);
  }
}
