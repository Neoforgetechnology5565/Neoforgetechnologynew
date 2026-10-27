import { NextResponse, type NextRequest } from "next/server";
import { fail, getJob, HttpError, jobsCol, limit, requireToken } from "@/lib/cctv/server";
import { loadAndAnalyze } from "@/lib/cctv/results";
import { reviewSchema } from "@/lib/cctv/schemas";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string; eid: string }> };
export async function GET(req: NextRequest, { params }: P) {
  try {
    limit(req, "event", 240);
    const { id, eid } = await params;
    const { events, tracks } = await loadAndAnalyze(await getJob(id));
    const ev = events.find((e) => e.id === eid);
    if (!ev) throw new HttpError(404, "Event not found");
    return NextResponse.json({ event: ev, track: tracks.find((t) => t.id === ev.trackId) ?? null });
  } catch (e) { return fail(e); }
}
/** Human review of an event: confirm or dismiss, with an optional note. */
export async function PATCH(req: NextRequest, { params }: P) {
  try {
    limit(req, "review", 120);
    const { id, eid } = await params;
    const job = await requireToken(req, id);
    const b = reviewSchema.parse(await req.json());
    const { events } = await loadAndAnalyze(job);
    if (!events.some((e) => e.id === eid)) throw new HttpError(404, "Event not found");
    const key = eid.replace(/[^\w-]/g, "_");
    await jobsCol().doc(id).update({ [`reviews.${key}`]: b.review, ...(b.note !== undefined ? { [`notes.${key}`]: b.note } : {}), updatedAt: Date.now() });
    return NextResponse.json({ ok: true, id: eid, review: b.review });
  } catch (e) { return fail(e); }
}
