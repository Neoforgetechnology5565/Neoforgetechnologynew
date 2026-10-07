import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C, adminListFaqs, invalidate } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { faqSchema } from "@/lib/schemas";

export const GET = adminRoute(async () => NextResponse.json({ items: await adminListFaqs() }));
export const POST = adminRoute(async (req) => {
  const ref = await adminDb().collection(C.faqs).add(faqSchema.parse(await req.json()));
  invalidate();
  return NextResponse.json({ id: ref.id });
});
