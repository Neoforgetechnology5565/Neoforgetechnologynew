"use client";
import type { Human } from "@vladmandic/human";
import type { Det } from "@/lib/cctv/types";
import { SUPPORTED_CLASSES } from "@/lib/cctv/types";

/** Pluggable detector. The platform only depends on this interface, so another model (for example a licensed YOLO build) can be dropped in. */
export interface Detector {
  id: string; label: string; license: string;
  load(): Promise<{ backend: string }>;
  detect(frame: HTMLCanvasElement): Promise<Det[]>;
  dispose(): void;
}

/** @vladmandic/human 3.3.6 (MIT) running MB3-CenterNet (COCO, 80 classes) on TensorFlow.js. Only the six surveillance-relevant classes are kept. */
export class HumanCenterNet implements Detector {
  id = "human-centernet"; label = "MB3-CenterNet (COCO) via Human / TensorFlow.js"; license = "MIT (Human, model weights), Apache-2.0 (TensorFlow.js)";
  private human: Human | null = null;
  async load() {
    // The bundled ESM build is a large chunk; it is only fetched when a user starts real inference.
    const mod = (await import(/* webpackChunkName: "human" */ "@vladmandic/human")) as { Human?: typeof Human; default?: typeof Human };
    const HumanCtor = (mod.Human ?? mod.default) as typeof Human;
    let backend = "webgl";
    for (const b of ["webgl", "cpu"]) {
      const h = new HumanCtor({ backend: b as "webgl" | "cpu", debug: false, modelBasePath: "/models/cctv/", face: { enabled: false }, body: { enabled: false }, hand: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false }, filter: { enabled: false }, object: { enabled: true, modelPath: "centernet.json", minConfidence: 0.15, maxDetected: 40 } });
      try { await h.init(); await h.load(); this.human = h; backend = h.tf.getBackend(); break; } catch { /* try the next backend */ }
    }
    if (!this.human) throw new Error("The detection model could not be loaded in this browser (WebGL and CPU backends both failed).");
    return { backend };
  }
  async detect(frame: HTMLCanvasElement) {
    if (!this.human) throw new Error("Detector not loaded");
    const res = await this.human.detect(frame);
    return res.object.filter((o) => SUPPORTED_CLASSES.includes(o.label)).map((o) => {
      const [x, y, w, h] = o.boxRaw, c = (v: number) => Math.min(1, Math.max(0, v));
      return { cls: o.label, conf: Math.round(o.score * 1000) / 1000, box: [c(x), c(y), c(Math.min(w, 1 - x)), c(Math.min(h, 1 - y))] as [number, number, number, number] };
    });
  }
  dispose() { this.human = null; }
}
