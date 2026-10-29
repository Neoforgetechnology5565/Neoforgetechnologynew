"use client";
/** Client for the FastAPI ML lab (services/ml-lab). Every call surfaces the service's own error message. */
export class MlApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface Sample { id: string; kind: string; file: string; title: string; description: string; provenance: string; licence: string }
export interface MlHealth { ok: boolean; models: Record<string, { name: string; source: string; licence: string }>; available: Record<string, boolean>; limits: Record<string, number> }

async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new MlApiError(0, "The ML service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new MlApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
export const form = (o: Record<string, string | number | boolean | File | null | undefined>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) f.set(k, v instanceof File ? v : String(v)); return f; };
export const mlApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<MlHealth>(base, "/api/health", { cache: "no-store" }),
  samples: (kind?: string) => j<{ samples: Sample[] }>(base, `/api/samples${kind ? `?kind=${kind}` : ""}`, { cache: "no-store" }),
  sampleUrl: (id: string) => `${base}/api/samples/${id}/file`,
  post: <T,>(path: string, body: FormData) => j<T>(base, path, { method: "POST", body }),
  get: <T,>(path: string) => j<T>(base, path, { cache: "no-store" }),
  del: <T,>(path: string) => j<T>(base, path, { method: "DELETE" }),
});
export type MlApi = ReturnType<typeof mlApi>;
export const download = (name: string, text: string, mime = "text/csv") => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
export const csvCell = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Saves a data: URL through a blob, which browsers handle reliably for large images. */
export const saveData = async (name: string, dataUrl: string) => { const b = await (await fetch(dataUrl)).blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
/** Cross-origin links ignore the download attribute, so fetch the file and save the blob. */
export const saveUrl = async (name: string, url: string) => { const b = await (await fetch(url)).blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
