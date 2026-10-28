/** Shared types for the factory workforce / PPE monitoring demonstration. Coordinates are pixels relative to the ORIGINAL frame (origin top-left). */
export type Assessment = "compliant" | "potential_violation" | "uncertain";
export type ItemState = "detected" | "not_detected" | "uncertain";
export type PpeKind = "hard_hat" | "safety_vest";
export const PPE_KINDS: PpeKind[] = ["hard_hat", "safety_vest"];
export const PPE_LABEL: Record<PpeKind, string> = { hard_hat: "Hard hat", safety_vest: "Safety vest" };
export const STATUS_LABEL: Record<Assessment, string> = { compliant: "Compliant", potential_violation: "Potential PPE violation", uncertain: "Uncertain" };
export const STATUS_COLOR: Record<Assessment, string> = { compliant: "#5ac85a", potential_violation: "#eb4646", uncertain: "#f5be28" };
export const PPE_COLOR: Record<PpeKind, string> = { hard_hat: "#3caaff", safety_vest: "#ff78e6" };
export const STATE_LABEL: Record<ItemState, string> = { detected: "detected", not_detected: "not detected", uncertain: "uncertain" };

export interface BBox { x1: number; y1: number; x2: number; y2: number }
export interface ItemEval { state: ItemState; confidence: number | null }
export interface PpeAssessment { status: Assessment; items: Record<PpeKind, ItemEval>; reasons: string[]; reliable_view: boolean; confirmed: boolean }
export interface WorkerDet { class: "worker"; track_id: number | null; confidence: number; confirmed: boolean; bbox: BBox; ppe_assessment: PpeAssessment }
export interface PpeDet { class: PpeKind; track_id: null; worker_track_id: number | null; confidence: number; bbox: BBox }
export type Det = WorkerDet | PpeDet;
export const isWorker = (d: Det): d is WorkerDet => d.class === "worker";

export interface FrameRec {
  frame_number: number; frame_index: number; timestamp_seconds: number;
  workers_visible: number; hard_hats_detected: number; safety_vests_detected: number; compliant_workers: number; potential_ppe_violations: number; uncertain_classifications: number;
  unique_worker_tracks: number; unique_tracks_with_potential_violation: number; detection_instances_processed: number;
  zone: { workers_inside: number; peak_workers_inside: number } | null; detections: Det[];
}
export interface Summary {
  frames_processed: number; frames_read: number; processing_seconds: number; average_fps: number; person_detection_ms_per_frame: number; ppe_detection_ms_per_frame: number;
  unique_worker_tracks: number; unique_tracks_with_potential_violation: number; detection_instances_processed: number; peak_workers_visible: number; peak_potential_violations: number;
  worker_frame_assessments: Record<Assessment, number>; required_ppe: PpeKind[]; zone: { peak_workers_inside: number } | null;
}
export interface Zone { x1: number; y1: number; x2: number; y2: number } // normalised 0..1, x1<x2, y1<y2
export interface ImageResult {
  image: { width: number; height: number }; person_model: string; ppe_model: string; inference_ms: number;
  workers_visible: number; hard_hats_detected: number; safety_vests_detected: number; compliant_workers: number; potential_ppe_violations: number; uncertain_classifications: number; detections: Det[];
}
export interface SampleInfo { id: string; title: string; description: string; scenarios: string; width: number; height: number; fps: number; duration_seconds: number; license: string; attribution: string; source: string; url: string; results?: string; processed?: string; processed_webm?: string }

/** Pick the processed frame record that applies at playback time `t` (latest record not after t). */
export function frameAt(frames: FrameRec[], t: number): FrameRec | null {
  if (!frames.length) return null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].timestamp_seconds <= t + 1e-3) lo = mid; else hi = mid - 1; }
  return frames[lo].timestamp_seconds <= t + 1e-3 ? frames[lo] : null;
}
const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export function framesToCsv(frames: FrameRec[]): string {
  const rows = ["frame_number,timestamp_seconds,class,worker_track_id,confidence,assessment,hard_hat,safety_vest,reasons,x1,y1,x2,y2"];
  for (const f of frames) for (const d of f.detections) {
    const b = d.bbox;
    if (isWorker(d)) rows.push([f.frame_number, f.timestamp_seconds, "worker", d.track_id ?? "", d.confidence, d.ppe_assessment.status, d.ppe_assessment.items.hard_hat.state, d.ppe_assessment.items.safety_vest.state, q(d.ppe_assessment.reasons.join("; ")), b.x1, b.y1, b.x2, b.y2].join(","));
    else rows.push([f.frame_number, f.timestamp_seconds, d.class, d.worker_track_id ?? "", d.confidence, "", "", "", "", b.x1, b.y1, b.x2, b.y2].join(","));
  }
  return rows.join("\n") + "\n";
}
