"use client";
/** Client for the FastAPI sports service (services/sports-analyzer). Every call surfaces the service's own error message. */
import type { AnalysisParams, Health, JobStatus, Landmark, PitchMapping, Results, SampleInfo } from "./types";

export class SportsApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new SportsApiError(0, "The sports analysis service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new SportsApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
export interface CalibrationRequest { time: number; points: { id: string; x: number; y: number }[]; pitch_length: number; pitch_width: number }
export const sportsApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  samples: () => j<{ samples: SampleInfo[] }>(base, "/api/sports/samples", { cache: "no-store" }),
  pitch: (length: number, width: number) => j<{ landmarks: Landmark[] }>(base, `/api/sports/pitch?length=${length}&width=${width}`),
  analyze: (src: File | { sampleId: string }, p: AnalysisParams) => { const f = new FormData(); if (src instanceof File) f.set("file", src); else f.set("sample_id", src.sampleId); f.set("params", JSON.stringify(p)); return j<JobStatus>(base, "/api/sports/analyze", { method: "POST", body: f }); },
  job: (id: string) => j<JobStatus>(base, `/api/sports/jobs/${id}`, { cache: "no-store" }),
  results: (id: string) => j<Results>(base, `/api/sports/jobs/${id}/results`, { cache: "no-store" }),
  cancel: (id: string) => j<{ status: string }>(base, `/api/sports/jobs/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/sports/jobs/${id}`, { method: "DELETE" }),
  calibrate: (id: string, body: CalibrationRequest | { clear: true }) => j<Pick<Results, "pitch_mapping" | "tracks" | "frames" | "events" | "summary" | "pitch" | "warnings">>(base, `/api/sports/jobs/${id}/calibrate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  videoUrl: (id: string, format: "mp4" | "webm" = "mp4") => `${base}/api/sports/jobs/${id}/video?format=${format}`,
  frameUrl: (id: string, time: number) => `${base}/api/sports/jobs/${id}/frame?time=${time.toFixed(3)}`,
  csvUrl: (id: string, kind: "stats" | "tracks" | "ball" | "events") => `${base}/api/sports/jobs/${id}/export.csv?kind=${kind}`,
});
export type { PitchMapping };
