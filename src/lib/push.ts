import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { iconUrl } from "./cloudinary";
import { getBranding } from "./db";
import { siteUrl } from "./utils";

/**
 * Browser / phone notifications (Web Push) for visitors who opt in after starting a chat or sending an enquiry.
 * Needs VAPID keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (generate in Admin → Maintenance). Without them nothing happens.
 */
export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export const pushSubSchema = z.object({
  endpoint: z.string().url().max(600).startsWith("https://"),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});
export type PushSub = z.infer<typeof pushSubSchema>;

/** Web Push needs an https: or mailto: contact for the sender. */
const vapidSubject = () => process.env.VAPID_SUBJECT || (siteUrl().startsWith("https://") ? siteUrl() : `mailto:${process.env.SMTP_USER || "noreply@neoforgetechnologies.com"}`);

/** Sends a notification to each subscription. Returns the subscriptions that are still valid (expired ones are dropped). */
export async function sendPush(subs: PushSub[], p: { title: string; body: string; url: string; tag?: string }): Promise<PushSub[]> {
  if (!pushConfigured() || !subs.length) return subs;
  webpush.setVapidDetails(vapidSubject(), process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const b = await getBranding().catch(() => null);
  const payload = JSON.stringify({ ...p, body: p.body.slice(0, 180), icon: b?.icon ? iconUrl(b.icon, 192) : undefined });
  const keep: PushSub[] = [];
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification(s, payload, { TTL: 86400 }); keep.push(s); }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code !== 404 && code !== 410) keep.push(s); }
  }));
  return keep;
}

export const addSub = (list: PushSub[] | undefined, s: PushSub): PushSub[] => [s, ...(list ?? []).filter((x) => x.endpoint !== s.endpoint)].slice(0, 3);
