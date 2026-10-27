import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorize, capturesCol, fail, getCapture, imagesCol, limit, sameOrigin, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; cid: string }> };
export async function GET(req: NextRequest, { params }: Ctx) { try { limit(req, "cap", 240); const p = await params; await authorize(req, p.id); return NextResponse.json({ capture: await getCapture(p.id, p.cid) }); } catch (e) { return fail(e); } }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "cap", 120); const p = await params; await authorize(req, p.id); const c = await getCapture(p.id, p.cid);
    const b = z.object({ use: z.enum(["auto", "manual"]).optional(), side: z.enum(["left", "right"]).optional() }).parse(await req.json());
    if (b.use === "manual" && !c.manual?.ok) return NextResponse.json({ error: "There is no valid manual correction for this photo yet." }, { status: 409 });
    await capturesCol().doc(c.id).set({ ...(b.use ? { use: b.use } : {}), ...(b.side ? { side: b.side } : {}) }, { merge: true }); await touch(p.id, { status: "open" });
    return NextResponse.json({ capture: await getCapture(p.id, c.id) });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "capdel", 60); const p = await params; const { session } = await authorize(req, p.id); const c = await getCapture(p.id, p.cid);
    await capturesCol().doc(c.id).delete(); await imagesCol().doc(c.id).delete();
    const ac = { ...session.activeCapture }; if (ac[c.side] === c.id) delete ac[c.side]; await touch(p.id, { activeCapture: ac, status: "open" });
    return NextResponse.json({ deleted: true });
  } catch (e) { return fail(e); }
}
