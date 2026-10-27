import { NextResponse, type NextRequest } from "next/server";
import { cleanupExpired, DETECTOR_INFO, fail, findUpload, HttpError, JOB_TTL_MS, jobsCol, limit, newId, publicJob, sameOrigin, tokenHash, capabilities, type JobDoc } from "@/lib/cctv/server";
import { createJobSchema, mergeSettings } from "@/lib/cctv/schemas";
import { SAMPLE_MAP } from "@/lib/cctv/samples";
import { LIMITS } from "@/lib/cctv/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    limit(req, "job", 20, 10 * 60_000);
    const body = createJobSchema.parse(await req.json());
    if (body.source.type === "sample" && !SAMPLE_MAP[body.source.id]) throw new HttpError(404, "Unknown sample");
    if (body.mode === "worker" && (body.source.type !== "upload" || !body.source.videoId)) throw new HttpError(400, "Server-worker jobs need an uploaded video");
    if (body.source.type === "upload" && body.mode === "worker" && !findUpload(body.source.videoId!)) throw new HttpError(404, "Uploaded video not found. Uploads expire after 60 minutes.");
    if (body.mode === "worker" && !capabilities().workerInference) throw new HttpError(501, capabilities().workerReason);
    if (body.mode === "reference" && body.source.type !== "sample") throw new HttpError(400, "Reference annotations exist only for the bundled synthetic samples.");
    const settings = mergeSettings(body.settings);
    const token = newId(24), id = newId(), now = Date.now();
    const expectedFrames = Math.min(LIMITS.maxFrames, Math.max(1, Math.floor(body.meta.durationSec * settings.sampleFps)));
    const reference = body.mode === "reference";
    const job: JobDoc = {
      id, tokenHash: tokenHash(token), source: body.source.type === "sample" ? { type: "sample", id: body.source.id } : { type: "upload", videoId: body.source.videoId, name: body.source.name },
      mode: body.mode, meta: body.meta, settings, status: "created", framesReceived: 0, expectedFrames, createdAt: now, updatedAt: now, expiresAt: now + JOB_TTL_MS, reviews: {}, notes: {},
      detector: reference ? { name: "Reference annotations", runtime: "none (no AI inference)", license: "n/a", note: "Ground-truth boxes authored with the synthetic clip. Not model output." } : DETECTOR_INFO,
    };
    await cleanupExpired();
    await jobsCol().doc(id).set(job);
    return NextResponse.json({ ...publicJob(job), token }, { status: 201 });
  } catch (e) { return fail(e); }
}
