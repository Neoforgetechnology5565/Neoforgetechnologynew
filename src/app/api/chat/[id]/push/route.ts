import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { addSub, pushConfigured, pushSubSchema, type PushSub } from "@/lib/push";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Saves a visitor's opt-in browser/phone notification subscription for their chat. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) throw new HttpError(403, "Bad origin");
    if (!pushConfigured()) throw new HttpError(503, "Notifications are not set up on this site.");
    if (!rateLimit(`chatpush:${clientIp(req)}`, 10, 60_000)) throw new HttpError(429, "Slow down");
    const token = req.headers.get("x-chat-token") || "";
    const ref = adminDb().collection(C.chats).doc(id);
    const chat = (await ref.get()).data();
    const real = chat?.token as string | undefined;
    if (!chat || !real || real.length !== token.length || !timingSafeEqual(Buffer.from(real), Buffer.from(token))) throw new HttpError(403, "Forbidden");
    const sub = pushSubSchema.parse(await req.json());
    await ref.update({ pushSubs: addSub(chat.pushSubs as PushSub[] | undefined, sub) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
