import { NextResponse, type NextRequest } from "next/server";
import { deleteDoc, getIssue, issuePatch, log, saveIssue } from "@/lib/bim/collab";
import { HttpError, authorize, fail, limit, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; iid: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "iget", 240); const { id, iid } = await params; const { project } = await authorize(req, id, "viewer"); return NextResponse.json({ issue: await getIssue(project.id, iid) }); } catch (e) { return fail(e); } }
/** Edit an issue; every changed field is recorded in the issue history with who changed it. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "iedit", 120, 10 * 60_000); const { id, iid } = await params; const a = await authorize(req, id, "reviewer"); const i = await getIssue(a.project.id, iid); const b = issuePatch.parse(await req.json()); const by = a.role === "owner" ? "Owner" : a.shareName || "Reviewer";
    if (b.versionId && !(a.project.versions ?? []).some((v) => v.id === b.versionId)) throw new HttpError(400, "Unknown version");
    for (const [k, v] of Object.entries(b)) { const old = (i as unknown as Record<string, unknown>)[k]; if (JSON.stringify(old) === JSON.stringify(v)) continue; if (k !== "viewpoint" && k !== "elements") i.history.push({ at: Date.now(), by, field: k, from: Array.isArray(old) ? old.join(", ") : String(old ?? ""), to: Array.isArray(v) ? (v as unknown[]).join(", ") : String(v ?? "") }); else i.history.push({ at: Date.now(), by, field: k, from: "", to: "updated" }); (i as unknown as Record<string, unknown>)[k] = v; }
    i.history = i.history.slice(-100); i.updatedAt = Date.now(); await saveIssue(i); if (b.status) { log(a.project, by, "status", `#${i.number} → ${b.status}`); await saveProject(a.project); } return NextResponse.json({ issue: i }); } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) { try { sameOrigin(req); limit(req, "idel", 60, 10 * 60_000); const { id, iid } = await params; const a = await authorize(req, id); const i = await getIssue(a.project.id, iid); await deleteDoc(i.id); log(a.project, "Owner", "issue-deleted", `#${i.number} ${i.title}`); await saveProject(a.project); return NextResponse.json({ deleted: true }); } catch (e) { return fail(e); } }
