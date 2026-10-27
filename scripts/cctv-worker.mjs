#!/usr/bin/env node
/**
 * AI CCTV demo worker: decodes a video with ffmpeg and runs real object detection
 * (Human 3.3.6 / MB3-CenterNet COCO on TensorFlow.js WASM, CPU) frame by frame.
 * It is just another client of the public job API: it posts raw detections with the job token and finalises the job.
 *
 *   CCTV_JOB_TOKEN=<token> node scripts/cctv-worker.mjs --api http://127.0.0.1:3000 --job <jobId> --file <video>
 *
 * Licences: @vladmandic/human (MIT), TensorFlow.js (Apache-2.0). No Ultralytics/YOLO code or weights are used.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };
const api = arg("api"), jobId = arg("job"), file = arg("file"), token = process.env.CCTV_JOB_TOKEN;
if (!api || !jobId || !file || !token) { console.error("usage: CCTV_JOB_TOKEN=… node cctv-worker.mjs --api URL --job ID --file VIDEO"); process.exit(2); }
const SUPPORTED = new Set(["person", "bicycle", "car", "motorcycle", "bus", "truck"]);
const H = { "content-type": "application/json", "x-job-token": token };
const call = async (p, method, body) => {
  const r = await fetch(`${api}/api/cctv/jobs/${jobId}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

async function main() {
  const job = await (await fetch(`${api}/api/cctv/jobs/${jobId}`)).json();
  const fps = job.settings.sampleFps, W = Math.min(640, job.meta.width), Hh = Math.max(2, Math.round((job.meta.height * W) / job.meta.width / 2) * 2), Wd = Math.round(W / 2) * 2;
  const mod = await import(pathToFileURL(path.join(process.cwd(), "node_modules", "@vladmandic", "human", "dist", "human.node-wasm.js")).href);
  const Human = mod.Human || mod.default?.Human || mod.default;
  const wasmDir = path.join(process.cwd(), "node_modules", "@tensorflow", "tfjs-backend-wasm", "dist") + path.sep;
  const human = new Human({ backend: "wasm", debug: false, modelBasePath: `${api}/models/cctv/`, wasmPath: wasmDir, face: { enabled: false }, body: { enabled: false }, hand: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false }, filter: { enabled: false }, object: { enabled: true, modelPath: "centernet.json", minConfidence: 0.15, maxDetected: 40 } });
  await human.init(); await human.load();
  console.log(`worker: backend=${human.tf.getBackend()} fps=${fps} size=${Wd}x${Hh} frames≤${job.expectedFrames}`);
  const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-vf", `fps=${fps},scale=${Wd}:${Hh}`, "-frames:v", String(job.expectedFrames), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
  const size = Wd * Hh * 3; let buf = Buffer.alloc(0), i = 0, batch = [];
  const flush = async () => { if (batch.length) { await call("/frames", "POST", { frames: batch }); batch = []; } };
  const handle = async (raw) => {
    const t = human.tf.tensor3d(new Uint8Array(raw), [Hh, Wd, 3]);
    const res = await human.detect(t); human.tf.dispose(t);
    const dets = res.object.filter((o) => SUPPORTED.has(o.label)).map((o) => {
      const [x, y, w, h] = o.boxRaw; const cx = (v) => Math.min(1, Math.max(0, v));
      return { cls: o.label, conf: Math.round(o.score * 1000) / 1000, box: [cx(x), cx(y), cx(Math.min(w, 1 - x)), cx(Math.min(h, 1 - y))] };
    });
    batch.push({ i, t: Math.round((i / fps) * 1000) / 1000, dets }); i++;
    if (batch.length >= 20) await flush();
  };
  let chain = Promise.resolve();
  ff.stdout.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= size) { const f = Buffer.from(buf.subarray(0, size)); buf = buf.subarray(size); chain = chain.then(() => handle(f)); }
  });
  await new Promise((res, rej) => { ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`)))); ff.on("error", rej); });
  await chain; await flush();
  const out = await call("/finalize", "POST", { ok: true });
  console.log("worker: done", out.stats?.detectionsTotal, "detections");
  process.exit(0);
}
main().catch(async (e) => {
  console.error("worker failed:", e.message);
  try { await call("/finalize", "POST", { ok: false, error: String(e.message).slice(0, 250) }); } catch { /* job may be gone */ }
  process.exit(1);
});
