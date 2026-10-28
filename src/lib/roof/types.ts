/** Shapes returned by the roof service (services/roof-analyzer) and stored for the bundled samples. Pixel coordinates are in the ORIGINAL image (origin top-left). */
export type XY = [number, number];
export interface PixelMeasures { area_px: number; perimeter_px: number; edge_lengths_px: number[] }
export interface MetricMeasures { available: boolean; reason?: string; area_m2?: number; perimeter_m?: number; edge_lengths_m?: number[]; bounding_rectangle_m?: { length: number; width: number }; meaning?: string; scale_kind?: string; scale_source?: string; area_m2_range_for_threshold_pm_0_1?: [number, number] }
export interface SurfaceMeasures { available: boolean; reason?: string; area_m2?: number; basis?: string; assumption?: string }
export interface PitchInfo { status: "supplied" | "not_measurable"; degrees?: number; rise_per_12?: number; source?: string; note?: string; reason?: string }
export interface Measurements { pixels: PixelMeasures; metric: MetricMeasures; surface: SurfaceMeasures; pitch: PitchInfo }
export interface Edge { p1: XY; p2: XY; length_px: number; angle_deg: number; kind: string; provenance: string; classification?: string; relation_to_outline?: string }
export interface Region {
  id: number; bbox: number[]; mask_area_px: number; polygon: XY[]; confidence: { mean_probability: number; p10_probability: number; meaning: string };
  area_px_range_for_threshold_pm_0_1: [number, number]; rectangle_fit: { center: XY; size_px: [number, number]; angle_deg: number; provenance: string }; solidity: number; touches_image_border: boolean;
  provenance: { mask: string; outline_polygon: string }; measurements: Measurements; features: { outline_edges: Edge[]; interior_edge_candidates: Edge[] };
}
export interface Georef { gsd_x_m: number; gsd_y_m: number; crs: string; note: string }
export interface ScaleDesc { kind: string | null; source?: string; meaning: string; note?: string; gsd_x_m?: number; gsd_y_m?: number }
export interface ImageResult {
  image: { name: string; width: number; height: number; format: string; georeference: Georef | null };
  model: { name: string; architecture: string; base_weights: string; fine_tuned_on: string; input: string };
  params: { threshold: number; min_area_px: number; model_scale: number; view: string; approx_roof_type: string | null };
  scale: ScaleDesc; pitch: PitchInfo; regions: Region[];
  summary: { regions: number; roof_fraction_of_image: number; total_area_px: number; total_area_m2?: number; total_area_meaning?: string; total_surface_area_m2?: number };
  features_status: { model_detected: string[]; derived: string[]; inferred: string[]; unavailable: Record<string, string> };
  needed_for_real_world_dimensions: string[]; warnings: string[]; timing: { model_seconds: number; total_seconds: number };
}
export interface ImageEntry { index: number; ok: boolean; result?: ImageResult; error?: string; name?: string }
export interface JobStatus { job_id: string; status: "queued" | "running" | "completed" | "cancelled" | "failed"; stage: string; error: string | null; images_total: number; images_done: number; progress: { fraction: number }; elapsed_seconds: number }
export interface JobResults extends JobStatus { images: ImageEntry[]; artifact_urls: Record<string, Record<string, string>>; session_note: string }
export interface SampleInfo { id: string; title: string; description: string; scenario: string; file: string; url: string; width: number; height: number; license: string; attribution: string; source: string; georeferenced: boolean; gsd_note?: string; preview: string; results?: string; artifacts?: Record<string, string> }

/** Scale specifications understood by the engine (mirrors services/roof-analyzer/app/measure.py). */
export type ScaleSpec =
  | { type: "none" } | { type: "geo" } | { type: "gsd"; gsd_m: number }
  | { type: "reference"; p1: XY; p2: XY; length_m: number }
  | { type: "plane_quad"; quad: XY[]; width_m: number; height_m: number };
export interface PitchSpec { rise_per_12?: number; degrees?: number }
