/** Where a visit came from. Only the referring HOST is used (never a full URL), plus standard utm_* campaign tags. */
export type Channel = "direct" | "search" | "social" | "email" | "campaign" | "referral";
export interface Source { channel: Channel; name: string; host: string; campaign: string }

const SEARCH: [RegExp, string][] = [[/(^|\.)google\./, "Google"], [/(^|\.)bing\.com$/, "Bing"], [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"], [/(^|\.)yahoo\./, "Yahoo"], [/(^|\.)baidu\.com$/, "Baidu"], [/(^|\.)yandex\./, "Yandex"], [/(^|\.)ecosia\.org$/, "Ecosia"], [/(^|\.)search\.brave\.com$/, "Brave Search"]];
const SOCIAL: [RegExp, string][] = [[/(^|\.)facebook\.com$|(^|\.)fb\.com$|^l\.facebook\.com$|^lm\.facebook\.com$/, "Facebook"], [/(^|\.)instagram\.com$|^l\.instagram\.com$/, "Instagram"], [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"], [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, "X"], [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"], [/(^|\.)reddit\.com$/, "Reddit"], [/(^|\.)pinterest\./, "Pinterest"], [/(^|\.)tiktok\.com$/, "TikTok"], [/(^|\.)whatsapp\.com$|^wa\.me$/, "WhatsApp"], [/(^|\.)t\.me$|(^|\.)telegram\.org$/, "Telegram"], [/(^|\.)github\.com$/, "GitHub"]];
const NAMED: Record<string, [Channel, string]> = { google: ["search", "Google"], bing: ["search", "Bing"], facebook: ["social", "Facebook"], instagram: ["social", "Instagram"], linkedin: ["social", "LinkedIn"], twitter: ["social", "X"], x: ["social", "X"], youtube: ["social", "YouTube"], fiverr: ["referral", "Fiverr"], upwork: ["referral", "Upwork"] };
const clean = (s: string | undefined, n = 60) => (s || "").replace(/[^\w .+@-]/g, "").trim().slice(0, n);

/** `referrer` is whatever the browser reports; `selfHosts` are this site's own hosts (internal navigation is not a source). */
export function classifySource(i: { referrer?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string }, selfHosts: string[] = []): Source {
  let host = "";
  try { host = i.referrer ? new URL(i.referrer.includes("://") ? i.referrer : `https://${i.referrer}`).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { host = ""; }
  const self = selfHosts.map((h) => h.toLowerCase().replace(/^www\./, "").split(":")[0]);
  if (host && self.some((s) => host === s || host.endsWith(`.${s}`))) host = "";
  const campaign = clean(i.utmCampaign), src = clean(i.utmSource).toLowerCase(), med = clean(i.utmMedium).toLowerCase();
  if (src || med) {
    if (/^(e-?mail|newsletter)$/.test(med) || src === "email" || src === "newsletter") return { channel: "email", name: clean(i.utmSource) || "Email", host, campaign };
    if (NAMED[src] && !/(cpc|ppc|paid)/.test(med)) return { channel: NAMED[src][0], name: NAMED[src][1], host, campaign };
    return { channel: "campaign", name: clean(i.utmSource) || "Campaign", host, campaign };
  }
  if (!host) return { channel: "direct", name: "Direct", host: "", campaign: "" };
  for (const [re, name] of SEARCH) if (re.test(host)) return { channel: "search", name, host, campaign: "" };
  for (const [re, name] of SOCIAL) if (re.test(host)) return { channel: "social", name, host, campaign: "" };
  return { channel: "referral", name: host, host, campaign: "" };
}
