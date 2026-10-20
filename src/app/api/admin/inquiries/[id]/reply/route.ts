import { after, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { emailVisitor, mailConfigured } from "@/lib/mail";
import { pushToInquiry } from "@/lib/notify-visitor";

const body = z.object({ text: z.string().trim().min(1).max(5000).transform((s) => s.replace(/<[^>]*>/g, "")) });

/** Reply to an enquiry from the admin: the text is emailed to the address the visitor entered, and kept on the inquiry. */
export const POST = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { text } = body.parse(await req.json());
  if (!mailConfigured()) throw new HttpError(503, "Email is not set up, so the reply can't be sent. Set the SMTP variables in Vercel (see Maintenance).");
  const ref = adminDb().collection(C.inquiries).doc(id);
  const q = (await ref.get()).data();
  if (!q) throw new HttpError(404, "Inquiry not found");
  const r = await emailVisitor({
    to: String(q.email), subject: "Re: your enquiry to Neo Forge Technology",
    heading: `Hi ${String(q.name || "").split(" ")[0] || "there"}, a reply to your enquiry`,
    body: `${text}\n\n———\nYour original message:\n${String(q.message || "").slice(0, 1500)}`,
  });
  if (!r.ok) throw new HttpError(502, `The email could not be sent: ${r.error}`);
  const at = Date.now();
  await ref.update({ replies: FieldValue.arrayUnion({ at, text }), status: "read" });
  after(() => pushToInquiry(id, text));
  return NextResponse.json({ ok: true, at });
});
