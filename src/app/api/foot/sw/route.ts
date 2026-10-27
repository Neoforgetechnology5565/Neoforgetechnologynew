import { NextResponse } from "next/server";

export const runtime = "nodejs";
const SLUG = "ai-shoe-foot-measurement-fitting";
/** Service worker for the phone scanner. Served from the API path with a widened scope; it caches only the scanner page shell, never photos or API responses. */
const SW = `
const CACHE = "foot-scan-shell-v1";
const SCOPE = "/ai-demos/${SLUG}/app/scan";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (u.pathname === SCOPE || u.pathname.startsWith("/_next/static/")) {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
  }
});
`;
export function GET() { return new NextResponse(SW, { headers: { "content-type": "application/javascript; charset=utf-8", "service-worker-allowed": `/ai-demos/${SLUG}/`, "cache-control": "no-cache" } }); }
