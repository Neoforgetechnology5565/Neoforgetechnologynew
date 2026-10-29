"use client";
/** In-browser engine for the PPE demo: same API shape as ppeApi (the FastAPI service). YOLOX-tiny finds workers (the same model file and pre-processing as the server), ByteTrack follows them, Intel's worker_safety_mobilenet (converted to ONNX) looks for hard hats and vests on each worker, and the rules of rules.ts assess each worker. A port of services/ppe-monitor/app/pipeline.py. Nothing is uploaded. */
import { ByteTracker } from "@/lib/vehicle/tracker";
import type { VClass } from "@/lib/vehicle/types";
import { Yolox } from "@/lib/vision/yolox";
import { probeFps, snapFps } from "@/lib/vision/fps";
import { PpeApiError, type Health, type JobInfo, type Options } from "../api";
import { framesToCsv, type Assessment, type Det, type FrameRec, type ImageResult, type Summary } from "../types";
import { Assessor, HAT, VEST, associate, type Box4 } from "./rules";
import { SafetyGear } from "./safety";

const MAX_SECONDS = 180, MAX_FRAMES = 900, MAX_MB = 400, MAX_IMAGE_MB = 25;
const fail = (s: number, m: string): never => { throw new PpeApiError(s, m); };
const r1 = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const seek = (v: HTMLVideoElement, t: number) => new Promise<void>((res) => { const d = () => { v.removeEventListener("seeked", d); res(); }; v.addEventListener("seeked", d); v.currentTime = t; });
interface Models { person: Yolox; safety: SafetyGear }
let models: Promise<Models> | null = null; const load = () => (models ??= Promise.all([Yolox.create(), SafetyGear.create()]).then(([person, safety]) => ({ person, safety })).catch((e) => { models = null; throw e; }));
interface P { conf: number; ppeConf: number; stride: number; minHits: number; required: ("hard_hat" | "safety_vest")[]; zone: [number, number, number, number] | null }

/** One frame in, one record out; shared by the image path (no tracking, no smoothing) and the video path. */
class FrameAnalyzer {
  tracker: ByteTracker | null; assessor: Assessor; confirmed = new Set<number>(); flagged = new Set<number>(); instances = 0; zonePeak = 0; timing = { person: 0, ppe: 0, n: 0 };
  constructor(private m: Models, private p: P, outFps: number, private tracked: boolean) { this.tracker = tracked ? new ByteTracker(Math.max(0.5, p.conf + 0.1), Math.min(0.1, p.conf), 0.8, Math.max(5, Math.round(1.0 * outFps))) : null; this.assessor = new Assessor(p.required, 0.5, 96, tracked); }
  async run(src: CanvasImageSource, w: number, h: number, frameIndex: number, t: number): Promise<FrameRec> {
    const t0 = performance.now(), raw = await this.m.person.detect(src, w, h, [0], this.p.conf), people = raw.filter((d) => d.box[2] - d.box[0] >= 12 && d.box[3] - d.box[1] >= 24), t1 = performance.now(), boxes = people.map((d) => d.box as Box4), scores = people.map((d) => d.score), byDet = new Map<number, { trackId: number; hits: number }>();
    if (this.tracker) for (const tr of this.tracker.update(boxes, scores, people.map(() => "worker" as unknown as VClass))) byDet.set(tr.detIndex, { trackId: tr.trackId, hits: tr.hits });
    const ppe = associate(boxes, await this.m.safety.detect(src, w, h, boxes), 0.3), t2 = performance.now(); this.timing.person += t1 - t0; this.timing.ppe += t2 - t1; this.timing.n++;
    const z = this.p.zone ? [this.p.zone[0] * w, this.p.zone[1] * h, this.p.zone[2] * w, this.p.zone[3] * h] : null, dets: Det[] = [], counts: Record<Assessment, number> = { compliant: 0, potential_violation: 0, uncertain: 0 }, alive = new Set<number>(); let inZone = 0;
    people.forEach((d, i) => {
      const tr = byDet.get(i), tid = tr ? tr.trackId : null, confirmed = !!tr && tr.hits >= this.p.minHits; if (tid !== null) alive.add(tid); if (confirmed) this.confirmed.add(tid!);
      const bad = this.assessor.reliability(i, boxes, scores), a = this.assessor.assess(i, tid, ppe, bad, this.p.ppeConf, confirmed);
      if (this.tracked && !confirmed) { if (a.status === "potential_violation") a.status = "uncertain"; if (a.status === "uncertain" && !a.reasons.includes("track not yet confirmed")) a.reasons = ["track not yet confirmed", ...a.reasons.filter((r) => !r.endsWith("not detected"))]; }
      counts[a.status]++; if (a.status === "potential_violation" && tid !== null && confirmed) this.flagged.add(tid); if (z && z[0] <= (d.box[0] + d.box[2]) / 2 && (d.box[0] + d.box[2]) / 2 <= z[2] && z[1] <= d.box[3] && d.box[3] <= z[3]) inZone++;
      dets.push({ class: "worker", track_id: tid, confidence: r1(d.score, 4), confirmed, bbox: { x1: r1(d.box[0]), y1: r1(d.box[1]), x2: r1(d.box[2]), y2: r1(d.box[3]) }, ppe_assessment: a });
    });
    const tidOf = (i: number) => byDet.get(i)?.trackId ?? null; for (const b of ppe) { if (b.score < this.p.ppeConf) continue; dets.push({ class: b.kind, track_id: null, worker_track_id: tidOf(b.worker), confidence: r1(b.score, 4), bbox: { x1: r1(b.x1), y1: r1(b.y1), x2: r1(b.x2), y2: r1(b.y2) } }); }
    if (this.tracked) this.assessor.prune(alive); const hats = dets.filter((x) => x.class === HAT).length, vests = dets.filter((x) => x.class === VEST).length; this.instances += dets.length; this.zonePeak = Math.max(this.zonePeak, inZone);
    return { frame_number: frameIndex + 1, frame_index: frameIndex, timestamp_seconds: r1(t, 3), workers_visible: people.length, hard_hats_detected: hats, safety_vests_detected: vests, compliant_workers: counts.compliant, potential_ppe_violations: counts.potential_violation, uncertain_classifications: counts.uncertain, unique_worker_tracks: this.confirmed.size, unique_tracks_with_potential_violation: this.flagged.size, detection_instances_processed: this.instances, zone: this.p.zone ? { workers_inside: inZone, peak_workers_inside: this.zonePeak } : null, detections: dets };
  }
}
interface Job { id: string; source: string; url: string; fps: number; width: number; height: number; duration: number; frames: number; status: JobInfo["status"]; error: string | null; started: number; finished: number; cancel: boolean; recs: FrameRec[]; total: number; summary: Summary | null; params: P; latest: Record<string, unknown> | null; elapsed: number; fpsAssumed: boolean }
const jobs = new Map<string, Job>(); const need = (id: string) => jobs.get(id) ?? fail(404, "Job not found or expired.");
const info = (j: Job): JobInfo => ({ job_id: j.id, status: j.status, error: j.error, error_detail: null, source: j.source, person_model: "yolox_tiny (in-browser)", ppe_model: "worker_safety_mobilenet (ONNX, in-browser)", video: { width: j.width, height: j.height, fps: r1(j.fps, 3), frames_estimate: j.frames, duration_seconds: r1(j.duration, 2) },
  progress: { frames_processed: j.recs.length, total_frames_estimate: j.total, fraction: j.status === "completed" ? 1 : j.total ? Math.min(0.999, j.recs.length / j.total) : 0, elapsed_seconds: r1(((j.finished || Date.now()) - j.started) / 1000, 2), live_fps: j.elapsed > 0 ? r1(j.recs.length / j.elapsed, 2) : 0 }, summary: ["completed", "cancelled", "failed"].includes(j.status) ? j.summary : null,
  outputs: { original: j.url, frames: "", result: "", csv: "", video_webm: null, video_mp4: null } });
async function run(j: Job) {
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = j.url;
  try {
    j.status = "running"; const [m] = await Promise.all([load(), new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("The video could not be opened in this browser. Try an MP4 (H.264) or WebM file.")); })]);
    const c = document.createElement("canvas"); c.width = j.width; c.height = j.height; const g = c.getContext("2d", { willReadFrequently: true })!, an = new FrameAnalyzer(m, j.params, j.fps / j.params.stride, true), status: Record<Assessment, number> = { compliant: 0, potential_violation: 0, uncertain: 0 }; let peakW = 0, peakV = 0, read = 0; const t0 = performance.now();
    for (let k = 0; k < j.total; k++) {
      if (j.cancel) break; const idx = k * j.params.stride, t = idx / j.fps; await seek(v, Math.min(j.duration - 0.001, (idx + 0.5) / j.fps)); g.drawImage(v, 0, 0, j.width, j.height);
      const rec = await an.run(c, j.width, j.height, idx, t); j.recs.push(rec); read = idx + 1; for (const d of rec.detections) if (d.class === "worker") status[(d as { ppe_assessment: { status: Assessment } }).ppe_assessment.status]++; peakW = Math.max(peakW, rec.workers_visible); peakV = Math.max(peakV, rec.potential_ppe_violations);
      j.elapsed = (performance.now() - t0) / 1000; j.latest = { frame_number: rec.frame_number, timestamp_seconds: rec.timestamp_seconds, workers_visible: rec.workers_visible }; if (k % 2 === 1) await new Promise((r) => setTimeout(r, 0));
    }
    const el = (performance.now() - t0) / 1000, n = Math.max(1, an.timing.n); j.summary = { frames_processed: j.recs.length, frames_read: read, processing_seconds: r1(el, 3), average_fps: el > 0 && j.recs.length ? r1(j.recs.length / el, 2) : 0, person_detection_ms_per_frame: r1(an.timing.person / n), ppe_detection_ms_per_frame: r1(an.timing.ppe / n), unique_worker_tracks: an.confirmed.size, unique_tracks_with_potential_violation: an.flagged.size, detection_instances_processed: an.instances, peak_workers_visible: peakW, peak_potential_violations: peakV, worker_frame_assessments: status, required_ppe: j.params.required, zone: j.params.zone ? { peak_workers_inside: an.zonePeak } : null };
    j.status = j.cancel ? "cancelled" : "completed"; j.finished = Date.now();
  } catch (e) { j.status = "failed"; j.error = e instanceof Error ? e.message : "Processing failed."; j.finished = Date.now(); } finally { v.removeAttribute("src"); v.load(); }
}
export function browserPpe() {
  return {
    url: (p: string) => p,
    health: async (): Promise<Health> => ({ ok: true, person_model: "yolox_tiny (in-browser)", ppe_model: "worker_safety_mobilenet (ONNX, in-browser)", runtime: "ONNX Runtime Web (WebAssembly, CPU)", ffmpeg: false, limits: { max_video_mb: MAX_MB, max_image_mb: MAX_IMAGE_MB, max_video_seconds: MAX_SECONDS, max_frames: MAX_FRAMES, max_concurrent_jobs: 1 } }),
    samples: async () => [],
    detectImage: async (file: File, o: Options): Promise<ImageResult> => {
      if (!file.size) fail(400, "The file is empty."); if (file.size > MAX_IMAGE_MB * 1e6) fail(413, `The image is larger than the ${MAX_IMAGE_MB} MB limit.`); let bm: ImageBitmap; try { bm = await createImageBitmap(file); } catch { return fail(422, "The image could not be decoded. The file may be damaged."); }
      const m = await load(), c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; c.getContext("2d")!.drawImage(bm, 0, 0); bm.close(); const t0 = performance.now(), an = new FrameAnalyzer(m, { conf: o.conf, ppeConf: o.pconf, stride: 1, minHits: 1, required: o.required, zone: null }, 1, false), rec = await an.run(c, c.width, c.height, 0, 0);
      return { image: { width: c.width, height: c.height }, person_model: "yolox_tiny (in-browser)", ppe_model: "worker_safety_mobilenet (ONNX, in-browser)", inference_ms: Math.round(performance.now() - t0), workers_visible: rec.workers_visible, hard_hats_detected: rec.hard_hats_detected, safety_vests_detected: rec.safety_vests_detected, compliant_workers: rec.compliant_workers, potential_ppe_violations: rec.potential_ppe_violations, uncertain_classifications: rec.uncertain_classifications, detections: rec.detections };
    },
    startVideo: async (src: { file?: File; sampleId?: string }, o: Options): Promise<JobInfo> => {
      let f: File;
      if (src.file) f = src.file; else if (src.sampleId) { const mf = (await (await fetch("/ppe/samples/manifest.json")).json()).samples as { id: string; file: string; webm?: string }[], sm = mf.find((x) => x.id === src.sampleId) ?? fail(404, "Unknown sample."), h264 = !!document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'), name = !h264 && sm.webm ? sm.webm : sm.file, r = await fetch(`/ppe/samples/${name}`); if (!r.ok) fail(404, "The sample could not be loaded."); f = new File([await r.blob()], name, { type: /\.webm$/.test(name) ? "video/webm" : "video/mp4" }); } else return fail(400, "Send a video file or a sample id."); if (!f.size) fail(400, "The file is empty."); if (f.size > MAX_MB * 1e6) fail(413, `The file is larger than the ${MAX_MB} MB limit.`); if ([...jobs.values()].some((x) => x.status === "running")) fail(503, "Another analysis is running in this page. Wait for it or stop it.");
      const url = URL.createObjectURL(f), el = document.createElement("video"); el.preload = "metadata"; el.muted = true; el.src = url; try { await new Promise<void>((res, rej) => { el.onloadedmetadata = () => res(); el.onerror = () => rej(new Error("This video could not be read. Use an MP4 (H.264) or WebM file.")); }); } catch (e) { URL.revokeObjectURL(url); return fail(422, e instanceof Error ? e.message : "This video could not be read."); }
      const dur = el.duration, W = el.videoWidth, H = el.videoHeight; if (!isFinite(dur) || dur <= 0 || !W || !H) { URL.revokeObjectURL(url); fail(422, "The video has no readable duration or frame size."); } if (dur > MAX_SECONDS) { URL.revokeObjectURL(url); fail(422, `The video is ${dur.toFixed(0)} s long. The browser engine analyses up to ${MAX_SECONDS} s.`); }
      const measured = await probeFps(el), fps = measured ? snapFps(measured) : 25, stride = Math.max(1, Math.round(o.stride)), total = Math.floor((dur * fps) / stride); if (total > MAX_FRAMES) { URL.revokeObjectURL(url); fail(422, `That would analyse ${total} frames; the browser engine limit is ${MAX_FRAMES}. Raise the frame stride.`); }
      const zone: P["zone"] = o.zone ? [o.zone.x1, o.zone.y1, o.zone.x2, o.zone.y2] : null, j: Job = { id: crypto.randomUUID().replace(/-/g, ""), source: "upload", url, fps, width: W, height: H, duration: dur, frames: Math.round(dur * fps), status: "queued", error: null, started: Date.now(), finished: 0, cancel: false, recs: [], total, summary: null, params: { conf: o.conf, ppeConf: o.pconf, stride, minHits: 3, required: o.required, zone }, latest: null, elapsed: 0, fpsAssumed: !measured };
      jobs.set(j.id, j); void run(j); return info(j);
    },
    job: async (id: string) => info(need(id)),
    frames: async (id: string, start: number) => { const j = need(id), fr = j.recs.slice(start, start + 500); return { frames: fr, next_start: start + fr.length, status: j.status }; },
    stop: async (id: string) => { const j = jobs.get(id); if (j && (j.status === "running" || j.status === "queued")) j.cancel = true; return { status: j?.status ?? "unknown" }; },
    remove: async (id: string) => { const j = jobs.get(id); if (j) { URL.revokeObjectURL(j.url); jobs.delete(id); } return { deleted: true }; },
    resultCsv: (id: string) => { const j = jobs.get(id); return j ? `data:text/csv;charset=utf-8,${encodeURIComponent(framesToCsv(j.recs))}` : ""; },
  };
}
