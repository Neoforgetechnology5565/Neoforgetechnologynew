import { randomBytes } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/auth";
import { chatAutoReplyActive, emailChatConfirmation, greetChat } from "@/lib/auto-reply";
import { C, getContactSettings } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { notifyChat } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { chatStartSchema } from "@/lib/schemas";

export const runtime = "nodejs";

/** Start a conversation. Returns the id + a secret token the browser keeps to poll/send. */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    if (!rateLimit(`chatstart:${clientIp(req)}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many chats started" }, { status: 429 });
    if (!(await getContactSettings()).chatEnabled) return NextResponse.json({ error: "Chat disabled" }, { status: 403 });

    const data = chatStartSchema.parse(await req.json());
    const now = Date.now();
    const token = randomBytes(24).toString("hex");
    const ref = adminDb().collection(C.chats).doc();
    // anti-abuse: an address can start only a few chats a day that email automatic messages to it
    const dayAgo = now - 24 * 3600_000;
    const recent = (await adminDb().collection(C.chats).where("email", "==", data.email).limit(10).get()).docs.filter((d) => Number(d.data().createdAt || 0) > dayAgo).length;
    await ref.set({ emailMuted: recent >= 3, name: data.name, email: data.email, token, createdAt: now, updatedAt: now, lastMessage: data.message.slice(0, 120), unreadAdmin: 1, lastNotifiedAt: now });
    await ref.collection("messages").add({ from: "visitor", text: data.message, file: null, createdAt: now });
    const ai = (await chatAutoReplyActive()) && rateLimit(`aireply:${clientIp(req)}`, 40, 60 * 60_000);
    after(async () => {
      await notifyChat({ name: data.name, email: data.email, text: data.message, isNew: true });
      if (!ai) await emailChatConfirmation(ref.id); // greeting emails cover this when the assistant is on
    });
    if (ai) after(() => greetChat(ref.id));
    return NextResponse.json({ id: ref.id, token, ai });
  } catch (e) {
    return errorResponse(e);
  }
}
