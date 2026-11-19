/// <reference lib="webworker" />
import { generateScene, type SceneData } from "./scenes";
import { segmentScene, type Segmentation } from "./segment";
import { evaluate, type Evaluation } from "./stats";

export interface SceneResult { scene: SceneData; seg: Segmentation; evaluation: Evaluation }
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
self.onmessage = (ev: MessageEvent<{ id: number; scene: string }>) => {
  const { id, scene: sid } = ev.data;
  try {
    post({ id, type: "progress", stage: "Generating the scene", fraction: 0.1 });
    const scene = generateScene(sid);
    post({ id, type: "progress", stage: "Segmenting the point cloud (floor, walls, objects)", fraction: 0.35 });
    const seg = segmentScene(scene.pos, scene.rgb);
    post({ id, type: "progress", stage: "Scoring against the reference labels", fraction: 0.9 });
    const evaluation = evaluate(scene, seg);
    post({ id, type: "done", scene, seg, evaluation });
  } catch (e) { post({ id, type: "error", message: e instanceof Error ? e.message : "Processing failed." }); }
};
export {};
