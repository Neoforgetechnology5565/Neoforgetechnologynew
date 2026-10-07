import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/auth";
import { C, adminListCategories, invalidate } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { categorySchema } from "@/lib/schemas";
import { slugify } from "@/lib/utils";

export const GET = adminRoute(async () => NextResponse.json({ items: await adminListCategories() }));

export const POST = adminRoute(async (req) => {
  const data = categorySchema.parse(await req.json());
  const slug = slugify(data.slug || data.name);
  if (!slug) throw new HttpError(400, "Invalid name");
  const id = `${data.division}--${slug}`;
  const ref = adminDb().collection(C.categories).doc(id);
  if ((await ref.get()).exists) throw new HttpError(409, "A category with this name already exists in the division");
  await ref.set({ ...data, slug });
  invalidate();
  return NextResponse.json({ id });
});

/** Bulk reorder: { orders: [{ id, order }] } */
export const PATCH = adminRoute(async (req) => {
  const { orders } = z.object({ orders: z.array(z.object({ id: z.string(), order: z.number().int() })).max(200) }).parse(await req.json());
  const batch = adminDb().batch();
  orders.forEach((o) => batch.update(adminDb().collection(C.categories).doc(o.id), { order: o.order }));
  await batch.commit();
  invalidate();
  return NextResponse.json({ ok: true });
});
