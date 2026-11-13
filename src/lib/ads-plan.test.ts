import assert from "node:assert/strict";
import { CAMPAIGNS, NEGATIVE_KEYWORDS } from "./ads-plan";

async function main() {
  assert.equal(CAMPAIGNS.length, 3); assert.equal(CAMPAIGNS.reduce((a, c) => a + c.monthly, 0), 300, "budgets must total $300");
  const banned = /\b(guarantee|guaranteed|#1|best|leading|world'?s|number one|certified|award|top-rated|cheapest|100%|proven|trusted by|clients? worldwide)\b/i;
  const negs = Object.values(NEGATIVE_KEYWORDS).flat().map((n) => n.toLowerCase());
  for (const c of CAMPAIGNS) {
    assert.equal(c.headlines.length, 15, c.name + " headlines"); assert.equal(new Set(c.headlines).size, 15, c.name + " duplicate headlines");
    for (const h of c.headlines) assert.ok(h.length <= 30, `headline ${h.length}>30: ${h}`);
    assert.equal(c.descriptions.length, 4); for (const d of c.descriptions) assert.ok(d.length <= 90 && d.length >= 30, `description ${d.length}: ${d}`);
    assert.ok(c.sitelinks.length >= 4); for (const s of c.sitelinks) { assert.ok(s.text.length <= 25, "sitelink text " + s.text); assert.ok(s.d1.length <= 35 && s.d2.length <= 35, "sitelink desc " + s.text); assert.ok(s.url.startsWith("/")); }
    for (const x of c.callouts) assert.ok(x.length <= 25, "callout " + x); assert.ok(c.snippetValues.length >= 3 && c.snippetValues.length <= 10); for (const x of c.snippetValues) assert.ok(x.length <= 25, "snippet " + x);
    for (const t of [...c.headlines, ...c.descriptions, ...c.callouts, ...c.snippetValues, ...c.sitelinks.flatMap((s) => [s.text, s.d1, s.d2])]) assert.ok(!banned.test(t), `unsupported claim wording: ${t}`);
    assert.ok(Math.abs(c.daily - c.monthly / 30) < 0.5, c.name + " daily budget");
    const kws = c.groups.flatMap((g) => [...g.phrase, ...g.exact]); for (const k of kws) for (const n of negs) assert.ok(!new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(k), `negative "${n}" would block keyword "${k}"`);
    assert.ok(c.headlines.some((h) => /USD|\$/.test(h)) && c.headlines.some((h) => /Quote/i.test(h)));
  }
  // the dollar range in ads matches the pricing page's exact ranges
  assert.ok(CAMPAIGNS.every((c) => c.headlines.includes("Budgets From $1,000 to $30,000")));
  assert.deepEqual(CAMPAIGNS.map((c) => c.landing), ["/computer-vision-development", "/cad-bim-development", "/crm-erp-development"]);
  console.log("google ads plan tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
