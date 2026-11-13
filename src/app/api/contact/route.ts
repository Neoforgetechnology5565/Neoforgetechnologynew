import { randomBytes } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { planInquiryStats, recordStats } from "@/lib/analytics/intl";
import { recordConversion, type Db } from "@/lib/analytics/process";
import { errorResponse } from "@/lib/auth";
import { autoReplyToInquiry } from "@/lib/auto-reply";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { notifyInquiry } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { inquirySchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    if (!rateLimit(`contact:${clientIp(req)}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

    const { website, vid, startedAt, ...data } = inquirySchema.parse(await req.json());
    if (website) return NextResponse.json({ ok: true }); // honeypot: silently accept
    if (startedAt && Date.now() - startedAt < 2500) return NextResponse.json({ ok: true }); // submitted faster than a person can type: silently accept

    const pushToken = randomBytes(24).toString("hex");
    const ref = await adminDb().collection(C.inquiries).add({ ...data, status: "unread", createdAt: Date.now(), pushToken });
    if (vid) { // visitor accepted statistics: link this inquiry to their visit; never blocks or fails the inquiry
      try { const visitor = await recordConversion(adminDb() as unknown as Db, (n) => FieldValue.increment(n), { vid, inquiryId: ref.id }); if (visitor) await ref.update({ visitor }); } catch { /* analytics must never affect an inquiry */ }
    }
    try { await recordStats(adminDb() as unknown as Db, (n) => FieldValue.increment(n), planInquiryStats({ country: data.country, service: data.service, intent: data.intent, preferredContact: data.preferredContact, currency: data.currency })); } catch { /* statistics must never affect an inquiry */ }
    after(async () => { // emails go out after the response is sent; they never block or fail the visitor
      await notifyInquiry(data);
      await autoReplyToInquiry(ref.id, data);
    });
    return NextResponse.json({ ok: true, id: ref.id, token: pushToken });
  } catch (e) {
    return errorResponse(e);
  }
}
