/** Shapes returned by services/sports-analyzer. Everything here comes from real processing; nothing is filled in client-side. */
export type Team = "team_a" | "team_b" | "other" | "uncertain";
/** [track id, x1, y1, x2, y2, confidence, team, pitch x (m) | null, pitch y (m) | null]; image coordinates are source-video pixels. */
export type PlayerRow = [number, number, number, number, number, number, Team, number | null, number | null];
/** [image x, image y, confidence (null when estimated), kind, pitch x | null, pitch y | null]. Pitch values assume the ball is on the ground. */
export type BallRow = [number, number, number | null, "observed" | "estimated", number | null, number | null];
export interface Frame { i: number; t: number; seg: number; p: PlayerRow[]; b: BallRow | null }

export interface PitchStats { status: "ok" | "insufficient"; mapped_observations: number; distance_m?: number; avg_speed_ms?: number | null; max_speed_ms?: number | null; excluded_segments?: number; counted_seconds?: number; reason?: string }
export interface TrackStat {
  track_id: number; team: Team; state: "active_at_end" | "ended"; observed_seconds: number; observations: number; first_seen_s: number; last_seen_s: number;
  image_distance_px: number; pitch: PitchStats | null; zone_seconds: number[] | null;
}
export interface EventRec { kind: string; t0: number; t1: number; track_id: number; team: Team | null; ball_observations: number; mean_distance_in_heights: number; confidence: "low" | "medium"; basis: string }
export interface Warning { level: "info" | "warning"; text: string }
export interface CalibrationInfo { points_used: number; rms_error_m: number; max_error_m: number; per_point_error_m: number[]; inliers: boolean[]; quality: "good" | "approximate" | "poor"; warnings: string[]; pitch_m: [number, number] }
export interface PitchMapping { status: "available" | "poor" | "unavailable"; reason: string | null; calibration?: CalibrationInfo; segment?: number; calibration_time_s?: number }
export interface TeamInfo { method: string; status: string; reason?: string; separation?: number; centroids_hex?: string[]; counts?: Record<string, number>; tracks_with_colour: number }
export interface Summary {
  samples_analysed: number; sampling_fps: number; source_fps: number; source_frames_decoded: number; analysed_seconds: number; processing_seconds: number; processing_fps: number | null; realtime_factor: number | null;
  timings: Record<string, number>; player_detections: number; tracks_found: number; tracks_kept: number; tracks_dropped_short: number; tracks_active_at_end: number; tracks_ended: number;
  players_per_sample: { mean: number; max: number; min: number };
  ball: { enabled: boolean; observed: number; estimated: number; missing: number; observed_rate: number; mapped_to_pitch: number };
  motion: { segments: number; camera: "fixed" | "moving"; max_centre_shift_px: number; max_step_corner_shift_px: number };
  detector_scale: number; median_player_height_px: number | null; fps_assumed: boolean;
}
export interface JobStatus {
  job_id: string; status: "queued" | "running" | "completed" | "cancelled" | "failed"; stage: string; source: string; error: string | null; error_detail: string | null;
  video: { width: number; height: number; fps: number; frames_estimate: number; duration_seconds: number; fps_assumed: boolean };
  progress: { samples_done: number; samples_total: number; fraction: number; elapsed_seconds: number; live_fps: number; player_detections: number };
  latest: { time_s: number; players_in_frame: number; ball_candidate_confidence: number | null; tracks_so_far: number } | null; preview: "pending" | "ready" | "unavailable"; preview_formats: ("mp4" | "webm")[]; summary: Summary | null;
}
export interface Results extends JobStatus {
  pitch_mapping: PitchMapping; teams: TeamInfo; frames: Frame[]; tracks: TrackStat[]; events: EventRec[]; ball_intervals: [number, number, "observed" | "estimated" | "missing"][];
  pitch: { length_m: number; width_m: number; heatmap: { cell_m: number; sigma_cells: number; method: string }; zones: string }; warnings: Warning[];
  model: { name: string; task: string; code_licence: string; trained_on: string; runtime: string }; methodology: Record<string, string>; limitations: string[];
}
export interface Landmark { id: string; x: number; y: number; label: string }
export interface Health { ok: boolean; model: Results["model"]; ffmpeg: boolean; limits: { max_video_mb: number; max_video_seconds: number; max_analysed_frames: number; max_concurrent_jobs: number } }
export interface SampleInfo { id: string; title: string; description: string; file: string; video_url: string; licence: string; source: string; attribution: string }
export interface AnalysisParams {
  sample_fps: number; start_s: number; end_s: number | null; player_conf: number; ball_conf: number; analyse_ball: boolean; team_mode: "auto" | "off" | "colors"; team_colors?: string[];
  pitch_length: number; pitch_width: number; match_label?: string; declared_duration_s?: number | null;
}
export const TEAM_COLOR: Record<Team, string> = { team_a: "#38bdf8", team_b: "#fb923c", other: "#a3a3a3", uncertain: "#e2e8f0" };
export const TEAM_LABEL: Record<Team, string> = { team_a: "Team A", team_b: "Team B", other: "Other (keeper/official/unclear)", uncertain: "Uncertain" };
