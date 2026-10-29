"use client";
/** YOLOX-tiny (Apache-2.0, COCO) in the browser through ONNX Runtime Web. Only the ten COCO animal classes are read from the 80-class output. Same model file as the vehicle demo. */
import { ANIMALS, type AnimalKey, type Box } from "./types";

export interface Raw { box: Box; score: number; cls: AnimalKey }
function nms(b: number[][], s: number[], thr: number): number[] {
  const order = s.map((_, i) => i).sort((x, y) => s[y] - s[x]); const keep: number[] = [];
  while (order.length) {
    const i = order.shift()!; keep.push(i); const a = b[i], areaA = (a[2] - a[0]) * (a[3] - a[1]);
    for (let k = order.length - 1; k >= 0; k--) {
      const c = b[order[k]], w = Math.max(0, Math.min(a[2], c[2]) - Math.max(a[0], c[0])), h = Math.max(0, Math.min(a[3], c[3]) - Math.max(a[1], c[1])), inter = w * h;
      if (inter / (areaA + (c[2] - c[0]) * (c[3] - c[1]) - inter + 1e-9) > thr) order.splice(k, 1);
    }
  }
  return keep;
}
export class AnimalDetector {
  private constructor(private ort: typeof import("onnxruntime-web/wasm"), private session: import("onnxruntime-web/wasm").InferenceSession, readonly size: number, private ctx: CanvasRenderingContext2D, private grids: Float32Array, private strides: Float32Array) {}
  static async create(modelUrl = "/models/vehicle/yolox_tiny.onnx", size = 416): Promise<AnimalDetector> {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = "/vehicle/ort/"; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = size; const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const g: number[] = [], s: number[] = []; for (const st of [8, 16, 32]) { const n = size / st; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.push(x, y); s.push(st); } }
    return new AnimalDetector(ort, session, size, ctx, new Float32Array(g), new Float32Array(s));
  }
  async detect(src: CanvasImageSource, w: number, h: number, conf = 0.3, nmsThr = 0.45): Promise<Raw[]> {
    const S = this.size, r = Math.min(S / h, S / w), nw = Math.round(w * r), nh = Math.round(h * r);
    this.ctx.fillStyle = "rgb(114,114,114)"; this.ctx.fillRect(0, 0, S, S); this.ctx.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
    const px = this.ctx.getImageData(0, 0, S, S).data, plane = S * S, input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) { input[i] = px[i * 4 + 2]; input[plane + i] = px[i * 4 + 1]; input[2 * plane + i] = px[i * 4]; }
    const out = await this.session.run({ [this.session.inputNames[0]]: new this.ort.Tensor("float32", input, [1, 3, S, S]) });
    const o = out[this.session.outputNames[0]].data as Float32Array, n = o.length / 85;
    const cand: { box: number[]; score: number; c: number }[] = [];
    for (let i = 0; i < n; i++) {
      const b = i * 85, obj = o[b + 4]; if (obj < conf) continue;
      let best = -1, bs = 0; for (let c = 0; c < ANIMALS.length; c++) { const sc = o[b + 5 + ANIMALS[c].id] * obj; if (sc > bs) { bs = sc; best = c; } }
      if (best < 0 || bs < conf) continue;
      const cx = (o[b] + this.grids[2 * i]) * this.strides[i], cy = (o[b + 1] + this.grids[2 * i + 1]) * this.strides[i], bw = Math.exp(o[b + 2]) * this.strides[i], bh = Math.exp(o[b + 3]) * this.strides[i];
      cand.push({ box: [(cx - bw / 2) / r, (cy - bh / 2) / r, (cx + bw / 2) / r, (cy + bh / 2) / r], score: bs, c: best });
    }
    const dets: Raw[] = [];
    for (let c = 0; c < ANIMALS.length; c++) {
      const m = cand.filter((x) => x.c === c);
      for (const k of nms(m.map((x) => x.box), m.map((x) => x.score), nmsThr)) {
        const b = m[k].box, x1 = Math.max(0, b[0]), y1 = Math.max(0, b[1]), x2 = Math.min(w, b[2]), y2 = Math.min(h, b[3]);
        if (x2 - x1 >= 4 && y2 - y1 >= 4) dets.push({ box: { x1, y1, x2, y2 }, score: m[k].score, cls: ANIMALS[c].key });
      }
    }
    return dets.sort((a, b) => b.score - a.score);
  }
}
