import { NextResponse, type NextRequest } from "next/server";
import { fail, jobsCol, limit, requireToken } from "@/lib/cctv/server";
import { mergeSettings, settingsPatchSchema } from "@/lib/cctv/schemas";
import { loadAndAnalyze } from "@/lib/cctv/results";

export const runtime = "nodejs";
/** Updates settings (classes, confidence, zones, lines, tracking) and re-runs tracking + event generation over the stored raw detections. No new inference. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    limit(req, "analyze", 120);
    const job = await requireToken(req, id);
    const settings = mergeSettings({ ...job.settings, ...settingsPatchSchema.parse(await req.json()) });
    await jobsCol().doc(id).update({ settings, updatedAt: Date.now() });
    return NextResponse.json(await loadAndAnalyze({ ...job, settings }));
  } catch (e) { return fail(e); }
}
