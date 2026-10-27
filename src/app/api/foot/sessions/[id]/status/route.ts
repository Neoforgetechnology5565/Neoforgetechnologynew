import { NextResponse, type NextRequest } from "next/server";
import { authorize, fail, limit, listCaptures } from "@/lib/foot/server";

export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    limit(req, "status", 240); const { session } = await authorize(req, (await params).id, true); const caps = await listCaptures(session.id);
    return NextResponse.json({ status: session.status, processedAt: session.processedAt ?? null, events: session.events ?? [], captures: caps.map((c) => ({ id: c.id, side: c.side, source: c.source, status: c.job.status, grade: c.auto.grade, events: c.job.events })) });
  } catch (e) { return fail(e); }
}
