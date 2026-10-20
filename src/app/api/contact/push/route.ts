import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { addSub, pushConfigured, pushSubSchema, type PushSub } from "@/lib/push";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Saves a visitor's opt-in notification subscription for the enquiry they just sent. */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) throw new HttpError(403, "Bad origin");
    if (!pushConfigured()) throw new HttpError(503, "Notifications are not set up on this site.");
    if (!rateLimit(`inqpush:${clientIp(req)}`, 10, 60_000)) throw new HttpError(429, "Slow down");
    const b = z.object({ id: z.string().min(5).max(60), token: z.string().length(48), sub: pushSubSchema }).parse(await req.json());
    const ref = adminDb().collection(C.inquiries).doc(b.id);
    const q = (await ref.get()).data();
    const real = q?.pushToken as string | undefined;
    if (!q || !real || real.length !== b.token.length || !timingSafeEqual(Buffer.from(real), Buffer.from(b.token))) throw new HttpError(403, "Forbidden");
    await ref.update({ pushSubs: addSub(q.pushSubs as PushSub[] | undefined, b.sub) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
