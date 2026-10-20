import "server-only";
import { aiConfigured } from "./ai-article";
import { chatReply, CHAT_FALLBACK, inquiryReply, type ChatTurn } from "./ai-reply";
import { C, getContactSettings } from "./db";
import { notifyChatVisitor } from "./notify-visitor";
import { adminDb } from "./firebase-admin";
import { emailVisitor, mailConfigured, recipient, sendMail } from "./mail";
import { siteUrl } from "./utils";

const MAX_AI_REPLIES_PER_CHAT = 8;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** True when visitors will get automatic replies in chat (used to show a typing indicator). */
export async function chatAutoReplyActive(): Promise<boolean> {
  return (await getContactSettings()).aiChatReply;
}

export const OPTIONS_TEXT = (first: string) => `Hi ${first}, welcome to Neo Forge Technology! Thanks for your message. How would you like to continue?

**A. Continue with AI for your enquiry** – ask me anything about your project
**B. Talk to the Developer** – we'll notify the developer to reply to you personally

Tap A or B (or type the letter).`;

/** Posts one or two messages to a chat (the second always lands after the first). */
async function post(ref: FirebaseFirestore.DocumentReference, msgs: { from: "ai" | "auto"; text: string; options?: string[] }[]) {
  let t = Date.now();
  for (const m of msgs) { await ref.collection("messages").add({ from: m.from, text: m.text, file: null, createdAt: t, ...(m.options ? { options: m.options } : {}) }); t++; }
  await ref.update({ updatedAt: t, lastMessage: `${msgs[0].from === "ai" ? "AI" : "Auto"}: ${msgs[0].text}`.replace(/\*\*/g, "").slice(0, 120) });
}

/**
 * Live chat, step 1: right after the visitor's first message they get a welcome and two choices (A: continue with AI for
 * the enquiry, B: talk to the Developer). Without an AI key they just get a fixed acknowledgement. Never throws.
 */
export async function greetChat(chatId: string): Promise<void> {
  try {
    if (!(await getContactSettings()).aiChatReply) return;
    const ref = adminDb().collection(C.chats).doc(chatId);
    const chat = (await ref.get()).data();
    if (!chat || chat.humanTakeover || chat.mode) return;
    const name = String(chat.name || "");
    if (aiConfigured()) {
      await post(ref, [{ from: "ai", text: OPTIONS_TEXT(name.split(" ")[0] || "there"), options: ["ai", "developer"] }]);
      await ref.update({ optionsPending: true });
    } else {
      await post(ref, [{ from: "auto", text: CHAT_FALLBACK(name) }]);
    }
  } catch (e) {
    console.error("[auto-reply:greet]", (e as Error).message?.slice(0, 160));
  }
}

/**
 * Live chat, step 2: the AI answers a visitor message (the first one right after they pick A). It stops when the visitor
 * picks B, when you reply yourself, or after a few replies. Never throws.
 */
export async function autoReplyInChat(chatId: string, opts: { afterChoice?: boolean } = {}): Promise<void> {
  try {
    const settings = await getContactSettings();
    if (!settings.aiChatReply || !aiConfigured()) return;
    const ref = adminDb().collection(C.chats).doc(chatId);
    const chat = (await ref.get()).data();
    if (!chat || chat.humanTakeover || chat.mode === "human") return;
    const used = Number(chat.aiCount || 0);
    if (used >= MAX_AI_REPLIES_PER_CHAT) return;
    const name = String(chat.name || "");

    const snap = await ref.collection("messages").orderBy("createdAt", "desc").limit(12).get();
    const history: ChatTurn[] = snap.docs.map((d) => d.data() as ChatTurn).reverse();
    const hint = opts.afterChoice ? "The visitor just chose to continue with AI support. Answer the question or request in their first message, and ask one useful follow-up question." : "";
    let text = await chatReply(history, name, hint);
    if (!text && opts.afterChoice) text = "Great, I'm happy to help. Tell me a bit more about what you'd like to build or automate, and which software or systems are involved.";
    if (!text) return;
    const fresh = (await ref.get()).data();
    if (fresh?.humanTakeover || fresh?.mode === "human") return; // the visitor asked for the Developer, or you replied, while the AI was thinking
    await post(ref, [{ from: "ai", text }]);
    await ref.update({ aiCount: used + 1 });
    await notifyChatVisitor(chatId, text, { email: false, from: "ai" });
  } catch (e) {
    console.error("[auto-reply:chat]", (e as Error).message?.slice(0, 160));
  }
}

/** Emails the visitor a confirmation of the chat message they just sent (to the address they entered). One per address per day. Never throws. */
export async function emailChatConfirmation(chatId: string): Promise<void> {
  try {
    const settings = await getContactSettings();
    if (!settings.aiEmailReply || !mailConfigured()) return;
    const db = adminDb();
    const ref = db.collection(C.chats).doc(chatId);
    const chat = (await ref.get()).data();
    if (!chat?.email) return;
    const dayAgo = Date.now() - 24 * 3600_000;
    const prior = await db.collection(C.chats).where("email", "==", chat.email).limit(10).get();
    if (prior.docs.some((d) => d.id !== chatId && Number(d.data().ackAt || 0) > dayAgo)) return;
    const first = await ref.collection("messages").where("from", "==", "visitor").orderBy("createdAt").limit(1).get();
    const r = await emailVisitor({
      to: String(chat.email), subject: "We received your chat message — Neo Forge Technology",
      heading: `Hi ${String(chat.name || "").split(" ")[0] || "there"}, we received your message`,
      body: `Your message:\n${String(first.docs[0]?.data().text || "").slice(0, 1500)}\n\nA member of our team will read it and reply. We'll send our replies to this email address, and you can continue the conversation in the chat.`,
      cta: { href: `${siteUrl()}/live-chat`, label: "Continue the conversation" },
    });
    if (r.ok) await ref.update({ ackAt: Date.now() });
  } catch (e) {
    console.error("[auto-reply:chat-email]", (e as Error).message?.slice(0, 160));
  }
}

/** Emails the visitor an acknowledgement of their enquiry (AI-written when available). At most one per address per day. Never throws. */
export async function autoReplyToInquiry(id: string, i: { name: string; email: string; company: string; projectType: string; division: string; budget: string; timeline: string; message: string }): Promise<void> {
  try {
    const settings = await getContactSettings();
    if (!settings.aiEmailReply || !mailConfigured() || !i.email) return;
    const db = adminDb();
    // stop strangers using the form to email someone else repeatedly
    const prior = await db.collection(C.inquiries).where("email", "==", i.email).limit(10).get();
    const dayAgo = Date.now() - 24 * 3600_000;
    if (prior.docs.some((d) => d.id !== id && Number(d.data().autoReply?.at || 0) > dayAgo)) return;

    const { text, ai } = await inquiryReply(i);
    const ours = await recipient();
    const site = siteUrl();
    const signature = `— The Neo Forge Technology team\n${site}${settings.phone ? `\n${settings.phone}` : ""}`;
    const note = "This is an automatic acknowledgement. Just reply to this email to reach us.";
    const html = `<div style="font-family:Georgia,serif;max-width:600px;margin:auto;color:#0b0b0b;font-size:15px;line-height:1.55">${text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}<p style="margin-top:20px">— The Neo Forge Technology team<br><a href="${esc(site)}">${esc(site)}</a>${settings.phone ? `<br>${esc(settings.phone)}` : ""}</p><p style="margin-top:24px;font-size:12px;color:#64748b">${esc(note)}${ai ? " This message was drafted with the help of AI and reviewed by our team when they reply." : ""}</p></div>`;
    const r = await sendMail({ to: i.email, subject: "We received your enquiry — Neo Forge Technology", text: `${text}\n\n${signature}\n\n${note}`, html, replyTo: ours || undefined });
    if (r.ok) await db.collection(C.inquiries).doc(id).update({ autoReply: { at: Date.now(), ai } });
    else console.error("[auto-reply:inquiry]", r.error);
  } catch (e) {
    console.error("[auto-reply:inquiry]", (e as Error).message?.slice(0, 160));
  }
}
