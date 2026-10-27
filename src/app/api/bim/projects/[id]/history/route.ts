import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { processProject } from "@/lib/bim/process";
import { HttpError, authorize, fail, limit, publicProject, sameOrigin } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 120;
type H = { version: number; at: number; settings: Record<string, unknown> };
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { limit(req, "hist", 120); const { project } = await authorize(req, (await params).id); return NextResponse.json({ history: ((project as unknown as { history?: H[] }).history ?? []).map((h) => ({ version: h.version, at: h.at })) }); } catch (e) { return fail(e); } }
/** Undo/reset: restore the settings of an earlier version (or `reset:true` for defaults) and regenerate. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { sameOrigin(req); limit(req, "restore", 20, 10 * 60_000); const { project } = await authorize(req, (await params).id); const b = z.object({ version: z.number().int().optional(), reset: z.boolean().optional() }).parse(await req.json()); const hist = ((project as unknown as { history?: H[] }).history ?? []);
    let target: Record<string, unknown>; if (b.reset) target = { overrides: {}, layerMap: {}, mep: [] }; else { const h = hist.find((x) => x.version === b.version); if (!h) throw new HttpError(404, "That version is not in the history"); target = h.settings; }
    const job = await processProject(project, target, true); return NextResponse.json({ job, project: publicProject(project) }, { status: job.status === "failed" ? 422 : 200 }); } catch (e) { return fail(e); }
}
