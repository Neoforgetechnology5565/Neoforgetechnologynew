import sharp from "sharp";
import { houseArchDxf, houseFilledSvg, houseMepDxf, houseSvg, HOUSE_MEP_CONFIG } from "./samples";
import { writeIfc } from "./ifcwrite";
import { parseDxf } from "./dxf";
import { buildFromDxf } from "./build";
import { extractMep } from "./mep";
import { DEFAULT_SETTINGS } from "./model";
import type { DemoKey } from "./server";

export interface SampleFile { name: string; role: string; format: string; make: () => Promise<Buffer> | Buffer }
export interface SampleDef { id: string; demo: DemoKey; name: string; description: string; files: SampleFile[]; settings?: Record<string, unknown>; truth?: Record<string, unknown> }
const buf = (s: string) => Buffer.from(s, "utf8");
export const SAMPLES: SampleDef[] = [
  { id: "house-2bed", demo: "plan3d", name: "Two-bedroom house with HVAC, plumbing and electrical", description: "Synthetic 10 × 8 m house (double-line walls, door swings, window symbols, room labels, dimensions) plus a separate MEP overlay drawing. Geometry is known exactly, so results can be checked by hand.", files: [{ name: "house-2bed-plan.dxf", role: "plan", format: "dxf", make: () => buf(houseArchDxf()) }, { name: "house-2bed-mep.dxf", role: "mep", format: "dxf", make: () => buf(houseMepDxf()) }], settings: { mep: HOUSE_MEP_CONFIG } },
  { id: "house-2bed-plan-only", demo: "plan3d", name: "Two-bedroom house — architecture only", description: "The same plan without MEP, to try the 2D → 3D conversion alone.", files: [{ name: "house-2bed-plan.dxf", role: "plan", format: "dxf", make: () => buf(houseArchDxf()) }] },
  { id: "house-svg", demo: "plan3d", name: "Two-bedroom house as SVG (wall faces)", description: "The wall layout as an SVG drawing (units: 1000 per metre).", files: [{ name: "house-2bed-plan.svg", role: "plan", format: "svg", make: () => buf(houseSvg()) }], settings: { svgUnitsPerMetre: 1000, layerMap: { "A-WALL": "wall" } } },
  { id: "house-raster", demo: "plan3d", name: "Two-bedroom house as a PNG image (inferred)", description: "A rendered image of the plan with filled walls, a text label and a dimension line (100 px per metre). Demonstrates image interpretation; geometry is inferred, not verified.", files: [{ name: "house-2bed-plan.png", role: "plan", format: "png", make: async () => sharp(Buffer.from(houseFilledSvg(100).svg)).png().toBuffer() }], settings: { rasterPxPerMetre: 100 } },
  { id: "house-ifc", demo: "plan3d", name: "Generated IFC4 model (round-trip)", description: "An IFC4 file written by this platform from the sample house, with MEP systems, to try IFC viewing and clash checks on IFC input.", files: [{ name: "house-2bed.ifc", role: "plan", format: "ifc", make: () => { const b = buildFromDxf(parseDxf(houseArchDxf()), DEFAULT_SETTINGS).building; const m = extractMep(parseDxf(houseMepDxf()), HOUSE_MEP_CONFIG, DEFAULT_SETTINGS); return buf(writeIfc(b, m.elements, { name: "House" }).text); } }] },
];
export const samplesFor = (demo: DemoKey) => SAMPLES.filter((s) => s.demo === demo);
