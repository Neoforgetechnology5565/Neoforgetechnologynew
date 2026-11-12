import { NextResponse } from "next/server";
import { summarizeVisitor } from "@/lib/analytics/aggregate";
import { COL } from "@/lib/analytics/consts";
import { placeName } from "@/lib/analytics/geo";
import { adminRoute, HttpError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";

const ok = (v: string) => /^[a-zA-Z0-9_-]{8,64}$/.test(v);
type P = { vid: string };
export const GET = adminRoute<P>(async (_req, { params }) => {
  const { vid } = await params; if (!ok(vid)) throw new HttpError(400, "Bad id");
  const s = await adminDb().collection(COL.visitors).doc(vid).get(); if (!s.exists) throw new HttpError(404, "Not found");
  const v = s.data() as Record<string, unknown>;
  return NextResponse.json({ ...summarizeVisitor(vid, v, placeName({ country: String(v.country ?? ""), regionName: String(v.regionName ?? ""), region: String(v.region ?? ""), city: String(v.city ?? "") })), journey: v.journey ?? [], clickLog: v.clickLog ?? [], language: v.lang ?? "", ipTimezone: v.ipTimezone ?? "" });
});
/** Erases one visitor's record (for a deletion request). Aggregate daily counters are anonymous and stay. */
export const DELETE = adminRoute<P>(async (_req, { params }) => {
  const { vid } = await params; if (!ok(vid)) throw new HttpError(400, "Bad id");
  await adminDb().collection(COL.visitors).doc(vid).delete(); return NextResponse.json({ ok: true });
});
