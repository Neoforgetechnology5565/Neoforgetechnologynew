import { NextResponse, type NextRequest } from "next/server";
import { HttpError, authorize, fail, getBlob, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
/** The processed model of one version (gzip as stored). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; vid: string }> }) {
  try { limit(req, "vmodel", 120); const { id, vid } = await params; const { project } = await authorize(req, id, "viewer"); const v = (project.versions ?? []).find((x) => x.id === vid); if (!v) throw new HttpError(404, "Version not found");
    const b = await getBlob(v.modelBlob, true); return new NextResponse(new Uint8Array(b.data), { headers: { "content-type": "application/json", ...(b.gz ? { "content-encoding": "gzip" } : {}), "cache-control": "private, no-store" } }); } catch (e) { return fail(e); }
}
