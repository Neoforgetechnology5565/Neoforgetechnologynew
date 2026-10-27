import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { C_CCTV } from "@/lib/cctv/collections";
import { capabilities } from "@/lib/cctv/server";

export const runtime = "nodejs";
export async function GET() {
  let db = "ok";
  try { await adminDb().collection(C_CCTV.jobs).limit(1).get(); } catch { db = "unavailable"; }
  const c = capabilities();
  return NextResponse.json({ ok: db === "ok", database: db, ffmpeg: c.ffmpeg, workerInference: c.workerInference, time: new Date().toISOString() }, { status: db === "ok" ? 200 : 503 });
}
