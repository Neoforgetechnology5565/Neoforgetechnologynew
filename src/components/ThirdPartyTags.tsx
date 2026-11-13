"use client";
import { useEffect } from "react";
import { contactKind, IDS, pushEvent, trackingOn, validId } from "@/lib/marketing";

type W = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; clarity?: (...a: unknown[]) => void; __nfTags?: boolean };
const script = (src: string, id?: string) => { const s = document.createElement("script"); s.async = true; s.src = src; if (id) s.id = id; document.head.appendChild(s); };

/** Loads GTM / GA4 / Google Ads / Clarity only after the visitor accepted statistics, and only for IDs that are configured and well-formed. Renders nothing. */
export default function ThirdPartyTags() {
  useEffect(() => {
    const w = window as W;
    const load = () => {
      if (w.__nfTags || !trackingOn()) return; w.__nfTags = true;
      w.dataLayer = w.dataLayer || [];
      if (validId.gtm(IDS.gtm)) { w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" }); script(`https://www.googletagmanager.com/gtm.js?id=${IDS.gtm}`, "nf-gtm"); }
      else if (validId.ga4(IDS.ga4) || validId.ads(IDS.ads)) {
        const first = validId.ga4(IDS.ga4) ? IDS.ga4 : IDS.ads;
        // gtag.js requires the real `arguments` object (an array is ignored), exactly as in Google's own snippet
        // eslint-disable-next-line prefer-rest-params
        w.gtag = function () { w.dataLayer!.push(arguments); }; w.gtag("js", new Date());
        if (validId.ga4(IDS.ga4)) w.gtag("config", IDS.ga4, { anonymize_ip: true }); if (validId.ads(IDS.ads)) w.gtag("config", IDS.ads);
        script(`https://www.googletagmanager.com/gtag/js?id=${first}`, "nf-gtag");
      }
      if (validId.clarity(IDS.clarity)) {
        const q: unknown[][] = []; // eslint-disable-next-line prefer-rest-params
        w.clarity = w.clarity || function () { q.push(Array.from(arguments)); (w.clarity as unknown as { q?: unknown[][] }).q = q; };
        script(`https://www.clarity.ms/tag/${IDS.clarity}`, "nf-clarity"); w.clarity("consent");
      }
    };
    load(); window.addEventListener("nf-consent", load);
    // Secondary conversions: clicks on WhatsApp, email and phone links
    const click = (e: MouseEvent) => { const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null; const k = a && contactKind(a.getAttribute("href") || ""); if (k) pushEvent("contact_click", { method: k }); };
    document.addEventListener("click", click, { capture: true });
    return () => { window.removeEventListener("nf-consent", load); document.removeEventListener("click", click, { capture: true }); };
  }, []);
  return null;
}
