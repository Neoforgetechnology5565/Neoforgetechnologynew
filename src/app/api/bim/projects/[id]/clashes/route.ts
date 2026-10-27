import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { detectClashes } from "@/lib/bim/clash";
import { ifcClashItems } from "@/lib/bim/ifcread";
import { loadModel } from "@/lib/bim/process";
import { authorize, fail, getBlob, limit, putBlob, deleteBlob, saveProject, sameOrigin, HttpError } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "clget", 120); const { project } = await authorize(req, (await params).id, "viewer"); if (!project.modelBlob) throw new HttpError(404, "No model yet"); const m = await loadModel(project); return NextResponse.json({ clashes: m.clashes, info: m.clashInfo }); } catch (e) { return fail(e); } }
/** Re-run clash detection on the stored model with a new clearance / tolerance. The result is stored with the model. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "clash", 40, 10 * 60_000); const { project } = await authorize(req, (await params).id); const b = z.object({ clearance: z.number().min(0).max(1).default(0.05), tolerance: z.number().min(0).max(0.05).default(0.002) }).parse(await req.json().catch(() => ({})));
    if (!project.modelBlob) throw new HttpError(404, "No model yet. Process the project first."); const m = await loadModel(project); const t0 = Date.now(); const extra = m.ifc ? ifcClashItems(m.ifc.elements) : undefined;
    const r = detectClashes(m.building, m.mep.source === "dxf" ? m.mep.elements : [], { clearance: b.clearance, clashTolerance: b.tolerance }, m.ifc ? { arch: extra!.arch, mep: m.mep.source === "dxf" ? [] : extra!.mep } : undefined);
    m.clashes = r.clashes; m.clashInfo = { ...m.clashInfo, tested: r.tested, method: r.method, clearance: b.clearance, tolerance: b.tolerance }; m.settings = { ...m.settings, clearance: b.clearance, clashTolerance: b.tolerance }; const blob = await putBlob(Buffer.from(JSON.stringify(m))); const old = project.modelBlob; project.modelBlob = blob; project.settings = { ...project.settings, clearance: b.clearance, clashTolerance: b.tolerance }; await saveProject(project); await deleteBlob(old); void getBlob;
    return NextResponse.json({ clashes: r.clashes, info: m.clashInfo, ms: Date.now() - t0 }); } catch (e) { return fail(e); }
}
