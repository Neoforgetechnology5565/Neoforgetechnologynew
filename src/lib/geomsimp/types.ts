/** Types for the architectural-geometry simplification demo (CAD/BIM demo 22). Metres, Y up, X east, Z south (north = -Z). */
export type Vec3 = [number, number, number];
export type Cat = "wall" | "window" | "door" | "floor" | "roof" | "partition" | "shading";
export const CATS: Cat[] = ["wall", "window", "door", "floor", "roof", "partition", "shading"];
export const CAT_LABEL: Record<Cat, string> = { wall: "External walls", window: "Windows", door: "Doors", floor: "Floors", roof: "Roofs", partition: "Internal partitions", shading: "Shading objects" };
export type Side = "S" | "N" | "E" | "W";
export type ShadeKind = "overhang" | "tree" | "neighbour";

/** One piece of detailed (original) geometry. box: s = size; cyl: s = [radius, height, radius]; sph: s = [r, r, r]. */
export interface Solid { k: "box" | "cyl" | "sph"; c: Vec3; s: Vec3; rx?: number; part: string; g: string }
/** What the CAD system calls the object (simulated source attributes, used by the classifier). */
export interface Source { category: string; family: string; type: string }

export interface Elem {
  id: string; cat: Cat; name: string;
  /** 0..2 storeys, 3 = roof level, -1 = site (shading) */
  level: number;
  src: Source;
  solids: Solid[];
  /** Normal axis of the element's reference plane when it is a plate (walls, partitions, slabs); undefined for oriented or non-plate elements. */
  axis?: "x" | "y" | "z";
  sub?: ShadeKind;
}

export interface WallP { id: string; level: number; side: Side; thick: number }
export interface OpeningP { id: string; kind: "window" | "door"; host: string; u0: number; w: number; sill: number; h: number }
export interface PartP { id: string; level: number; axis: "x" | "z"; off: number; a0: number; a1: number; thick: number }
export interface FloorP { id: string; level: number }
export interface RoofP { id: string; insul: number }
export type ShadeP =
  | { id: string; sk: "overhang"; name: string; c: Vec3; size: Vec3; rx: number; type: string }
  | { id: string; sk: "tree"; x: number; z: number; trunk: number; r: number }
  | { id: string; sk: "neighbour"; x0: number; x1: number; z0: number; z1: number; h: number; face: Side };
export interface ZoneP { id: string; name: string; use: string; level: number; x0: number; x1: number; z0: number; z1: number }

export interface Model { name: string; walls: WallP[]; openings: OpeningP[]; parts: PartP[]; floors: FloorP[]; roof: RoofP; shades: ShadeP[]; zones: ZoneP[] }

export interface Surf {
  id: string; elem: string; cat: Cat; kind: string; level: number;
  verts: Vec3[]; normal: Vec3; area: number;
  /** degrees clockwise from north; null for horizontal surfaces */
  azimuth: number | null; tilt: number;
  boundary: "external" | "internal" | "ground" | "roof" | "shading";
  parent?: string; children: string[]; zones: string[];
  thickness: 0; source: Source;
}
export interface Line { id: string; elem: string; kind: string; a: Vec3; b: Vec3; length: number }

export interface Bound { src: string; kind: "external-wall" | "partition"; edge: "W" | "E" | "N" | "S"; overlap: [number, number]; gross: number; openings: { id: string; kind: "window" | "door"; area: number; azimuth: number | null }[]; net: number }
export interface ZoneResult {
  id: string; name: string; use: string; level: number; area: number; height: number; volume: number;
  floor: string; ceiling: string; bounds: Bound[];
  windowArea: number; doorArea: number; externalWallGross: number;
  windowByAzimuth: Record<"N" | "E" | "S" | "W", number>;
  /** every edge of the footprint is covered by wall/partition surfaces */
  closed: boolean; coverage: Record<"W" | "E" | "N" | "S", number>;
}
export interface Work { solids: number; faces: number; tris: number; removed: number; merged: number }
export interface UnitResult { surfaces: Surf[]; lines: Line[]; zone?: ZoneResult; work: Work; warnings: string[] }
