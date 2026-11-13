# Website optimization, pricing, SEO, Google Ads and international marketing: what was done

Your brief was cut off in the middle of Part 12 (after "File upload"). Parts 1–11 were done as written; Part 12 was done from the topics that were listed (HTTPS, headers, form validation, spam protection, access control, admin authentication, file upload).

## 1. The inquiry form: the only change (Part 5)
Exactly one requirement was applied: **the existing Budget field is now compulsory.**

| Where | Change |
|---|---|
| `src/components/ContactForm.tsx` | Label is "Estimated budget \*". The select is `required`. It starts on a disabled "Select a budget…" choice (the same pattern the form's other required selects use). The old "Prefer to discuss" choice, which used to be the empty value, is now a real choice named "Prefer to discuss", still first in the list, so every existing option is kept in its original order. Browser message: "Please select a budget". A server error for budget is shown under the field. |
| `src/lib/schemas.ts`, `src/lib/inquiry-options.ts` | The server rejects a missing or unknown budget ("Please select a budget"). Allowed values are the form's own options. This cannot be skipped by posting directly to the API. |
| Nothing else | No new fields, tiers, pricing cards, questions, workflow, storage, email or admin changes. The saved value and the admin view are unchanged. |

**Note on the "existing" form:** the inquiry form already had the international fields (country, phone with country code, service, currency, preferred contact method, request type) from the previous task, which you accepted. I treated that as "the existing form" and did not touch it further.

**Known mismatch to decide:** the form's budget options ("Under $5k", "$5k – $15k", …) are not the same bands as the new pricing ranges ($1,000–$5,000, $6,000–$10,000, $11,000–$30,000). You told me not to change the options, so I did not. Aligning them is a one-line change in `src/lib/inquiry-options.ts` when you decide.

**Tests (real browser plus unit):** empty submit is blocked with the message and nothing is sent; all seven options submit and arrive unchanged; a direct POST without a budget is rejected by the real API with a 400; the rest of the form and its layout are unchanged (`npm run test:inquiry`, `npm run test:international:ui`, the analytics tracker test).

## 2. Pricing (Part 4) and divisions (Part 2)
- `/pricing`: sticky navigation between **Computer Vision / AI**, **CAD/BIM** and **CRM / HRM / ERP**. Each has BASIC $1,000–$5,000, STANDARD $6,000–$10,000, PREMIUM $11,000–$30,000 (USD), with exactly the suitability lists you gave, typical deliverables, and a Request a Quote button that opens the existing inquiry form. The STANDARD card has a stronger border and tinted background and carries **no** "most popular" claim. Your disclaimer is shown word for word. No other prices exist. Data: `src/lib/pricing.ts`.
- The "typical deliverables" lines are my general wording (working application, source code for the agreed scope, documentation and similar). **Please check they match what you really deliver.**
- `/services` now has a three-division section with the full service lists you gave (13, 12 and 10 services), each linking to the most relevant indexable service page, plus links to the division's landing page and its pricing. Data: `src/lib/division-services.ts`. (Sports Analytics links to `/demos` because there is no separate sports page.)
- Tests: `npm run test:pricing:ui` (19 checks).

## 3. SEO (Part 6)
Already in place from earlier work: sitemap, robots.txt, canonical URLs, Open Graph, JSON-LD, the Services hub linking all eight landing pages. New this time:
- **Search Console and Bing tags:** set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and `NEXT_PUBLIC_BING_SITE_VERIFICATION` (the tokens those tools give you). Until then no tag is emitted. Nothing is claimed as verified.
- **Audit script** `npm run seo:audit` (`scripts/seo-audit.mjs`): crawls the sitemap and internal links, and checks status codes, redirects, titles, descriptions, canonicals, one H1, image alt attributes, duplicate metadata, noindex pages in the sitemap, the sitemap line in robots.txt and the Services page links. First run found 136 problems; after fixes it reports none on 165 crawled URLs. Fixed: duplicated brand and over-long titles on service, demo and suite pages (`src/lib/seo-title.ts`), over-long descriptions, the new How-we-work title. Interactive app shells were already `noindex` with a canonical to their demo page and are excluded from the metadata rules.
- **Not done:** Google ranking or indexing cannot be promised or checked from here. Submit `https://www.neoforgetechnologies.com/sitemap.xml` in Search Console and Bing, and watch the Pages report yourself. `NEXT_PUBLIC_SITE_URL` must be set in Vercel or the sitemap and canonicals point to localhost.
- **Screaming Frog:** run it on `https://www.neoforgetechnologies.com` with the default settings, then compare with `npm run seo:audit`. In Screaming Frog check Response Codes (4xx/5xx), Page Titles and Meta Descriptions (duplicates, missing, over length), Canonicals, Directives (noindex), Images (missing alt) and Redirects. I could not run Screaming Frog itself here, so the script covers the same checks on this build.

## 4. Analytics, Clarity and conversion tracking (Parts 8 and 9)
Implemented, **off until you add IDs** and only after the visitor accepts statistics: GTM, GA4, Google Ads lead conversion, Microsoft Clarity. Events: `generate_lead` (successful inquiry only), `meeting_request`, `contact_click` (WhatsApp, email, phone). No personal data is sent. Details, variable names and GTM setup steps are in `docs/google-ads/README.md` section 5.
- Tested in a real browser against two builds with test IDs (GTM + Clarity, and GA4 + Ads): nothing loads without consent, after decline, or with Do-Not-Track; tags load after accepting without a reload; exactly one lead event per successful inquiry and none for a failed one; click events only for WhatsApp, email and phone; no conversion from page views (`npm run test:marketing` for the unit part, `scripts/test-marketing-tags.mjs` with `MODE=gtm|gtag` against a build made with the test IDs listed in that file).
- Not verified: that Google, Microsoft or your accounts receive the events. I used stubs for the external hosts. After adding your IDs use GTM preview and GA4 DebugView.
- The site's own first-party analytics (International tab, etc.) continues to work as before.

## 5. Performance (Part 9C)
I could not use pagespeed.web.dev from here, so I ran **Lighthouse** (the engine behind PageSpeed Insights) locally against the production build with Chromium. These are lab numbers on this machine with simulated throttling, **not** PageSpeed field data:

| Page | Mobile performance | Desktop performance | Accessibility | SEO | Mobile LCP | CLS | TBT (mobile) |
|---|---|---|---|---|---|---|---|
| Home | 96 | 100 | 98 | 100 | 2.7 s | 0 | 80 ms |
| /contact (after the fixes) | 96 | 100 | 100 | 100 | 2.9 s | 0 | 80 ms |
| /pricing | 96 | 100 | 100 | 100 | 2.9 s | 0 | 70 ms |
| /computer-vision-development | 95 | 100 | 96 | 100 | 2.7 s | 0 | 130 ms |

Fixed from the reports: low-contrast text (footer legal links, small grey labels, small green eyebrow headings now use the darker green), an invalid definition list on the contact page. Not changed: the home-link `aria-label` on the logo (the logo is left untouched). INP needs real-user data; check it in Search Console's Core Web Vitals report after launch. Static assets are immutable-cached, pages are cached at the edge, and no heavy script was added (the marketing tags are consent-gated and async).

## 6. Cloudflare (Part 9E): evaluation only, nothing was changed
The site is on Vercel, which already provides TLS, a global CDN, caching and basic DDoS mitigation. Putting Cloudflare in front of Vercel in proxy mode usually adds a second CDN layer, can interfere with caching and Vercel's firewall, and is generally not recommended. Reasonable options: (1) leave DNS where it is; (2) use Cloudflare **DNS only** (grey cloud) if you want to manage DNS there; (3) only consider the proxy if you need Cloudflare WAF/bot rules that Vercel's firewall cannot provide. DNS, nameservers and security settings were **not** touched and Cloudflare is **not** connected. Needs your explicit approval before any change.

## 7. Security and reliability review (Part 12, partly truncated brief)
Checked on the running build:
- **HTTPS and headers:** HSTS (2 years, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, strict `Referrer-Policy`, `Permissions-Policy` (camera, microphone, geolocation off), API responses `no-store`, admin pages `noindex`. **Not present: a Content-Security-Policy.** Adding one blindly could break the demos and the new marketing tags; recommended path: ship it first as `Content-Security-Policy-Report-Only`, review reports, then enforce. Not done in this task.
- **Access control:** every `/api/admin/*` route returned 401 without a session (inquiries, meetings, analytics, content); state-changing admin requests without a matching Origin returned 403; `/admin/*` redirects to login.
- **Forms:** same-origin check (403 for a foreign Origin), server-side validation with markup stripped, honeypot, minimum fill time, per-IP rate limit (5 per hour). **Limit:** the rate limiter is in memory, so on a serverless host each instance counts separately; it slows abuse but is not a hard guarantee. A shared store (for example Upstash Redis) would make it exact.
- **Uploads:** signed uploads limited by type and size (existing); the route returns 503 until Cloudinary is configured, which is the safe default.
- **Not covered here:** penetration testing, dependency vulnerability scan beyond `npm audit` output, Vercel project settings and secrets hygiene (review in the Vercel dashboard), backups of Firestore.

## 8. International presentation and portfolio (Parts 10 and 11)
Done last task: country and phone handling, USD pricing, time-zone-aware meeting requests (requests only, confirmed by a person), `/how-we-work`, and project labels (client / internal demonstration / conceptual prototype) with industry and objective. No offices, addresses or country-specific pages were created. **Portfolio categories:** the portfolio uses the categories stored in your admin (Admin → Categories). I did not invent projects to fill "CCTV and ANPR", "AI and Machine Learning" or "3D Reconstruction"; create those categories and label each project in the admin. Screenshots, outcomes and clients are shown only if you supplied them.

## 9. What you must do
1. In Vercel set `NEXT_PUBLIC_SITE_URL=https://www.neoforgetechnologies.com`, plus the Firebase, SMTP and Cloudinary settings from `docs/international/README.md`.
2. Create the GTM, GA4, Google Ads and Clarity accounts, add the IDs, redeploy, test with preview tools.
3. Add Search Console and Bing verification tokens and submit the sitemap.
4. Decide the budget-option bands (section 1) and review the "typical deliverables" wording (section 2).
5. Decide the company name ("Neo Forge Technology" vs "NeoForge Technologies") and the brand green: the live site uses `#34821d` (taken from the logo), while your brief lists `#16834A`, `#11643A` and `#E9F7EF`. I did **not** recolor the site because you asked to preserve the existing identity; changing the three tokens in `tailwind.config.ts` re-themes the pages in one step if you prefer your listed values.
6. Run the Google Ads plan in stages (see `docs/google-ads/README.md`), starting with one campaign.
