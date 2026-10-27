import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listDemoExports, makeDemoExport } from "@/lib/bim/demos/exports";
import { loadAnyModel, loadFiles } from "@/lib/bim/process";
import { HttpError, authorize, deleteBlob, fail, limit, newId, putBlob, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 90;
type Ctx = { params: Promise<{ id: string }> };
const pub = (a: { blob?: string }) => { const { blob: _b, ...r } = a; void _b; return r; };
/** The exports this project's current result can produce, and the artifacts already generated. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try { limit(req, "exl", 120); const { project } = await authorize(req, (await params).id, "viewer"); const formats = project.modelBlob ? listDemoExports(project.demo, await loadAnyModel(project)) : []; return NextResponse.json({ formats, artifacts: project.artifacts.map(pub) }); } catch (e) { return fail(e); }
}
/** Generate an export from the stored result and keep it as a downloadable artifact (replacing an earlier artifact of the same kind). */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "export", 40, 10 * 60_000); const { project } = await authorize(req, (await params).id); const b = z.object({ format: z.string().regex(/^[a-z0-9-]{2,40}$/) }).parse(await req.json());
    if (!project.modelBlob) throw new HttpError(404, "Nothing to export yet. Process the project first.");
    const model = await loadAnyModel(project); const allowed = listDemoExports(project.demo, model); const item = allowed.find((x) => x.format === b.format); if (!item) throw new HttpError(400, "This export format is not offered for the current result.");
    let out; try { out = await makeDemoExport(b.format, { demo: project.demo, model, name: project.name, files: await loadFiles(project), settings: project.settings }); } catch (e) { throw new HttpError(422, (e as Error).message); }
    const prior = project.artifacts.find((a) => a.name === out.fileName && a.kind === b.format); if (prior) { await deleteBlob(prior.blob); project.artifacts = project.artifacts.filter((a) => a !== prior); }
    const blob = await putBlob(out.buf, { mime: out.mime }); const meta = { id: newId(), name: out.fileName, format: b.format, mime: out.mime, size: out.buf.length, blob, createdAt: Date.now(), kind: b.format, sample: model.sample }; project.artifacts.unshift(meta); project.artifacts = project.artifacts.slice(0, 30); await saveProject(project);
    return NextResponse.json({ artifact: pub(meta), note: item.note }, { status: 201 });
  } catch (e) { return fail(e); }
}
