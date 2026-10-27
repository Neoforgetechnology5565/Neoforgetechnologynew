import { NextResponse, type NextRequest } from "next/server";
import { LIMITS, deleteDoc, getView, listViews, saveView, viewSchema, type SavedView } from "@/lib/bim/collab";
import { HttpError, authorize, fail, limit, newId, sameOrigin } from "@/lib/bim/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "views", 120); const { project } = await authorize(req, (await params).id, "viewer"); return NextResponse.json({ views: await listViews(project.id) }); } catch (e) { return fail(e); } }
/** Save the current camera, section and visibility as a named view. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "vadd2", 60, 10 * 60_000); const a = await authorize(req, (await params).id, "reviewer"); const b = viewSchema.parse(await req.json()); if ((await listViews(a.project.id)).length >= LIMITS.views) throw new HttpError(409, `A project can hold ${LIMITS.views} saved views.`);
    const v: SavedView = { kind: "view", id: newId(), projectId: a.project.id, name: b.name, versionId: b.versionId, viewpoint: b.viewpoint, by: a.role === "owner" ? "Owner" : a.shareName || "Reviewer", createdAt: Date.now() }; await saveView(v); return NextResponse.json({ view: v }, { status: 201 }); } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) { try { sameOrigin(req); limit(req, "vdel", 60, 10 * 60_000); const a = await authorize(req, (await params).id); const id = new URL(req.url).searchParams.get("id") ?? ""; const v = await getView(a.project.id, id); await deleteDoc(v.id); return NextResponse.json({ deleted: true }); } catch (e) { return fail(e); } }
