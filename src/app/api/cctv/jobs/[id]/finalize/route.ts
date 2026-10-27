import { NextResponse, type NextRequest } from "next/server";
import { fail, HttpError, jobsCol, limit, loadFrames, requireToken } from "@/lib/cctv/server";
import { analyze } from "@/lib/cctv/analyze";
import { z } from "zod";

export const runtime = "nodejs";
const body = z.object({ ok: z.boolean().default(true), error: z.string().max(300).optional() }).default({ ok: true });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    limit(req, "finalize", 60);
    const job = await requireToken(req, id);
    const b = body.parse(await req.json().catch(() => ({})));
    if (!b.ok) { await jobsCol().doc(id).update({ status: "failed", error: b.error ?? "Processing failed", updatedAt: Date.now() }); return NextResponse.json({ ok: true, status: "failed" }); }
    const frames = await loadFrames(id);
    if (frames.length === 0) throw new HttpError(400, "No frames were received for this job");
    const a = analyze(frames, job.settings, { durationSec: job.meta.durationSec });
    await jobsCol().doc(id).update({ status: "ready", framesReceived: frames.length, updatedAt: Date.now(), error: null });
    return NextResponse.json({ ok: true, status: "ready", stats: a.stats });
  } catch (e) { return fail(e); }
}
