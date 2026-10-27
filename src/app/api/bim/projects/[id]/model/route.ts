import { NextResponse, type NextRequest } from "next/server";
import { HttpError, authorize, fail, getBlob, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
/** The generated model as JSON (served gzip-compressed as stored). `?meta=1` returns only the summary. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { limit(req, "model", 120); const { project } = await authorize(req, (await params).id, "viewer"); if (new URL(req.url).searchParams.get("meta")) return NextResponse.json({ version: project.version, meta: project.modelMeta ?? null, jobs: project.jobs.slice(0, 5) });
    if (!project.modelBlob) throw new HttpError(404, "No model has been generated yet. Upload a file or open a sample, then process it.");
    const b = await getBlob(project.modelBlob, true); return new NextResponse(new Uint8Array(b.data), { headers: { "content-type": "application/json", ...(b.gz ? { "content-encoding": "gzip" } : {}), "cache-control": "private, no-store" } }); } catch (e) { return fail(e); }
}
