import "server-only";
import { C } from "./db";
import { adminDb } from "./firebase-admin";
import { emailVisitor, mailConfigured } from "./mail";
import { pushConfigured, sendPush, type PushSub } from "./push";
import { siteUrl } from "./utils";

const MAX_EMAIL_COPIES = 30;

/** Tells a chat visitor about a new message from us: a browser/phone notification (if they opted in) and, for our own replies, an email copy to the address they gave. Never throws. */
export async function notifyChatVisitor(chatId: string, text: string, opts: { email: boolean; from: "you" | "ai" }): Promise<void> {
  try {
    const ref = adminDb().collection(C.chats).doc(chatId);
    const chat = (await ref.get()).data();
    if (!chat) return;
    if (pushConfigured() && Array.isArray(chat.pushSubs) && chat.pushSubs.length) {
      const keep = await sendPush(chat.pushSubs as PushSub[], { title: opts.from === "ai" ? "Neo Forge assistant replied" : "Neo Forge replied to you", body: text, url: "/live-chat", tag: `chat-${chatId}` });
      if (keep.length !== chat.pushSubs.length) await ref.update({ pushSubs: keep });
    }
    if (opts.email && mailConfigured() && chat.email && Number(chat.emailCopies || 0) < MAX_EMAIL_COPIES) {
      const r = await emailVisitor({ to: String(chat.email), subject: "Neo Forge Technology replied to your message", heading: `Hi ${String(chat.name || "").split(" ")[0] || "there"}, we replied to your chat`, body: text, cta: { href: `${siteUrl()}/live-chat`, label: "Continue the conversation" } });
      if (r.ok) await ref.update({ emailCopies: Number(chat.emailCopies || 0) + 1 });
    }
  } catch (e) {
    console.error("[notify-visitor]", (e as Error).message?.slice(0, 160));
  }
}

/** Browser/phone notification for an enquiry reply (the email itself is sent by the caller). */
export async function pushToInquiry(id: string, text: string): Promise<void> {
  try {
    if (!pushConfigured()) return;
    const ref = adminDb().collection(C.inquiries).doc(id);
    const q = (await ref.get()).data();
    if (!q || !Array.isArray(q.pushSubs) || !q.pushSubs.length) return;
    const keep = await sendPush(q.pushSubs as PushSub[], { title: "Neo Forge replied to your enquiry", body: text, url: "/contact", tag: `inq-${id}` });
    if (keep.length !== q.pushSubs.length) await ref.update({ pushSubs: keep });
  } catch (e) {
    console.error("[notify-visitor:inquiry]", (e as Error).message?.slice(0, 160));
  }
}
