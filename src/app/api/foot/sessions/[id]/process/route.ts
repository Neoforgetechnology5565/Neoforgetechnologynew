import { NextResponse, type NextRequest } from "next/server";
import type { StageEvent } from "@/lib/foot/api-types";
import { buildResults, pickActive } from "@/lib/foot/results";
import { HttpError, authorize, fail, limit, listCaptures, sameOrigin, sessionDTO, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Finalise the session: pick the capture used for each side, assemble results and recommendations. Each stage is timed; the per-photo measuring already happened at upload. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "process", 40, 10 * 60_000); const { session } = await authorize(req, (await params).id);
    const events: StageEvent[] = []; const t0 = Date.now(); const mark = (stage: StageEvent["stage"], note?: string) => { const now = Date.now(); events.push({ stage, at: now, ms: now - (events.length ? events[events.length - 1].at : t0), note }); };
    const caps = await listCaptures(session.id); mark("Validating", `${caps.length} capture(s)`);
    const dtoNow = sessionDTO(session, caps.length); const act = pickActive(dtoNow, caps);
    if (!act.left && !act.right) { mark("Failed", "No photo has been measured successfully"); await touch(session.id, { events }); throw new HttpError(409, caps.length ? "None of the photos could be measured. Fix the paper corners or retake the photos, then process again." : "Add at least one photo first."); }
    mark("Calibrating", [act.left && `left: ${act.left.use === "manual" ? "manual corners" : "auto paper"}`, act.right && `right: ${act.right.use === "manual" ? "manual corners" : "auto paper"}`].filter(Boolean).join(", "));
    mark("Measuring", "Using the saved per-photo measurements");
    const active = { left: act.left?.id, right: act.right?.id }; const res = buildResults({ ...dtoNow, activeCapture: active }, caps);
    mark("Generating recommendations", `${res.recommendations.length} sample shoe profile(s)`); mark("Completed");
    await touch(session.id, { status: "processed", processedAt: Date.now(), events });
    return NextResponse.json({ status: "completed", events, results: res });
  } catch (e) { return fail(e); }
}
