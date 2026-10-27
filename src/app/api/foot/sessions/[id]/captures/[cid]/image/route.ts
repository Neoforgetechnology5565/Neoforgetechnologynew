import { NextResponse, type NextRequest } from "next/server";
import { authorize, fail, getCapture, getImage, limit } from "@/lib/foot/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; cid: string }> };
/** The stored (downscaled) photo. Owner only; never cached by shared caches; never reachable without the session key. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try { limit(req, "img", 240); const p = await params; await authorize(req, p.id); const c = await getCapture(p.id, p.cid); const buf = await getImage(c.id);
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }); } catch (e) { return fail(e); }
}
