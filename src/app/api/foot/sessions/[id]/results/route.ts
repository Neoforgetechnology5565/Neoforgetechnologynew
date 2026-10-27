import { NextResponse, type NextRequest } from "next/server";
import { buildResults } from "@/lib/foot/results";
import { authorize, fail, limit, listCaptures, sessionDTO } from "@/lib/foot/server";

export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    limit(req, "results", 120); const { session } = await authorize(req, (await params).id); const caps = await listCaptures(session.id); const u = new URL(req.url); const fit = u.searchParams.get("fit"); const al = Number(u.searchParams.get("allowanceMm"));
    const dto = sessionDTO(session, caps.length);
    return NextResponse.json({ session: dto, results: buildResults(dto, caps, fit === "snug" || fit === "roomy" || fit === "regular" ? fit : session.fit, Number.isFinite(al) && al > 0 && al < 40 ? al : undefined), meshes: dto.meshes });
  } catch (e) { return fail(e); }
}
