import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/auth";
import { C, adminListProjects, invalidate } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { saveProject } from "@/lib/project-write";

export const GET = adminRoute(async () => NextResponse.json({ items: await adminListProjects() }));

export const POST = adminRoute(async (req) => {
  const id = await saveProject(null, await req.json());
  return NextResponse.json({ id });
});

export const PATCH = adminRoute(async (req) => {
  const { orders } = z.object({ orders: z.array(z.object({ id: z.string(), order: z.number().int() })).max(500) }).parse(await req.json());
  const batch = adminDb().batch();
  orders.forEach((o) => batch.update(adminDb().collection(C.projects).doc(o.id), { order: o.order }));
  await batch.commit();
  invalidate();
  return NextResponse.json({ ok: true });
});
