import { NextResponse } from "next/server";
import { SAMPLES } from "@/lib/cctv/samples";
export const runtime = "nodejs";
export const GET = () => NextResponse.json({ samples: SAMPLES.map((s) => ({ ...s, synthetic: true, source: "Rendered shapes with ground-truth annotations; no AI inference is involved in the reference mode." })) });
