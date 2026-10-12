/** Visitor statistics only run after the visitor accepts. Flip to false to run them unless the visitor declines. */
export const ANALYTICS_REQUIRES_CONSENT = true;
export const CONSENT_KEY = "nf_consent";
export type Consent = "accepted" | "declined" | null;

export function readConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch { return null; }
}
export function analyticsAllowed(): boolean {
  const c = readConsent();
  return c === "accepted" || (!ANALYTICS_REQUIRES_CONSENT && c !== "declined");
}
