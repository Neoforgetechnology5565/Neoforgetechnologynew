import { NextResponse, type NextRequest } from "next/server";
import { fail, getJob, limit } from "@/lib/cctv/server";
import { loadAndAnalyze } from "@/lib/cctv/results";
import { eventsCsv } from "@/lib/cctv/csv";

export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    limit(req, "export", 30);
    const job = await getJob((await params).id);
    const r = await loadAndAnalyze(job);
    const name = (job.source.name || job.source.id || "upload").replace(/[^\w.-]/g, "_").slice(0, 40);
    if (req.nextUrl.searchParams.get("format") === "json") {
      const body = { disclosure: { mode: job.mode, detector: job.detector, note: "Counts of unique tracked objects differ from frame-level detection counts. Weapon detection is not supported." }, job: r.job, stats: r.stats, tracks: r.tracks, events: r.events };
      return new NextResponse(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="cctv-${name}.json"` } });
    }
    return new NextResponse(eventsCsv(r.events, `${name} (${job.mode})`), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cctv-events-${name}.csv"` } });
  } catch (e) { return fail(e); }
}
