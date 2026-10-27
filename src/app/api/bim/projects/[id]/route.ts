import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorize, deleteProject, fail, limit, publicProject, sameOrigin, saveProject } from "@/lib/bim/server";
import { anySettingsSchema } from "@/lib/bim/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "pget", 240); const { project, role } = await authorize(req, (await params).id, "viewer"); return NextResponse.json({ project: publicProject(project, role) }); } catch (e) { return fail(e); } }
/** Rename and/or change settings. Settings changes only take effect after /process (regeneration). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "ppatch", 120); const { project } = await authorize(req, (await params).id); const b = z.object({ name: z.string().trim().min(1).max(80).optional(), settings: anySettingsSchema.optional() }).parse(await req.json());
    await saveProject(project, { ...(b.name ? { name: b.name } : {}), ...(b.settings ? { settings: { ...project.settings, ...b.settings } } : {}) }); return NextResponse.json({ project: publicProject(project) }); } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) { try { sameOrigin(req); limit(req, "pdel", 30); const { project } = await authorize(req, (await params).id); await deleteProject(project); return NextResponse.json({ deleted: true }); } catch (e) { return fail(e); } }
