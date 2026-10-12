"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CONSENT_KEY, readConsent } from "@/lib/consent";

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
    <div role="dialog" aria-label="Privacy notice" className="fixed inset-x-3 bottom-3 z-[55] mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl sm:bottom-5 sm:p-5">
      <p className="text-sm text-stone-700">We don&apos;t use advertising cookies. With your OK we count page views with a random ID stored in your browser, to see which pages help. Details in our <Link href="/privacy" className="font-medium text-blue-600 underline">Privacy Policy</Link>.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => choose("accepted")} className="rounded-full bg-blue-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-400">Accept</button>
        <button type="button" onClick={() => choose("declined")} className="rounded-full border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">Decline</button>
      </div>
    </div>
  );
}
