import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { processProject } from "@/lib/bim/process";
import { settingsPatchSchema } from "@/lib/bim/schemas";
import { authorize, fail, limit, publicProject, sameOrigin } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 120;
/** Create a processing job: parse the stored source files with the current settings (optionally patched) and store the generated model. Runs in the request; stages are timed for real. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req); limit(req, "process", 40, 10 * 60_000); const { project } = await authorize(req, (await params).id); const b = z.object({ settings: settingsPatchSchema.optional() }).parse(await req.json().catch(() => ({})));
    const job = await processProject(project, b.settings as Record<string, unknown> | undefined); return NextResponse.json({ job, project: publicProject(project) }, { status: job.status === "failed" ? 422 : 200 });
  } catch (e) { return fail(e); }
}
