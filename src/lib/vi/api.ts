"use client";
/** Client for the video intelligence service (services/video-intel). Errors carry the service's own plain-language message. */
export class ViError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface ViSample { id: string; title: string; apps: string[]; duration_s: number; resolution: string; source: string; licence: string; contains: string; demonstrates: string[]; does_not_demonstrate: string[]; video_url: string }
export interface ViHealth { ok: boolean; models: Record<string, { name: string; licence?: string; note?: string }>; ffmpeg: boolean; notice: string; limits: Record<string, number> }
export interface VideoInfo { width: number; height: number; fps: number; duration_seconds: number; fps_assumed: boolean }
export interface VideoState {
  video_id: string; status: "uploaded" | "queued" | "running" | "completed" | "failed" | "cancelled"; stage: string; source: string; error: string | null; playback: "pending" | "ready" | "unavailable"; playback_formats: ("mp4" | "webm")[]; video: VideoInfo;
  progress: { frames_done: number; frames_total: number; fraction: number; elapsed_seconds: number }; params: Record<string, unknown> | null; summary: { analysed_frames: number; person_observations: number; tracks: number; ball_points: number; effective_fps: number; range_s: [number, number] } | null;
}
export interface Observations { width: number; height: number; effective_fps: number; frames: { t: number; persons: [number, number, number, number, number][]; ball: [number, number, string] | null }[]; tracks: TrackInfo[]; ball_points: BallPoint[] }
export interface TrackInfo { id: number; first_t: number; last_t: number; observations: number; observed_s: number; mean_score: number }
export interface BallPoint { t: number; x: number; y: number; src: string; conf: number }
export interface PresenceEvent { track_id: number; entry_t: number; exit_t: number; duration_s: number; observations: number; entry_observed: boolean; exit_observed: boolean; complete: boolean; status: string; flag: string | null; flag_note: string | null }
export interface RestaurantResult { events: PresenceEvent[]; ignored_short_events: number; threshold_s: number; merge_gap_s: number; summary: { events: number; tracks_in_area: number; flagged: number; incomplete: number; observed_area_seconds: number }; occupancy: { t: number; max_people_in_area: number }[]; tracks: TrackInfo[]; attendance?: Attendance; limits: string[] }
export interface Employee { id: string; name: string; role: string; shift_start: string; shift_end: string }
export interface Attendance { rows: { employee_id: string; name: string; role: string; shift: string; linked_tracks: number[]; shift_seconds_covered_by_video: number; observed_in_area_within_shift_s: number; events: number; status: string; explanation: string }[]; unlinked_tracks: number[]; note: string }
export interface Calibration { points: number; rms_error_m: number; max_error_m: number; warning?: string }
export interface TableTennisResult { calibration: Calibration; segments: { index: number; label: string; start_t: number; end_t: number; duration_s: number; ball_points: number; net_side_crossings: number; bounce_candidates: { t: number; table_x_m: number; table_y_m: number; half: string }[]; max_table_plane_speed_ms: number | null; median_table_plane_speed_ms: number | null }[]; ball: { detected_points: number; analysed_frames: number; visibility_pct: number; note: string }; players: TrackInfo[]; table_plane_points: { t: number; x_m: number; y_m: number; src: string }[] }
export interface BasketballResult { calibration: Calibration; heatmap: { cell_m: number; cols: number; rows: number; seconds: number[][]; court_m: [number, number]; note: string }; players: { id: number; observations_on_court: number; seconds_on_court: number; distance_m: number; implausible_jumps_excluded: number }[]; outside_court_observations: number; possession: { track_id: number; start_t: number; end_t: number; duration_s: number; observations: number; label: string; confidence: string; follows_track?: number | null }[]; possession_note: string; ball: { detected_points: number; on_court_plane: { t: number; x_m: number; y_m: number }[]; note: string } }
export interface Landmark { name: string; x_m: number; y_m: number }

async function j<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${base}${path}`, init); } catch { throw new ViError(0, "The video service could not be reached."); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ViError(r.status, typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? "The request was not valid." : `Request failed (${r.status})`);
  return body as T;
}
const post = <T,>(base: string, path: string, body: unknown) => j<T>(base, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const viApi = (base: string) => ({
  url: (p: string) => `${base}${p}`,
  health: () => j<ViHealth>(base, "/api/health", { cache: "no-store" }),
  samples: (app: string) => j<{ samples: ViSample[] }>(base, `/api/samples?app=${app}`, { cache: "no-store" }),
  landmarks: () => j<{ court_m: [number, number]; table_m: [number, number]; landmarks: Landmark[] }>(base, "/api/court-landmarks"),
  openSample: (id: string) => { const f = new FormData(); f.set("sample_id", id); return j<VideoState>(base, "/api/videos", { method: "POST", body: f }); },
  upload: (file: File) => { const f = new FormData(); f.set("file", file); return j<VideoState>(base, "/api/videos", { method: "POST", body: f }); },
  state: (id: string) => j<VideoState>(base, `/api/videos/${id}`, { cache: "no-store" }),
  start: (id: string, params: Record<string, unknown>) => post<VideoState>(base, `/api/videos/${id}/jobs`, params),
  cancel: (id: string) => post<VideoState>(base, `/api/videos/${id}/cancel`, {}),
  remove: (id: string) => j<{ deleted: boolean }>(base, `/api/videos/${id}`, { method: "DELETE" }),
  observations: (id: string) => j<Observations>(base, `/api/videos/${id}/observations`, { cache: "no-store" }),
  playbackUrl: (id: string, format: "mp4" | "webm" = "mp4") => `${base}/api/videos/${id}/playback?format=${format}`,
  frameUrl: (id: string, t: number, w = 960) => `${base}/api/videos/${id}/frame?t=${t.toFixed(3)}&w=${w}`,
  restaurant: (id: string, body: unknown) => post<RestaurantResult>(base, `/api/videos/${id}/analyze/restaurant`, body),
  tableTennis: (id: string, body: unknown) => post<TableTennisResult>(base, `/api/videos/${id}/analyze/tabletennis`, body),
  basketball: (id: string, body: unknown) => post<BasketballResult>(base, `/api/videos/${id}/analyze/basketball`, body),
  clip: (id: string, body: unknown) => post<{ clip_id: string; url: string; url_webm: string | null; has_mp4: boolean; t0: number; t1: number }>(base, `/api/videos/${id}/clip`, body),
  pdf: async (body: unknown) => { const r = await fetch(`${base}/api/report/pdf`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new ViError(r.status, "The PDF could not be created."); return r.blob(); },
});
export type ViApi = ReturnType<typeof viApi>;
