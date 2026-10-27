import { NextResponse, type NextRequest } from "next/server";
import { authorize, deleteBlob, fail, getBlob, HttpError, limit, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; fid: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "fdl", 60); const p = await params; const { project } = await authorize(req, p.id); const f = project.files.find((x) => x.id === p.fid); if (!f) throw new HttpError(404, "File not found"); const b = await getBlob(f.blob); return new NextResponse(new Uint8Array(b.data), { headers: { "content-type": "application/octet-stream", "content-disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }); } catch (e) { return fail(e); } }
export async function DELETE(req: NextRequest, { params }: Ctx) { try { sameOrigin(req); const p = await params; const { project } = await authorize(req, p.id); const f = project.files.find((x) => x.id === p.fid); if (!f) throw new HttpError(404, "File not found"); await deleteBlob(f.blob); project.files = project.files.filter((x) => x !== f); await saveProject(project, { sampleOnly: project.files.every((x) => x.sample) }); return NextResponse.json({ deleted: true }); } catch (e) { return fail(e); } }
