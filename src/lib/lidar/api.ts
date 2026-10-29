"use client";
/** Client for the FastAPI LiDAR service (services/lidar-wires). Every call surfaces the service's own error message. */
import type { CloudSummary, Health, Measurement, PointData, PointsMeta, Sample, Selector, VersionSummary, Wire } from "./types";

export class LidarApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new LidarApiError(0, "The LiDAR service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new LidarApiError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const lidarApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<Health>(base, "/api/health", { cache: "no-store" }),
  samples: () => j<{ samples: Sample[] }>(base, "/api/samples", { cache: "no-store" }),
  upload: (file: File, units?: string) => { const f = new FormData(); f.set("file", file); if (units) f.set("units", units); return j<CloudSummary>(base, "/api/pointcloud/upload", { method: "POST", body: f }); },
  fromSample: (id: string) => j<CloudSummary>(base, "/api/pointcloud/from-sample", post({ sample_id: id })),
  summary: (id: string) => j<CloudSummary>(base, `/api/pointcloud/${id}/summary`, { cache: "no-store" }),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/pointcloud/${id}`, { method: "DELETE" }),
  setUnits: (id: string, units: string) => j<CloudSummary>(base, `/api/pointcloud/${id}/units`, post({ units })),
  preprocess: (id: string, version: string, ops: object[]) => j<{ version: VersionSummary; steps: { op: string; before: number; after: number; seconds: number }[] }>(base, `/api/pointcloud/${id}/preprocess`, post({ version, ops })),
  deleteVersion: (id: string, v: string) => j<CloudSummary>(base, `/api/pointcloud/${id}/versions/${v}`, { method: "DELETE" }),
  classify: (id: string, version: string, body: object) => j<VersionSummary>(base, `/api/pointcloud/${id}/classify`, post({ version, ...body })),
  detectWires: (id: string, version: string, params: object) => j<{ version: VersionSummary; wires: Wire[]; diagnostics: Record<string, unknown> }>(base, `/api/pointcloud/${id}/detect-wires`, post({ version, params })),
  wires: (id: string, version: string) => j<{ wires: Wire[] }>(base, `/api/pointcloud/${id}/wires?version=${version}`, { cache: "no-store" }),
  measure: (id: string, version: string, a: Selector, b: Selector, label: string, threshold?: { value: number; unit: string }) => j<Measurement>(base, `/api/pointcloud/${id}/measure`, post({ version, a, b, label, threshold })),
  measurements: (id: string) => j<{ measurements: Measurement[] }>(base, `/api/pointcloud/${id}/measurements`, { cache: "no-store" }),
  deleteMeasurement: (id: string, m: string) => j<{ deleted: boolean }>(base, `/api/pointcloud/${id}/measurements/${m}`, { method: "DELETE" }),
  exportUrl: (id: string, kind: string, version?: string) => `${base}/api/pointcloud/${id}/export?kind=${kind}${version ? `&version=${version}` : ""}`,
  async points(id: string, version: string, maxPoints = 0): Promise<PointData> {
    const q = `version=${version}${maxPoints ? `&max_points=${maxPoints}` : ""}`;
    const meta = await j<PointsMeta>(base, `/api/pointcloud/${id}/points/meta?${q}`, { cache: "no-store" });
    let r: Response;
    try { r = await fetch(`${base}/api/pointcloud/${id}/points/data?${q}`, { cache: "no-store" }); } catch { throw new LidarApiError(0, "The LiDAR service could not be reached."); }
    if (!r.ok) throw new LidarApiError(r.status, "The points could not be loaded.");
    const buf = await r.arrayBuffer(); const n = meta.n; let o = 0;
    const xyz = new Float32Array(buf, o, n * 3); o += n * 12; const label = new Uint8Array(buf, o, n); o += n;
    let rgb: Uint8Array | null = null, intensity: Float32Array | null = null, hag: Float32Array | null = null;
    if (meta.has_rgb) { rgb = new Uint8Array(buf, o, n * 3); o += n * 3; }
    if (meta.has_intensity) { intensity = new Float32Array(buf.slice(o, o + n * 4)); o += n * 4; }
    if (meta.has_hag) { hag = new Float32Array(buf.slice(o, o + n * 4)); o += n * 4; }
    return { meta, xyz, label, rgb, intensity, hag };
  },
});
