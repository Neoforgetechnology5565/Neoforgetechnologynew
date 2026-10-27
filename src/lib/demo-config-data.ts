/** Parameters, presets and the quantity/cost summary for the SketchUp Parametric Model Configurator demo. All values are sample data. */
export type Roof = "flat" | "gable" | "hip" | "shed";
export type WindowCfg = "none" | "standard" | "large" | "ribbon";
export type DoorCfg = "single" | "double" | "glazed";
export type Material = "render" | "brick" | "timber" | "concrete" | "metal";
export type RoofFinish = "slate" | "terracotta" | "zinc" | "green";

export interface Cfg {
  width: number; length: number; floors: number; floorHeight: number;
  roof: Roof; pitch: number; windows: WindowCfg; spacing: number; door: DoorCfg;
  material: Material; color: string; roofFinish: RoofFinish;
  balcony: boolean; porch: boolean; chimney: boolean; solar: boolean;
}

export const LIMITS = { width: [6, 20, 0.5], length: [6, 24, 0.5], floors: [1, 4, 1], floorHeight: [2.6, 4.2, 0.1], pitch: [8, 45, 1], spacing: [2.2, 5, 0.1] } as const;
export const MATERIALS: { key: Material; label: string; colors: string[]; rate: number }[] = [
  { key: "render", label: "Render", colors: ["#f1efe8", "#d9d2c3", "#b7c4cf", "#9fb59a"], rate: 85 },
  { key: "brick", label: "Brick", colors: ["#ffffff", "#e6c9a8", "#c9d0d6"], rate: 140 },
  { key: "timber", label: "Timber cladding", colors: ["#ffffff", "#d8b48a", "#7a5a3a"], rate: 120 },
  { key: "concrete", label: "Board-marked concrete", colors: ["#ffffff", "#d7d9d4"], rate: 160 },
  { key: "metal", label: "Metal panels", colors: ["#d5dadd", "#47535c", "#2b3a33"], rate: 150 },
];
export const ROOF_FINISHES: { key: RoofFinish; label: string; rate: number }[] = [
  { key: "slate", label: "Slate", rate: 95 }, { key: "terracotta", label: "Terracotta tile", rate: 85 }, { key: "zinc", label: "Standing-seam zinc", rate: 130 }, { key: "green", label: "Green roof", rate: 110 },
];

export const PRESETS: Record<string, { label: string; blurb: string; cfg: Cfg }> = {
  modern: { label: "Modern Residential", blurb: "Two-storey house, flat roof, large glazing, balcony and solar.", cfg: { width: 11, length: 9, floors: 2, floorHeight: 3, roof: "flat", pitch: 25, windows: "large", spacing: 3.6, door: "single", material: "render", color: "#f1efe8", roofFinish: "zinc", balcony: true, porch: true, chimney: false, solar: true } },
  commercial: { label: "Compact Commercial", blurb: "Three-storey office, ribbon glazing, metal panels, double doors.", cfg: { width: 16, length: 10, floors: 3, floorHeight: 3.6, roof: "flat", pitch: 12, windows: "ribbon", spacing: 3.4, door: "glazed", material: "metal", color: "#47535c", roofFinish: "zinc", balcony: false, porch: true, chimney: false, solar: true } },
  premium: { label: "Contemporary Premium", blurb: "Timber-clad two-storey home, shed roof, balcony and canopy.", cfg: { width: 14, length: 10, floors: 2, floorHeight: 3.2, roof: "shed", pitch: 12, windows: "large", spacing: 3.8, door: "double", material: "timber", color: "#d8b48a", roofFinish: "zinc", balcony: true, porch: true, chimney: false, solar: true } },
  classic: { label: "Classic Family Home", blurb: "Brick house with a gable roof, chimney and standard windows.", cfg: { width: 9, length: 12, floors: 2, floorHeight: 2.8, roof: "gable", pitch: 35, windows: "standard", spacing: 3.2, door: "single", material: "brick", color: "#ffffff", roofFinish: "slate", balcony: false, porch: true, chimney: true, solar: false } },
};
export const DEFAULT_CFG = PRESETS.modern.cfg;

export interface Layout { n: (len: number) => number; ww: number; wh: number; sill: number }
export function windowLayout(cfg: Cfg, len: number): { count: number; w: number; h: number; sill: number } {
  if (cfg.windows === "none") return { count: 0, w: 0, h: 0, sill: 0 };
  if (cfg.windows === "ribbon") return { count: 1, w: Math.max(1.5, len - 1.6), h: 0.95, sill: 1.1 };
  const count = Math.max(1, Math.floor((len - 1) / cfg.spacing));
  const bay = len / count;
  const big = cfg.windows === "large";
  return { count, w: Math.min(big ? 1.8 : 1.2, bay - 0.55), h: big ? 1.7 : 1.3, sill: big ? 0.5 : 0.9 };
}
export const doorSize = (d: DoorCfg) => (d === "single" ? { w: 1, h: 2.2 } : d === "double" ? { w: 1.8, h: 2.3 } : { w: 2.2, h: 2.4 });
export const rise = (cfg: Cfg) => (cfg.roof === "flat" ? 0.4 : cfg.roof === "gable" ? (cfg.width / 2) * Math.tan((cfg.pitch * Math.PI) / 180) : cfg.roof === "hip" ? Math.min(cfg.width, cfg.length) / 2 * Math.tan((cfg.pitch * Math.PI) / 180) : 0.3 + cfg.width * Math.tan((cfg.pitch * Math.PI) / 180));

export function summary(cfg: Cfg) {
  const H = cfg.floors * cfg.floorHeight;
  const footprint = cfg.width * cfg.length;
  const gia = (cfg.width - 0.6) * (cfg.length - 0.6) * cfg.floors;
  const perim = 2 * (cfg.width + cfg.length);
  const faceGross = perim * H;
  let winCount = 0, winArea = 0;
  for (const L of [cfg.width, cfg.width, cfg.length - 0.6, cfg.length - 0.6]) {
    const w = windowLayout(cfg, L);
    winCount += w.count * cfg.floors; winArea += w.count * cfg.floors * w.w * w.h;
  }
  const d = doorSize(cfg.door);
  // ground-floor front: one window bay is replaced by the door; upper floors: one by a balcony door when a balcony is fitted
  const fw = windowLayout(cfg, cfg.width);
  if (fw.count) { winCount -= 1; winArea -= fw.w * fw.h; }
  const balconyDoors = cfg.balcony && cfg.floors > 1 ? cfg.floors - 1 : 0;
  if (balconyDoors && fw.count) { winCount -= balconyDoors; winArea -= balconyDoors * fw.w * fw.h; }
  const doorCount = 1 + balconyDoors;
  const openings = winArea + d.w * d.h + balconyDoors * 1.2 * 2.2;
  const cladding = Math.max(0, faceGross - openings);
  const ov = 0.5;
  const r = rise(cfg);
  const roofArea = cfg.roof === "flat" ? (cfg.width + 2 * ov) * (cfg.length + 2 * ov)
    : cfg.roof === "gable" ? 2 * ((cfg.width / 2 + ov) / Math.cos((cfg.pitch * Math.PI) / 180)) * (cfg.length + 2 * ov)
    : cfg.roof === "shed" ? (cfg.width + 2 * ov) / Math.cos((cfg.pitch * Math.PI) / 180) * (cfg.length + 2 * ov)
    : (cfg.width + 2 * ov) * (cfg.length + 2 * ov) * 1.15;
  const panels = cfg.solar && cfg.roof !== "hip" ? Math.max(0, Math.floor(((cfg.roof === "gable" ? cfg.width / 2 : cfg.width) - 1) / 1.1) * Math.floor((cfg.length - 1) / 1.7)) : 0;
  const mat = MATERIALS.find((m) => m.key === cfg.material)!, rf = ROOF_FINISHES.find((m) => m.key === cfg.roofFinish)!;
  const lines: [string, number][] = [
    ["Structure and floors", gia * 900],
    [`${mat.label} cladding`, cladding * mat.rate],
    ["Windows", winArea * 420],
    ["Doors", d.w >= 1.8 ? 2400 + balconyDoors * 1800 : 1200 + balconyDoors * 1800],
    [`${rf.label} roof`, roofArea * rf.rate],
    ["Balcony", cfg.balcony && cfg.floors > 1 ? (cfg.floors - 1) * 3200 : 0],
    ["Porch canopy", cfg.porch ? 2800 : 0],
    ["Chimney", cfg.chimney ? 1500 : 0],
    ["Solar panels", panels * 320],
  ];
  const total = lines.reduce((s, l) => s + l[1], 0);
  return { H, footprint, gia, perim, faceGross, winCount, winArea, glazing: faceGross ? winArea / faceGross : 0, doorCount, cladding, roofArea, volume: cfg.width * cfg.length * H, rise: r, totalHeight: H + r, panels, lines, total };
}
