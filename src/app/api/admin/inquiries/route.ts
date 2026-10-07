import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import type { Inquiry } from "@/lib/types";

export const GET = adminRoute(async () => {
  const snap = await adminDb().collection(C.inquiries).orderBy("createdAt", "desc").limit(300).get();
  return NextResponse.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Inquiry) });
});
