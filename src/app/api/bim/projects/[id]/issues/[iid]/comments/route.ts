import { NextResponse, type NextRequest } from "next/server";
import { LIMITS, commentSchema, getIssue, log, saveIssue } from "@/lib/bim/collab";
import { HttpError, authorize, fail, limit, newId, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
/** Add a comment (reviewers and the owner). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; iid: string }> }) {
  try { sameOrigin(req); limit(req, "icom", 80, 10 * 60_000); const { id, iid } = await params; const a = await authorize(req, id, "reviewer"); const i = await getIssue(a.project.id, iid); if (i.comments.length >= LIMITS.comments) throw new HttpError(409, "This issue has reached the comment limit.");
    const b = commentSchema.parse(await req.json()); const by = a.role === "owner" ? "Owner" : a.shareName || "Reviewer"; i.comments.push({ id: newId(), author: by, text: b.text, at: Date.now() }); i.updatedAt = Date.now(); await saveIssue(i); log(a.project, by, "comment", `#${i.number}`); await saveProject(a.project); return NextResponse.json({ issue: i }, { status: 201 }); } catch (e) { return fail(e); }
}
