"use client";
/** FootAndBall player and ball detector (Komorowski et al., VISAPP 2020; MIT code) on ONNX Runtime Web. Same pre- and post-processing as services/sports-analyzer/app/footandball.py: scaled frame replicate-padded to a multiple of 32, ImageNet normalisation, 3×3 peak picking on the stride-16 player map and the stride-4 ball map. */
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225], BALL_BOX = 40;
export interface Det { x1: number; y1: number; x2: number; y2: number; score: number }
type Ort = typeof import("onnxruntime-web/wasm");
function peaks(prob: Float32Array, h: number, w: number, thr: number, k: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = prob[y * w + x]; if (v < thr) continue; let isMax = true;
    for (let dy = -1; dy <= 1 && isMax; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx)); if (prob[yy * w + xx] >= v && !(yy === y && xx === x)) { isMax = false; break; } }
    if (isMax) out.push([y, x, v]);
  }
  return out.sort((a, b) => b[2] - a[2]).slice(0, k);
}
export class FootAndBall {
  private constructor(private ort: Ort, private session: import("onnxruntime-web/wasm").InferenceSession) {}
  static async create(url = "/models/sports/footandball.onnx"): Promise<FootAndBall> {
    const ort = await import("onnxruntime-web/wasm"); ort.env.wasm.wasmPaths = "/vehicle/ort/"; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    return new FootAndBall(ort, await ort.InferenceSession.create(url, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }));
  }
  /** `src` is drawn at `scale`; the returned boxes are in the source frame's pixels (w × h). */
  async detect(src: CanvasImageSource, w: number, h: number, playerThr: number, ballThr: number, scale: number, maxPlayers = 60, maxBall = 5): Promise<{ players: Det[]; balls: Det[] }> {
    const sw = Math.round(w * scale), sh = Math.round(h * scale), pw = Math.ceil(sw / 32) * 32, ph = Math.ceil(sh / 32) * 32, c = document.createElement("canvas"); c.width = sw; c.height = sh; const g = c.getContext("2d", { willReadFrequently: true })!; g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, sw, sh);
    const px = g.getImageData(0, 0, sw, sh).data, plane = pw * ph, x = new Float32Array(3 * plane);
    for (let yy = 0; yy < ph; yy++) { const sy = Math.min(sh - 1, yy); for (let xx = 0; xx < pw; xx++) { const sx = Math.min(sw - 1, xx), i = (sy * sw + sx) * 4, o = yy * pw + xx; for (let k = 0; k < 3; k++) x[k * plane + o] = (px[i + k] / 255 - MEAN[k]) / STD[k]; } }
    const out = await this.session.run({ input: new this.ort.Tensor("float32", x, [1, 3, ph, pw]) }), ball = out[this.session.outputNames[0]].data as Float32Array, player = out[this.session.outputNames[1]].data as Float32Array, box = out[this.session.outputNames[2]].data as Float32Array;
    const bh = ph / 4, bw = pw / 4, lh = ph / 16, lw = pw / 16, sxs = sw / w, sys = sh / h, ballP = ball.subarray(bh * bw, 2 * bh * bw), playerP = player.subarray(lh * lw, 2 * lh * lw), players: Det[] = [], balls: Det[] = [], fw = lw * 16, fh = lh * 16, clip = (v: number, m: number) => Math.min(m, Math.max(0, v));
    for (const [cy, cx, sc] of peaks(playerP, lh, lw, playerThr, maxPlayers)) {
      const ccx = cx * 16 + 7.5, ccy = cy * 16 + 7.5, i = cy * lw + cx, bx = ccx + box[0 * lh * lw + i] * fw, by = ccy + box[1 * lh * lw + i] * fh, bww = box[2 * lh * lw + i] * fw, bhh = box[3 * lh * lw + i] * fh; if (bww < 2 || bhh < 2) continue;
      players.push({ x1: clip((bx - bww / 2) / sxs, w), y1: clip((by - bhh / 2) / sys, h), x2: clip((bx + bww / 2) / sxs, w), y2: clip((by + bhh / 2) / sys, h), score: sc });
    }
    for (const [cy, cx, sc] of peaks(ballP, bh, bw, ballThr, maxBall)) { const bx = (cx * 4 + 1.5) / sxs, by = (cy * 4 + 1.5) / sys; balls.push({ x1: bx - BALL_BOX / 2, y1: by - BALL_BOX / 2, x2: bx + BALL_BOX / 2, y2: by + BALL_BOX / 2, score: sc }); }
    return { players, balls };
  }
}
