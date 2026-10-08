"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

function visitorId(): string {
  try {
    let v = localStorage.getItem("nf_vid");
    if (!v) {
      v = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, "");
      localStorage.setItem("nf_vid", v);
    }
    return v;
  } catch {
    return "anon" + Math.random().toString(36).slice(2, 12);
  }
}

/** Lightweight first-party page-view beacon. Respects Do-Not-Track. */
export default function Tracker() {
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith("/admin") || navigator.doNotTrack === "1") return;
    const m = path.match(/^\/portfolio\/([^/]+)\/([^/]+)$/) || path.match(/^\/(computer-vision|crm-hrm-erp|cad-bim)\/[^/]+\/([^/]+)$/);
    const body = JSON.stringify({ path, vid: visitorId(), project: m ? `${m[1]}/${m[2]}` : undefined });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
