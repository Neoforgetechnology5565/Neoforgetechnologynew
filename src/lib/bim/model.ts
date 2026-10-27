/** Shared building-model types (metres). Everything the viewer, exporters, clash engine and reports consume. */
import type { V2, V3 } from "./geom";

export type Origin = "dxf" | "ifc" | "svg" | "image" | "derived" | "user" | "assumed";
export interface Source { origin: Origin; layer?: string; handle?: string; note?: string }
export interface Level { id: string; name: string; elevation: number; height: number }
export interface Opening { id: string; kind: "door" | "window" | "opening"; s: number; width: number; height: number; sill: number; source: Source; assumed: string[]; swing?: V2 }
export interface Wall {
  id: string; level: string; a: V2; b: V2; thickness: number; height: number; kind: "exterior" | "interior" | "unknown";
  openings: Opening[]; source: Source; assumed: string[];
}
export interface Room { id: string; level: string; name: string; nameSource: "text-label" | "generated"; polygon: V2[]; grossPolygon: V2[]; area: number; grossArea: number; perimeter: number; centroid: V2; source: Source; netValid: boolean; wallIds: string[] }
export interface Column { id: string; level: string; c: V2; w: number; d: number; round: boolean; height: number; source: Source; assumed: string[] }
export interface Stair { id: string; level: string; polygon: V2[]; dir: V2; width: number; run: number; treads: number; rise: number; source: Source; assumed: string[] }
export interface Slab { id: string; level: string; kind: "floor" | "ceiling" | "roof"; polygon: V2[]; z: number; thickness: number; source: Source; assumed: string[] }
export interface RoofInfo { type: "flat" | "gable" | "none"; pitchDeg?: number; ridge?: { a: V3; b: V3 }; note: string }

export type MepSystem = "supply-air" | "return-air" | "exhaust-air" | "water-cold" | "water-hot" | "drainage" | "vent" | "fire-protection" | "electrical-power" | "electrical-lighting" | "cable-tray" | "mechanical-pipe" | "equipment";
export type MepCategory = "duct" | "pipe" | "conduit" | "cable-tray" | "equipment" | "air-terminal" | "fitting" | "fixture" | "light" | "panel" | "valve" | "fan" | "sprinkler" | "switch" | "receptacle";
export interface MepSection { shape: "rect" | "round"; w: number; h: number }
export interface MepElement {
  id: string; tag: string; category: MepCategory; system: MepSystem; level: string;
  /** polyline for linear elements, single point for point elements (z = centre elevation) */
  path: V3[]; section: MepSection; size3?: { x: number; y: number; z: number; rotation: number };
  props: Record<string, string | number>; source: Source;
  /** which of the properties are assumptions (from layer configuration) rather than extracted */
  assumed: string[]; networkId?: string; connections: string[];
}
export interface MepLayerConfig { layer: string; system: MepSystem; category: MepCategory; elevation: number; width?: number; height?: number; diameter?: number; label?: string }

export interface Settings {
  unitsOverride?: number; layerMap: Record<string, string>; wallMode: "auto" | "outline" | "centerline";
  defaultWallThickness: number; thicknessRange: [number, number]; wallHeight: number; storeys: number; floorThickness: number; roofType: "flat" | "gable" | "none"; roofPitchDeg: number; parapet: number;
  doorHeight: number; doorWidth: number; windowSill: number; windowHeight: number; mep: MepLayerConfig[]; clearance: number; clashTolerance: number;
}
export const DEFAULT_SETTINGS: Settings = { layerMap: {}, wallMode: "auto", defaultWallThickness: 0.2, thicknessRange: [0.05, 0.6], wallHeight: 2.8, storeys: 1, floorThickness: 0.2, roofType: "flat", roofPitchDeg: 25, parapet: 0.3, doorHeight: 2.1, doorWidth: 0.9, windowSill: 0.9, windowHeight: 1.2, mep: [], clearance: 0.05, clashTolerance: 0.002 };

export interface Building {
  units: { name: string; toM: number; declared: boolean; ambiguous: boolean; note: string };
  levels: Level[]; walls: Wall[]; rooms: Room[]; columns: Column[]; stairs: Stair[]; slabs: Slab[]; roof: RoofInfo; extents: { x0: number; y0: number; x1: number; y1: number };
  warnings: string[]; assumptions: string[]; stats: Record<string, number>;
  scaleCheck?: { checked: number; agreeing: number; medianRatio: number };
}
/** One renderable element with a triangle mesh; `id` refers to the element in the building/MEP model. */
export interface MeshEl { id: string; cat: string; sys?: string; level?: string; pos: number[]; idx: number[]; name: string }
export interface Clash {
  id: string; type: "hard" | "clearance"; a: { id: string; cat: string; tag: string }; b: { id: string; cat: string; tag: string }; depth: number; distance: number; point: V3; box: { min: V3; max: V3 };
  severity: "high" | "medium" | "low" | "warning"; method: "oriented-box SAT" | "segment distance (round)" | "segment vs slab prism"; note?: string;
}
