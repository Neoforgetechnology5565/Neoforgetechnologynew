import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { C } from "@/lib/db";
import { adminDb, isFirebaseConfigured } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests/i;
const body = z.object({ sid: z.string().regex(/^[A-Za-z0-9]{8,40}$/), path: z.string().max(200).startsWith("/") });

/**
 * "Online now" heartbeat. The id is random per page load and kept only in memory (nothing is stored on the visitor's
 * device); we store the id, the page path, the country from the hosting header and a timestamp. No IP address or user agent.
 */
export async function POST(req: NextRequest) {
  const ok = NextResponse.json({ ok: true });
  if (!isFirebaseConfigured() || BOT.test(req.headers.get("user-agent") || "")) return ok;
  if (!rateLimit(`presence:${clientIp(req)}`, 60, 60_000)) return ok;
  try {
    const b = body.parse(await req.json());
    if (b.path.startsWith("/admin") || b.path.startsWith("/api")) return ok;
    const db = adminDb();
    const now = Date.now();
    await db.collection(C.presence).doc(b.sid).set({ at: now, path: b.path.slice(0, 200), country: (req.headers.get("x-vercel-ip-country") || "XX").slice(0, 2).toUpperCase() });
    if (Math.random() < 0.03) { // tidy old heartbeats now and then
      const old = await db.collection(C.presence).where("at", "<", now - 3600_000).limit(200).get();
      if (!old.empty) { const batch = db.batch(); old.docs.forEach((d) => batch.delete(d.ref)); await batch.commit(); }
    }
  } catch { /* bad input: ignore */ }
  return ok;
}
