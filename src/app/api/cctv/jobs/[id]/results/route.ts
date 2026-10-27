import { NextResponse, type NextRequest } from "next/server";
import { fail, getJob, HttpError, limit } from "@/lib/cctv/server";
import { loadAndAnalyze } from "@/lib/cctv/results";

export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    limit(req, "results", 120);
    const job = await getJob((await params).id);
    if (job.status !== "ready" && job.mode !== "reference") throw new HttpError(409, `Results are not ready (status: ${job.status})`);
    return NextResponse.json(await loadAndAnalyze(job));
  } catch (e) { return fail(e); }
}
