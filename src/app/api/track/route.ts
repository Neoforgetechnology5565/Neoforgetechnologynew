import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { processTrack, type Db } from "@/lib/analytics/process";
import { adminDb, isFirebaseConfigured } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests/i;

/**
 * First-party, cookie-less analytics, sent only after the visitor accepted statistics. A random visitor id lives in the visitor's localStorage.
 * Nothing identifying is stored: no IP address, no raw user agent, no full referrer URL. Location is the hosting platform's approximate,
 * IP-derived country, region and city (request headers); device and browser are coarse categories. See lib/analytics for the exact fields.
 */
export async function POST(req: NextRequest) {
  const ok = NextResponse.json({ ok: true });
  const ua = req.headers.get("user-agent") || "";
  if (!isFirebaseConfigured() || BOT.test(ua) || req.headers.get("dnt") === "1") return ok;
  if (!rateLimit(`track:${clientIp(req)}`, 150, 60_000)) return ok;
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    await processTrack({ db: adminDb() as unknown as Db, inc: (n) => FieldValue.increment(n), headers: req.headers, body: await req.json(), ua, selfHosts: [host] });
  } catch {
    /* analytics must never surface errors */
  }
  return ok;
}
