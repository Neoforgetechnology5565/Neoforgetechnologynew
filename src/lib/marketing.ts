/**
 * Marketing measurement (Google Tag Manager, Google Analytics 4, Google Ads, Microsoft Clarity).
 * Everything here is OFF until (a) the matching public ID is set in the environment and (b) the visitor accepted statistics
 * (and Do-Not-Track is not on). IDs are public identifiers, never secrets. No names, emails or phone numbers are ever sent.
 */
import { analyticsAllowed } from "./consent";

export const IDS = {
  gtm: process.env.NEXT_PUBLIC_GTM_ID || "",
  ga4: process.env.NEXT_PUBLIC_GA_ID || "",
  ads: process.env.NEXT_PUBLIC_GADS_ID || "",
  adsLead: process.env.NEXT_PUBLIC_GADS_LEAD_LABEL || "",
  clarity: process.env.NEXT_PUBLIC_CLARITY_ID || "",
};
/** Only well-formed IDs are ever put into a script URL. */
export const validId = {
  gtm: (v: string) => /^GTM-[A-Z0-9]{4,10}$/.test(v), ga4: (v: string) => /^G-[A-Z0-9]{6,14}$/.test(v), ads: (v: string) => /^AW-\d{6,14}$/.test(v),
  adsLabel: (v: string) => /^[A-Za-z0-9_-]{6,40}$/.test(v), clarity: (v: string) => /^[a-z0-9]{8,12}$/.test(v),
};
export const trackingOn = () => { try { return analyticsAllowed() && navigator.doNotTrack !== "1"; } catch { return false; } };

type W = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
/** Pushes an event for GTM / GA4. Does nothing without consent. Parameters must not contain personal data. */
export function pushEvent(name: "generate_lead" | "meeting_request" | "contact_click", params: Record<string, string | number> = {}) {
  if (typeof window === "undefined" || !trackingOn()) return;
  const w = window as W; w.dataLayer = w.dataLayer || []; w.dataLayer.push({ event: name, ...params });
  if (w.gtag && IDS.ads && IDS.adsLead && validId.ads(IDS.ads) && validId.adsLabel(IDS.adsLead) && name === "generate_lead") w.gtag("event", "conversion", { send_to: `${IDS.ads}/${IDS.adsLead}` });
}
/** The kind of contact link, from its href (null for ordinary links). */
export function contactKind(href: string): "whatsapp" | "email" | "phone" | null {
  const h = href.trim().toLowerCase();
  if (h.startsWith("mailto:")) return "email"; if (h.startsWith("tel:")) return "phone";
  try { const u = new URL(h, "https://x.invalid"); if (u.hostname === "wa.me" || u.hostname === "api.whatsapp.com" || u.hostname === "web.whatsapp.com") return "whatsapp"; } catch { /* not a URL */ }
  return null;
}
