import { NextResponse } from "next/server";
import { DEFAULT_SETTINGS, LIMITS, SUPPORTED_CLASSES } from "@/lib/cctv/types";
export const runtime = "nodejs";
export const GET = () => NextResponse.json({ defaults: DEFAULT_SETTINGS, limits: LIMITS, supportedClasses: SUPPORTED_CLASSES,
  schema: { classes: "string[] of supported classes", minConf: "0.05..0.99", sampleFps: `${LIMITS.minFps}..${LIMITS.maxFps}`, zones: `up to ${LIMITS.maxZones}; polygon of 3..${LIMITS.maxPoints} normalised points (0..1)`, lines: `up to ${LIMITS.maxLines}; segment a→b in normalised coordinates`, trackMaxAgeSec: "0.2..10", minTrackHits: "1..10" } });
