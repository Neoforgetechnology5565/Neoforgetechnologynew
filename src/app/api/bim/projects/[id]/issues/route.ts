import { NextResponse, type NextRequest } from "next/server";
import { LIMITS, issueCreate, listIssues, log, nextNumber, saveIssue, type Issue } from "@/lib/bim/collab";
import { HttpError, authorize, fail, limit, newId, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const who = (a: { role: string; shareName?: string }) => (a.role === "owner" ? "Owner" : a.shareName || "Reviewer");
export async function GET(req: NextRequest, { params }: Ctx) {
  try { limit(req, "iss", 240); const { project } = await authorize(req, (await params).id, "viewer"); const q = new URL(req.url).searchParams; let list = await listIssues(project.id);
    const f = (k: keyof Issue) => q.get(String(k)); if (f("status")) list = list.filter((i) => i.status === f("status")); if (f("priority")) list = list.filter((i) => i.priority === f("priority")); if (f("type")) list = list.filter((i) => i.type === f("type")); if (f("assignee")) list = list.filter((i) => i.assignee.toLowerCase() === f("assignee")!.toLowerCase()); if (f("versionId")) list = list.filter((i) => i.versionId === f("versionId"));
    const s = (q.get("q") ?? "").toLowerCase().trim(); if (s) list = list.filter((i) => `${i.title} ${i.description} ${i.labels.join(" ")} ${i.assignee} #${i.number}`.toLowerCase().includes(s)); return NextResponse.json({ total: list.length, issues: list.slice(0, 300) }); } catch (e) { return fail(e); }
}
/** Create an issue (reviewers and the owner). The author is taken from the credential, never from the request body. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "iadd", 60, 10 * 60_000); const a = await authorize(req, (await params).id, "reviewer"); const p = a.project; const b = issueCreate.parse(await req.json()); if ((await listIssues(p.id)).length >= LIMITS.issues) throw new HttpError(409, `A project can hold ${LIMITS.issues} issues.`);
    if (b.versionId && !(p.versions ?? []).some((v) => v.id === b.versionId)) throw new HttpError(400, "Unknown version"); const now = Date.now(); const i: Issue = { kind: "issue", id: newId(), projectId: p.id, number: nextNumber(p), ...b, due: b.due ?? "", comments: [], history: [{ at: now, by: who(a), field: "created", from: "", to: b.status }], reporter: who(a), createdAt: now, updatedAt: now, sample: p.sampleOnly };
    await saveIssue(i); log(p, who(a), "issue", `#${i.number} ${i.title}`); await saveProject(p); return NextResponse.json({ issue: i }, { status: 201 }); } catch (e) { return fail(e); }
}
