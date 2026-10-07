import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { inquirySchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    if (!rateLimit(`contact:${clientIp(req)}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

    const { website, ...data } = inquirySchema.parse(await req.json());
    if (website) return NextResponse.json({ ok: true }); // honeypot: silently accept

    await adminDb().collection(C.inquiries).add({ ...data, status: "unread", createdAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
