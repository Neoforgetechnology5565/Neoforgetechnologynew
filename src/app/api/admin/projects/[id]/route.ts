import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/auth";
import { C, invalidate, toProject } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { saveProject } from "@/lib/project-write";

export const GET = adminRoute<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const doc = await adminDb().collection(C.projects).doc(id).get();
  if (!doc.exists) throw new HttpError(404, "Not found");
  return NextResponse.json({ item: toProject(doc.id, doc.data()!) });
});

export const PUT = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  await saveProject(id, await req.json());
  return NextResponse.json({ id });
});

/** Quick toggles from the list view: publish/unpublish, feature */
export const PATCH = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const patch = z.object({ status: z.enum(["draft", "published"]).optional(), featured: z.boolean().optional() }).parse(await req.json());
  await adminDb().collection(C.projects).doc(id).update({ ...patch, updatedAt: Date.now() });
  invalidate();
  return NextResponse.json({ ok: true });
});

export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  await adminDb().collection(C.projects).doc(id).delete();
  invalidate();
  return NextResponse.json({ ok: true });
});
