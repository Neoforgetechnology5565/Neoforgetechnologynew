import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LIMITS, log } from "@/lib/bim/collab";
import { HttpError, authorize, fail, keyHash, limit, newKey, sameOrigin, saveProject } from "@/lib/bim/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "shg", 60); const { project } = await authorize(req, (await params).id); return NextResponse.json({ shares: (project.shares ?? []).map((s) => ({ name: s.name, role: s.role, createdAt: s.createdAt, id: s.hash.slice(0, 10) })) }); } catch (e) { return fail(e); } }
/** Create a share key with the role viewer (read only) or reviewer (can add issues and comments). The key is shown once; only its hash is stored. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "shadd", 20, 10 * 60_000); const { project } = await authorize(req, (await params).id); const b = z.object({ name: z.string().trim().min(1).max(40), role: z.enum(["viewer", "reviewer"]) }).parse(await req.json());
    if ((project.shares ?? []).length >= LIMITS.shares) throw new HttpError(409, `A project can have ${LIMITS.shares} share keys. Revoke one first.`); const key = newKey(); project.shares = [...(project.shares ?? []), { hash: keyHash(key), role: b.role, name: b.name, createdAt: Date.now() }]; log(project, "Owner", "share", `${b.name} (${b.role})`); await saveProject(project);
    return NextResponse.json({ share: { name: b.name, role: b.role, id: keyHash(key).slice(0, 10) }, key }, { status: 201 }); } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) { try { sameOrigin(req); limit(req, "shdel", 30, 10 * 60_000); const { project } = await authorize(req, (await params).id); const id = new URL(req.url).searchParams.get("id") ?? ""; const n = (project.shares ?? []).length; project.shares = (project.shares ?? []).filter((s) => s.hash.slice(0, 10) !== id); if (project.shares.length === n) throw new HttpError(404, "Share not found"); log(project, "Owner", "share-revoked", id); await saveProject(project); return NextResponse.json({ revoked: true }); } catch (e) { return fail(e); } }
