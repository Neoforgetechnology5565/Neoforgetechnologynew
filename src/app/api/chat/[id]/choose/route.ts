import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError } from "@/lib/auth";
import { applyChoice } from "@/lib/chat-choice";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** The visitor picks A (continue with AI for the enquiry) or B (talk to the Developer) after their first message. */
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
    const { mode, followUp } = await applyChoice(id, choice, { echo: true });
    after(followUp);
    return NextResponse.json({ ok: true, mode });
  } catch (e) {
    return errorResponse(e);
  }
}
