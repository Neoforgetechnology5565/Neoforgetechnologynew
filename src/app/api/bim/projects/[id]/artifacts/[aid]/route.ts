import { NextResponse, type NextRequest } from "next/server";
import { HttpError, authorize, fail, getBlob, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
/** Protected download: requires the project key; never cached. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try { limit(req, "dl", 60); const p = await params; const { project } = await authorize(req, p.id, "viewer"); const a = project.artifacts.find((x) => x.id === p.aid); if (!a) throw new HttpError(404, "Artifact not found"); const b = await getBlob(a.blob);
    return new NextResponse(new Uint8Array(b.data), { headers: { "content-type": a.mime, "content-disposition": `attachment; filename="${a.name.replace(/"/g, "")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }); } catch (e) { return fail(e); }
}
