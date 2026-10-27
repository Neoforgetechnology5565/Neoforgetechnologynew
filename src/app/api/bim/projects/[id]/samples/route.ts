import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SAMPLES } from "@/lib/bim/samples-registry";
import { validateUpload } from "@/lib/bim/validate";
import { HttpError, authorize, deleteBlob, fail, limit, newId, putBlob, sameOrigin, saveProject, type FileMeta } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Replace the project's source files with a bundled sample (labelled `sample: true` everywhere). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req); limit(req, "sample", 30, 10 * 60_000); const { project } = await authorize(req, (await params).id); const { sample } = z.object({ sample: z.string().max(60) }).parse(await req.json()); const def = SAMPLES.find((s) => s.id === sample && s.demo === project.demo); if (!def) throw new HttpError(404, "Unknown sample for this application");
    for (const f of project.files) await deleteBlob(f.blob); project.files = [];
    for (const sf of def.files) { const b = Buffer.from(await sf.make()); const v = validateUpload(sf.name, b); const blob = await putBlob(b); const m: FileMeta = { id: newId(), name: sf.name, format: v.format, role: sf.role, size: b.length, blob, sample: true, sampleId: def.id, uploadedAt: Date.now(), validation: { ok: v.ok, support: v.support, warnings: v.warnings, info: v.info } }; project.files.push(m); }
    await saveProject(project, { settings: { ...(def.settings ?? {}) }, sampleOnly: true });
    if (project.demo === "collab") { const { seedCollabSample } = await import("@/lib/bim/collab"); project.versions = []; await seedCollabSample(project); await saveProject(project); } const { files, ...rest } = project; void rest; return NextResponse.json({ files: files.map(({ blob: _b, ...f }) => (void _b, f)), sample: { id: def.id, name: def.name } });
  } catch (e) { return fail(e); }
}
