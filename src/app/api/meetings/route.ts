import { after, NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/auth";
import { getMeetingSettings } from "@/lib/db";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { firestoreStore } from "@/lib/meeting-store";
import { notifyMeeting, emailVisitor } from "@/lib/mail";
import { offeredSlots, requestMeeting, SlotError } from "@/lib/meeting-service";
import { formatSlot } from "@/lib/meetings";
import { COUNTRY_NAME } from "@/lib/countries";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { meetingRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

/** Public: the slots currently on offer (team working hours in the team's zone), as UTC instants. Without a database there is nothing to book against. */
export async function GET() {
  try {
    const s = await getMeetingSettings();
    if (!s.enabled) return NextResponse.json({ enabled: false, slots: [], tz: s.tz, durationMin: s.durationMin, bookingUrl: s.bookingUrl });
    const slots = isFirebaseConfigured() ? await offeredSlots(firestoreStore(), s, Date.now()) : [];
    return NextResponse.json({ enabled: true, slots, tz: s.tz, durationMin: s.durationMin, bookingUrl: s.bookingUrl, now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}

/** Public: request a meeting. This only records a request; it is confirmed by a person, by email. */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin"), host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    if (!rateLimit(`meeting:${clientIp(req)}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const { website, startedAt, ...input } = meetingRequestSchema.parse(await req.json());
    if (website || (startedAt && Date.now() - startedAt < 2000)) return NextResponse.json({ ok: true, fake: true });
    const s = await getMeetingSettings();
    const r = await requestMeeting(firestoreStore(), s, input, Date.now());
    after(async () => {
      await notifyMeeting({ ...input, country: COUNTRY_NAME[input.country] || input.country, durationMin: r.durationMin }, s.tz);
      await emailVisitor({ to: input.email, subject: "We received your meeting request — not confirmed yet", heading: "Meeting request received",
        body: `Hi ${input.name.split(" ")[0]},\n\nThanks for requesting a ${r.durationMin}-minute call (${input.purpose}).\n\nRequested time: ${formatSlot(input.start, input.tz)} (your time)\nSame time for us: ${formatSlot(input.start, s.tz)}\n\nThis is a request, not a confirmed booking. We will reply by email to confirm it or to suggest another time.` });
    });
    return NextResponse.json({ ok: true, id: r.id, durationMin: r.durationMin, status: "requested" });
  } catch (e) {
    if (e instanceof SlotError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "disabled" ? 503 : 409 });
    return errorResponse(e);
  }
}
