import assert from "node:assert/strict";
import { buildReport } from "./aggregate";
import { planInquiryStats, recordStats, responseStats } from "./intl";
import { fakeDb, fakeInc } from "./testing";
import { COL } from "./consts";

async function main() {
  const db = fakeDb(), now = Date.UTC(2026, 9, 12, 10), day = new Date(now).toISOString().slice(0, 10);
  const inq = (country: string, service: string, intent = "project", preferredContact = "email") => recordStats(db, fakeInc, planInquiryStats({ country, service, intent, preferredContact, currency: "USD" }), now);
  await inq("DE", "ANPR / licence plate recognition"); await inq("DE", "ANPR / licence plate recognition", "quote"); await inq("US", "CAD and BIM software development", "quote", "video"); await inq("zz", ""); // junk country -> Unknown
  const d = db.all.get(COL.daily)!.get(day)!;
  const r = buildReport([{ day, data: d }], undefined, { service: (s) => s, demo: (s) => s, project: (s) => s });
  const i = r.international;
  assert.equal(i.inquiries, 4); assert.equal(i.distinctCountries, 2);
  assert.deepEqual(i.countries.map((c) => [c.label, c.n]), [["Germany", 2], ["United States", 1], ["Unknown", 1]]);
  assert.equal(i.services[0].n, 2); assert.equal(i.services[0].label, "ANPR / licence plate recognition");
  assert.equal(i.intents.find((x) => x.key === "quote")?.n, 2); assert.equal(i.methods.find((x) => x.key === "video")?.label, "Video call");
  // privacy: nothing identifying is ever stored in the aggregate document
  const dump = JSON.stringify(d); assert.ok(!/@|\+\d{5,}/.test(dump), "no emails or phone numbers in counters");
  // service names containing dots/slashes must not break Firestore map keys
  assert.ok(Object.keys(d.intlServices as object).every((k) => !/[./]/.test(k)), "sanitised keys: " + Object.keys(d.intlServices as object));
  // response times
  const H = 3600_000;
  const rs = responseStats([{ createdAt: 0, replies: [{ at: 2 * H }] }, { createdAt: 0, replies: [{ at: 30 * H }, { at: 5 * H }] }, { createdAt: 0, replies: [{ at: 10 * H }] }, { createdAt: 0 }]);
  assert.deepEqual(rs, { answered: 3, unanswered: 1, medianHours: 5, within24hPct: 100 }); // the first reply counts, so the 5 h reply wins over the later 30 h one
  assert.equal(responseStats([{ createdAt: 0, replies: [{ at: 30 * H }] }, { createdAt: 0, replies: [{ at: 2 * H }] }, { createdAt: 0, replies: [{ at: 50 * H }] }]).within24hPct, 33);
  assert.deepEqual(responseStats([]), { answered: 0, unanswered: 0, medianHours: null, within24hPct: null });
  console.log("international analytics tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
