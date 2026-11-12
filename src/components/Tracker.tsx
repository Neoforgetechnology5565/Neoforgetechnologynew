"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { describeClick, referrerOrigin, utmFrom, visitSession, type ClickItem } from "@/lib/analytics/client";
import { analyticsAllowed } from "@/lib/consent";

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
const send = (body: unknown) => {
  const s = JSON.stringify(body);
  if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([s], { type: "application/json" }));
  else fetch("/api/track", { method: "POST", body: s, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
};
/** Demo workspaces are not click-tracked: their buttons carry demo data, and only the visit itself is counted. */
const clickable = (p: string) => !p.startsWith("/admin") && !/\/app(\/|$)/.test(p);

/**
 * First-party page-view and click beacon, active only after the visitor accepted statistics and never when Do-Not-Track is on.
 * Sends: the page path, a random visitor id, a visit id, the referring site's origin (not the full URL), utm tags, the browser time zone and language,
 * and the labels of clicked buttons and links (never anything typed into a field, never an email address or phone number).
 */
export default function Tracker() {
  const path = usePathname();
  const [ok, setOk] = useState(false);
  const pathRef = useRef(path), queue = useRef<(ClickItem & { p: string })[]>([]), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  pathRef.current = path;
  useEffect(() => {
    setOk(analyticsAllowed());
    const on = () => setOk(analyticsAllowed());
    window.addEventListener("nf-consent", on);
    return () => window.removeEventListener("nf-consent", on);
  }, []);

  useEffect(() => {
    if (!ok || path.startsWith("/admin") || navigator.doNotTrack === "1") return;
    const { id: sid, fresh } = visitSession();
    const m = path.match(/^\/portfolio\/([^/]+)\/([^/]+)$/) || path.match(/^\/(computer-vision|crm-hrm-erp|cad-bim)\/[^/]+\/([^/]+)$/);
    const body: Record<string, unknown> = { path, vid: visitorId(), sid, project: m ? `${m[1]}/${m[2]}` : undefined, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language };
    if (fresh) { body.ref = referrerOrigin(document.referrer, location.href); body.utm = utmFrom(location.search); }
    send(body);
  }, [path, ok]);

  useEffect(() => {
    if (!ok || navigator.doNotTrack === "1") return;
    const flush = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      const items = queue.current.splice(0); if (!items.length) return;
      const vid = visitorId(), { id: sid } = visitSession(), byPath = new Map<string, ClickItem[]>();
      for (const { p, ...c } of items) byPath.set(p, [...(byPath.get(p) ?? []), c]);
      for (const [p, list] of byPath) for (let i = 0; i < list.length; i += 20) send({ type: "clicks", vid, sid, path: p, items: list.slice(i, i + 20) });
    };
    const onClick = (e: MouseEvent) => {
      const p = pathRef.current; if (!clickable(p)) return;
      const c = describeClick(e.target); if (!c) return;
      queue.current.push({ ...c, p });
      if (queue.current.length >= 10) flush(); else if (!timer.current) timer.current = setTimeout(flush, 4000);
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("click", onClick, true); document.addEventListener("visibilitychange", onHide); window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); flush(); };
  }, [ok]);
  return null;
}
