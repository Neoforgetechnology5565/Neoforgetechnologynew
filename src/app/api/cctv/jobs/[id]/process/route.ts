import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { capabilities, fail, findUpload, HttpError, jobsCol, limit, requireToken } from "@/lib/cctv/server";

export const runtime = "nodejs";
let running = 0;
/** Starts the Node worker (ffmpeg decode + Human/CenterNet on TensorFlow.js WASM) for an uploaded video. Only on hosts where capabilities.workerInference is true. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    limit(req, "process", 6, 10 * 60_000);
    const job = await requireToken(req, id);
    const cap = capabilities();
    if (!cap.workerInference) throw new HttpError(501, cap.workerReason);
    if (job.mode !== "worker" || job.source.type !== "upload" || !job.source.videoId) throw new HttpError(400, "Only uploaded worker-mode jobs can be processed on the server");
    if (job.status !== "created") throw new HttpError(409, `Job already ${job.status}`);
    const file = findUpload(job.source.videoId);
    if (!file) throw new HttpError(404, "Uploaded video expired. Upload it again.");
    if (running >= 1) throw new HttpError(429, "The server worker is busy. Try again in a minute.");
    const port = process.env.PORT || "3000";
    running++;
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "cctv-worker.mjs"), "--api", `http://127.0.0.1:${port}`, "--job", id, "--file", file], { env: { ...process.env, CCTV_JOB_TOKEN: req.headers.get("x-job-token") || "" }, stdio: "ignore", detached: false });
    child.on("exit", () => { running--; });
    child.on("error", () => { running--; });
    await jobsCol().doc(id).update({ status: "processing", updatedAt: Date.now() });
    return NextResponse.json({ ok: true, status: "processing" }, { status: 202 });
  } catch (e) { return fail(e); }
}
