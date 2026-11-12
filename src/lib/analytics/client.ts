/** Browser-side helpers for the tracker: what a click is described as, and how a visit (session) is identified. Nothing typed by a visitor is ever read. */
export interface ClickItem { l: string; k: "link" | "button" | "other"; h?: string }
const SKIP = "input, textarea, select, option, label, [contenteditable], [data-no-track]";
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Describes the interactive element a click landed on, or null when it should not be recorded. */
export function describeClick(target: EventTarget | null): ClickItem | null {
  const t = target instanceof Element ? target : null; if (!t) return null;
  if (t.closest(SKIP)) return null;
  const el = t.closest("a[href], button, [role=button], [role=tab], [role=menuitem], summary, [data-track]"); if (!el || el.closest("[data-no-track]")) return null;
  const img = el.querySelector("img[alt]")?.getAttribute("alt");
  const label = norm(el.getAttribute("data-track")) || norm(el.getAttribute("aria-label")) || norm(el.textContent).slice(0, 80) || norm(el.getAttribute("title")) || norm(img) || "";
  if (!label) return null;
  const tag = el.tagName.toLowerCase(), k: ClickItem["k"] = tag === "a" ? "link" : tag === "button" || el.getAttribute("role") === "button" || el.getAttribute("role") === "tab" ? "button" : "other";
  let h: string | undefined;
  if (tag === "a") {
    const raw = (el as HTMLAnchorElement).getAttribute("href") || "";
    if (/^(mailto|tel|sms):/i.test(raw)) h = raw.split(":")[0].toLowerCase() + ":"; // never the address or number
    else { try { const u = new URL(raw, location.href); h = u.origin === location.origin ? u.pathname : u.hostname; } catch { h = undefined; } }
  }
  return { l: label.slice(0, 80), k, ...(h ? { h: h.slice(0, 120) } : {}) };
}

const SID_KEY = "nf_sid", GAP = 30 * 60_000;
const rand = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
/** A visit lasts until 30 minutes of inactivity. Kept in sessionStorage, so it ends with the tab. */
export function visitSession(now = Date.now()): { id: string; fresh: boolean } {
  try {
    const raw = sessionStorage.getItem(SID_KEY), s = raw ? (JSON.parse(raw) as { id: string; t: number }) : null;
    if (s && now - s.t < GAP) { sessionStorage.setItem(SID_KEY, JSON.stringify({ id: s.id, t: now })); return { id: s.id, fresh: false }; }
    const id = rand(); sessionStorage.setItem(SID_KEY, JSON.stringify({ id, t: now })); return { id, fresh: true };
  } catch { return { id: rand(), fresh: true }; }
}
/** Referrer reduced to its origin (never a path or query), and only when it is another site. */
export function referrerOrigin(ref: string, here: string): string | undefined { try { if (!ref) return undefined; const u = new URL(ref); return u.origin === new URL(here).origin ? undefined : u.origin; } catch { return undefined; } }
export function utmFrom(search: string): { s?: string; m?: string; c?: string } | undefined {
  const p = new URLSearchParams(search), s = p.get("utm_source") ?? undefined, m = p.get("utm_medium") ?? undefined, c = p.get("utm_campaign") ?? undefined;
  return s || m || c ? { ...(s ? { s: s.slice(0, 60) } : {}), ...(m ? { m: m.slice(0, 60) } : {}), ...(c ? { c: c.slice(0, 60) } : {}) } : undefined;
}
