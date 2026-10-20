import "server-only";
import nodemailer from "nodemailer";
import { getContactSettings } from "./db";
import { siteUrl } from "./utils";

/**
 * Email notifications over SMTP using your own mailbox (e.g. Zoho Mail). Entirely optional: when SMTP is not
 * configured nothing is sent and nothing breaks. Sending never blocks or fails a visitor's request.
 * Env: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, optional NOTIFY_TO, MAIL_FROM, SMTP_SECURE, SMTP_INSECURE.
 */
export const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clip = (s: string, n = 4000) => (s.length > n ? s.slice(0, n) + "…" : s);

export async function recipient(): Promise<string> {
  return process.env.NOTIFY_TO || (await getContactSettings()).email || process.env.SMTP_USER || "";
}

export async function sendMail(opts: { to?: string; subject: string; text: string; html: string; replyTo?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!mailConfigured()) return { ok: false, error: "Email is not configured (SMTP variables missing)." };
  try {
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
      ...(process.env.SMTP_INSECURE === "1" ? { ignoreTLS: true } : {}),
    });
    const to = opts.to || (await recipient());
    if (!to) return { ok: false, error: "No recipient: set NOTIFY_TO or the contact email in Admin → Site content." };
    await t.sendMail({
      from: process.env.MAIL_FROM || `Neo Forge Website <${process.env.SMTP_USER}>`, // must be the authenticated mailbox, or SPF/DMARC fail
      to, subject: opts.subject, text: opts.text, html: opts.html, ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message || "send failed";
    console.error("[mail]", msg);
    // Plain-English next step for the failures people actually hit when setting up Zoho/SMTP. Never includes credentials.
    const host = process.env.SMTP_HOST || "";
    let hint = "";
    if (/535|auth|invalid login/i.test(msg)) hint = ` — Check that SMTP_USER is the full, existing mailbox address and SMTP_PASS is an app password generated for that same mailbox.${/zoho\.(com|eu|in)$/i.test(host) && !/smtppro/i.test(host) ? " Paid Zoho business mailboxes usually need SMTP_HOST=smtppro.zoho.com." : ""}`;
    else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timed out|EAI_AGAIN/i.test(msg)) hint = " — Cannot reach the mail server: check SMTP_HOST and SMTP_PORT (465).";
    else if (/553|550|relay|not allowed|sender/i.test(msg)) hint = " — The server refused the sender: SMTP_USER (or MAIL_FROM) must be a mailbox that belongs to this account.";
    return { ok: false, error: (msg.slice(0, 160) + hint).slice(0, 420) };
  }
}

const shell = (title: string, rows: [string, string][], body: string, cta: { href: string; label: string }) => `
<div style="font-family:Georgia,serif;max-width:600px;margin:auto;color:#0b0b0b">
  <h2 style="margin:0 0 12px">${esc(title)}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${v}</td></tr>`).join("")}</table>
  <div style="margin:16px 0;padding:14px;background:#f1f5f9;border-radius:8px;white-space:pre-wrap;font-size:15px">${body}</div>
  <a href="${cta.href}" style="display:inline-block;background:#34821d;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-size:14px">${esc(cta.label)}</a>
</div>`;

export async function notifyInquiry(i: { name: string; email: string; company: string; projectType: string; division: string; budget: string; timeline: string; message: string; files: { url: string; name?: string }[] }) {
  const admin = `${siteUrl()}/admin/inbox`;
  const files = i.files.map((f) => `<a href="${esc(f.url)}">${esc(f.name || "attachment")}</a>`).join("<br>");
  return sendMail({
    subject: `New inquiry: ${i.projectType} — ${i.name}`,
    replyTo: i.email, // replying goes straight to the visitor
    text: `New website inquiry\n\nName: ${i.name}\nEmail: ${i.email}\nCompany: ${i.company}\nType: ${i.projectType}\nBudget: ${i.budget}\nTimeline: ${i.timeline}\n\n${clip(i.message)}\n\n${i.files.map((f) => f.url).join("\n")}\n\nOpen in admin: ${admin}`,
    html: shell("New website inquiry", [["Name", esc(i.name)], ["Email", `<a href="mailto:${esc(i.email)}">${esc(i.email)}</a>`], ["Company", esc(i.company)], ["Project type", esc(i.projectType)], ["Division", esc(i.division)], ["Budget", esc(i.budget)], ["Timeline", esc(i.timeline)], ["Files", files]], esc(clip(i.message)), { href: admin, label: "Open in admin" }),
  });
}

export async function notifyChat(c: { name: string; email: string; text: string; isNew: boolean }) {
  const admin = `${siteUrl()}/admin/chats`;
  return sendMail({
    subject: `${c.isNew ? "New live chat" : "New chat message"} from ${c.name}`,
    replyTo: c.email || undefined,
    text: `${c.isNew ? "A visitor started a live chat" : "A visitor sent a new message"}\n\nName: ${c.name}\nEmail: ${c.email || "(not given)"}\n\n${clip(c.text, 1500)}\n\nReply in admin: ${admin}`,
    html: shell(c.isNew ? "New live chat" : "New chat message", [["Name", esc(c.name)], ["Email", c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""]], esc(clip(c.text, 1500)), { href: admin, label: "Reply in admin" }),
  });
}

/** A plain, friendly email to a visitor (copies of our replies, confirmations). Replies go to our own mailbox. */
export async function emailVisitor(o: { to: string; subject: string; heading: string; body: string; cta?: { href: string; label: string } }) {
  const ours = await recipient();
  const cta = o.cta ? `<p style="margin:20px 0"><a href="${esc(o.cta.href)}" style="display:inline-block;background:#34821d;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-size:14px">${esc(o.cta.label)}</a></p>` : "";
  return sendMail({
    to: o.to, subject: o.subject, replyTo: ours || undefined,
    text: `${o.heading}\n\n${clip(o.body)}\n\n${o.cta ? `${o.cta.label}: ${o.cta.href}\n\n` : ""}— The Neo Forge Technology team\n${siteUrl()}\n\nYou can reply to this email to reach us.`,
    html: `<div style="font-family:Georgia,serif;max-width:600px;margin:auto;color:#0b0b0b;font-size:15px;line-height:1.55"><h2 style="margin:0 0 12px;font-size:20px">${esc(o.heading)}</h2><div style="white-space:pre-wrap;padding:14px;background:#f1f5f9;border-radius:8px">${esc(clip(o.body))}</div>${cta}<p style="margin-top:20px">— The Neo Forge Technology team<br><a href="${esc(siteUrl())}">${esc(siteUrl())}</a></p><p style="font-size:12px;color:#64748b">You can reply to this email to reach us.</p></div>`,
  });
}

/** Alert for the owner when a chat visitor asks to talk to the developer. */
export async function notifyDeveloperRequested(c: { name: string; email: string; lastMessage: string }) {
  const admin = `${siteUrl()}/admin/chats`;
  return sendMail({
    subject: `⚠ ${c.name} wants to talk to the Developer (live chat)`,
    replyTo: c.email || undefined,
    text: `A visitor asked to talk to the developer in live chat.\n\nName: ${c.name}\nEmail: ${c.email || "(not given)"}\n\nTheir message:\n${clip(c.lastMessage, 1500)}\n\nReply in admin: ${admin}`,
    html: shell("Visitor wants to talk to the Developer", [["Name", esc(c.name)], ["Email", c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""]], esc(clip(c.lastMessage, 1500)), { href: admin, label: "Reply in admin" }),
  });
}
