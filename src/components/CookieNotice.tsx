"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CONSENT_KEY, readConsent } from "@/lib/consent";
import { IDS, validId } from "@/lib/marketing";

/** True when Google Analytics, Google Ads, Tag Manager or Clarity IDs are configured, so the notice must say so. */
const THIRD_PARTY = validId.gtm(IDS.gtm) || validId.ga4(IDS.ga4) || validId.ads(IDS.ads) || validId.clarity(IDS.clarity);

/** Small privacy notice: we use no cookies; visitor statistics only run if the visitor accepts. */
export default function CookieNotice() {
  const path = usePathname();
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(readConsent() === null); }, []);
  if (!show || path.startsWith("/admin")) return null;
  const choose = (v: "accepted" | "declined") => {
    try { localStorage.setItem(CONSENT_KEY, v); } catch { /* private mode: choice just lasts this page */ }
    setShow(false);
    if (v === "accepted") window.dispatchEvent(new Event("nf-consent"));
  };
  return (
    <div role="dialog" aria-label="Privacy notice" className="fixed inset-x-3 bottom-3 z-[55] mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-3 shadow-2xl sm:bottom-5 sm:p-5">
      <p className="text-xs leading-snug text-stone-700 sm:text-sm">No cookies or measurement run until you accept. If you accept, we count page views and clicks with a random ID in your browser, plus your approximate location (estimated from your network connection, never your exact location), device and where you came from; if you contact us we can link your message to your visit{THIRD_PARTY ? ", and we use Google Analytics, Google Ads and Microsoft Clarity, which may set their own cookies" : ""}. Details in our <Link href="/privacy" className="font-medium text-blue-600 underline">Privacy Policy</Link>.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => choose("accepted")} className="rounded-full bg-blue-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-400">Accept</button>
        <button type="button" onClick={() => choose("declined")} className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">Decline</button>
      </div>
    </div>
  );
}
