"use client";
import type { Frame } from "@/lib/cctv/types";
import type { Detector } from "./detector";

export interface InferenceArgs {
  detector: Detector; url: string; durationSec: number; fps: number; maxFrames: number;
  onProgress(done: number, total: number, msPerFrame: number): void; cancelled(): boolean; post(frames: Frame[]): Promise<void>;
}
/** Decodes the video in the browser (seek → canvas) and runs the detector on each sampled frame. Frames are posted to the API in batches. */
export async function runBrowserInference(a: InferenceArgs) {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = a.url;
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("The browser could not decode this video (unsupported codec?).")); });
  const total = Math.min(a.maxFrames, Math.max(1, Math.floor(a.durationSec * a.fps)));
  const cw = Math.min(640, v.videoWidth), ch = Math.round((v.videoHeight * cw) / v.videoWidth);
  const canvas = document.createElement("canvas"); canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let batch: Frame[] = [], t0 = performance.now();
  for (let i = 0; i < total; i++) {
    if (a.cancelled()) break;
    const t = Math.min(i / a.fps, Math.max(0, v.duration - 0.05));
    await new Promise<void>((res, rej) => { const to = setTimeout(() => rej(new Error("Seeking the video timed out")), 10_000); v.onseeked = () => { clearTimeout(to); res(); }; v.currentTime = t; });
    ctx.drawImage(v, 0, 0, cw, ch);
    const dets = await a.detector.detect(canvas);
    batch.push({ i, t: Math.round((i / a.fps) * 1000) / 1000, dets });
    if (batch.length >= 20) { await a.post(batch); batch = []; }
    a.onProgress(i + 1, total, (performance.now() - t0) / (i + 1));
  }
  if (batch.length && !a.cancelled()) await a.post(batch);
  v.removeAttribute("src"); v.load();
  return !a.cancelled();
}
