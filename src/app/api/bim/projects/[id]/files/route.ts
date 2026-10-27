import { NextResponse, type NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES, validateUpload } from "@/lib/bim/validate";
import { HttpError, MAX_PROJECT_BYTES, authorize, fail, limit, newId, projectBytes, putBlob, sameOrigin, saveProject, type FileMeta } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "files", 240); const { project } = await authorize(req, (await params).id, "viewer"); return NextResponse.json({ files: project.files.map(({ blob: _b, ...f }) => (void _b, f)) }); } catch (e) { return fail(e); } }

/** multipart/form-data: file, role (plan|mep|model|drawing|cloud|...). The bytes are validated by content, stored compressed, and listed with their validation result. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "upload", 40, 10 * 60_000); const { project } = await authorize(req, (await params).id);
    if (Number(req.headers.get("content-length") || 0) > MAX_UPLOAD_BYTES + 256 * 1024) throw new HttpError(413, `File too large. The limit is ${MAX_UPLOAD_BYTES / 1048576} MB.`);
    const form = await req.formData().catch(() => { throw new HttpError(400, "Expected multipart form data"); }); const file = form.get("file"); if (!(file instanceof File)) throw new HttpError(400, "No file was sent");
    const role = String(form.get("role") || "plan").replace(/[^a-z0-9-]/g, "").slice(0, 20) || "plan"; const name = (file.name || "upload").replace(/[\\/\0]/g, "_").slice(0, 120);
    if (project.files.length >= 12) throw new HttpError(409, "This project already has the maximum number of files (12). Delete one first.");
    const buf = Buffer.from(await file.arrayBuffer()); const v = validateUpload(name, buf); if (!v.ok) return NextResponse.json({ error: v.errors[0] ?? "The file could not be validated.", validation: v }, { status: v.support === "conversion-required" ? 422 : 415 });
    if ((await projectBytes(project)) + buf.length > MAX_PROJECT_BYTES) throw new HttpError(413, "The project storage limit was reached. Delete files or artifacts first.");
    const blob = await putBlob(buf, { mime: file.type || "application/octet-stream" });
    const meta: FileMeta = { id: newId(), name, format: v.format, role, size: buf.length, blob, sample: false, uploadedAt: Date.now(), validation: { ok: true, support: v.support, warnings: v.warnings, info: v.info } };
    // replacing the plan/mep file of the same role keeps one active source per role
    const replaced = project.files.filter((f) => f.role === role && ["plan", "mep", "drawing", "drawing-b", "cloud"].includes(role)); project.files = project.files.filter((f) => !replaced.includes(f)); project.files.push(meta); await saveProject(project, { sampleOnly: project.files.every((f) => f.sample) });
    const { deleteBlob } = await import("@/lib/bim/server"); for (const r of replaced) await deleteBlob(r.blob);
    const { blob: _b, ...pub } = meta; void _b; return NextResponse.json({ file: pub, validation: v }, { status: 201 });
  } catch (e) { return fail(e); }
}
