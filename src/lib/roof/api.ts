"use client";
/** Client for the FastAPI roof service (services/roof-analyzer). Every call surfaces the service's own error message. */
import type { JobResults, JobStatus, SampleInfo } from "./types";

export class RoofApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface Health { ok: boolean; model: string; runtime: string; limits: { max_file_mb: number; max_images: number; max_total_mb: number; max_pixels: number }; model_info: Record<string, string> }
async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new RoofApiError(0, "The analysis service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new RoofApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
export const roofApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  samples: async (): Promise<SampleInfo[]> => (await j<{ samples: (Omit<SampleInfo, "url"> & { image_url: string })[] }>(base, "/api/samples")).samples.map((s) => ({ ...s, url: `${base}${s.image_url}` })),
  analyze: (files: File[], sampleIds: string[], params: object) => { const f = new FormData(); files.forEach((x) => f.append("files", x)); if (sampleIds.length) f.set("sample_ids", sampleIds.join(",")); f.set("params", JSON.stringify(params)); return j<JobStatus>(base, "/api/roof/analyze", { method: "POST", body: f }); },
  job: (id: string) => j<JobStatus>(base, `/api/roof/jobs/${id}`, { cache: "no-store" }),
  results: (id: string) => j<JobResults>(base, `/api/roof/jobs/${id}/results`, { cache: "no-store" }),
  cancel: (id: string) => j<{ status: string }>(base, `/api/roof/jobs/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/roof/jobs/${id}`, { method: "DELETE" }),
});
