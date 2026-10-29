"use client";
/** Client for the FastAPI document service (services/document-ocr). Every call surfaces the service's own error message. */
import type { DocInfo, DocReview, Field, FieldStatus, Health, ProcessParams, Results, SampleInfo } from "./types";

export class DocsApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new DocsApiError(0, "The document service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new DocsApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
const json = (b: unknown, method = "POST"): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
export const docsApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  samples: () => j<{ samples: SampleInfo[] }>(base, "/api/samples", { cache: "no-store" }),
  upload: (src: File | { sampleId: string }) => { const f = new FormData(); if (src instanceof File) f.set("file", src); else f.set("sample_id", src.sampleId); return j<DocInfo>(base, "/api/documents/upload", { method: "POST", body: f }); },
  process: (id: string, p: ProcessParams) => j<DocInfo>(base, `/api/documents/${id}/process`, json(p)),
  status: (id: string) => j<DocInfo>(base, `/api/documents/${id}/status`, { cache: "no-store" }),
  cancel: (id: string) => j<{ status: string }>(base, `/api/documents/${id}/cancel`, { method: "POST" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/documents/${id}`, { method: "DELETE" }),
  results: (id: string) => j<Results>(base, `/api/documents/${id}/results`, { cache: "no-store" }),
  patchField: (id: string, fid: string, body: { value?: string; status?: FieldStatus; note?: string }) => j<Field>(base, `/api/documents/${id}/fields/${fid}`, json(body, "PATCH")),
  review: (id: string, status: DocReview, note: string) => j<{ status: DocReview; note: string; reviewed_at: number | null }>(base, `/api/documents/${id}/review`, json({ status, note })),
  exportUrl: (id: string, kind: "txt" | "json" | "csv" | "tables.csv" | "pdf") => `${base}/api/documents/${id}/export?kind=${kind}`,
  /** The service names downloads itself (Content-Disposition); the browser engine supplies a file name. */
  exportName: (_id: string, _kind: "txt" | "json" | "csv" | "tables.csv" | "pdf") => "",
});
