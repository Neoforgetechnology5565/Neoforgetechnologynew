import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

export const PATCH = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { status } = z.object({ status: z.enum(["read", "unread"]) }).parse(await req.json());
  await adminDb().collection(C.inquiries).doc(id).update({ status });
  return NextResponse.json({ ok: true });
});
export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => {
  await adminDb().collection(C.inquiries).doc((await params).id).delete();
  return NextResponse.json({ ok: true });
});
