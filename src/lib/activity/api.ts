"use client";
/** Client for the FastAPI activity-review service (services/activity-monitor). Every call surfaces the service's own error message. */
import type { Alert, AlertStatus, FrameObs, Health, Params, SampleInfo, Summary, VideoStatus } from "./types";

export class ActivityApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new ActivityApiError(0, "The activity review service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ActivityApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
const json = (b: unknown, method = "POST"): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
export const activityApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  samples: () => j<{ samples: SampleInfo[] }>(base, "/api/samples", { cache: "no-store" }),
  upload: (src: File | { sampleId: string }) => { const f = new FormData(); if (src instanceof File) f.set("file", src); else f.set("sample_id", src.sampleId); return j<VideoStatus>(base, "/api/videos/upload", { method: "POST", body: f }); },
  process: (id: string, p: Partial<Params>) => j<VideoStatus>(base, `/api/videos/${id}/process`, json(p)),
  status: (id: string) => j<VideoStatus>(base, `/api/videos/${id}/status`, { cache: "no-store" }),
  cancel: (id: string) => j<{ status: string }>(base, `/api/videos/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/videos/${id}`, { method: "DELETE" }),
  summary: (id: string) => j<Summary>(base, `/api/videos/${id}/summary`, { cache: "no-store" }),
  alerts: (id: string) => j<{ alerts: Alert[] }>(base, `/api/videos/${id}/alerts`, { cache: "no-store" }),
  frames: (id: string) => j<{ width: number; height: number; analysed_fps: number; frames: FrameObs[] }>(base, `/api/videos/${id}/frames`, { cache: "no-store" }),
  reanalyse: (id: string, p: Pick<Params, "fall" | "aggression">, discard: boolean) => j<{ alerts: Alert[] }>(base, `/api/videos/${id}/reanalyse`, json({ ...p, discard_reviews: discard })),
  review: (alertId: string, status: AlertStatus, note: string) => j<Alert>(base, `/api/alerts/${alertId}/review`, json({ status, note })),
  videoUrl: (id: string, format: "mp4" | "webm" = "mp4") => `${base}/api/videos/${id}/video?format=${format}`,
  annotatedUrl: (id: string, alertId?: string) => `${base}/api/videos/${id}/annotated${alertId ? `?alert=${alertId}` : ""}`,
  exportUrl: (id: string, kind: "alerts.json" | "alerts.csv") => `${base}/api/videos/${id}/export?kind=${kind}`,
});
