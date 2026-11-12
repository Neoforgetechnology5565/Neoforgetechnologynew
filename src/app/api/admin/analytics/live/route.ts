import { NextResponse } from "next/server";
import { ONLINE_WINDOW_MS, summarizeLive } from "@/lib/analytics/live";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

/** Admin only: visitors on the site right now (open pages that sent a heartbeat in the last 90 seconds). */
export const GET = adminRoute(async () => {
  const snap = await adminDb().collection(C.presence).where("at", ">", Date.now() - ONLINE_WINDOW_MS).limit(500).get();
  return NextResponse.json(summarizeLive(snap.docs.map((d) => d.data())));
});
