import type { DocAnalysis } from "./analysis";
import type { Building, Clash, MepElement, MepLayerConfig, MeshEl, Settings } from "./model";
import type { IfcEl, IfcNode } from "./ifcread";

export interface NeedsInput { field: "unitsOverride" | "svgUnitsPerMetre" | "rasterPxPerMetre" | "mep"; question: string; options?: { label: string; value: number }[] }
export interface Plan3dModel {
  kind: "plan3d"; generatedAt: number; version: number; sample: boolean; inputs: { plan?: { name: string; format: string; support: string }; mep?: { name: string; format: string; support: string } };
  settings: Settings; needsInput: NeedsInput[]; building: Building | null; planAnalysis: DocAnalysis | null; mepAnalysis: DocAnalysis | null; raster?: { wallRects: number; thicknessPx: number; unexplainedShare: number };
  mep: { elements: MepElement[]; networks: { id: string; system: string; length: number; elements: string[] }[]; config: MepLayerConfig[]; guessed: boolean; annotationsUsed: number; source: "dxf" | "ifc" | "none" };
  ifc: { schema: string; project: string; lengthUnit: string; storeys: { id: number; name: string; elevation: number | null; count: number }[]; elements: IfcEl[]; tree: IfcNode | null; classes: Record<string, number>; triangles: number; systems: { id: number; name: string; count: number }[] } | null;
  meshes: MeshEl[]; clashes: Clash[]; clashInfo: { tested: number; method: string[]; clearance: number; tolerance: number; level: string };
  warnings: string[]; assumptions: string[]; limitations: string[]; provenance: { architecture: string; mep: string };
}
export const PLAN3D_LIMITATIONS = [
  "Geometry comes from the uploaded drawing; wall heights, door/window heights and sills, slab thickness and roof are configurable assumptions because a 2D plan does not carry them.",
  "Curved walls are not converted. Walls are straight segments with a constant thickness.",
  "MEP from a 2D drawing has no vertical routing: elevations and sizes come from drawing annotations where present, otherwise from per-layer configuration (shown as 'assumed'). Risers are not inferred.",
  "No airflow, pressure, heating/cooling load or equipment capacity is calculated or displayed. No code-compliance or structural check is performed.",
  "Clash detection covers boxes (exact), round vs round (exact) and round vs box (bounding box). It does not prove a model is clash-free.",
  "IFC input is displayed from the geometry web-ifc triangulates; clash checks on IFC elements use axis-aligned bounding boxes.",
  "Raster plans are interpreted by image processing (axis-aligned walls only); the result is inferred, not verified CAD geometry.",
];
