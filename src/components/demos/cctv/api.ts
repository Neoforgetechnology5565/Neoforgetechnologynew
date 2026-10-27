"use client";
import type { Analysis, EventRec, Frame, Settings } from "@/lib/cctv/types";

export interface Caps {
  ffmpeg: boolean; serverless: boolean; workerInference: boolean; workerReason: string; browserInference: boolean;
  rtsp: { available: boolean; reason: string }; weaponDetection: { available: boolean; reason: string }; gpu: boolean; realtime: boolean;
  limits: { maxFrames: number; maxUploadMb: number; maxZones: number; maxLines: number; jobTtlHours: number; uploadTtlMinutes: number };
  detector: { name: string; runtime: string; license: string };
}
export interface SampleInfo { id: string; name: string; description: string; file: string; webm: string; durationSec: number; width: number; height: number; annotations: string }
export interface JobInfo { id: string; mode: "browser" | "worker" | "reference"; status: "created" | "receiving" | "processing" | "ready" | "failed"; error?: string; framesReceived: number; expectedFrames: number; settings: Settings; detector: { name: string; runtime: string; license: string; note?: string }; meta: { durationSec: number; width: number; height: number } }
export type Results = Omit<Analysis, "events"> & { job: JobInfo; events: (EventRec & { note?: string })[]; rawFrames: number };

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function req<T>(url: string, init?: RequestInit & { token?: string }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(init?.token ? { "x-job-token": init.token } : {}) };
  let r: Response;
  try { r = await fetch(url, { ...init, headers }); } catch { throw new ApiError(0, "Network error: the analysis server could not be reached."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (j as { error?: string; issues?: string[] }).issues?.join("; ") || (j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}
export const api = {
  caps: () => req<Caps>("/api/cctv/capabilities"),
  samples: () => req<{ samples: SampleInfo[] }>("/api/cctv/samples"),
  upload: (file: File) => { const f = new FormData(); f.set("file", file); return req<{ videoId: string; probe: { durationSec: number; width: number; height: number } | null; retention: string }>("/api/cctv/videos/upload", { method: "POST", body: f }); },
  createJob: (body: unknown) => req<JobInfo & { token: string }>("/api/cctv/jobs", { method: "POST", body: JSON.stringify(body) }),
  job: (id: string) => req<JobInfo>(`/api/cctv/jobs/${id}`),
  frames: (id: string, token: string, frames: Frame[]) => req<{ framesReceived: number }>(`/api/cctv/jobs/${id}/frames`, { method: "POST", token, body: JSON.stringify({ frames }) }),
  finalize: (id: string, token: string, ok = true, error?: string) => req<{ status: string }>(`/api/cctv/jobs/${id}/finalize`, { method: "POST", token, body: JSON.stringify({ ok, error }) }),
  process: (id: string, token: string) => req<{ status: string }>(`/api/cctv/jobs/${id}/process`, { method: "POST", token }),
  results: (id: string) => req<Results>(`/api/cctv/jobs/${id}/results`),
  analyze: (id: string, token: string, patch: Partial<Settings>) => req<Results>(`/api/cctv/jobs/${id}/analyze`, { method: "POST", token, body: JSON.stringify(patch) }),
  review: (id: string, token: string, eid: string, review: string, note?: string) => req<{ ok: boolean }>(`/api/cctv/jobs/${id}/events/${encodeURIComponent(eid)}`, { method: "PATCH", token, body: JSON.stringify({ review, note }) }),
  del: (id: string, token: string) => req<{ ok: boolean }>(`/api/cctv/jobs/${id}`, { method: "DELETE", token }),
};
