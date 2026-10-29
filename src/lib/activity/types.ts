export interface Health { ok: boolean; ffmpeg: boolean; notice: string; models: Record<string, { name: string; licence: string; note?: string; trained_on?: string }>; active_jobs: number; limits: { max_video_mb: number; max_video_seconds: number; max_analysed_frames: number; max_concurrent_jobs: number } }
export interface SampleInfo { id: string; title: string; file: string; duration_s: number; resolution: string; source: string; licence: string; contains: string; demonstrates: string[]; does_not_demonstrate: string[]; video_url?: string }
export interface VideoStatus {
  video_id: string; status: "uploaded" | "queued" | "running" | "completed" | "cancelled" | "failed"; stage: string; source: string; error: string | null; error_detail: string | null;
  video: { width: number; height: number; fps: number; frames_estimate: number; duration_seconds: number; fps_assumed: boolean };
  progress: { frames_done: number; frames_total: number; fraction: number; elapsed_seconds: number };
  preview: "pending" | "ready" | "unavailable"; preview_done: boolean; preview_formats: ("mp4" | "webm")[]; alert_count: number | null; notice: string;
}
export type AlertStatus = "pending" | "confirmed" | "dismissed" | "uncertain";
export interface Evidence { name: string; value: number | string | boolean | null; threshold: string | null; met: boolean; note: string }
export interface Alert { id: string; kind: "fall" | "aggression"; title: string; tracks: number[]; t_start: number; t_end: number; t_peak: number; evidence: Evidence[]; notes: string[]; criteria_met: number; criteria_total: number; status: AlertStatus; note: string; reviewed_at: number | null }
export interface Summary extends VideoStatus {
  counts: { analysed_frames: number; person_observations: number; pose_runs: number; tracks: number; tracks_with_pose: number; alerts: number; alerts_by_kind: Record<string, number>; alerts_by_status: Record<AlertStatus, number> };
  analysed_fps: number; timing_seconds: { detect: number; pose: number; total: number }; tracks: { id: number; first_s: number; last_s: number; observations: number; with_pose: number }[];
  models: Health["models"]; limitations: string[]; warnings: string[]; params: Params;
}
export interface FallRules { min_upright_s: number; window_s: number; upright_tilt_deg: number; lying_tilt_deg: number; lying_aspect: number; min_drop_torso: number; drop_height_ratio: number; min_lying_s: number; min_visibility: number }
export interface AggressionRules { max_distance: number; min_arm_speed: number; min_duration_s: number; min_fraction: number; min_visibility: number }
export interface Params { sample_fps: number; det_threshold: number; pose: boolean; start_s?: number; end_s?: number | null; fall: FallRules; aggression: AggressionRules }
export interface FramePerson { id: number; box: [number, number, number, number]; score: number; kp: [number, number, number][] | null }
export interface FrameObs { t: number; f: number; persons: FramePerson[] }
export const DEFAULT_FALL: FallRules = { min_upright_s: 0.6, window_s: 1.5, upright_tilt_deg: 35, lying_tilt_deg: 60, lying_aspect: 1.2, min_drop_torso: 0.6, drop_height_ratio: 0.6, min_lying_s: 1, min_visibility: 0.5 };
export const DEFAULT_AGGR: AggressionRules = { max_distance: 1.2, min_arm_speed: 6, min_duration_s: 1, min_fraction: 0.5, min_visibility: 0.5 };
/** A deliberately loose setting: more candidates, many of them false alarms. Used to demonstrate review on footage that contains no real events. */
export const SENSITIVE_AGGR: AggressionRules = { ...DEFAULT_AGGR, min_arm_speed: 3 };
export const SENSITIVE_FALL: FallRules = { ...DEFAULT_FALL, upright_tilt_deg: 45, lying_tilt_deg: 50, min_drop_torso: 0.3, min_lying_s: 0.6 };
// the same 33-point BlazePose body connections as the service (indices)
export const BONES: [number, number][] = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]];
export const STATUS_LABEL: Record<AlertStatus, string> = { pending: "Pending review", confirmed: "Confirmed by reviewer", dismissed: "Dismissed", uncertain: "Uncertain" };
export const STATUS_STYLE: Record<AlertStatus, string> = { pending: "border-amber-500/50 bg-amber-500/10 text-amber-300", confirmed: "border-red-500/50 bg-red-500/10 text-red-300", dismissed: "border-slate-600 bg-slate-800 text-slate-300", uncertain: "border-violet-500/50 bg-violet-500/10 text-violet-300" };
