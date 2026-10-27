import { z } from "zod";

const num = (min: number, max: number) => z.number().min(min).max(max);
const mepCfg = z.object({ layer: z.string().min(1).max(120), system: z.enum(["supply-air", "return-air", "exhaust-air", "water-cold", "water-hot", "drainage", "vent", "fire-protection", "electrical-power", "electrical-lighting", "cable-tray", "mechanical-pipe", "equipment"]), category: z.enum(["duct", "pipe", "conduit", "cable-tray", "equipment", "air-terminal", "fitting", "fixture", "light", "panel", "valve", "fan", "sprinkler", "switch", "receptacle"]), elevation: num(-30, 100), width: num(0.005, 5).optional(), height: num(0.005, 5).optional(), diameter: num(0.005, 3).optional(), label: z.string().max(80).optional() });
export const settingsPatchSchema = z.object({
  unitsOverride: z.number().int().min(1).max(10).optional(), layerMap: z.record(z.string().max(120), z.enum(["wall", "door", "window", "column", "stair", "room-label", "dimension", "furniture", "mep", "ignore"])).optional(), wallMode: z.enum(["auto", "outline", "centerline"]).optional(),
  defaultWallThickness: num(0.05, 1.5).optional(), thicknessRange: z.tuple([num(0.02, 1), num(0.05, 2)]).optional(), wallHeight: num(1.5, 15).optional(), storeys: z.number().int().min(1).max(20).optional(), floorThickness: num(0.05, 1).optional(),
  roofType: z.enum(["flat", "gable", "none"]).optional(), roofPitchDeg: num(5, 60).optional(), parapet: num(0, 2).optional(), doorHeight: num(1.6, 4).optional(), doorWidth: num(0.5, 3).optional(), windowSill: num(0, 2).optional(), windowHeight: num(0.3, 3).optional(),
  mep: z.array(mepCfg).max(60).optional(), clearance: num(0, 1).optional(), clashTolerance: num(0, 0.05).optional(), svgUnitsPerMetre: num(0.001, 1e6).optional(), rasterPxPerMetre: num(1, 20000).optional(),
  overrides: z.record(z.string().max(40), z.record(z.string().max(20), num(-100, 100))).optional(),
}).strict();
/** Per-demonstration parameters (rule sets, rates, thresholds). Bounded in size; each processor validates the keys it reads. */
const paramsSchema = z.record(z.string().max(40), z.unknown()).refine((o) => JSON.stringify(o).length <= 40_000, "Parameters are too large");
export const anySettingsSchema = settingsPatchSchema.extend({ params: paramsSchema.optional() });
export type SettingsPatch = z.infer<typeof anySettingsSchema>;
