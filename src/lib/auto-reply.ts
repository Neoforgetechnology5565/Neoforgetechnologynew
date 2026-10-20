import "server-only";
import { aiConfigured } from "./ai-article";
import { chatReply, CHAT_FALLBACK, inquiryReply, type ChatTurn } from "./ai-reply";
import { C, getContactSettings } from "./db";
import { notifyChatVisitor } from "./notify-visitor";
import { adminDb } from "./firebase-admin";
import { mailConfigured, recipient, sendMail } from "./mail";
import { siteUrl } from "./utils";

const MAX_AI_REPLIES_PER_CHAT = 8;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** True when visitors will get automatic replies in chat (used to show a typing indicator). */
export async function chatAutoReplyActive(): Promise<boolean> {
  return (await getContactSettings()).aiChatReply;
}

export const OPTIONS_TEXT = "How would you like to continue?\n\n**Continue with AI support** – keep asking me questions about your enquiry\n**Talk to the Developer** – we'll notify the developer to reply to you personally";

/** Posts one or two messages to a chat (the second always lands after the first). */
async function post(ref: FirebaseFirestore.DocumentReference, msgs: { from: "ai" | "auto"; text: string; options?: string[] }[]) {
  let t = Date.now();
  for (const m of msgs) { await ref.collection("messages").add({ from: m.from, text: m.text, file: null, createdAt: t, ...(m.options ? { options: m.options } : {}) }); t++; }
  await ref.update({ updatedAt: t, lastMessage: `${msgs[0].from === "ai" ? "AI" : "Auto"}: ${msgs[0].text}`.replace(/\*\*/g, "").slice(0, 120) });
}

/**
 * Automatic replies in live chat. On the first message the visitor gets a welcome + an answer, then two choices
 * (continue with AI support, or talk to the Developer). Afterwards the AI answers each message until they ask for the
 * Developer or you reply yourself. Never throws.
 */
export async function autoReplyInChat(chatId: string, opts: { first: boolean }): Promise<void> {
  try {
    const settings = await getContactSettings();
    if (!settings.aiChatReply) return;
    const ref = adminDb().collection(C.chats).doc(chatId);
    const chat = (await ref.get()).data();
    if (!chat || chat.humanTakeover || chat.mode === "human") return;
    const used = Number(chat.aiCount || 0);
    if (used >= MAX_AI_REPLIES_PER_CHAT) return;
    const name = String(chat.name || "");
    const first = name.split(" ")[0] || "there";

    const snap = await ref.collection("messages").orderBy("createdAt", "desc").limit(12).get();
    const history: ChatTurn[] = snap.docs.map((d) => d.data() as ChatTurn).reverse();
    const ai = aiConfigured() ? await chatReply(history, name) : null;
    const fresh = (await ref.get()).data();
    if (fresh?.humanTakeover || fresh?.mode === "human") return; // a person (or the visitor's choice) took over while the AI was thinking

    if (opts.first) {
      const welcome = ai ? `Hi ${first}, welcome to Neo Forge Technology! ${ai}` : CHAT_FALLBACK(name);
      const msgs: { from: "ai" | "auto"; text: string; options?: string[] }[] = [{ from: ai ? "ai" : "auto", text: welcome }];
      if (aiConfigured()) msgs.push({ from: "ai", text: OPTIONS_TEXT, options: ["ai", "developer"] });
      await post(ref, msgs);
      await ref.update({ aiCount: used + (ai ? 1 : 0) });
      await notifyChatVisitor(chatId, welcome, { email: false, from: "ai" });
    } else if (ai) {
      await post(ref, [{ from: "ai", text: ai }]);
      await ref.update({ aiCount: used + 1 });
      await notifyChatVisitor(chatId, ai, { email: false, from: "ai" });
    }
  } catch (e) {
    console.error("[auto-reply:chat]", (e as Error).message?.slice(0, 160));
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
