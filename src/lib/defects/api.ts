"use client";
/** Client for the FastAPI inspection service (services/defect-inspector). Every call surfaces the service's own error message. */
import type { Health, Inspection, ReferenceInfo, ReviewEntry, Rules, SampleImage, Summary } from "./types";

export class InspectApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new InspectApiError(0, "The inspection service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new InspectApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
const json = (b: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
export const inspectApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  references: () => j<{ references: ReferenceInfo[] }>(base, "/api/references", { cache: "no-store" }),
  reference: (id: string) => j<ReferenceInfo>(base, `/api/references/${id}`, { cache: "no-store" }),
  buildReference: (name: string, files: File[]) => { const f = new FormData(); f.set("name", name); files.forEach((x) => f.append("files", x)); return j<ReferenceInfo>(base, "/api/references", { method: "POST", body: f }); },
  deleteReference: (id: string) => j<{ deleted: boolean }>(base, `/api/references/${id}`, { method: "DELETE" }),
  samples: () => j<{ samples: SampleImage[] }>(base, "/api/sample-images", { cache: "no-store" }),
  inspect: (src: File | { sampleId: string }, referenceId: string, rules: Rules) => { const f = new FormData(); if (src instanceof File) f.set("file", src); else f.set("sample_id", src.sampleId); f.set("reference_id", referenceId); f.set("rules", JSON.stringify(rules)); return j<Inspection>(base, "/api/inspect", { method: "POST", body: f }); },
  list: () => j<{ inspections: Summary[] }>(base, "/api/inspections", { cache: "no-store" }),
  get: (id: string) => j<Inspection>(base, `/api/inspections/${id}`, { cache: "no-store" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/inspections/${id}`, { method: "DELETE" }),
  reevaluate: (id: string, rules: Rules) => j<Inspection>(base, `/api/inspections/${id}/reevaluate`, json({ rules })),
  review: (id: string, body: { action: "confirm" | "override"; decision?: string; notes: string; reviewer: string; region_reviews: Record<string, string> }) => j<Inspection>(base, `/api/inspections/${id}/review`, json(body)),
  image: (id: string, kind: "original" | "annotated" | "heatmap" | "thumb" | "dataset_annotation") => `${base}/api/inspections/${id}/images/${kind}`,
  pdf: (id: string) => `${base}/api/inspections/${id}/report.pdf`,
  reportJson: (id: string) => `${base}/api/inspections/${id}/report.json`,
});
export type { ReviewEntry };
