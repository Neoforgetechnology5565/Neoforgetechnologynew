import { NextResponse } from "next/server";
import { z } from "zod";
import { addAdminSub, removeAdminSub } from "@/lib/analytics/alerts-server";
import { adminRoute, HttpError } from "@/lib/auth";
import { pushConfigured, pushSubSchema } from "@/lib/push";

/** Admin only: register or remove this device for visitor alerts. */
export const POST = adminRoute(async (req) => {
  if (!pushConfigured()) throw new HttpError(503, "Push is not set up on this site yet (VAPID keys are missing).");
  await addAdminSub(pushSubSchema.parse(await req.json())); return NextResponse.json({ ok: true });
});
export const DELETE = adminRoute(async (req) => { await removeAdminSub(z.object({ endpoint: z.string().url().max(600) }).parse(await req.json()).endpoint); return NextResponse.json({ ok: true }); });
