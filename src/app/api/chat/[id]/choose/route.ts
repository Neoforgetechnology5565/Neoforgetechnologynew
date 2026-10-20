import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { errorResponse, HttpError } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { emailVisitor, notifyDeveloperRequested } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { siteUrl } from "@/lib/utils";

export const runtime = "nodejs";

/** The visitor picks "Continue with AI support" or "Talk to the Developer" after the welcome message. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) throw new HttpError(403, "Bad origin");
    if (!rateLimit(`chatchoose:${clientIp(req)}`, 20, 60_000)) throw new HttpError(429, "Slow down");
    const token = req.headers.get("x-chat-token") || "";
    const ref = adminDb().collection(C.chats).doc(id);
    const chat = (await ref.get()).data();
    const real = chat?.token as string | undefined;
    if (!chat || !real || real.length !== token.length || !timingSafeEqual(Buffer.from(real), Buffer.from(token))) throw new HttpError(403, "Forbidden");
    const { choice } = z.object({ choice: z.enum(["ai", "developer"]) }).parse(await req.json());
    if (chat.mode) return NextResponse.json({ ok: true, mode: chat.mode }); // already chosen

    const now = Date.now();
    const col = ref.collection("messages");
    if (choice === "ai") {
      await col.add({ from: "visitor", text: "Continue with AI support", file: null, createdAt: now });
      await col.add({ from: "ai", text: "Great! Ask me anything about your project. What are you hoping to build or automate?", file: null, createdAt: now + 1 });
      await ref.update({ mode: "ai", updatedAt: now + 1, lastMessage: "Chose AI support" });
    } else {
      await col.add({ from: "visitor", text: "Talk to the Developer", file: null, createdAt: now });
      await col.add({ from: "auto", text: "Thank you! I've notified the Developer, who will reply to you here personally. If you left an email address you'll get the reply there too. Meanwhile, feel free to add any details that will help.", file: null, createdAt: now + 1 });
      await ref.update({ mode: "human", humanTakeover: true, wantsHuman: true, unreadAdmin: FieldValue.increment(1), updatedAt: now + 1, lastMessage: "⚠ Wants to talk to the Developer" });
      const first = await col.where("from", "==", "visitor").orderBy("createdAt").limit(1).get();
      after(async () => {
        await notifyDeveloperRequested({ name: String(chat.name || "Visitor"), email: String(chat.email || ""), lastMessage: String(first.docs[0]?.data().text || "") });
        if (chat.email) await emailVisitor({ to: String(chat.email), subject: "We've notified our Developer", heading: `Hi ${String(chat.name || "").split(" ")[0] || "there"}, your request is with our Developer`, body: "Thank you for your message. Our Developer has been notified and will reply to you personally. You'll receive their reply by email, and in the chat if you keep it open.", cta: { href: `${siteUrl()}/live-chat`, label: "Open the chat" } });
      });
    }
    return NextResponse.json({ ok: true, mode: choice === "ai" ? "ai" : "human" });
  } catch (e) {
    return errorResponse(e);
  }
}
