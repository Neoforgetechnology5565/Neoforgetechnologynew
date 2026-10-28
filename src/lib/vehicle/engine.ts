"use client";
/** Detection → tracking → counting loop shared by the browser engine (the server engine does the same in Python). */
import { BrowserDetector, type RawDet } from "./detector";
import { ByteTracker } from "./tracker";
import { zeroCounts, type Det, type FrameRec, type Line, type Summary, type VClass } from "./types";

const ccw = (p: number[], q: number[], r: number[]) => (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0]);
const crosses = (l: number[], a: number[], b: number[]) => { const p1 = [l[0], l[1]], p2 = [l[2], l[3]]; return ccw(a, b, p1) * ccw(a, b, p2) < 0 && ccw(p1, p2, a) * ccw(p1, p2, b) < 0; };
const side = (l: number[], p: number[]) => (l[2] - l[0]) * (p[1] - l[1]) - (l[3] - l[1]) * (p[0] - l[0]);

/** Stateful per-frame processor: feed raw detections in time order, get a FrameRec with cumulative counts. */
export class FrameProcessor {
  private tracker: ByteTracker; private confirmed = new Map<number, VClass>(); private lastC = new Map<number, number[]>(); private lastCross = new Map<number, number>();
  private instances = 0; private peak = 0; private cross = { a_to_b: 0, b_to_a: 0 }; private classInst = zeroCounts(); private n = 0;
  constructor(private p: { conf: number; fps: number; minHits: number; line: Line | null; width: number; height: number }) { this.tracker = new ByteTracker(Math.max(0.5, p.conf + 0.1), Math.min(0.1, p.conf), 0.8, Math.max(5, Math.round(p.fps))); }
  step(dets: RawDet[], frameIndex: number, t: number): FrameRec {
    const tracks = this.tracker.update(dets.map((d) => [d.x1, d.y1, d.x2, d.y2]), dets.map((d) => d.score), dets.map((d) => d.cls));
    const byDet = new Map(tracks.map((tr) => [tr.detIndex, tr])); const visible = zeroCounts(); const out: Det[] = [];
    const L = this.p.line ? [this.p.line.x1 * this.p.width, this.p.line.y1 * this.p.height, this.p.line.x2 * this.p.width, this.p.line.y2 * this.p.height] : null;
    dets.forEach((d, i) => {
      const tr = byDet.get(i); const cls = tr ? tr.cls : d.cls; visible[cls]++; this.classInst[cls]++;
      const conf = !!tr && tr.hits >= this.p.minHits; if (tr && conf) this.confirmed.set(tr.trackId, tr.cls);
      out.push({ track_id: tr ? tr.trackId : null, class: cls, detected_class: d.cls, confidence: Math.round(d.score * 1e4) / 1e4, confirmed: conf, bbox: { x1: Math.round(d.x1 * 10) / 10, y1: Math.round(d.y1 * 10) / 10, x2: Math.round(d.x2 * 10) / 10, y2: Math.round(d.y2 * 10) / 10 } });
      if (tr && conf && L) {
        const c = [(d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2], prev = this.lastC.get(tr.trackId);
        if (prev && crosses(L, prev, c) && frameIndex - (this.lastCross.get(tr.trackId) ?? -1e9) > 2) { if (side(L, prev) < 0) this.cross.a_to_b++; else this.cross.b_to_a++; this.lastCross.set(tr.trackId, frameIndex); }
        this.lastC.set(tr.trackId, c);
      }
    });
    this.instances += dets.length; this.peak = Math.max(this.peak, dets.length); this.n++;
    return { frame_number: frameIndex + 1, frame_index: frameIndex, timestamp_seconds: Math.round(t * 1000) / 1000, vehicles_visible: dets.length, tracked_visible: tracks.length, unique_tracks_observed: this.confirmed.size, detection_instances_processed: this.instances, detections: out, class_counts: visible, unique_by_class: this.uniqueByClass(), line_crossings: L ? { ...this.cross, total: this.cross.a_to_b + this.cross.b_to_a } : null };
  }
  private uniqueByClass() { const u = zeroCounts(); for (const c of this.confirmed.values()) u[c]++; return u; }
  summary(seconds: number, inferMs: number): Summary {
    return { frames_processed: this.n, frames_read: this.n, processing_seconds: Math.round(seconds * 1000) / 1000, average_fps: seconds > 0 ? Math.round((this.n / seconds) * 100) / 100 : 0, inference_ms_per_frame: Math.round(inferMs * 10) / 10, unique_tracks_observed: this.confirmed.size, unique_by_class: this.uniqueByClass(), detection_instances_processed: this.instances,
      instances_by_class: this.classInst, peak_vehicles_visible: this.peak, line_crossings: this.p.line ? { ...this.cross, total: this.cross.a_to_b + this.cross.b_to_a } : null };
  }
}

export const BROWSER_LIMITS = { maxSeconds: 120, maxSamples: 600 };
export interface BrowserRunOpts { conf: number; sampleFps: number; minHits: number; line: Line | null; signal: AbortSignal; onFrame: (f: FrameRec, done: number, total: number) => void }

/** Process a video entirely in the browser by seeking to evenly spaced timestamps. Returns the summary (also when stopped early). */
export async function runBrowserVideo(src: string, detector: BrowserDetector, o: BrowserRunOpts): Promise<{ summary: Summary; stopped: boolean; width: number; height: number; duration: number }> {
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = src;
  await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error("The video could not be opened in this browser. Try an MP4 (H.264) or WebM file.")); });
  const dur = v.duration, w = v.videoWidth, h = v.videoHeight;
  if (!isFinite(dur) || dur <= 0 || !w || !h) throw new Error("The video has no readable duration or frame size.");
  if (dur > BROWSER_LIMITS.maxSeconds) throw new Error(`The browser engine processes clips up to ${BROWSER_LIMITS.maxSeconds} s (this one is ${dur.toFixed(0)} s). Trim it, or use the server engine.`);
  const total = Math.min(BROWSER_LIMITS.maxSamples, Math.max(1, Math.floor(dur * o.sampleFps)));
  const proc = new FrameProcessor({ conf: o.conf, fps: o.sampleFps, minHits: o.minHits, line: o.line, width: w, height: h });
  const t0 = performance.now(); let infer = 0, n = 0, stopped = false;
  for (let k = 0; k < total; k++) {
    if (o.signal.aborted) { stopped = true; break; }
    const t = Math.min(dur - 0.001, k / o.sampleFps);
    await new Promise<void>((res) => { const done = () => { v.removeEventListener("seeked", done); res(); }; v.addEventListener("seeked", done); v.currentTime = t; });
    const a = performance.now(); const dets = await detector.detect(v, w, h, o.conf); infer += performance.now() - a;
    n++; o.onFrame(proc.step(dets, k, t), n, total);
    if (k % 3 === 2) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  v.removeAttribute("src"); v.load();
  return { summary: proc.summary((performance.now() - t0) / 1000, n ? infer / n : 0), stopped, width: w, height: h, duration: dur };
}
