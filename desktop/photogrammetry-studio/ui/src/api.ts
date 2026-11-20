// Thin client for the local PhotoMesh Studio engine (FastAPI on 127.0.0.1). Every call goes to the real engine; nothing is simulated in the UI.
export type Stage = "original" | "cleaned" | "reconstructed" | "refined" | "preview" | "reference";
export interface StageSummary { kind: "cloud" | "mesh"; points?: number; vertices?: number; faces?: number; size: number[]; bbox_min: number[]; bbox_max: number[]; has_colors: boolean; has_normals?: boolean; has_texture?: boolean; file: string }
export interface HistoryItem { id: number; label: string; op: string; seconds: number; current: boolean; future: boolean }
export interface ProjectView { id: string; name: string; info: Record<string, any>; stages: Partial<Record<Stage, StageSummary>>; can_undo: boolean; can_redo: boolean; history: HistoryItem[]; entry_report: any; import?: any }
export interface JobView { id: string; project: string; op: string; state: "queued" | "running" | "done" | "error" | "cancelled"; stage: string; fraction: number; logs: { t: number; level: string; message: string }[]; result: any; error: string | null; elapsed: number }
export interface Preview { kind: "cloud" | "mesh"; center: number[]; bbox_min: number[]; bbox_max: number[]; decimated: boolean; count: number; total?: number; faces?: number; total_faces?: number; has_colors: boolean; positions: Float32Array; colors: Uint8Array | null; indices: Uint32Array | null }

export class ApiError extends Error {}
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) { let m = r.statusText; try { const b = await r.json(); m = typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail); } catch { /* keep status text */ } throw new ApiError(m); }
  return r.json();
}
const post = (u: string, body?: unknown) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const api = {
  capabilities: () => fetch("/api/capabilities").then((r) => j<any>(r)),
  defaults: () => fetch("/api/defaults").then((r) => j<any>(r)),
  presets: () => fetch("/api/presets").then((r) => j<Record<string, { label: string; description: string }>>(r)),
  preset: (n: string) => fetch(`/api/presets/${n}`).then((r) => j<any>(r)),
  newProject: (name = "Untitled project") => post("/api/projects", { name }).then((r) => j<ProjectView>(r)),
  project: (id: string) => fetch(`/api/projects/${id}`).then((r) => j<ProjectView>(r)),
  importFiles: (id: string, files: File[]) => { const f = new FormData(); files.forEach((x) => f.append("files", x)); return fetch(`/api/projects/${id}/import`, { method: "POST", body: f }).then((r) => j<ProjectView>(r)); },
  sample: (id: string, kind: string, points = 120000) => post(`/api/projects/${id}/sample`, { kind, points }).then((r) => j<ProjectView>(r)),
  run: (id: string, op: string, params: unknown) => post(`/api/projects/${id}/run`, { op, params }).then((r) => j<JobView>(r)),
  job: (id: string) => fetch(`/api/jobs/${id}`).then((r) => j<JobView>(r)),
  cancel: (id: string) => post(`/api/jobs/${id}/cancel`).then((r) => j<JobView>(r)),
  undo: (id: string) => post(`/api/projects/${id}/undo`).then((r) => j<ProjectView>(r)),
  redo: (id: string) => post(`/api/projects/${id}/redo`).then((r) => j<ProjectView>(r)),
  recommend: (id: string) => fetch(`/api/projects/${id}/recommend`).then((r) => j<any>(r)),
  inspect: (id: string, stage: Stage) => fetch(`/api/projects/${id}/stage/${stage}/inspect`).then((r) => j<any>(r)),
  report: (id: string, stage: Stage) => fetch(`/api/projects/${id}/stage/${stage}/report`).then((r) => j<any>(r)),
  deleteProject: (id: string) => fetch(`/api/projects/${id}`, { method: "DELETE" }),
  open: (file: File) => { const f = new FormData(); f.append("file", file); return fetch("/api/open", { method: "POST", body: f }).then((r) => j<ProjectView>(r)); },
  async preview(id: string, stage: Stage): Promise<Preview> {
    const r = await fetch(`/api/projects/${id}/stage/${stage}/preview`); if (!r.ok) throw new ApiError((await r.json().catch(() => ({ detail: r.statusText }))).detail);
    const buf = await r.arrayBuffer(); const hl = new DataView(buf).getUint32(0, true); const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))); let o = 4 + hl; const n = h.count;
    const positions = new Float32Array(buf.slice(o, o + n * 12)); o += n * 12; let colors: Uint8Array | null = null;
    if (h.has_colors) { colors = new Uint8Array(buf.slice(o, o + n * 3)); o += n * 3; }
    o += (4 - ((n * 12 + (h.has_colors ? n * 3 : 0)) % 4)) % 4; const indices = h.kind === "mesh" ? new Uint32Array(buf.slice(o, o + h.faces * 12)) : null;
    return { ...h, positions, colors, indices };
  },
  async exportStage(id: string, body: unknown) {
    const r = await post(`/api/projects/${id}/export`, body); if (!r.ok) throw new ApiError((await r.json().catch(() => ({ detail: r.statusText }))).detail);
    const name = /filename="?([^";]+)"?/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "export"; let notes: string[] = []; try { notes = JSON.parse(r.headers.get("X-Export-Notes") || "[]"); } catch { /* ignore */ }
    return { blob: await r.blob(), name, notes, faces: Number(r.headers.get("X-Export-Faces") || 0) };
  },
  async save(id: string) { const r = await fetch(`/api/projects/${id}/save`); if (!r.ok) throw new ApiError(r.statusText); const name = /filename="?([^";]+)"?/.exec(r.headers.get("Content-Disposition") || "")?.[1] || "project.pgproj"; return { blob: await r.blob(), name }; },
};
export function download(name: string, blob: Blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
