import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorize, capturesCol, fail, getCapture, limit, reanalyse, sameOrigin, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string; cid: string }> };
const pt = z.object({ x: z.number().min(0).max(20000), y: z.number().min(0).max(20000) });
const schema = z.object({ corners: z.array(pt).length(4), paper: z.enum(["a4", "letter"]) });

/** Re-measure with the four paper corners placed by a person (image pixels of the stored photo). The automatic result is preserved. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "calib", 60); const p = await params; await authorize(req, p.id); const c = await getCapture(p.id, p.cid); const b = schema.parse(await req.json());
    if (b.corners.some((q) => q.x > c.width || q.y > c.height)) return NextResponse.json({ error: "A corner lies outside the photo." }, { status: 400 });
    const manual = await reanalyse(c, b.corners, b.paper); await capturesCol().doc(c.id).set({ manual, use: manual.ok ? "manual" : c.use }, { merge: true }); await touch(p.id, { status: "open" });
    return NextResponse.json({ capture: await getCapture(p.id, c.id) });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); const p = await params; await authorize(req, p.id); const c = await getCapture(p.id, p.cid); await capturesCol().doc(c.id).update({ manual: null, use: "auto" }); await touch(p.id, { status: "open" }); return NextResponse.json({ capture: await getCapture(p.id, c.id) }); } catch (e) { return fail(e); }
}
