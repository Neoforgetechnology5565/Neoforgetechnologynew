import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/auth";
import { C, getMeetingSettings } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { emailVisitor } from "@/lib/mail";
import { formatSlot } from "@/lib/meetings";
import type { MeetingRequest } from "@/lib/types";

/** Confirm or decline a meeting request. The visitor is emailed with the time in their zone and ours; a declined request frees the slot. Nothing is "booked" until this is called with confirmed. */
export const PATCH = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { status, message } = z.object({ status: z.enum(["confirmed", "declined"]), message: z.string().max(1500).default("") }).parse(await req.json());
  const ref = adminDb().collection(C.meetings).doc(id), snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Not found");
  const m = { id, ...snap.data() } as MeetingRequest, s = await getMeetingSettings();
  await ref.update({ status, decidedAt: Date.now(), message });
  if (status === "declined") await adminDb().collection(C.meetingSlots).doc(String(m.start)).delete().catch(() => undefined);
  const when = `${formatSlot(m.start, m.tz)} (your time)\n${formatSlot(m.start, s.tz)} (our time)`;
  const body = status === "confirmed" ? `Hi ${m.name.split(" ")[0]},\n\nYour ${m.durationMin}-minute call is confirmed:\n\n${when}\n\n${message || "We will send the meeting link before the call if it was not included here."}` : `Hi ${m.name.split(" ")[0]},\n\nThank you for your request for ${formatSlot(m.start, m.tz)}. Unfortunately we cannot take that slot.\n\n${message || "Please pick another time on our website or reply with times that suit you."}`;
  let emailed = false, emailError = "";
  try { const r = await emailVisitor({ to: m.email, subject: status === "confirmed" ? "Your meeting is confirmed" : "About your meeting request", heading: status === "confirmed" ? "Meeting confirmed" : "Meeting request update", body }); emailed = r.ok; emailError = r.error || ""; } catch (e) { emailError = (e as Error).message; }
  return NextResponse.json({ ok: true, emailed, emailError });
});
