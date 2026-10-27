import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { EXPORT_INFO, makeExport, type ExportFormat } from "@/lib/bim/exports";
import { loadModel } from "@/lib/bim/process";
import { HttpError, authorize, deleteBlob, fail, limit, newId, putBlob, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 90;
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "exl", 120); const { project } = await authorize(req, (await params).id, "viewer"); return NextResponse.json({ formats: Object.entries(EXPORT_INFO).map(([k, v]) => ({ format: k, label: v.label, note: v.note })), artifacts: project.artifacts.map(({ blob: _b, ...a }) => (void _b, a)) }); } catch (e) { return fail(e); } }
/** Generate an export from the stored model and keep it as a downloadable artifact. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "export", 40, 10 * 60_000); const { project } = await authorize(req, (await params).id); const b = z.object({ format: z.enum(Object.keys(EXPORT_INFO) as [ExportFormat, ...ExportFormat[]]) }).parse(await req.json()); if (!project.modelBlob) throw new HttpError(404, "Nothing to export yet. Process the project first.");
    const m = await loadModel(project); let out; try { out = makeExport(b.format, m, project.name, project.files.map((f) => ({ name: f.name, format: f.format, sample: f.sample, size: f.size }))); } catch (e) { throw new HttpError(422, (e as Error).message); }
    const prior = project.artifacts.find((a) => a.name === out.fileName && a.kind === b.format); if (prior) { await deleteBlob(prior.blob); project.artifacts = project.artifacts.filter((a) => a !== prior); }
    const blob = await putBlob(out.buf, { mime: out.mime }); const meta = { id: newId(), name: out.fileName, format: b.format, mime: out.mime, size: out.buf.length, blob, createdAt: Date.now(), kind: b.format, sample: m.sample }; project.artifacts.unshift(meta); project.artifacts = project.artifacts.slice(0, 30); await saveProject(project); const { blob: _b, ...pub } = meta; void _b; return NextResponse.json({ artifact: pub, note: EXPORT_INFO[b.format].note }, { status: 201 }); } catch (e) { return fail(e); }
}
