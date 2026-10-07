import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { errorResponse, HttpError } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { chatMessageSchema } from "@/lib/schemas";

export const runtime = "nodejs";

async function authorise(req: NextRequest, id: string) {
  const token = req.headers.get("x-chat-token") || "";
  const ref = adminDb().collection(C.chats).doc(id);
  const snap = await ref.get();
  const real = snap.data()?.token as string | undefined;
  if (!real || real.length !== token.length || !timingSafeEqual(Buffer.from(real), Buffer.from(token))) throw new HttpError(403, "Forbidden");
  return ref;
}

/** Poll for messages newer than ?after=<ms>. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!rateLimit(`chatpoll:${clientIp(req)}`, 90, 60_000)) return NextResponse.json({ error: "Slow down" }, { status: 429 });
    const ref = await authorise(req, id);
    const after = Number(req.nextUrl.searchParams.get("after") || 0);
    const snap = await ref.collection("messages").where("createdAt", ">", after).orderBy("createdAt").limit(100).get();
    return NextResponse.json({ messages: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) throw new HttpError(403, "Bad origin");
    if (!rateLimit(`chatmsg:${clientIp(req)}`, 30, 60_000)) throw new HttpError(429, "Slow down");
    const ref = await authorise(req, id);
    const data = chatMessageSchema.parse(await req.json());
    const now = Date.now();
    const msg = await ref.collection("messages").add({ from: "visitor", text: data.text, file: data.file, createdAt: now });
    await ref.update({ updatedAt: now, lastMessage: (data.text || "📎 attachment").slice(0, 120), unreadAdmin: FieldValue.increment(1) });
    return NextResponse.json({ id: msg.id, createdAt: now });
  } catch (e) {
    return errorResponse(e);
  }
}
