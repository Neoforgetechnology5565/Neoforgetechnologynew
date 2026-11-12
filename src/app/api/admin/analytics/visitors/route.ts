import { NextResponse } from "next/server";
import { summarizeVisitor } from "@/lib/analytics/aggregate";
import { COL } from "@/lib/analytics/consts";
import { placeName } from "@/lib/analytics/geo";
import { adminRoute } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";

/** Admin only. ?filter=all|contacted&limit=100. Individual visitor records (random id, approximate place, device category, source, counts). */
export const GET = adminRoute(async (req) => {
  const u = new URL(req.url), contacted = u.searchParams.get("filter") === "contacted", limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 100));
  const col = adminDb().collection(COL.visitors);
  const snap = await (contacted ? col.where("convertedAt", ">", 0).orderBy("convertedAt", "desc") : col.orderBy("lastSeen", "desc")).limit(limit).get();
  return NextResponse.json({ items: snap.docs.map((d) => { const v = d.data(); return summarizeVisitor(d.id, v, placeName({ country: String(v.country ?? ""), regionName: String(v.regionName ?? ""), region: String(v.region ?? ""), city: String(v.city ?? "") })); }) });
});
