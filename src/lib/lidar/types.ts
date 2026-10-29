/** Shapes returned by services/lidar-wires. Coordinates are in the cloud's own system (float64 on the server); the viewer works in local coordinates plus an origin. */
export type Vec3 = [number, number, number];
export interface UnitsInfo { horizontal: string; vertical: string; known: boolean; crs: string | null; source: string; notes: string[]; label: string }
export interface Classification { source: "provided" | "heuristic"; kind: string; counts: Record<string, number>; seconds?: number; notes?: string[]; rules?: Record<string, string>; codes_present?: Record<string, number> }
export interface WireInfo { count: number; params: Record<string, number>; diagnostics: { candidates_height: number; candidates_linear: number; components: number; reason?: string; wires_found?: number; rejected: Record<string, number>; median_spacing?: number }; seconds: number; unit: string; honesty: string }
export interface VersionSummary {
  id: string; parent: string | null; description: string; points: number; bounds: { min: Vec3; max: Vec3; extent: Vec3 };
  attributes: { rgb: boolean; intensity: boolean; provided_classification: boolean; normals: boolean }; classification: Classification | null; ground_model: boolean; wires: WireInfo | null; log: { op: string; before: number; after: number; seconds: number }[];
  provided_codes?: Record<string, number>; intensity_range?: [number, number];
}
export interface Defaults { length_unit: string; assumed: boolean; note: string | null; preprocess: Record<string, number>; classify: Record<string, number>; wires: Record<string, number> }
export interface CloudSummary { id: string; name: string; created_at: number; info: Record<string, unknown>; units: UnitsInfo; extent: Vec3; versions: VersionSummary[]; defaults: Defaults; measurements: number; warnings: string[]; sample?: Sample }
export interface Sample { id: string; title: string; file: string; kind: "synthetic" | "real"; points: number; units: string | null; description: string; provenance: string; licence: string; demonstrates: string[]; does_not_demonstrate: string[] }
export interface Wire {
  id: string; support_points: number; endpoints: [Vec3, Vec3]; length: number; span_horizontal: number; curve_model: string; sag: number; rms_residual: number; max_residual: number; coverage: number; quality: "strong" | "moderate" | "weak";
  plan_direction_deg: number; method: string; limitations: string; curve?: Vec3[];
}
export interface Measurement {
  id: string; version: string; created_at: number; label: string; type: string; value: number; unit: string; units_known: boolean; value_m?: number; geometry: string[]; components: Record<string, number>; closest_points: [Vec3, Vec3]; method: string; status: string; notes: string[];
  threshold_check?: { status: string; threshold?: number; unit?: string; compared_value?: number; note: string };
}
export interface PointsMeta { version: string; n: number; total: number; decimated: boolean; origin: Vec3; local_min: Vec3; local_max: Vec3; has_rgb: boolean; has_intensity: boolean; has_hag: boolean; has_labels: boolean; intensity_range: [number, number] | null; label_names: Record<string, string>; units: UnitsInfo }
export interface PointData { meta: PointsMeta; xyz: Float32Array; label: Uint8Array; rgb: Uint8Array | null; intensity: Float32Array | null; hag: Float32Array | null }
export interface Health { ok: boolean; formats: Record<string, boolean>; limits: { max_file_mb: number; max_points: number; max_versions: number; ttl_seconds: number }; classification: string; wire_detection: string }
export type ColorMode = "height" | "hag" | "rgb" | "intensity" | "classification" | "flat";
export const LABELS = [0, 1, 2, 3, 4] as const;
export const LABEL_NAME: Record<number, string> = { 0: "unclassified", 1: "ground-like", 2: "vegetation-like", 3: "structure-like", 4: "wire-candidate" };
export const LABEL_COLOR: Record<number, string> = { 0: "#94a3b8", 1: "#a16207", 2: "#22c55e", 3: "#60a5fa", 4: "#f43f5e" };
export type Selector = { kind: "point"; xyz: Vec3 } | { kind: "wire"; id: string } | { kind: "ground" } | { kind: "object"; label: number; near?: Vec3; radius?: number };
