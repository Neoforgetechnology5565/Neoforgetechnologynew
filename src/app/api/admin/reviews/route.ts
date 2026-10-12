import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C, adminListReviews, invalidate } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { reviewSchema } from "@/lib/schemas";

export const GET = adminRoute(async () => NextResponse.json({ items: await adminListReviews() }));
export const POST = adminRoute(async (req) => {
  const ref = await adminDb().collection(C.reviews).add(reviewSchema.parse(await req.json()));
  invalidate();
  return NextResponse.json({ id: ref.id });
});
