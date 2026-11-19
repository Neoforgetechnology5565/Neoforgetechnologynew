/// <reference lib="webworker" />
import { parseFile } from "./io";
import { runPipeline } from "./pipeline";
import { PRESETS, synthFacade } from "./synth";
import type { Cloud, Mesh, Params, Parsed } from "./types";

type Req = { type: "run"; id: number; params: Params; source: { kind: "synthetic"; preset: string } | { kind: "file"; name: string; buffer: ArrayBuffer } };
const post = (m: unknown, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t);
self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, params, source } = ev.data;
  try {
    post({ id, type: "progress", stage: "Loading the scan", fraction: 0.01 });
    let parsed: Parsed, truthOrigin: [number, number, number] | null = null;
    if (source.kind === "synthetic") { const pre = PRESETS[source.preset]; if (!pre) throw new Error("Unknown sample."); const cloud = synthFacade(pre.opt); parsed = { cloud, mesh: null, format: "generated sample (PLY-like point cloud)", vertexCount: cloud.pos.length / 3, faceCount: 0, notes: [] }; truthOrigin = pre.opt.origin; }
    else parsed = await parseFile(source.name, source.buffer);
    const raw: Cloud | Mesh = (parsed.cloud ?? parsed.mesh)!;
    if (raw.pos.length / 3 > 3_000_000) throw new Error("This demo handles up to 3 million points or vertices in the browser. Use a decimated copy of the scan.");
    post({ id, type: "loaded", format: parsed.format, vertexCount: parsed.vertexCount, faceCount: parsed.faceCount, kind: parsed.cloud ? "cloud" : "mesh", pos: raw.pos.slice(), colors: raw.colors ? raw.colors.slice() : null, idx: parsed.mesh ? parsed.mesh.idx.slice() : null, truthOrigin });
    const out = runPipeline(parsed, params, (stage, fraction) => post({ id, type: "progress", stage, fraction }));
    const buffers = [out.cleaned.pos.buffer, out.recon.pos.buffer, out.recon.idx.buffer, out.mesh.pos.buffer, out.mesh.idx.buffer, out.deviation.buffer] as ArrayBuffer[];
    post({ id, type: "done", cleaned: out.cleaned.pos, cleanedColors: out.cleaned.colors ?? null, recon: out.recon, mesh: out.mesh, deviation: out.deviation, report: out.report, truthOrigin }, [...new Set(buffers)]);
  } catch (e) { post({ id, type: "error", message: e instanceof Error ? e.message : "Processing failed." }); }
};
export {};
