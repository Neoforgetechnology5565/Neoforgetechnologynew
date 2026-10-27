import { NextResponse, type NextRequest } from "next/server";
import { activeAnalysis, buildResults } from "@/lib/foot/results";
import { RULESET } from "@/lib/foot/sizing";
import { HttpError, authorize, fail, limit, listCaptures, sessionDTO } from "@/lib/foot/server";

export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    limit(req, "report", 60); const { session } = await authorize(req, (await params).id); const caps = await listCaptures(session.id); const dto = sessionDTO(session, caps.length); const r = buildResults(dto, caps);
    if (!r.left && !r.right) throw new HttpError(409, "No measured foot to report yet.");
    const format = new URL(req.url).searchParams.get("format") || "json";
    if (format === "csv") {
      const rows = [["side", "capture", "source", "method", "grade", "length_mm", "width_mm", "ball_width_mm", "heel_width_mm", "area_cm2", "raw_planar_length_mm", "parallax_bound_mm", "sample_data"]];
      for (const s of ["left", "right"] as const) { const x = r[s]; if (x) rows.push([s, x.captureId, x.source, x.method, x.grade, x.lengthMm, x.widthMm, x.ballWidthMm, x.heelWidthMm, x.areaCm2, x.rawLengthMm, x.parallaxBoundMm, x.sample].map(String)); }
      return new NextResponse(rows.map((c) => c.join(",")).join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="foot-report-${session.id.slice(0, 8)}.csv"`, "cache-control": "private, no-store" } });
    }
    const body = { generatedAt: new Date().toISOString(), session: { id: dto.id, name: dto.name, paper: dto.paper, fit: dto.fit, createdAt: dto.createdAt }, rulesetId: RULESET.id, results: r, captures: caps.map((c) => ({ id: c.id, side: c.side, source: c.source, filename: c.filename, width: c.width, height: c.height, usedAnalysis: c.use, original: c.auto, corrected: c.manual ?? null, chosen: activeAnalysis(c).ok })), meshes: dto.meshes, notice: r.anySample ? "Contains sample (synthetic) data." : undefined };
    return new NextResponse(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="foot-report-${session.id.slice(0, 8)}.json"`, "cache-control": "private, no-store" } });
  } catch (e) { return fail(e); }
}
