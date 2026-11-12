import { NextResponse } from "next/server";
import { buildReport } from "@/lib/analytics/aggregate";
import { COL } from "@/lib/analytics/consts";
import { pruneVisitors, type Db } from "@/lib/analytics/process";
import { makeTitles } from "@/lib/analytics/titles";
import { adminRoute } from "@/lib/auth";
import { adminListProjects } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

/** Admin only. ?days=7|30|90 (default 30). */
export const GET = adminRoute(async (req) => {
  const db = adminDb(), n = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const ids = Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
  const [docs, totals, projects] = await Promise.all([Promise.all(ids.map((id) => db.collection(COL.daily).doc(id).get())), db.collection(COL.totals).doc("all").get(), adminListProjects()]);
  void pruneVisitors(db as unknown as Db).catch(() => 0); // retention: individual visitor records older than 180 days are removed
  return NextResponse.json(buildReport(docs.map((d, i) => ({ day: ids[i], data: d.data() })), totals.data(), makeTitles(projects)));
});
