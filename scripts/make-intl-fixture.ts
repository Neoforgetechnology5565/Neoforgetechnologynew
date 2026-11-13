// Builds an International-tab report with the real counters code. Usage: npx tsx scripts/make-intl-fixture.ts > fixture.json
import { buildReport } from "../src/lib/analytics/aggregate";
import { COL } from "../src/lib/analytics/consts";
import { planInquiryStats, recordStats, responseStats } from "../src/lib/analytics/intl";
import { fakeDb, fakeInc } from "../src/lib/analytics/testing";

async function main() {
  const db = fakeDb(), now = Date.now(), day = new Date(now).toISOString().slice(0, 10), H = 3600_000;
  const rows: [string, string, string, string][] = [["DE", "ANPR / licence plate recognition", "quote", "email"], ["DE", "ANPR / licence plate recognition", "project", "video"], ["US", "CAD and BIM software development", "quote", "video"], ["GB", "Computer vision development", "project", "email"], ["NG", "CRM, ERP or HRM software", "project", "whatsapp"], ["AU", "Computer vision development", "quote", "email"]];
  for (const [country, service, intent, preferredContact] of rows) await recordStats(db, fakeInc, planInquiryStats({ country, service, intent, preferredContact, currency: country === "GB" ? "GBP" : "USD" }), now);
  await db.collection(COL.daily).doc(day).set({ views: 40, visits: 12, sessions: 12, newVisitors: 9, clickEvents: 3, clicks: { "~|Request_a_customised_quotation|link": 3, "~|Home|link": 5 }, services: { "computer-vision-development": 6 }, visitsByCountry: { US: 5, DE: 4, GB: 3 }, countries: { US: 20, DE: 12, GB: 8 } }, { merge: true });
  const r = buildReport([{ day, data: (await db.collection(COL.daily).doc(day).get()).data() }], undefined, { service: (s) => s, demo: (s) => s, project: (s) => s });
  process.stdout.write(JSON.stringify({ ...r, response: responseStats([{ createdAt: 0, replies: [{ at: 3 * H }] }, { createdAt: 0, replies: [{ at: 9 * H }] }, { createdAt: 0 }]) }));
}
main();
