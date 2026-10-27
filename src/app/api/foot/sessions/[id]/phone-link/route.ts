import { NextResponse, type NextRequest } from "next/server";
import { FOOT_LIMITS } from "@/lib/foot/api-types";
import { authorize, fail, keyHash, limit, newKey, sameOrigin, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
/** Mint a short-lived, capture-only token for the phone. It is shown once (in the QR link fragment) and only its hash is stored. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "link", 20, 10 * 60_000); const { session } = await authorize(req, (await params).id);
    const token = newKey(), exp = Date.now() + FOOT_LIMITS.phoneTokenMinutes * 60_000; await touch(session.id, { phoneHash: keyHash(token), phoneExp: exp });
    return NextResponse.json({ token, expiresAt: exp, permissions: ["read session summary", "list captures", "upload captures"] }, { status: 201 });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); const { session } = await authorize(req, (await params).id); await touch(session.id, { phoneHash: "", phoneExp: 0 }); return NextResponse.json({ revoked: true }); } catch (e) { return fail(e); }
}
