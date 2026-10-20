import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { autoReplyInChat } from "./auto-reply";
import { C } from "./db";
import { adminDb } from "./firebase-admin";
import { emailVisitor, notifyDeveloperRequested } from "./mail";
import { siteUrl } from "./utils";

export type Choice = "ai" | "developer";

/** "a", "A.", "b)", "option b" … typed instead of tapping a button. */
export function parseChoice(text: string): Choice | null {
  const m = text.trim().match(/^(?:option\s+)?([ab])\s*[.):\-]?\s*$/i);
  return m ? (m[1].toLowerCase() === "a" ? "ai" : "developer") : null;
}

/**
 * Applies the visitor's choice (A: continue with AI for the enquiry, B: talk to the Developer).
 * Returns the mode now in force and a follow-up to run after the response is sent (AI answer or alert emails).
 */
export async function applyChoice(chatId: string, choice: Choice, opts: { echo: boolean }): Promise<{ mode: "ai" | "human"; followUp: () => Promise<void> }> {
  const ref = adminDb().collection(C.chats).doc(chatId);
  const chat = (await ref.get()).data();
  if (!chat) return { mode: "ai", followUp: async () => {} };
  if (chat.mode) return { mode: chat.mode, followUp: async () => {} }; // already chosen
  const now = Date.now();
  const col = ref.collection("messages");
  if (opts.echo) await col.add({ from: "visitor", text: choice === "ai" ? "A. Continue with AI for my enquiry" : "B. Talk to the Developer", file: null, createdAt: now });

  if (choice === "ai") {
    await ref.update({ mode: "ai", optionsPending: false, updatedAt: now, lastMessage: "Chose A: AI support" });
    return { mode: "ai", followUp: () => autoReplyInChat(chatId, { afterChoice: true }) };
  }

  await col.add({ from: "auto", text: "Thank you! I've notified the Developer, who will reply to you here personally. You'll also get the reply by email. Meanwhile, feel free to add any details that will help.", file: null, createdAt: now + 1 });
  await ref.update({ mode: "human", optionsPending: false, humanTakeover: true, wantsHuman: true, unreadAdmin: FieldValue.increment(1), updatedAt: now + 1, lastMessage: "⚠ Wants to talk to the Developer" });
  return {
    mode: "human",
    followUp: async () => {
      const first = await col.where("from", "==", "visitor").orderBy("createdAt").limit(1).get();
      await notifyDeveloperRequested({ name: String(chat.name || "Visitor"), email: String(chat.email || ""), lastMessage: String(first.docs[0]?.data().text || "") });
      if (chat.email) await emailVisitor({ to: String(chat.email), subject: "We've notified our Developer", heading: `Hi ${String(chat.name || "").split(" ")[0] || "there"}, your request is with our Developer`, body: "Thank you for your message. Our Developer has been notified and will reply to you personally. You'll receive their reply at this email address, and in the chat if you keep it open.", cta: { href: `${siteUrl()}/live-chat`, label: "Open the chat" } });
    },
  };
}
