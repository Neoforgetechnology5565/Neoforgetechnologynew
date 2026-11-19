/** Photogrammetry clean-up demo (CV demo 26). Coordinates are Float64 and are never re-centred or rescaled: the output is in the input's coordinate system and units. */
export interface Cloud { pos: Float64Array; colors?: Uint8Array; normals?: Float64Array }
export interface Mesh { pos: Float64Array; idx: Uint32Array; colors?: Uint8Array }
export interface Parsed { cloud: Cloud | null; mesh: Mesh | null; format: string; vertexCount: number; faceCount: number; notes: string[] }
export type Unit = "m" | "mm" | "cm" | "ft" | "in";
export const UNIT_PER_M: Record<Unit, number> = { m: 1, cm: 100, mm: 1000, ft: 3.280839895, in: 39.37007874 };
export interface Params {
  unit: Unit;
  /** cleaning */
  outlierK: number; outlierStd: number; floatingFraction: number;
  /** reconstruction (point clouds): average number of scan points per surface cell (more = smoother but coarser), small-gap filling, planar snap tolerance in millimetres (0 = off) */
  pointsPerCell: number; fillIterations: number; snapMm: number;
  /** smoothing: Taubin iterations (0 = off), feature angle in degrees that locks edges, and the largest distance in millimetres any vertex may move */
  smoothIterations: number; featureAngle: number; maxMoveMm: number;
  /** simplification: keep this fraction of triangles at most, but never create more than errorMm of deviation (0 = ratio only) */
  keepRatio: number; errorMm: number;
  /** pass/fail tolerance for the validation report, in millimetres */
  toleranceMm: number;
}
export const DEFAULT_PARAMS: Params = { unit: "m", outlierK: 12, outlierStd: 2.5, floatingFraction: 0.02, pointsPerCell: 6, fillIterations: 3, snapMm: 8, smoothIterations: 6, featureAngle: 40, maxMoveMm: 6, keepRatio: 0.12, errorMm: 6, toleranceMm: 20 };
export interface StageInfo { name: string; detail: string; ms: number }
