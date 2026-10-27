import { z } from "zod";
import { DEFAULT_SETTINGS, LIMITS, SUPPORTED_CLASSES } from "./types";

const n01 = z.number().min(0).max(1);
const pt = z.object({ x: n01, y: n01 });
const name = z.string().trim().min(1).max(40).regex(/^[\w .\-()]+$/, "Letters, numbers, spaces and . - _ ( ) only");
const ident = z.string().trim().min(1).max(40).regex(/^[\w-]+$/);
const classes = z.array(z.enum(SUPPORTED_CLASSES as [string, ...string[]])).max(SUPPORTED_CLASSES.length);

export const settingsSchema = z.object({
  classes: classes.min(1),
  minConf: z.number().min(0.05).max(0.99),
  sampleFps: z.number().min(LIMITS.minFps).max(LIMITS.maxFps),
  zones: z.array(z.object({ id: ident, name, points: z.array(pt).min(3).max(LIMITS.maxPoints), classes, dwellSeconds: z.number().min(0).max(600) })).max(LIMITS.maxZones),
  lines: z.array(z.object({ id: ident, name, a: pt, b: pt, classes })).max(LIMITS.maxLines),
  trackMaxAgeSec: z.number().min(0.2).max(10),
  minTrackHits: z.number().int().min(1).max(10),
});
export const settingsPatchSchema = settingsSchema.partial();

export const detSchema = z.object({
  cls: z.string().min(1).max(32), conf: z.number().min(0).max(1),
  box: z.tuple([n01, n01, n01, n01]),
});
export const frameSchema = z.object({ i: z.number().int().min(0).max(LIMITS.maxFrames * 4), t: z.number().min(0).max(3600), dets: z.array(detSchema).max(100) });
export const framesBatchSchema = z.object({ frames: z.array(frameSchema).min(1).max(100) });

export const videoMetaSchema = z.object({
  durationSec: z.number().min(0.1).max(3600), width: z.number().int().min(16).max(8192), height: z.number().int().min(16).max(8192),
});
export const createJobSchema = z.object({
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("sample"), id: ident }),
    z.object({ type: z.literal("upload"), videoId: z.string().regex(/^[a-f0-9]{32}$/).optional(), name: z.string().max(120).optional() }),
  ]),
  mode: z.enum(["browser", "worker", "reference"]),
  meta: videoMetaSchema,
  settings: settingsPatchSchema.optional(),
});
export const reviewSchema = z.object({ review: z.enum(["unreviewed", "confirmed", "dismissed"]), note: z.string().max(300).optional() });

export const mergeSettings = (patch?: Partial<z.infer<typeof settingsSchema>>) => settingsSchema.parse({ ...DEFAULT_SETTINGS, ...(patch ?? {}) });
