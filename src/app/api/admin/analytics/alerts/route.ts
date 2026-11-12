import { NextResponse } from "next/server";
import { adminSubs } from "@/lib/analytics/alerts-server";
import { alertSettingsSchema, ALERT_DOC, readSettings } from "@/lib/analytics/alerts";
import type { Db } from "@/lib/analytics/process";
import { adminRoute } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { mailConfigured, recipient } from "@/lib/mail";
import { pushConfigured } from "@/lib/push";

const state = async () => {
  const s = await readSettings(adminDb() as unknown as Db), { lastAlertAt, pending, ...settings } = s;
  return { settings, lastAlertAt: lastAlertAt ?? null, pending: pending ?? 0, emailConfigured: mailConfigured(), emailTo: mailConfigured() ? await recipient() : "", pushConfigured: pushConfigured(), devices: pushConfigured() ? (await adminSubs()).length : 0 };
};
/** Admin only. */
export const GET = adminRoute(async () => NextResponse.json(await state()));
export const PUT = adminRoute(async (req) => {
  await adminDb().collection(ALERT_DOC.collection).doc(ALERT_DOC.id).set(alertSettingsSchema.parse(await req.json()), { merge: true });
  return NextResponse.json(await state());
});
