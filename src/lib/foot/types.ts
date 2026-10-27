/** Shared types for the foot measurement platform (browser and server). */
export type Side = "left" | "right";
export type PaperKind = "a4" | "letter";
export const PAPER_MM: Record<PaperKind, { w: number; h: number; label: string }> = { a4: { w: 297, h: 210, label: "A4 (297 × 210 mm)" }, letter: { w: 279.4, h: 215.9, label: "US Letter (279.4 × 215.9 mm)" } };

export interface Pt { x: number; y: number }
/** Raw pixel buffer. `ch` is 3 (RGB) or 4 (RGBA). */
export interface Img { w: number; h: number; ch: 3 | 4; data: Uint8Array | Uint8ClampedArray }

export interface ImageQuality { sharpness: number; sharpnessLabel: "sharp" | "soft" | "blurry"; brightness: number; lighting: "ok" | "dark" | "overexposed"; paperCoverage: number }
export interface Calibration {
  method: "auto-paper" | "manual-corners"; paper: PaperKind; paperAutoChosen: boolean;
  corners: Pt[]; // image pixel coordinates, ordered so that corners[0]->corners[1] is the long paper side
  tilt: number; // longest/shortest opposite-side ratio; 1 = camera looking straight down
  lineFitRmsPx: number; pxPerMm: number; estCameraDistanceMm: number; assumedFovDeg: number;
}
export interface FootMeasurement {
  lengthMm: number; widthMm: number; ballWidthMm: number; heelWidthMm: number; areaCm2: number; widthLengthRatio: number;
  /** Top-view parallax: the silhouette is above the paper plane, so it looks larger than it is. `rawLengthMm` is the uncorrected planar silhouette;
   *  the reported values are scaled by (d − h)/d using an ASSUMED silhouette height h and the estimated camera distance d.
   *  `parallaxBoundMm` is the remaining length uncertainty if h is wrong by ±ASSUMED_HEIGHT_UNCERTAINTY_MM — a bound from stated assumptions, not a statistical confidence. */
  rawLengthMm: number; rawWidthMm: number; parallaxScale: number; parallaxBoundMm: number; resolutionMm: number;
  axis: { angleDeg: number; toe: Pt; heel: Pt; widestAt: number; widestA: Pt; widestB: Pt };
  outlineMm: Pt[]; // simplified silhouette in paper-plane millimetres
}
export interface Analysis {
  ok: boolean; stage: "decoded" | "paper" | "segmentation" | "measured";
  reason?: string; // set when ok is false: plain-language explanation and what to do
  warnings: string[]; grade: "good" | "fair" | "poor" | "unusable";
  quality?: ImageQuality; calibration?: Calibration; measurement?: FootMeasurement;
  imageSize: { w: number; h: number };
}
export const ASSUMED_FOV_DEG = 65;
export const ASSUMED_SILHOUETTE_HEIGHT_MM = 25;
export const ASSUMED_HEIGHT_UNCERTAINTY_MM = 10;
