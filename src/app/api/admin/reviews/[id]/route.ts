import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C, invalidate } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { reviewSchema } from "@/lib/schemas";

export const PUT = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await adminDb().collection(C.reviews).doc(id).set(reviewSchema.parse(await req.json()));
  invalidate();
  return NextResponse.json({ ok: true });
});
export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  await adminDb().collection(C.reviews).doc(id).delete();
  invalidate();
  return NextResponse.json({ ok: true });
});
