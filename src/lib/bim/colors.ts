import type { MeshEl } from "./model";

export const CAT_COLOR: Record<string, [number, number, number]> = {
  "wall-exterior": [0.86, 0.84, 0.8], "wall-interior": [0.93, 0.92, 0.9], door: [0.55, 0.36, 0.2], window: [0.55, 0.75, 0.9], "slab-floor": [0.7, 0.7, 0.72], roof: [0.62, 0.34, 0.3], column: [0.6, 0.6, 0.62], stair: [0.8, 0.72, 0.55], space: [0.4, 0.7, 0.55],
  "mep-duct": [0.2, 0.55, 0.85], "mep-equipment": [0.9, 0.55, 0.15], "mep-air-terminal": [0.2, 0.8, 0.75], "mep-fitting": [0.3, 0.4, 0.8], "mep-pipe": [0.2, 0.65, 0.3], "mep-conduit": [0.9, 0.8, 0.1], "mep-cable-tray": [0.85, 0.65, 0.1], "mep-light": [1, 0.95, 0.5],
};
export const SYS_COLOR: Record<string, [number, number, number]> = { "supply-air": [0.15, 0.5, 0.95], "return-air": [0.95, 0.5, 0.15], "exhaust-air": [0.6, 0.35, 0.8], "water-cold": [0.1, 0.7, 0.9], "water-hot": [0.9, 0.2, 0.2], drainage: [0.45, 0.32, 0.2], vent: [0.6, 0.6, 0.6], "fire-protection": [0.9, 0.1, 0.1], "electrical-power": [0.95, 0.8, 0.1], "electrical-lighting": [1, 0.95, 0.5], "cable-tray": [0.85, 0.65, 0.1], equipment: [0.9, 0.55, 0.15] };
export const colorFor = (m: MeshEl): [number, number, number] => (m.sys && SYS_COLOR[m.sys] && m.cat.startsWith("mep") ? SYS_COLOR[m.sys] : CAT_COLOR[m.cat] ?? [0.7, 0.7, 0.7]);

