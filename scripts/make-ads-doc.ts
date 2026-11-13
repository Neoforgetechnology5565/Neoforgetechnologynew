// Generates docs/google-ads/README.md from src/lib/ads-plan.ts so the document and the tested data cannot drift apart.
import { writeFileSync } from "node:fs";
import { CAMPAIGNS, NEGATIVE_KEYWORDS } from "../src/lib/ads-plan";

const L = (a: string[]) => a.map((x) => `- ${x}`).join("\n");
let md = `# Google Ads Search plan: $300 per month, United States and United Kingdom

Generated from \`src/lib/ads-plan.ts\` (character limits and wording are checked by \`npm run test:ads\`). Nothing here has been entered into a Google Ads account: that needs your account, billing and approval. No clicks, leads or revenue are promised.

## 1. Is the budget too fragmented? (my recommendation)
The requested split is $150 + $90 + $60 = $300 per month, about $5, $3 and $2 per day, in two countries.

- A US or UK click on software-development terms like these commonly costs several dollars; **check real figures in Keyword Planner before launch** (I could not retrieve them from this environment). At a cost of about $8 per click, $2 a day is a quarter of a click per day and $5 a day is well under one click per day.
- Google's automated bidding needs conversion history to learn; at this volume a campaign may record only a handful of inquiries a month, if any. Three campaigns across two countries split a very small number of clicks into six pieces, none of which will give you readable data.
- Budgets this small can also run out early in the day.

**Recommended staging (keeps your campaign structure, changes only the order):**
1. **Stage 1 (months 1–2): run Campaign 1 only**, with the full $300 (about $10 a day), targeting the United States and United Kingdom together (compare countries in the location report, do not split them yet). Use exact and phrase match only. Review the search-terms report weekly.
2. **Stage 2:** once Campaign 1 shows a sensible cost per click and at least some inquiries, move $90 from it to Campaign 2 (CAD/BIM) and keep Campaign 1 at $210.
3. **Stage 3:** add Campaign 3 (CRM/ERP, $60) only if Stage 2 is healthy, or keep two campaigns permanently if the data says CRM/ERP clicks are too expensive.
4. Choose the first campaign by evidence: estimated CPCs from Keyword Planner and the division you most want, and are best able, to deliver.

If you prefer to launch all three at once, the plan below supports it, but expect thin data.

## 2. Account and campaign settings
| Setting | Recommendation |
|---|---|
| Campaign type / goal | Search, objective **Leads** |
| Networks | Google Search only. **Search partners off, Display Network off** initially |
| Locations | United States and United Kingdom. Option: **"Presence: people in or regularly in your targeted locations"** (not "interest in") |
| Language | English |
| Bidding (no conversion history) | **Maximize clicks with a maximum CPC cap** (or Manual CPC) for the first weeks; switch to **Maximize conversions** only after roughly 15–30 recorded inquiries, then consider a target CPA |
| Match types | Phrase and exact only at the start. No broad match until conversion tracking is proven |
| Daily budgets | As below; the monthly total is $300, so average spend across all campaigns must stay near $9.86 a day |
| Ad assets | Responsive Search Ads with all 15 headlines and 4 descriptions, plus sitelinks, callouts and structured snippets |
| Final URLs | Each campaign's landing page (below). Add your tracking template or UTM parameters in Google Ads |
| Ad schedule | Start with all hours; later restrict to hours that produce inquiries |
| Conversion tracking | Section 5 |

**Policy and accuracy:** ads must match the site. Every claim used (interactive demos, USD quotations, remote delivery, milestone-based work, written scope) exists on the site today. The ads do not say "best", "leading", "certified", "guaranteed" or quote customer numbers (checked by the test).
`;
for (const c of CAMPAIGNS) {
  md += `
## ${c.name}
**Monthly budget:** $${c.monthly} · **Average daily budget:** about $${c.daily} · **Landing page:** \`${c.landing}\`

`;
  for (const g of c.groups) md += `### Ad group: ${g.name}\nPhrase match: ${g.phrase.map((k) => `"${k}"`).join(", ")}\n\nExact match: ${g.exact.map((k) => `[${k}]`).join(", ")}\n\n`;
  md += `### 15 responsive search ad headlines (max 30 characters)\n${c.headlines.map((h, i) => `${i + 1}. ${h} (${h.length})`).join("\n")}\n\n### 4 descriptions (max 90 characters)\n${c.descriptions.map((d, i) => `${i + 1}. ${d} (${d.length})`).join("\n")}\n\n### Sitelinks (text up to 25, descriptions up to 35)\n${c.sitelinks.map((s) => `- **${s.text}**: ${s.d1} / ${s.d2} → \`${s.url}\``).join("\n")}\n\n### Callouts (up to 25)\n${L(c.callouts)}\n\n### Structured snippet\nHeader: ${c.snippetHeader}. Values: ${c.snippetValues.join(", ")}\n`;
}
md += `
## Negative keywords
Add as a shared list. **Before adding any exclusion beyond these, read the search-terms report**: words such as "free", "open source" or "template" can occasionally come from a real buyer, and "course" or "training" can appear in a company that wants AI training software. The test confirms none of these blocks a keyword in this plan.
${Object.entries(NEGATIVE_KEYWORDS).map(([k, v]) => `\n**${k}:** ${v.join(", ")}`).join("\n")}

## 5. Conversion tracking (implemented in the site, off until you add the IDs)
**Primary conversion:** a *successfully submitted project inquiry*. The site pushes one \`generate_lead\` event only after the existing inquiry API answers success (a failed submit, a page view or a visit to the contact page counts for nothing).
**Meeting requests:** pushed as \`meeting_request\`. This site only *requests* meetings (a person confirms by email), so it is not a confirmed booking. Treat it as secondary until you record confirmed meetings yourself.
**Secondary conversions:** \`contact_click\` with \`method\` = whatsapp, email or phone.

| Environment variable (public IDs, set in Vercel, then redeploy) | Purpose |
|---|---|
| \`NEXT_PUBLIC_GTM_ID\` (GTM-XXXX) | Google Tag Manager (recommended) |
| \`NEXT_PUBLIC_GA_ID\` (G-XXXX) | GA4 directly, when you do not use GTM |
| \`NEXT_PUBLIC_GADS_ID\` (AW-XXXX) and \`NEXT_PUBLIC_GADS_LEAD_LABEL\` | Google Ads lead conversion directly, when you do not use GTM |
| \`NEXT_PUBLIC_CLARITY_ID\` | Microsoft Clarity project ID |
| \`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION\`, \`NEXT_PUBLIC_BING_SITE_VERIFICATION\` | Search Console and Bing Webmaster ownership meta tags |

**How it behaves:** nothing loads and nothing is sent until the visitor accepts statistics in the cookie notice (and Do-Not-Track is off). Events carry no name, email, phone or message. No secret is in the front end (these IDs are public identifiers). Clarity: the inquiry and meeting forms are marked \`data-clarity-mask\`, and Clarity's own default masking applies to typed input; keep "Balanced" or "Strict" masking in the Clarity project settings.

**GTM setup (in your GTM account):** a GA4 Configuration tag; GA4 Event tags for \`generate_lead\`, \`meeting_request\` and \`contact_click\` (custom-event triggers); a Google Ads Conversion tag for \`generate_lead\` (conversion ID and label from Google Ads, category "Submit lead form", count one). Mark only the lead conversion as a Primary goal in Google Ads; keep \`contact_click\` and \`meeting_request\` as secondary. Test with Tag Assistant or GTM preview after accepting the site's notice.

**Consent caveat:** because tags load only after consent, visitors who decline are not measured, so Google Ads will under-count conversions. That is the price of the consent-first design; confirm with your legal advisor what your target markets require (the UK and EU expect consent for advertising cookies).
`;
writeFileSync("docs/google-ads/README.md", md);
console.log("written", md.length, "chars");
