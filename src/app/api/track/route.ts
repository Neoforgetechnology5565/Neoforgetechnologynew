import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { C } from "@/lib/db";
import { adminDb, isFirebaseConfigured } from "@/lib/firebase-admin";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { trackSchema } from "@/lib/schemas";

export const runtime = "nodejs";
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests/i;
const key = (p: string) => p.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\//g, "~") || "~";

/**
 * First-party, cookie-less analytics. A random visitor id lives in the visitor's localStorage;
 * no IP address or user agent is stored. Country comes from the hosting platform's geo header.
 */
export async function POST(req: NextRequest) {
  const ok = NextResponse.json({ ok: true });
  if (!isFirebaseConfigured() || BOT.test(req.headers.get("user-agent") || "")) return ok;
  if (!rateLimit(`track:${clientIp(req)}`, 120, 60_000)) return ok;
  try {
    const body = trackSchema.parse(await req.json());
    if (!body.path.startsWith("/") || body.path.startsWith("/admin") || body.path.startsWith("/api")) return ok;

    const db = adminDb();
    const day = new Date().toISOString().slice(0, 10);
    const dayRef = db.collection(C.daily).doc(day);
    const country = (req.headers.get("x-vercel-ip-country") || "XX").slice(0, 2).toUpperCase();

    const inc = FieldValue.increment(1);
    const dailyUpdate: Record<string, unknown> = { views: inc, pages: { [key(body.path)]: inc }, countries: { [country]: inc } };
    if (body.project) dailyUpdate.projects = { [key(body.project)]: inc };

    // A visit = first hit by this visitor on this day; a unique visitor = first hit ever.
    let newDay = false;
    let newEver = false;
    try { await dayRef.collection("v").doc(body.vid).create({ t: Date.now() }); newDay = true; } catch { /* exists */ }
    try { await db.collection(C.visitors).doc(body.vid).create({ t: Date.now() }); newEver = true; } catch { /* exists */ }
    if (newDay) dailyUpdate.visits = inc;
    if (newDay) dailyUpdate.visitors = inc;

    await dayRef.set(dailyUpdate, { merge: true });
    await db.collection(C.totals).doc("all").set(
      { views: inc, ...(newDay ? { visits: inc } : {}), ...(newEver ? { uniqueVisitors: inc } : {}) },
      { merge: true },
    );
  } catch {
    /* analytics must never surface errors */
  }
  return ok;
}
