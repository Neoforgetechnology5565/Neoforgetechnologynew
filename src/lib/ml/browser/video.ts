"use client";
/** Video detection / pose jobs in the browser: frames are sampled by seeking, analysed, then replayed onto a canvas and recorded (MediaRecorder) as the annotated output. */
import { cleanName, err, fileOf, INFO, LIMITS, mk, ctx2, numOf, readUpload, sampleBlob, strOf, type Cvs } from "./core";
import { detectCanvas, drawDet, drawPose, poseFrame, type PosePerson } from "./vision";

export interface Job { id: string; kind: string; status: "running" | "completed" | "failed"; done: number; total: number; error: string | null; result: unknown; output: string | null; cancel: boolean }
export const jobs = new Map<string, Job>();
const seek = (v: HTMLVideoElement, t: number) => new Promise<void>((res) => { const d = () => { v.removeEventListener("seeked", d); res(); }; v.addEventListener("seeked", d); v.currentTime = t; });
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function videoInput(f: FormData): Promise<{ url: string; revoke: boolean }> {
  const file = fileOf(f, "file"), sid = strOf(f, "sample_id");
  if (file) { const u = await readUpload(file, LIMITS.max_video_mb, ["video"], "an MP4, MOV, WebM, MKV or AVI video"); return { url: URL.createObjectURL(u.blob), revoke: true }; }
  if (sid) { const { blob } = await sampleBlob(sid, "video"); return { url: URL.createObjectURL(blob), revoke: true }; }
  return err(400, "Send either a video file or a sample_id.");
}

export async function startVideoJob<R>(kind: "detect" | "pose", f: FormData, perFrame: (c: Cvs, w: number, h: number) => Promise<R>, draw: (c: Cvs, w: number, h: number, r: R) => Cvs, summarise: (frames: { t: number; r: R }[]) => Record<string, unknown>) {
  const fps = numOf(f, "analysed_fps", 3); if (fps < 1 || fps > 10) err(400, "analysed_fps must be between 1 and 10.");
  const { url, revoke } = await videoInput(f), job: Job = { id: crypto.randomUUID().replace(/-/g, ""), kind, status: "running", done: 0, total: 0, error: null, result: null, output: null, cancel: false }; jobs.set(job.id, job);
  (async () => {
    const t0 = performance.now(), v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    try {
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("The video could not be opened in this browser. Try an MP4 (H.264) or WebM file.")); });
      const dur = v.duration, W = v.videoWidth, H = v.videoHeight; if (!isFinite(dur) || dur <= 0) throw new Error("The video has no readable duration.");
      if (dur > LIMITS.max_video_seconds) throw new Error(`The video is ${dur.toFixed(0)} s long. This demo accepts up to ${LIMITS.max_video_seconds} s per video.`);
      const total = Math.min(LIMITS.max_frames, Math.max(1, Math.floor(dur * fps))); job.total = total;
      const cv = mk(W, H), g = ctx2(cv), frames: { t: number; r: R }[] = [];
      for (let i = 0; i < total && !job.cancel; i++) { const t = Math.min(dur - 0.001, i / fps); await seek(v, t + 0.5 / 30); g.drawImage(v, 0, 0, W, H); frames.push({ t: Math.round(t * 1000) / 1000, r: await perFrame(cv, W, H) }); job.done = i + 1; await tick(); }
      if (job.cancel) { job.status = "failed"; job.error = "Cancelled."; return; }
      // replay the analysed frames onto a canvas and record it, so the annotated video plays at the analysed frame rate
      let output: string | null = null;
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      if (mime) {
        const out = mk(W, H), og = ctx2(out), stream = out.captureStream(0), track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void }, rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 }), chunks: Blob[] = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); rec.start(250);
        for (const fr of frames) { await seek(v, Math.min(dur - 0.001, fr.t + 0.5 / 30)); g.drawImage(v, 0, 0, W, H); og.drawImage(draw(cv, W, H, fr.r), 0, 0); track.requestFrame?.(); await new Promise((r) => setTimeout(r, 1000 / fps)); }
        await new Promise<void>((res) => { rec.onstop = () => res(); rec.stop(); }); output = URL.createObjectURL(new Blob(chunks, { type: mime.split(";")[0] }));
      }
      const secs = Math.round(((performance.now() - t0) / 1000) * 100) / 100;
      job.result = { width: W, height: H, source_fps: 30, analysed_fps: fps, frames_analysed: frames.length, seconds: secs, ...summarise(frames) }; job.output = output; job.status = "completed";
    } catch (e) { job.status = "failed"; job.error = e instanceof Error ? e.message : "The video could not be analysed."; }
    finally { v.removeAttribute("src"); v.load(); if (revoke) URL.revokeObjectURL(url); }
  })();
  return { job_id: job.id, status: job.status };
}

export const jobStatus = (id: string) => { const j = jobs.get(id); if (!j) return err(404, "Job not found or expired."); return { job_id: j.id, kind: j.kind, status: j.status, progress: { done: j.done, total: j.total, fraction: j.status === "completed" ? 1 : j.total ? Math.min(0.99, j.done / j.total) : 0 }, error: j.error, result: j.status === "completed" ? j.result : null, output_url: j.status === "completed" ? j.output : null }; };
export const jobCancel = (id: string) => { const j = jobs.get(id); if (!j) return err(404, "Job not found or expired."); j.cancel = true; return { cancel_requested: true }; };

export function detectVideo(f: FormData) {
  const thr = numOf(f, "threshold", 0.35); if (thr < 0.05 || thr > 0.95) err(400, "threshold must be between 0.05 and 0.95.");
  return startVideoJob("detect", f, (c, w, h) => detectCanvas(c, w, h, thr), (c, w, h, r) => drawDet(c, w, h, r), (frames) => {
    const counts: Record<string, number> = {}, peak: Record<string, number> = {};
    for (const fr of frames) { const c: Record<string, number> = {}; for (const d of fr.r) { c[d.label] = (c[d.label] ?? 0) + 1; counts[d.label] = (counts[d.label] ?? 0) + 1; } for (const [k, v] of Object.entries(c)) peak[k] = Math.max(peak[k] ?? 0, v); }
    return { per_frame_counts: frames.map((x) => ({ t: x.t, n: x.r.length })), detection_instances_by_class: counts, max_in_one_frame: peak, threshold: thr, model: INFO.detector, note: "Counts are detections per analysed frame, not unique objects: there is no tracking in this demo, so the same object is counted in every frame it appears." };
  });
}
export function poseVideo(f: FormData) {
  const thr = numOf(f, "threshold", 0.35);
  return startVideoJob<PosePerson[]>("pose", f, (c, w, h) => poseFrame(c, w, h, thr), (c, w, h, r) => drawPose(c, w, h, r), (frames) => ({ frames_with_person: frames.filter((x) => x.r.length).length, frames_without_person: frames.filter((x) => !x.r.length).length, persons_per_frame: frames.map((x) => ({ t: x.t, n: x.r.length })), model: INFO.pose, note: "Pose is estimated independently in every analysed frame; people are not tracked between frames, and no activity is classified." }));
}
