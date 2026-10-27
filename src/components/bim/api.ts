"use client";
import type { Plan3dModel } from "@/lib/bim/pipeline-types";

export class ApiError extends Error { constructor(public status: number, message: string, public body?: unknown) { super(message); } }
const STORE = "neoforge-bim-v1";
export interface Saved { id: string; key: string; name: string; demo: string; updatedAt: number }
export const saved = {
  list(demo?: string): Saved[] { try { const j = JSON.parse(localStorage.getItem(STORE) || "[]"); return (Array.isArray(j) ? j : []).filter((s: Saved) => !demo || s.demo === demo); } catch { return []; } },
  put(s: Saved) { try { const all = saved.list().filter((x) => x.id !== s.id); all.unshift(s); localStorage.setItem(STORE, JSON.stringify(all.slice(0, 40))); } catch { /* private mode */ } },
  remove(id: string) { try { localStorage.setItem(STORE, JSON.stringify(saved.list().filter((x) => x.id !== id))); } catch { /* ignore */ } },
};
export interface Auth { id: string; key: string }
export interface FileRec { id: string; name: string; format: string; role: string; size: number; sample: boolean; sampleId?: string; uploadedAt: number; validation: { ok: boolean; support: string; warnings: string[]; info: Record<string, string | number | boolean> } }
export interface ArtifactRec { id: string; name: string; format: string; mime: string; size: number; createdAt: number; kind: string; sample: boolean }
export interface JobRec { id: string; kind: string; status: "running" | "completed" | "failed"; stages: { stage: string; at: number; ms: number; note?: string }[]; startedAt: number; finishedAt?: number; error?: string; summary?: Record<string, unknown> }
export interface ProjectRec { id: string; demo: string; name: string; settings: Record<string, unknown>; files: FileRec[]; artifacts: ArtifactRec[]; jobs: JobRec[]; version: number; modelMeta?: Record<string, unknown>; createdAt: number; updatedAt: number; expiresAt: number; sampleOnly: boolean; role: string }
export interface SampleRec { id: string; demo: string; name: string; description: string; files: { name: string; role: string; format: string }[] }
export interface ComponentRow { id: string; kind: string; tag: string; category: string; system?: string; level?: string; summary: string }

async function req<T>(url: string, init: RequestInit & { auth?: Auth; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.auth ? { "x-bim-key": init.auth.key } : {}), ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...((init.headers as Record<string, string>) ?? {}) };
  let r: Response; try { r = await fetch(url, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }); } catch { throw new ApiError(0, "Network error: the server could not be reached."); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new ApiError(r.status, (j as { issues?: string[] }).issues?.join("; ") || (j as { error?: string }).error || `Request failed (${r.status})`, j); return j as T;
}
const B = (id: string) => `/api/bim/projects/${id}`;
export const api = {
  health: () => req<{ ok: boolean; limits: { maxUploadMb: number; extensions: string[] } }>("/api/bim/health"),
  samples: (demo: string) => req<{ samples: SampleRec[] }>(`/api/bim/samples?demo=${demo}`),
  create: (demo: string, name: string) => req<{ project: ProjectRec; key: string }>("/api/bim/projects", { method: "POST", json: { demo, name } }),
  list: (items: { id: string; key: string }[], demo: string) => req<{ projects: (Omit<ProjectRec, "files" | "artifacts" | "jobs"> & { fileCount: number; artifactCount: number })[] }>("/api/bim/projects/list", { method: "POST", json: { items, demo } }),
  get: (a: Auth) => req<{ project: ProjectRec }>(B(a.id), { auth: a }),
  patch: (a: Auth, b: Record<string, unknown>) => req<{ project: ProjectRec }>(B(a.id), { method: "PATCH", auth: a, json: b }),
  del: (a: Auth) => req<{ deleted: boolean }>(B(a.id), { method: "DELETE", auth: a }),
  sample: (a: Auth, sample: string) => req<{ files: FileRec[]; sample: { id: string; name: string } }>(`${B(a.id)}/samples`, { method: "POST", auth: a, json: { sample } }),
  upload(a: Auth, file: File | Blob, name: string, role: string, onProgress?: (f: number) => void): Promise<{ file: FileRec; validation: { warnings: string[]; support: string; info: Record<string, unknown> } }> {
    return new Promise((resolve, reject) => { const f = new FormData(); f.set("file", file, name); f.set("role", role); const x = new XMLHttpRequest(); x.open("POST", `${B(a.id)}/files`); x.setRequestHeader("x-bim-key", a.key); x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => { let j: { error?: string } = {}; try { j = JSON.parse(x.responseText); } catch { /* not json */ } if (x.status >= 200 && x.status < 300) resolve(j as never); else reject(new ApiError(x.status, j.error || `Upload failed (${x.status})`, j)); }; x.onerror = () => reject(new ApiError(0, "Network error during upload.")); x.send(f); });
  },
  delFile: (a: Auth, fid: string) => req<{ deleted: boolean }>(`${B(a.id)}/files/${fid}`, { method: "DELETE", auth: a }),
  process: (a: Auth, settings?: Record<string, unknown>) => req<{ job: JobRec; project: ProjectRec }>(`${B(a.id)}/process`, { method: "POST", auth: a, json: { settings } }).catch((e: ApiError) => { if (e.status === 422 && e.body && (e.body as { job?: JobRec }).job) return e.body as { job: JobRec; project: ProjectRec }; throw e; }),
  async model(a: Auth): Promise<Plan3dModel> { const r = await fetch(`${B(a.id)}/model`, { headers: { "x-bim-key": a.key } }); if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => ({}))).error || "No model"); return r.json(); },
  clashes: (a: Auth, clearance: number, tolerance: number) => req<{ clashes: Plan3dModel["clashes"]; info: Plan3dModel["clashInfo"]; ms: number }>(`${B(a.id)}/clashes`, { method: "POST", auth: a, json: { clearance, tolerance } }),
  components: (a: Auth, q: string, extra = "") => req<{ total: number; items: ComponentRow[] }>(`${B(a.id)}/components?q=${encodeURIComponent(q)}&limit=60${extra}`, { auth: a }),
  component: (a: Auth, id: string) => req<{ kind: string; element: Record<string, unknown>; clashes?: Plan3dModel["clashes"]; wall?: string }>(`${B(a.id)}/components/${encodeURIComponent(id)}`, { auth: a }),
  measure: (a: Auth, body: Record<string, unknown>) => req<Record<string, number | string>>(`${B(a.id)}/measurements`, { method: "POST", auth: a, json: body }),
  exportFormats: (a: Auth) => req<{ formats: { format: string; label: string; note: string }[]; artifacts: ArtifactRec[] }>(`${B(a.id)}/exports`, { auth: a }),
  makeExport: (a: Auth, format: string) => req<{ artifact: ArtifactRec; note: string }>(`${B(a.id)}/exports`, { method: "POST", auth: a, json: { format } }),
  async download(a: Auth, art: ArtifactRec) { const r = await fetch(`${B(a.id)}/artifacts/${art.id}`, { headers: { "x-bim-key": a.key } }); if (!r.ok) throw new ApiError(r.status, "Download failed"); const u = URL.createObjectURL(await r.blob()); const el = document.createElement("a"); el.href = u; el.download = art.name; el.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); },
  history: (a: Auth) => req<{ history: { version: number; at: number }[] }>(`${B(a.id)}/history`, { auth: a }),
  restore: (a: Auth, body: { version?: number; reset?: boolean }) => req<{ job: JobRec; project: ProjectRec }>(`${B(a.id)}/history`, { method: "POST", auth: a, json: body }),
};
