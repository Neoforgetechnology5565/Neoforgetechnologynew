/** Safety rules for automated clicking. The walkthrough shows interfaces; it never deletes, sends, pays, publishes or changes records. */
const RISKY = /\b(delete|remove|discard|destroy|erase|drop|wipe|clear all|reset all|send|e-?mail|notify|invite|pay|payment|checkout|purchase|buy|publish|submit|approve|reject|confirm|save|create|add|new|post|import|overwrite|sign ?out|log ?out|logout|unsubscribe|deploy|archive)\b/i;
/** Words that make an otherwise risky-looking label safe because it only reads or navigates (e.g. "Add filter" is still blocked; "View sample" is fine). */
export function riskyLabel(label: string): boolean { return RISKY.test(label.replace(/[_-]+/g, " ")); }
/** Never allowed, even when an action is marked "allow": deleting, paying, sending, publishing and signing out. */
const HARD = /\b(delete|remove|destroy|erase|drop|wipe|pay|payment|checkout|purchase|buy|send|e-?mail|notify|invite|publish|sign ?out|log ?out|logout|unsubscribe|deploy)\b/i;
export const hardRisky = (label: string) => HARD.test(label.replace(/[_-]+/g, " "));

export interface ElInfo { text: string; aria: string; title: string; testid: string; id: string; type: string; tag: string; insideForm: boolean }
/** Returns the reason a click is refused, or null when it is safe. Navigation (tabs, links within the demo) is always allowed. */
export function blockReason(e: ElInfo, kind: string, allow = false): string | null {
  if (kind === "tab" || kind === "navigate" || kind === "scroll" || kind === "highlight") return null;
  if (e.type === "submit" && e.insideForm) return "submit button inside a form";
  const label = [e.text, e.aria, e.title, e.testid, e.id].filter(Boolean).join(" ");
  if (allow) return hardRisky(label) ? `label looks like a delete, send, payment or publish action ("${label.replace(/\s+/g, " ").trim().slice(0, 60)}"); "allow" cannot override this` : null;
  if (riskyLabel(label)) return `label looks like a change or send action ("${label.replace(/\s+/g, " ").trim().slice(0, 60)}")`;
  return null;
}
/** Requests the walkthrough refuses to let the demo make while it is playing (so it can never write to a server or contact anyone). */
export function blockedRequest(method: string, url: string, origin: string, sandbox = false): boolean {
  const m = method.toUpperCase();
  try {
    const u = new URL(url, origin); if (u.origin !== origin) return true;
    if (m === "GET" || m === "HEAD") return false;
    // Opt-in per walkthrough: the demo may create its own anonymous sample project (never delete, never admin, contact, chat or tracking).
    return !(sandbox && (m === "POST" || m === "PUT" || m === "PATCH") && SANDBOX_PREFIXES.some((p) => u.pathname.startsWith(p)));
  } catch { return true; }
}
/** Demo back-ends that only hold anonymous sample projects. */
export const SANDBOX_PREFIXES = ["/api/bim/", "/api/cctv/"];
