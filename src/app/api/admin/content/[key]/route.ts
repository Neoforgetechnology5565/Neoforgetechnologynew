import { NextResponse } from "next/server";
import { adminRoute, HttpError } from "@/lib/auth";
import { C, adminGetContent, invalidate } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { contentSchemas, type ContentKey } from "@/lib/schemas";

const key = (k: string): ContentKey => {
  if (!(k in contentSchemas)) throw new HttpError(404, "Unknown content key");
  return k as ContentKey;
};

export const GET = adminRoute<{ key: string }>(async (_req, { params }) =>
  NextResponse.json({ item: await adminGetContent(key((await params).key)) }),
);

export const PUT = adminRoute<{ key: string }>(async (req, { params }) => {
  const k = key((await params).key);
  const data = contentSchemas[k].parse(await req.json());
  await adminDb().collection(C.content).doc(k).set(data);
  invalidate();
  return NextResponse.json({ ok: true });
});
