import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/auth";
import { C, getContactSettings } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
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
    await ref.set({ name: data.name, email: data.email, token, createdAt: now, updatedAt: now, lastMessage: data.message.slice(0, 120), unreadAdmin: 1 });
    await ref.collection("messages").add({ from: "visitor", text: data.message, file: null, createdAt: now });
    return NextResponse.json({ id: ref.id, token });
  } catch (e) {
    return errorResponse(e);
  }
}
