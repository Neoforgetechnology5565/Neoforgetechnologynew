import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/auth";
import { C, invalidate, toPost } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { savePost } from "@/lib/post-write";

export const GET = adminRoute<{ id: string }>(async (_req, { params }) => {
  const doc = await adminDb().collection(C.posts).doc((await params).id).get();
  if (!doc.exists) throw new HttpError(404, "Not found");
  return NextResponse.json({ item: toPost(doc.id, doc.data()!) });
});
export const PUT = adminRoute<{ id: string }>(async (req, { params }) => {
  const id = (await params).id;
  await savePost(id, await req.json());
  return NextResponse.json({ id });
});
/** Quick publish/unpublish from the list. */
export const PATCH = adminRoute<{ id: string }>(async (req, { params }) => {
  const id = (await params).id;
  const { status } = z.object({ status: z.enum(["draft", "published"]) }).parse(await req.json());
  const ref = adminDb().collection(C.posts).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Not found");
  await ref.update({ status, updatedAt: Date.now(), ...(status === "published" && !snap.data()!.publishedAt ? { publishedAt: Date.now() } : {}) });
  invalidate();
  return NextResponse.json({ ok: true });
});
export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => {
  await adminDb().collection(C.posts).doc((await params).id).delete();
  invalidate();
  return NextResponse.json({ ok: true });
});
