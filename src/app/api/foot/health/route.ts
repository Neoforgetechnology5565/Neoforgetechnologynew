import { NextResponse } from "next/server";
import { FOOT_LIMITS } from "@/lib/foot/api-types";
import { RULESET } from "@/lib/foot/sizing";
import { C_FOOT, retentionMs, sessionsCol } from "@/lib/foot/server";

export const runtime = "nodejs";
export async function GET() {
  let db = "ok"; try { await sessionsCol().limit(1).get(); } catch { db = "unavailable"; }
  return NextResponse.json({ ok: db === "ok", database: db, collections: C_FOOT, limits: FOOT_LIMITS, retentionHours: retentionMs() / 3600_000, sizingRuleset: RULESET.id, processing: "in-request (no background worker)", reconstruction: "none (top-view silhouette measurement only)", time: new Date().toISOString() }, { status: db === "ok" ? 200 : 503 });
}
