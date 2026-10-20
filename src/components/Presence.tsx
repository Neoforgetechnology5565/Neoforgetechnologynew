"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const sid = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32).padEnd(8, "0");
let id = ""; // lives only in this page load's memory — never written to the visitor's device

/** Tells the site owner someone is on the site right now (anonymous heartbeat, see /api/presence). */
export default function Presence() {
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith("/admin")) return;
    id = id || sid();
    const beat = () => {
      if (document.hidden) return;
      const body = JSON.stringify({ sid: id, path });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" }));
      else fetch("/api/presence", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, 30_000);
    const vis = () => beat();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [path]);
  return null;
}
