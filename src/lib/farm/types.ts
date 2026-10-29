/** Animal classes the bundled COCO-trained YOLOX model can actually name. Sheep, cow and horse are the livestock classes; there is no goat, pig, chicken or deer class. */
export const ANIMALS = [
  { id: 14, key: "bird", label: "Bird", livestock: false, color: "#0ea5e9" },
  { id: 15, key: "cat", label: "Cat", livestock: false, color: "#a855f7" },
  { id: 16, key: "dog", label: "Dog", livestock: false, color: "#f59e0b" },
  { id: 17, key: "horse", label: "Horse", livestock: true, color: "#b45309" },
  { id: 18, key: "sheep", label: "Sheep", livestock: true, color: "#16834A" },
  { id: 19, key: "cow", label: "Cow", livestock: true, color: "#dc2626" },
  { id: 20, key: "elephant", label: "Elephant", livestock: false, color: "#64748b" },
  { id: 21, key: "bear", label: "Bear", livestock: false, color: "#7c2d12" },
  { id: 22, key: "zebra", label: "Zebra", livestock: false, color: "#111827" },
  { id: 23, key: "giraffe", label: "Giraffe", livestock: false, color: "#ca8a04" },
] as const;
export type AnimalKey = (typeof ANIMALS)[number]["key"];
export const BY_KEY = Object.fromEntries(ANIMALS.map((a) => [a.key, a])) as Record<AnimalKey, (typeof ANIMALS)[number]>;
export type Pt = [number, number]; // normalised 0..1
export interface Box { x1: number; y1: number; x2: number; y2: number }
export interface Det { cls: AnimalKey; score: number; box: Box; track?: number; inZone?: boolean }
export interface ZoneEvent { t: number; track: number; cls: AnimalKey; kind: "enter" | "exit"; frame: number }
export interface FrameOut { i: number; t: number; dets: Det[]; inZone: number }
export interface Summary { frames: number; seconds: number; inferMs: number; unique: Record<string, number>; peak: Record<string, number>; instances: number; zone: Pt[] | null; events: ZoneEvent[]; zoneEntries: number }
