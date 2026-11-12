import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { mailConfigured, sendMail } from "@/lib/mail";
import { addSub, pushConfigured, pushSubSchema, sendPush, type PushSub } from "@/lib/push";
import { siteUrl } from "@/lib/utils";
import type { AlertMessage, Senders } from "./alerts";

const subsRef = () => adminDb().collection("content").doc("adminPush");
export async function adminSubs(): Promise<PushSub[]> { const s = await subsRef().get(); return ((s.data()?.subs ?? []) as unknown[]).flatMap((x) => { const p = pushSubSchema.safeParse(x); return p.success ? [p.data] : []; }); }
export async function addAdminSub(sub: PushSub) { const cur = await adminSubs(); await subsRef().set({ subs: [sub, ...cur.filter((x) => x.endpoint !== sub.endpoint)].slice(0, 5) }); }
export async function removeAdminSub(endpoint: string) { await subsRef().set({ subs: (await adminSubs()).filter((x) => x.endpoint !== endpoint) }); }
void addSub;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Real senders: email to your own mailbox (NOTIFY_TO) and push to the devices you enabled. Each is a no-op when not configured. */
export const alertSenders: Senders = {
  email: async (m: AlertMessage) => { if (!mailConfigured()) return; const r = await sendMail({ subject: m.title, text: `${m.body}\n\n${siteUrl()}${m.url}`, html: `<p><b>${esc(m.title)}</b></p><p>${esc(m.body)}</p><p><a href="${siteUrl()}${m.url}">Open analytics</a></p>` }); if (!r.ok) throw new Error(r.error || "send failed"); },
  push: async (m: AlertMessage) => {
    if (!pushConfigured()) return; const subs = await adminSubs(); if (!subs.length) return;
    const keep = await sendPush(subs, { title: m.title, body: m.body, url: m.url, tag: "visitor" });
    if (keep.length !== subs.length) await subsRef().set({ subs: keep });
  },
};
