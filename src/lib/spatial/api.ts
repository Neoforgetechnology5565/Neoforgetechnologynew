"use client";
/** Client for the FastAPI spatial service (services/spatial-recon). Every call surfaces the service's own error message. */
import type { Artifact, JobResults, JobStatus } from "./types";

export class SpatialApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface Health { ok: boolean; pycolmap: string; depth_model: string | null; runtime: string; cuda: boolean; limits: { max_upload_mb: number; max_images: number; max_video_seconds: number; max_frames: number; max_import_mb: number; max_points: number }; notes: string[] }
async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new SpatialApiError(0, "The reconstruction service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new SpatialApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
export interface Params { max_frames: number; image_size: number; depth: boolean; densify: boolean; mesh: boolean }
export const spatialApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  reconstruct: (files: File[], p: Params) => { const f = new FormData(); files.forEach((x) => f.append("files", x)); f.set("params", JSON.stringify(p)); return j<JobStatus>(base, "/api/spatial/reconstruct", { method: "POST", body: f }); },
  importFile: (file: File) => { const f = new FormData(); f.set("file", file); return j<JobStatus>(base, "/api/spatial/import", { method: "POST", body: f }); },
  job: (id: string) => j<JobStatus>(base, `/api/spatial/jobs/${id}`, { cache: "no-store" }),
  results: (id: string) => j<JobResults>(base, `/api/spatial/jobs/${id}/results`, { cache: "no-store" }),
  artifacts: (id: string) => j<{ status: string; artifacts: Artifact[] }>(base, `/api/spatial/jobs/${id}/artifacts`, { cache: "no-store" }),
  process: (id: string, source: string, op: string, params: object) => j<{ artifact: Artifact; points_before: number; points_after: number }>(base, `/api/spatial/jobs/${id}/process`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, op, params }) }),
  cancel: (id: string) => j<{ status: string }>(base, `/api/spatial/jobs/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/spatial/jobs/${id}`, { method: "DELETE" }),
});
