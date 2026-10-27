import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addVersion } from "@/lib/bim/collab";
import { HttpError, authorize, fail, limit, publicProject, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "vers", 120); const { project, role } = await authorize(req, (await params).id, "viewer"); return NextResponse.json({ versions: publicProject(project, role).versions }); } catch (e) { return fail(e); } }
/** Register an uploaded IFC file as the next version of the reviewed model. The file is parsed and its model stored per version. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "vadd", 20, 10 * 60_000); const { project } = await authorize(req, (await params).id); if (project.demo !== "collab") throw new HttpError(409, "Versions belong to review projects.");
    const b = z.object({ fileId: z.string().min(6).max(60), label: z.string().trim().max(60).default(""), note: z.string().trim().max(500).default("") }).parse(await req.json()); let v; try { v = await addVersion(project, b.fileId, b.label, b.note, "Owner"); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(422, `The IFC file could not be processed: ${(e as Error).message}`); }
    await saveProject(project); const { modelBlob: _m, ...pub } = v; void _m; return NextResponse.json({ version: pub, project: publicProject(project) }, { status: 201 }); } catch (e) { return fail(e); }
}
