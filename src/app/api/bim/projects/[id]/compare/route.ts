import { NextResponse, type NextRequest } from "next/server";
import { loadVersionModel } from "@/lib/bim/collab";
import { compareModels } from "@/lib/bim/compare";
import { HttpError, authorize, fail, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Compare two versions of the reviewed model by GlobalId: added, removed and changed elements with the changed fields. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { limit(req, "cmp", 40, 60_000); const { project } = await authorize(req, (await params).id, "viewer"); const q = new URL(req.url).searchParams; const a = (project.versions ?? []).find((v) => v.id === q.get("a")), b = (project.versions ?? []).find((v) => v.id === q.get("b"));
    if (!a || !b) throw new HttpError(400, "Pass two existing version ids as ?a=…&b=…"); if (a.id === b.id) throw new HttpError(400, "Choose two different versions.");
    const [A, B] = await Promise.all([loadVersionModel(a), loadVersionModel(b)]); return NextResponse.json(compareModels(A, B, { a: a.label, b: b.label, idA: a.id, idB: b.id })); } catch (e) { return fail(e); }
}
