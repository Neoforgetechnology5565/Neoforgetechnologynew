import { NextResponse, type NextRequest } from "next/server";
import { listIssues, reportCsv, reportHtml } from "@/lib/bim/collab";
import { HttpError, authorize, fail, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
/** Download the issue list as CSV/JSON or a printable HTML review report. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { limit(req, "rep", 30, 60_000); const { project } = await authorize(req, (await params).id, "viewer"); const f = new URL(req.url).searchParams.get("format") ?? "csv"; const issues = await listIssues(project.id); const base = project.name.replace(/[^\w.-]+/g, "_").slice(0, 40) || "review";
    const out = (body: string, mime: string, ext: string) => new NextResponse(body, { headers: { "content-type": `${mime}; charset=utf-8`, "content-disposition": `attachment; filename="${base}-issues.${ext}"`, "cache-control": "private, no-store" } });
    if (f === "csv") return out(reportCsv(issues), "text/csv", "csv"); if (f === "json") return out(JSON.stringify({ project: project.name, versions: (project.versions ?? []).map(({ modelBlob: _m, ...v }) => (void _m, v)), issues }, null, 2), "application/json", "json"); if (f === "html") return out(reportHtml(project, issues), "text/html", "html"); throw new HttpError(400, "format must be csv, json or html"); } catch (e) { return fail(e); }
}
