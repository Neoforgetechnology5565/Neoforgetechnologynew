"use client";
import type { CaptureDTO, MeshAssetDTO, SessionDTO, StageEvent } from "@/lib/foot/api-types";
import type { Results } from "@/lib/foot/results";
import type { Recommendation, SizeResult, WidthClass } from "@/lib/foot/sizing";
import type { PaperKind, Pt, Side } from "@/lib/foot/types";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const STORE = "neoforge-foot-v1";
export interface Saved { id: string; key: string; name: string; updatedAt: number }
export const saved = {
  list(): Saved[] { try { const j = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(j) ? j : []; } catch { return []; } },
  put(s: Saved) { try { const all = saved.list().filter((x) => x.id !== s.id); all.unshift(s); localStorage.setItem(STORE, JSON.stringify(all.slice(0, 30))); } catch { /* private mode */ } },
  remove(id: string) { try { localStorage.setItem(STORE, JSON.stringify(saved.list().filter((x) => x.id !== id))); } catch { /* ignore */ } },
};

export interface Auth { id: string; key?: string; phone?: string }
const hdr = (a?: Auth): Record<string, string> => ({ ...(a?.key ? { "x-foot-key": a.key } : {}), ...(a?.phone ? { "x-foot-phone": a.phone } : {}) });
async function req<T>(url: string, init: RequestInit & { auth?: Auth; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...hdr(init.auth), ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...((init.headers as Record<string, string>) ?? {}) };
  let r: Response; try { r = await fetch(url, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }); } catch { throw new ApiError(0, "Network error: the server could not be reached."); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new ApiError(r.status, (j as { issues?: string[] }).issues?.join("; ") || (j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}
const B = (id: string) => `/api/foot/sessions/${id}`;
export interface Reco { size: SizeResult; width: ReturnType<typeof Object>; fitFoot: Results["fitFoot"]; recommendations: Recommendation[]; ruleset: { id: string; description: string }; disclaimer: string }
export const api = {
  health: () => req<{ ok: boolean; limits: { maxFileBytes: number; phoneTokenMinutes: number }; retentionHours: number; sizingRuleset: string }>("/api/foot/health"),
  create: (b: { name?: string; paper: PaperKind; fit: string }) => req<{ session: SessionDTO; key: string }>("/api/foot/sessions", { method: "POST", json: b }),
  list: (items: { id: string; key: string }[]) => req<{ sessions: SessionDTO[] }>("/api/foot/sessions/list", { method: "POST", json: { items } }),
  get: (a: Auth) => req<{ session: SessionDTO }>(B(a.id), { auth: a }),
  patch: (a: Auth, b: Record<string, unknown>) => req<{ session: SessionDTO }>(B(a.id), { method: "PATCH", auth: a, json: b }),
  del: (a: Auth) => req<{ deleted: boolean }>(B(a.id), { method: "DELETE", auth: a }),
  phoneLink: (a: Auth) => req<{ token: string; expiresAt: number }>(`${B(a.id)}/phone-link`, { method: "POST", auth: a, json: {} }),
  revokePhone: (a: Auth) => req<{ revoked: boolean }>(`${B(a.id)}/phone-link`, { method: "DELETE", auth: a }),
  captures: (a: Auth) => req<{ captures: CaptureDTO[]; activeCapture: { left?: string; right?: string } }>(`${B(a.id)}/captures`, { auth: a }),
  upload(a: Auth, file: Blob, name: string, side: Side, source: "camera" | "upload", paper: PaperKind | "auto", onProgress?: (f: number) => void): Promise<{ capture: CaptureDTO; uploadedBy: string }> {
    return new Promise((resolve, reject) => {
      const f = new FormData(); f.set("file", file, name); f.set("side", side); f.set("source", source); f.set("paper", paper);
      const x = new XMLHttpRequest(); x.open("POST", `${B(a.id)}/captures`); for (const [k, v] of Object.entries(hdr(a))) x.setRequestHeader(k, v);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onload = () => { let j: { error?: string; issues?: string[] } = {}; try { j = JSON.parse(x.responseText); } catch { /* not json */ } if (x.status >= 200 && x.status < 300) resolve(j as never); else reject(new ApiError(x.status, j.issues?.join("; ") || j.error || `Upload failed (${x.status})`)); };
      x.onerror = () => reject(new ApiError(0, "Network error during upload. Check the connection and retry.")); x.send(f);
    });
  },
  sample: (a: Auth, side: Side) => req<{ capture: CaptureDTO }>(`${B(a.id)}/samples`, { method: "POST", auth: a, json: { side } }),
  captureDel: (a: Auth, cid: string) => req<{ deleted: boolean }>(`${B(a.id)}/captures/${cid}`, { method: "DELETE", auth: a }),
  capturePatch: (a: Auth, cid: string, b: { use?: "auto" | "manual"; side?: Side }) => req<{ capture: CaptureDTO }>(`${B(a.id)}/captures/${cid}`, { method: "PATCH", auth: a, json: b }),
  calibrate: (a: Auth, cid: string, corners: Pt[], paper: PaperKind) => req<{ capture: CaptureDTO }>(`${B(a.id)}/captures/${cid}/calibration`, { method: "POST", auth: a, json: { corners, paper } }),
  uncalibrate: (a: Auth, cid: string) => req<{ capture: CaptureDTO }>(`${B(a.id)}/captures/${cid}/calibration`, { method: "DELETE", auth: a }),
  async imageUrl(a: Auth, cid: string): Promise<string> { const r = await fetch(`${B(a.id)}/captures/${cid}/image`, { headers: hdr(a) }); if (!r.ok) throw new ApiError(r.status, "Could not load the photo"); return URL.createObjectURL(await r.blob()); },
  process: (a: Auth) => req<{ status: string; events: StageEvent[]; results: Results }>(`${B(a.id)}/process`, { method: "POST", auth: a, json: {} }),
  results: (a: Auth, q = "") => req<{ session: SessionDTO; results: Results; meshes: MeshAssetDTO[] }>(`${B(a.id)}/results${q}`, { auth: a }),
  reco: (a: Auth, b: { fit: string; allowanceMm?: number }) => req<Reco>(`${B(a.id)}/recommendations`, { method: "POST", auth: a, json: b }),
  mesh: (a: Auth, text: string, side: Side, unit: string, filename: string) => req<{ mesh: MeshAssetDTO }>(`${B(a.id)}/mesh?side=${side}&unit=${unit}&filename=${encodeURIComponent(filename)}`, { method: "POST", auth: a, body: text, headers: { "content-type": "text/plain" } }),
  meshDel: (a: Auth) => req<{ deleted: boolean }>(`${B(a.id)}/mesh`, { method: "DELETE", auth: a }),
  reportUrl: (id: string, fmt: "json" | "csv") => `${B(id)}/report?format=${fmt}`,
  async download(a: Auth, fmt: "json" | "csv") { const r = await fetch(`${B(a.id)}/report?format=${fmt}`, { headers: hdr(a) }); if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => ({}))).error || "Report failed"); const u = URL.createObjectURL(await r.blob()); const el = document.createElement("a"); el.href = u; el.download = `foot-report-${a.id.slice(0, 8)}.${fmt}`; el.click(); URL.revokeObjectURL(u); },
};
export type { WidthClass };

/** Downscale very large phone photos before upload (keeps within the 8 MB limit). Falls back to the original file when the browser cannot decode it. */
export async function prepareImage(file: File | Blob, name: string): Promise<{ blob: Blob; name: string; note?: string }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions); const m = Math.max(bmp.width, bmp.height);
    if (m <= 2200 && file.size <= 6 * 1024 * 1024) { bmp.close(); return { blob: file, name }; }
    const k = Math.min(1, 2200 / m); const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9)); if (!blob) return { blob: file, name };
    return { blob, name: name.replace(/\.\w+$/, "") + ".jpg", note: `resized to ${c.width}×${c.height}` };
  } catch { return { blob: file, name }; }
}
export const fmtLen = (mm: number, unit: "mm" | "cm" | "in") => (unit === "mm" ? `${mm.toFixed(1)} mm` : unit === "cm" ? `${(mm / 10).toFixed(2)} cm` : `${(mm / 25.4).toFixed(2)} in`);
