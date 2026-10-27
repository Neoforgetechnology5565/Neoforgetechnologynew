/** JSON shapes exchanged between the foot API and the browser. No server-only imports. */
import type { Analysis, PaperKind, Pt, Side } from "./types";
import type { Fit } from "./sizing";

export const FOOT_LIMITS = { maxFileBytes: 8 * 1024 * 1024, maxCapturesPerSession: 24, maxPerSide: 10, storedMaxSide: 1400, maxPixels: 80_000_000, objMaxBytes: 12 * 1024 * 1024, phoneTokenMinutes: 30 };
export const STAGES = ["Uploading", "Validating", "Preparing", "Calibrating", "Reconstructing", "Measuring", "Generating recommendations", "Completed", "Failed"] as const;
export type Stage = (typeof STAGES)[number];
export interface StageEvent { stage: Stage; at: number; ms?: number; note?: string }

export type CaptureSource = "camera" | "upload" | "sample";
export interface CaptureDTO {
  id: string; sessionId: string; side: Side; view: "top"; source: CaptureSource; filename: string; mime: string; bytes: number;
  width: number; height: number; createdAt: number; thumb: string;
  /** automatic analysis of the stored image */
  auto: Analysis;
  /** analysis after a person corrected the four paper corners; the automatic result above is kept untouched */
  manual?: Analysis;
  use: "auto" | "manual";
  job: { status: "completed" | "failed"; events: StageEvent[] };
  sampleTruth?: { lengthMm: number; widthMm: number; note: string };
  /** true when this capture is the one used for its side */
  active?: boolean;
}
export interface MeshAssetDTO { id: string; side: Side; kind: "imported-obj"; filename: string; unit: "mm" | "cm" | "m"; createdAt: number; measurement: { lengthMm: number; widthMm: number; heightMm: number; vertexCount: number; faceCount: number; notes: string[] } }
export interface SessionDTO {
  id: string; name: string; paper: PaperKind; fit: Fit; createdAt: number; updatedAt: number; expiresAt: number;
  status: "open" | "processed"; processedAt?: number; captureCount: number; phoneLinked: boolean; phoneExpiresAt?: number; meshes: MeshAssetDTO[];
  activeCapture: { left?: string; right?: string }; events: StageEvent[];
}
export interface SideResult { captureId: string; source: CaptureSource; method: "auto" | "manual"; grade: Analysis["grade"]; calibration: "calibrated"; lengthMm: number; widthMm: number; ballWidthMm: number; heelWidthMm: number; areaCm2: number; widthLengthRatio: number; rawLengthMm: number; parallaxBoundMm: number; warnings: string[]; outlineMm: Pt[]; axis: NonNullable<Analysis["measurement"]>["axis"]; sample: boolean }
