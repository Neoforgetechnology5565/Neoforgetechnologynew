"use client";
/** Client for the FastAPI vehicle service (services/vehicle-tracker). Every call surfaces the service's own error message. */
import type { FrameRec, ImageResult, Line, SampleInfo, Summary } from "./types";

export class VehicleApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface JobInfo {
  job_id: string; status: "queued" | "running" | "completed" | "cancelled" | "failed"; error: string | null; error_detail: string | null; source: string; model: string;
  video: { width: number; height: number; fps: number; frames_estimate: number; duration_seconds: number };
  progress: { frames_processed: number; total_frames_estimate: number; fraction: number; elapsed_seconds: number; live_fps: number };
  summary: Summary | null; outputs: { original: string; frames: string; result: string; csv: string; video_webm: string | null; video_mp4: string | null };
}
export interface Health { ok: boolean; model: string; runtime: string; ffmpeg: boolean; limits: { max_video_mb: number; max_image_mb: number; max_video_seconds: number; max_frames: number; max_concurrent_jobs: number } }

async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new VehicleApiError(0, "The processing service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new VehicleApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
export const vehicleApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  samples: async (): Promise<SampleInfo[]> => (await j<{ samples: (Omit<SampleInfo, "url"> & { video_url: string })[] }>(base, "/api/samples")).samples.map((s) => ({ ...s, url: `${base}${s.video_url}` })),
  detectImage: (file: File, conf: number) => { const f = new FormData(); f.set("file", file); f.set("conf", String(conf)); return j<ImageResult>(base, "/api/detect/image", { method: "POST", body: f }); },
  startVideo: (src: { file?: File; sampleId?: string }, o: { conf: number; stride: number; minHits: number; line: Line | null }) => {
    const f = new FormData(); if (src.file) f.set("file", src.file); if (src.sampleId) f.set("sample_id", src.sampleId);
    f.set("conf", String(o.conf)); f.set("stride", String(o.stride)); f.set("min_hits", String(o.minHits)); if (o.line) f.set("line", `${o.line.x1},${o.line.y1},${o.line.x2},${o.line.y2}`);
    return j<JobInfo>(base, "/api/detect/video", { method: "POST", body: f });
  },
  job: (id: string) => j<JobInfo>(base, `/api/jobs/${id}`, { cache: "no-store" }),
  frames: (id: string, start: number) => j<{ frames: FrameRec[]; next_start: number; status: string }>(base, `/api/jobs/${id}/frames?start=${start}&limit=500`, { cache: "no-store" }),
  stop: (id: string) => j<{ status: string }>(base, `/api/jobs/${id}/stop`, { method: "POST" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/jobs/${id}`, { method: "DELETE" }),
});
