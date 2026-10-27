/** Shared types for the AI CCTV Intelligence & Security Analytics demo. Coordinates are normalised to 0..1 of the frame. */
export interface Det { cls: string; conf: number; box: [number, number, number, number]; tid?: number }
export interface Frame { i: number; t: number; dets: Det[] }
export interface Pt { x: number; y: number }
export interface Zone { id: string; name: string; points: Pt[]; classes: string[]; dwellSeconds: number }
export interface Line { id: string; name: string; a: Pt; b: Pt; classes: string[] }
export interface Settings {
  classes: string[]; minConf: number; sampleFps: number; zones: Zone[]; lines: Line[];
  trackMaxAgeSec: number; minTrackHits: number;
}
export type EventType = "object_first_seen" | "zone_enter" | "zone_exit" | "zone_dwell" | "line_cross";
export type Severity = "info" | "notice" | "review";
export type Review = "unreviewed" | "confirmed" | "dismissed";
export interface EventRec {
  id: string; jobId: string; type: EventType; t: number; frame: number; cls: string; conf: number; trackId: number;
  box: [number, number, number, number]; zone?: string; line?: string; direction?: "a_to_b" | "b_to_a"; dwellSeconds?: number;
  severity: Severity; message: string; review: Review;
}
export interface TrackSummary { id: number; cls: string; firstT: number; lastT: number; hits: number; avgConf: number; maxConf: number; path: [number, number][] }
export interface Stats {
  framesProcessed: number; durationSec: number; detectionsTotal: number; detectionsByClass: Record<string, number>; uniqueByClass: Record<string, number>;
  uniqueTotal: number; eventsTotal: number; eventsByType: Record<string, number>;
  series: { t: number; person: number; vehicle: number; other: number }[];
}
export interface Analysis { frames: Frame[]; tracks: TrackSummary[]; events: Omit<EventRec, "id" | "jobId" | "review">[]; stats: Stats }
export const VEHICLE_CLASSES = ["car", "truck", "bus", "motorcycle"];
export const SUPPORTED_CLASSES = ["person", "bicycle", "car", "motorcycle", "bus", "truck"];
export const DEFAULT_SETTINGS: Settings = { classes: ["person", "car", "truck", "bus", "motorcycle", "bicycle"], minConf: 0.4, sampleFps: 4, zones: [], lines: [], trackMaxAgeSec: 1.5, minTrackHits: 2 };
export const LIMITS = { maxFrames: 1500, maxUploadMb: 40, maxZones: 4, maxLines: 4, maxPoints: 12, minFps: 1, maxFps: 10 };
export const isVehicle = (c: string) => VEHICLE_CLASSES.includes(c);
