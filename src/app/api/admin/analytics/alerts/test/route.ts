import { NextResponse } from "next/server";
import { alertSenders } from "@/lib/analytics/alerts-server";
import { message, readSettings } from "@/lib/analytics/alerts";
import type { Db } from "@/lib/analytics/process";
import { adminRoute } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { mailConfigured } from "@/lib/mail";
import { pushConfigured } from "@/lib/push";

/** Admin only: sends a sample alert through the channels that are switched on, and says what happened. */
export const POST = adminRoute(async () => {
  const s = await readSettings(adminDb() as unknown as Db), m = message({ newVisitor: true, place: "Lagos, Lagos, Nigeria", source: "Google", channel: "search", landing: "/services/revit-plugin-development", device: "mobile" }, 0);
  m.title = "Test: " + m.title;
  const out: Record<string, string> = {};
  if (s.email) out.email = !mailConfigured() ? "not configured (SMTP variables missing)" : await alertSenders.email(m).then(() => "sent", (e) => `failed: ${(e as Error).message}`);
  if (s.push) out.push = !pushConfigured() ? "not configured (VAPID keys missing)" : await alertSenders.push(m).then(() => "sent to your enabled devices", (e) => `failed: ${(e as Error).message}`);
  if (!s.email && !s.push) out.note = "Switch on email and/or push first.";
  return NextResponse.json(out);
});
