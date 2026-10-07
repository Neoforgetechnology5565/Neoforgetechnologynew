import { NextResponse } from "next/server";
import { adminRoute, HttpError } from "@/lib/auth";
import { C, invalidate } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { categorySchema } from "@/lib/schemas";
import { slugify } from "@/lib/utils";

export const PUT = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const data = categorySchema.parse(await req.json());
  const ref = adminDb().collection(C.categories).doc(id);
  if (!(await ref.get()).exists) throw new HttpError(404, "Not found");
  const slug = slugify(data.slug || data.name);
  await ref.set({ ...data, slug });
  // Keep denormalised names on projects in sync
  const projects = await adminDb().collection(C.projects).where("categoryId", "==", id).get();
  if (!projects.empty) {
    const batch = adminDb().batch();
    projects.docs.forEach((p) => batch.update(p.ref, { categoryName: data.name, division: data.division }));
    await batch.commit();
  }
  invalidate();
  return NextResponse.json({ ok: true });
});

export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const used = await adminDb().collection(C.projects).where("categoryId", "==", id).limit(1).get();
  if (!used.empty) throw new HttpError(409, "Category has projects. Move or delete them first, or disable the category instead.");
  await adminDb().collection(C.categories).doc(id).delete();
  invalidate();
  return NextResponse.json({ ok: true });
});
