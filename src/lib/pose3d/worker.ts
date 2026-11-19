/// <reference lib="webworker" />
import { analyse, type Analysis } from "./analysis";
import { estimateSequence, mpjpe, type FrameEstimate } from "./estimate";
import { DATASETS, generateDataset, type V3 } from "./model";

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
self.onmessage = (ev: MessageEvent<{ id: number; dataset: string }>) => {
  const { id, dataset } = ev.data;
  try {
    const ds = DATASETS.find((d) => d.id === dataset); if (!ds) throw new Error("Unknown dataset.");
    post({ id, type: "progress", stage: "Generating the human point clouds", fraction: 0.05 });
    const frames = generateDataset(ds), t0 = performance.now();
    post({ id, type: "progress", stage: "Detecting people and fitting skeletons", fraction: 0.15 });
    const est: FrameEstimate[] = estimateSequence(frames.map((f) => f.points)), ms = performance.now() - t0;
    post({ id, type: "progress", stage: "Analysing motion", fraction: 0.9 });
    const ids = [...new Set(est.flatMap((e) => e.people.map((p) => p.id)))].sort((a, b) => a - b);
    const analyses: { id: number; analysis: Analysis }[] = ids.map((pid) => ({ id: pid, analysis: analyse(est.map((e) => e.people.find((p) => p.id === pid)?.joints ?? null), ds.fps) }));
    const acc = mpjpe(est, frames.map((f) => f.truth));
    post({ id, type: "done", dataset: ds, frames: frames.map((f) => ({ points: f.points, truth: f.truth as V3[][] })), estimates: est, analyses, accuracy: acc, ms });
  } catch (e) { post({ id, type: "error", message: e instanceof Error ? e.message : "Processing failed." }); }
};
export {};
