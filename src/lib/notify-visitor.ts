import "server-only";
import { C } from "./db";
import { adminDb } from "./firebase-admin";
import { emailVisitor, mailConfigured } from "./mail";
import { pushConfigured, sendPush, type PushSub } from "./push";
import { siteUrl } from "./utils";

const MAX_EMAIL_COPIES = { you: 150, automated: 60 };
/** One fixed subject so Gmail and other mail apps keep the whole conversation in one thread. */
export const CHAT_SUBJECT = "Your conversation with Neo Forge Technology";
const WHO = { you: "the Neo Forge team", ai: "our AI assistant", auto: "Neo Forge Technology" } as const;

/**
 * Every message we send into a chat (yours, the AI's, and the automatic ones) is also emailed straight away to the
 * address the visitor entered, whether or not they are online, and pushed to their phone/browser if they opted in. Never throws.
 */
export async function notifyChatVisitor(chatId: string, text: string, opts: { from: "you" | "ai" | "auto"; options?: boolean }): Promise<void> {
  try {
    const ref = adminDb().collection(C.chats).doc(chatId);
    const chat = (await ref.get()).data();
    if (!chat) return;
    const plain = text.replace(/\*\*/g, "");
    if (pushConfigured() && Array.isArray(chat.pushSubs) && chat.pushSubs.length) {
      const keep = await sendPush(chat.pushSubs as PushSub[], { title: opts.from === "you" ? "Neo Forge replied to you" : "Neo Forge assistant replied", body: plain, url: "/live-chat", tag: `chat-${chatId}` });
      if (keep.length !== chat.pushSubs.length) await ref.update({ pushSubs: keep });
    }
    const automated = opts.from !== "you";
    if (!mailConfigured() || !chat.email || (automated && chat.emailMuted)) return;
    const sent = Number(chat.emailCopies || 0);
    if (sent >= (automated ? MAX_EMAIL_COPIES.automated : MAX_EMAIL_COPIES.you)) return;
    const latest = opts.options ? plain.replace(/\n*Tap A or B[^\n]*$/i, "") : plain;
    // the whole conversation so far goes in every email, so their inbox holds every message from both sides
    const hist = await ref.collection("messages").orderBy("createdAt", "desc").limit(40).get();
    const label = { visitor: "You", admin: "Neo Forge team", ai: "AI assistant", auto: "Neo Forge" } as const;
    const lines = hist.docs.reverse().slice(0, -1).map((d) => { const m = d.data(); return `[${new Date(Number(m.createdAt)).toISOString().slice(0, 16).replace("T", " ")} UTC] ${label[m.from as keyof typeof label] ?? "Neo Forge"}: ${String(m.text || (m.file ? "(attachment)" : "")).replace(/\*\*/g, "")}`; });
    const body = lines.length ? `${latest}\n\n———\nConversation so far\n${lines.join("\n")}` : latest;
    const r = await emailVisitor({
      to: String(chat.email), subject: CHAT_SUBJECT,
      heading: `Hi ${String(chat.name || "").split(" ")[0] || "there"}, a message from ${WHO[opts.from]}`,
      body, cta: { href: `${siteUrl()}/live-chat`, label: opts.options ? "Choose A or B in the chat" : "Continue the conversation" },
    });
    if (r.ok) await ref.update({ emailCopies: sent + 1 });
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
