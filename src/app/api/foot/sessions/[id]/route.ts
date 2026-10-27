import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, authorize, capturesCol, deleteSession, fail, limit, listCaptures, sameOrigin, sessionDTO, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const patch = z.object({ name: z.string().trim().min(1).max(60).optional(), paper: z.enum(["a4", "letter"]).optional(), fit: z.enum(["snug", "regular", "roomy"]).optional(), activeCapture: z.object({ left: z.string().regex(/^[a-f0-9]{32}$/).optional(), right: z.string().regex(/^[a-f0-9]{32}$/).optional() }).optional() });

export async function GET(req: NextRequest, { params }: Ctx) {
  try { limit(req, "get", 240); const { session } = await authorize(req, (await params).id, true); const n = (await capturesCol().where("sessionId", "==", session.id).get()).size; return NextResponse.json({ session: sessionDTO(session, n) }); } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "patch", 120); const { session } = await authorize(req, (await params).id); const b = patch.parse(await req.json());
    const caps = await listCaptures(session.id); const p: Record<string, unknown> = {};
    if (b.name) p.name = b.name; if (b.paper) p.paper = b.paper; if (b.fit) p.fit = b.fit;
    if (b.activeCapture) { const next = { ...session.activeCapture }; for (const side of ["left", "right"] as const) { const cid = b.activeCapture[side]; if (cid) { const c = caps.find((x) => x.id === cid && x.side === side); if (!c) throw new HttpError(400, "That capture does not exist for this side"); next[side] = cid; } } p.activeCapture = next; p.status = "open"; }
    await touch(session.id, p); const fresh = { ...session, ...p } as typeof session; return NextResponse.json({ session: sessionDTO(fresh, caps.length) });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); limit(req, "del", 30); const { session } = await authorize(req, (await params).id); await deleteSession(session.id); return NextResponse.json({ deleted: true }); } catch (e) { return fail(e); }
}
