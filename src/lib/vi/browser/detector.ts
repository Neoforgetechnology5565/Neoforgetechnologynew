"use client";
/** YOLOX-tiny (Apache-2.0, COCO) in the browser via ONNX Runtime Web (WebAssembly). Keeps the person and sports-ball classes. Same model file as the vehicle demo. */
export interface Det { box: [number, number, number, number]; score: number }
function nms(b: number[][], s: number[], thr: number): number[] {
  const order = s.map((_, i) => i).sort((x, y) => s[y] - s[x]), keep: number[] = [];
  while (order.length) { const i = order.shift()!; keep.push(i); const a = b[i], aa = (a[2] - a[0]) * (a[3] - a[1]);
    for (let k = order.length - 1; k >= 0; k--) { const q = b[order[k]], w = Math.max(0, Math.min(a[2], q[2]) - Math.max(a[0], q[0])), h = Math.max(0, Math.min(a[3], q[3]) - Math.max(a[1], q[1])), it = w * h; if (it / (aa + (q[2] - q[0]) * (q[3] - q[1]) - it + 1e-9) > thr) order.splice(k, 1); } }
  return keep;
}
export class ViDetector {
  private constructor(private ort: typeof import("onnxruntime-web/wasm"), private session: import("onnxruntime-web/wasm").InferenceSession, readonly size: number, private canvas: HTMLCanvasElement, private ctx: CanvasRenderingContext2D, private grids: Float32Array, private strides: Float32Array) {}
  static async create(modelUrl = "/models/vehicle/yolox_tiny.onnx", size = 416): Promise<ViDetector> {
    const ort = await import("onnxruntime-web/wasm"); ort.env.wasm.wasmPaths = "/vehicle/ort/"; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = size; const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const g: number[] = [], s: number[] = []; for (const st of [8, 16, 32]) { const n = size / st; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.push(x, y); s.push(st); } }
    return new ViDetector(ort, session, size, canvas, ctx, new Float32Array(g), new Float32Array(s));
  }
  async detect(src: CanvasImageSource, w: number, h: number, personThr = 0.1, ballThr = 0.15): Promise<{ person: Det[]; ball: Det[] }> {
    const S = this.size, r = Math.min(S / h, S / w), nw = Math.round(w * r), nh = Math.round(h * r);
    this.ctx.fillStyle = "rgb(114,114,114)"; this.ctx.fillRect(0, 0, S, S); this.ctx.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
    const px = this.ctx.getImageData(0, 0, S, S).data, plane = S * S, input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) { input[i] = px[i * 4 + 2]; input[plane + i] = px[i * 4 + 1]; input[2 * plane + i] = px[i * 4]; }
    const out = await this.session.run({ [this.session.inputNames[0]]: new this.ort.Tensor("float32", input, [1, 3, S, S]) });
    const o = out[this.session.outputNames[0]].data as Float32Array, n = o.length / 85, res: { person: Det[]; ball: Det[] } = { person: [], ball: [] };
    for (const [name, col, thr] of [["person", 0, personThr], ["ball", 32, ballThr]] as const) {
      const boxes: number[][] = [], sc: number[] = [];
      for (let i = 0; i < n; i++) { const b = i * 85, obj = o[b + 4]; if (obj < thr) continue; const s = obj * o[b + 5 + col]; if (s < thr) continue;
        const cx = (o[b] + this.grids[2 * i]) * this.strides[i], cy = (o[b + 1] + this.grids[2 * i + 1]) * this.strides[i], bw = Math.exp(o[b + 2]) * this.strides[i], bh = Math.exp(o[b + 3]) * this.strides[i];
        boxes.push([Math.max(0, (cx - bw / 2) / r), Math.max(0, (cy - bh / 2) / r), Math.min(w, (cx + bw / 2) / r), Math.min(h, (cy + bh / 2) / r)]); sc.push(s); }
      for (const k of nms(boxes, sc, 0.45)) res[name].push({ box: boxes[k] as Det["box"], score: sc[k] });
    }
    return res;
  }
}
