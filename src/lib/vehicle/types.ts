/** Shared types for the vehicle detection / tracking / counting demonstration. Coordinates are pixels relative to the ORIGINAL frame (origin top-left). */
export type VClass = "car" | "motorcycle" | "bus" | "truck";
export const VCLASSES: VClass[] = ["car", "motorcycle", "bus", "truck"];
export const CLASS_LABEL: Record<VClass, string> = { car: "Cars", motorcycle: "Motorcycles", bus: "Buses", truck: "Trucks" };
export const CLASS_COLOR: Record<VClass, string> = { car: "#2899ff", motorcycle: "#ffdc3c", bus: "#5ad25a", truck: "#ff5a50" };
export type ClassCounts = Record<VClass, number>;
export const zeroCounts = (): ClassCounts => ({ car: 0, motorcycle: 0, bus: 0, truck: 0 });

export interface Det { track_id: number | null; class: VClass; detected_class: VClass; confidence: number; confirmed: boolean; bbox: { x1: number; y1: number; x2: number; y2: number } }
export interface Crossings { a_to_b: number; b_to_a: number; total: number }
export interface FrameRec {
  frame_number: number; frame_index: number; timestamp_seconds: number; vehicles_visible: number; tracked_visible: number; unique_tracks_observed: number; detection_instances_processed: number;
  detections: Det[]; class_counts: ClassCounts; unique_by_class: ClassCounts; line_crossings: Crossings | null;
}
export interface Summary {
  frames_processed: number; frames_read: number; processing_seconds: number; average_fps: number; inference_ms_per_frame: number; unique_tracks_observed: number; unique_by_class: ClassCounts;
  detection_instances_processed: number; instances_by_class: ClassCounts; peak_vehicles_visible: number; line_crossings: Crossings | null;
}
export interface Line { x1: number; y1: number; x2: number; y2: number } // normalised 0..1
export interface ImageResult { image: { width: number; height: number }; model: string; inference_ms: number; vehicles_visible: number; class_counts: ClassCounts; detections: Omit<Det, "confirmed" | "detected_class">[] }
export interface SampleInfo { id: string; title: string; description: string; width: number; height: number; fps: number; duration_seconds: number; license: string; attribution: string; source: string; url: string }

/** Pick the processed frame record that applies at playback time `t` (latest record not after t, with half a sampling interval of tolerance). */
export function frameAt(frames: FrameRec[], t: number): FrameRec | null {
  if (!frames.length) return null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].timestamp_seconds <= t + 1e-3) lo = mid; else hi = mid - 1; }
  return frames[lo].timestamp_seconds <= t + 1e-3 ? frames[lo] : null;
}
export function framesToCsv(frames: FrameRec[]): string {
  const rows = ["frame_number,timestamp_seconds,track_id,class,detected_class,confidence,confirmed,x1,y1,x2,y2"];
  for (const f of frames) for (const d of f.detections) rows.push([f.frame_number, f.timestamp_seconds, d.track_id ?? "", d.class, d.detected_class, d.confidence, d.confirmed ? 1 : 0, d.bbox.x1, d.bbox.y1, d.bbox.x2, d.bbox.y2].join(","));
  return rows.join("\n") + "\n";
}
