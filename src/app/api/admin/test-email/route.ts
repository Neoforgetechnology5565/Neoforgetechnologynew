import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { mailConfigured, recipient, sendMail } from "@/lib/mail";

export const runtime = "nodejs";

/** Status of the email setup (no secrets). */
export const GET = adminRoute(async () => NextResponse.json({ configured: mailConfigured(), to: mailConfigured() ? await recipient() : "", host: process.env.SMTP_HOST || "" }));

/** Sends a test message so you can confirm Zoho/SMTP is set up correctly. */
export const POST = adminRoute(async () => {
  const to = await recipient();
  const r = await sendMail({
    to,
    subject: "Test email from your Neo Forge website",
    text: "This is a test. If you can read this, new inquiries and chats will be emailed to this address.",
    html: '<div style="font-family:Georgia,serif">This is a test. If you can read this, new <b>inquiries</b> and <b>chats</b> will be emailed to this address.</div>',
  });
  return NextResponse.json({ ...r, to }, { status: r.ok ? 200 : 502 });
});
