import type { Campaign, MContact, Metrics, Rule, Segment, Template } from "./seed-mkt";
import { hash01 } from "./util";

const norm = (s: string) => s.trim().toLowerCase();
export function matchRule(c: MContact, r: Rule): boolean {
  const v = norm(r.value);
  switch (r.field) {
    case "industry": return r.op === "is not" ? norm(c.industry) !== v : r.op === "contains" ? norm(c.industry).includes(v) : norm(c.industry) === v;
    case "country": return r.op === "is not" ? norm(c.country) !== v : r.op === "contains" ? norm(c.country).includes(v) : norm(c.country) === v;
    case "tag": return r.op === "is not" ? !c.tags.map(norm).includes(v) : c.tags.map(norm).includes(v);
    case "status": return r.op === "is not" ? norm(c.status) !== v : norm(c.status) === v;
    case "list": return r.op === "is not" ? !c.lists.includes(r.value) : c.lists.includes(r.value);
    case "score": return r.op === "lte" ? c.score <= Number(r.value) : c.score >= Number(r.value);
    case "engaged": return r.op === "lte" ? c.lastEngaged <= r.value : c.lastEngaged >= r.value; // engaged since / before a date
  }
}
export const inSegment = (c: MContact, s: Segment) => (s.rules.length === 0 ? true : s.match === "all" ? s.rules.every((r) => matchRule(c, r)) : s.rules.some((r) => matchRule(c, r)));
/** Audience = segment members, minus anyone who has unsubscribed or bounced (suppression is always applied). */
export function audience(contacts: MContact[], s: Segment | undefined) { const members = s ? contacts.filter((c) => inSegment(c, s)) : []; const sendable = members.filter((c) => c.status === "Subscribed"); return { members, sendable, suppressed: members.length - sendable.length }; }
export const merge = (text: string, c: Pick<MContact, "name" | "company" | "industry">) => text.replace(/\{\{first_name\}\}/g, c.name.split(" ")[0]).replace(/\{\{company\}\}/g, c.company).replace(/\{\{industry\}\}/g, c.industry);
export const unknownFields = (t: Template) => [...new Set(`${t.subject} ${t.body} ${t.heading}`.match(/\{\{[^}]*\}\}/g) ?? [])].filter((f) => !["{{first_name}}", "{{company}}", "{{industry}}"].includes(f));
/** SIMULATED metrics: a deterministic function of the audience size and campaign id. No email is sent and nobody opened or clicked anything. */
export function simulateMetrics(recipients: number, key: string): Metrics {
  const bounced = Math.round(recipients * (0.01 + hash01(key + "b") * 0.03)); const delivered = recipients - bounced;
  const opened = Math.round(delivered * (0.26 + hash01(key + "o") * 0.24)); const clicked = Math.round(opened * (0.1 + hash01(key + "c") * 0.18)); const unsubscribed = Math.round(delivered * hash01(key + "u") * 0.012);
  return { recipients, delivered, opened, clicked, unsubscribed, bounced };
}
export const rate = (a: number, b: number) => (b ? a / b : 0);
export const campaignAudience = (c: Campaign, contacts: MContact[], segments: Segment[]) => audience(contacts, segments.find((s) => s.id === c.segmentId));
