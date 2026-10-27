import { NextResponse, type NextRequest } from "next/server";
import { fail, getJob, limit } from "@/lib/cctv/server";
import { loadAndAnalyze } from "@/lib/cctv/results";

export const runtime = "nodejs";
/** Filterable event list: ?type=&severity=&cls=&review=&min_conf= */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    limit(req, "events", 120);
    const { events } = await loadAndAnalyze(await getJob((await params).id));
    const q = req.nextUrl.searchParams, mc = Number(q.get("min_conf") ?? 0);
    const out = events.filter((e) => (!q.get("type") || e.type === q.get("type")) && (!q.get("severity") || e.severity === q.get("severity")) && (!q.get("cls") || e.cls === q.get("cls")) && (!q.get("review") || e.review === q.get("review")) && e.conf >= mc);
    return NextResponse.json({ events: out, total: events.length });
  } catch (e) { return fail(e); }
}
