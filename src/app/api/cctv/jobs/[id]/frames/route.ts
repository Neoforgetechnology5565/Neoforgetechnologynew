import { NextResponse, type NextRequest } from "next/server";
import { fail, framesCol, HttpError, jobsCol, limit, requireToken } from "@/lib/cctv/server";
import { framesBatchSchema } from "@/lib/cctv/schemas";
import { LIMITS } from "@/lib/cctv/types";

export const runtime = "nodejs";
/** Accepts a batch of raw per-frame detections (idempotent per frame index). Used by the browser inference loop and the Node worker. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    limit(req, "frames", 600);
    const job = await requireToken(req, id);
    if (job.status === "ready") throw new HttpError(409, "Job is already finalised. Create a new job to re-run inference.");
    if (job.mode === "reference") throw new HttpError(400, "Reference jobs do not accept detections.");
    const { frames } = framesBatchSchema.parse(await req.json());
    const bad = frames.find((f) => f.i >= job.expectedFrames + 2 || f.t > job.meta.durationSec + 1);
    if (bad) throw new HttpError(400, `Frame ${bad.i} is outside the video`);
    frames.sort((a, b) => a.i - b.i);
    await framesCol().doc(`${id}_${frames[0].i}`).set({ jobId: id, frames, expiresAt: job.expiresAt });
    const snap = await framesCol().where("jobId", "==", id).get();
    const seen = new Set<number>(); snap.docs.forEach((d) => (d.data().frames as { i: number }[]).forEach((f) => seen.add(f.i)));
    const received = Math.min(seen.size, LIMITS.maxFrames);
    await jobsCol().doc(id).update({ framesReceived: received, status: job.status === "processing" ? "processing" : "receiving", updatedAt: Date.now() });
    return NextResponse.json({ ok: true, framesReceived: received, expectedFrames: job.expectedFrames });
  } catch (e) { return fail(e); }
}
