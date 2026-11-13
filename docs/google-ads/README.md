# Google Ads Search plan: $300 per month, United States and United Kingdom

Generated from `src/lib/ads-plan.ts` (character limits and wording are checked by `npm run test:ads`). Nothing here has been entered into a Google Ads account: that needs your account, billing and approval. No clicks, leads or revenue are promised.

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

## NeoForge | Search | Computer Vision
**Monthly budget:** $150 · **Average daily budget:** about $5 · **Landing page:** `/computer-vision-development`

### Ad group: Computer vision development
Phrase match: "computer vision software development", "custom computer vision development", "object detection software development", "YOLO development services"

Exact match: [custom computer vision software], [computer vision development company]

### Ad group: CCTV analytics and ANPR
Phrase match: "CCTV analytics software development", "ANPR software development", "video analytics software development"

Exact match: [ANPR software development], [CCTV analytics software]

### 15 responsive search ad headlines (max 30 characters)
1. Computer Vision Development (27)
2. Custom Computer Vision Apps (27)
3. CCTV Analytics Software (23)
4. ANPR Software Development (25)
5. YOLO Model Development (22)
6. Object Detection Software (25)
7. Video Analytics Development (27)
8. Request a Quote in USD (22)
9. Budgets From $1,000 to $30,000 (30)
10. Remote Software Engineering (27)
11. Try Interactive AI Demos (24)
12. AI and Deep Learning Software (29)
13. Industrial Inspection AI (24)
14. Tell Us About Your Project (26)
15. Milestone-Based Delivery (24)

### 4 descriptions (max 90 characters)
1. Custom computer vision, CCTV analytics and ANPR software. Get a quote in USD. (77)
2. Try interactive demos on sample data, then scope your project with our engineers. (81)
3. Detection, tracking and video analytics built around your cameras, data and workflow. (85)
4. Scoped in writing and delivered in milestones. Request your indicative quote today. (83)

### Sitelinks (text up to 25, descriptions up to 35)
- **Computer Vision Services**: Detection, tracking, analytics / See what we build → `/computer-vision-development`
- **CCTV Analytics**: Video analytics software / Cameras, events, dashboards → `/cctv-analytics`
- **ANPR Software**: Plate recognition software / Built around your cameras → `/anpr-software`
- **Pricing in USD**: Indicative budget ranges / Request a detailed quote → `/pricing`

### Callouts (up to 25)
- Interactive Demos
- USD Quotations
- Remote Delivery
- Milestone-Based Work
- Written Project Scope

### Structured snippet
Header: Services. Values: Computer Vision, CCTV Analytics, ANPR, Object Detection, Video Analytics, Industrial Inspection AI

## NeoForge | Search | CAD BIM
**Monthly budget:** $90 · **Average daily budget:** about $3 · **Landing page:** `/cad-bim-development`

### Ad group: CAD and BIM development
Phrase match: "CAD software development", "custom CAD software", "Revit plugin development", "AutoCAD plugin development", "BIM software development", "point cloud to BIM", "Scan to BIM services"

Exact match: [Revit plugin development], [custom CAD software], [BIM software development]

### 15 responsive search ad headlines (max 30 characters)
1. Revit Plugin Development (24)
2. Custom CAD Software (19)
3. AutoCAD Plugin Development (26)
4. BIM Software Development (24)
5. Scan-to-BIM Workflows (21)
6. Point Cloud to BIM Tools (24)
7. CAD Automation Software (23)
8. Engineering Software Built (26)
9. 3D Reconstruction Tools (23)
10. Request a Quote in USD (22)
11. Budgets From $1,000 to $30,000 (30)
12. Try Interactive CAD/BIM Demos (29)
13. Remote Software Engineering (27)
14. Tell Us About Your Project (26)
15. Milestone-Based Delivery (24)

### 4 descriptions (max 90 characters)
1. Revit and AutoCAD plugins, CAD automation and BIM software. Get a quote in USD. (79)
2. Try interactive CAD/BIM demos on sample data, then scope your project with us. (78)
3. Point cloud, Scan-to-BIM and 3D reconstruction tools built around your workflow. (80)
4. Scoped in writing and delivered in milestones. Request your indicative quote today. (83)

### Sitelinks (text up to 25, descriptions up to 35)
- **CAD/BIM Development**: Revit, AutoCAD, BIM tools / See what we build → `/cad-bim-development`
- **3D Reconstruction**: Point clouds, photogrammetry / Scan-to-BIM workflows → `/3d-reconstruction`
- **Interactive CAD/BIM Demos**: Try working demonstrations / Sample data only → `/demos`
- **Pricing in USD**: Indicative budget ranges / Request a detailed quote → `/pricing`

### Callouts (up to 25)
- Interactive Demos
- USD Quotations
- Remote Delivery
- Milestone-Based Work
- Written Project Scope

### Structured snippet
Header: Services. Values: Revit Plugins, AutoCAD Plugins, BIM Software, CAD Automation, Scan-to-BIM, 3D Reconstruction

## NeoForge | Search | CRM ERP
**Monthly budget:** $60 · **Average daily budget:** about $2 · **Landing page:** `/crm-erp-development`

### Ad group: CRM ERP HRM development
Phrase match: "custom CRM software development", "ERP software development company", "custom ERP development", "HRM software development", "business management software development", "enterprise software development"

Exact match: [custom CRM development], [custom ERP software], [HRM software development]

### 15 responsive search ad headlines (max 30 characters)
1. Custom CRM Development (22)
2. ERP Software Development (24)
3. HRM Software Development (24)
4. Business Management Software (28)
5. Enterprise Software Builds (26)
6. Workflow Automation Software (28)
7. Custom Dashboards and BI (24)
8. Inventory Management Systems (28)
9. Third-Party Integrations (24)
10. Request a Quote in USD (22)
11. Budgets From $1,000 to $30,000 (30)
12. Try Interactive ERP Demos (25)
13. Remote Software Engineering (27)
14. Tell Us About Your Project (26)
15. Milestone-Based Delivery (24)

### 4 descriptions (max 90 characters)
1. Custom CRM, HRM and ERP software built around your workflow. Request a quote in USD. (84)
2. Try interactive CRM and ERP demos on sample data, then scope your project with us. (82)
3. Inventory, workflow automation, dashboards and integrations for your business. (78)
4. Scoped in writing and delivered in milestones. Request your indicative quote today. (83)

### Sitelinks (text up to 25, descriptions up to 35)
- **CRM and ERP Development**: CRM, HRM and ERP software / See what we build → `/crm-erp-development`
- **Interactive ERP Demos**: Try working demonstrations / Sample data only → `/demos`
- **Pricing in USD**: Indicative budget ranges / Request a detailed quote → `/pricing`
- **How We Work**: Process, milestones, support / Remote delivery → `/how-we-work`

### Callouts (up to 25)
- Interactive Demos
- USD Quotations
- Remote Delivery
- Milestone-Based Work
- Written Project Scope

### Structured snippet
Header: Services. Values: Custom CRM, HRM Software, ERP Software, Inventory Management, Workflow Automation, Business Intelligence

## Negative keywords
Add as a shared list. **Before adding any exclusion beyond these, read the search-terms report**: words such as "free", "open source" or "template" can occasionally come from a real buyer, and "course" or "training" can appear in a company that wants AI training software. The test confirms none of these blocks a keyword in this plan.

**Jobs and careers:** job, jobs, career, careers, hiring, vacancy, vacancies, recruitment, resume, salary, salaries, internship, internships, freelance jobs, remote jobs

**Learning:** course, courses, tutorial, tutorials, training, certification, certificate, degree, university, college, class, classes, bootcamp, lecture, pdf, book, books, youtube, github, example code, source code free

**Free and pirated:** free, free download, download, crack, cracked, keygen, torrent, pirated, serial key, license key, nulled

**Definitions and research:** what is, meaning, definition, definitions, wikipedia, thesis, dissertation, research paper, pdf download, interview questions

**Off-topic products:** app download, apk, mobile game, template, templates, open source, diy

## 5. Conversion tracking (implemented in the site, off until you add the IDs)
**Primary conversion:** a *successfully submitted project inquiry*. The site pushes one `generate_lead` event only after the existing inquiry API answers success (a failed submit, a page view or a visit to the contact page counts for nothing).
**Secondary conversions:** `contact_click` with `method` = whatsapp, email or phone.

| Environment variable (public IDs, set in Vercel, then redeploy) | Purpose |
|---|---|
| `NEXT_PUBLIC_GTM_ID` (GTM-XXXX) | Google Tag Manager (recommended) |
| `NEXT_PUBLIC_GA_ID` (G-XXXX) | GA4 directly, when you do not use GTM |
| `NEXT_PUBLIC_GADS_ID` (AW-XXXX) and `NEXT_PUBLIC_GADS_LEAD_LABEL` | Google Ads lead conversion directly, when you do not use GTM |
| `NEXT_PUBLIC_CLARITY_ID` | Microsoft Clarity project ID |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Search Console and Bing Webmaster ownership meta tags |

**How it behaves:** nothing loads and nothing is sent until the visitor accepts statistics in the cookie notice (and Do-Not-Track is off). Events carry no name, email, phone or message. No secret is in the front end (these IDs are public identifiers). Clarity: the inquiry form is marked `data-clarity-mask`, and Clarity's own default masking applies to typed input; keep "Balanced" or "Strict" masking in the Clarity project settings.

**GTM setup (in your GTM account):** a GA4 Configuration tag; GA4 Event tags for `generate_lead` and `contact_click` (custom-event triggers); a Google Ads Conversion tag for `generate_lead` (conversion ID and label from Google Ads, category "Submit lead form", count one). Mark only the lead conversion as a Primary goal in Google Ads; keep `contact_click` as secondary. Test with Tag Assistant or GTM preview after accepting the site's notice.

**Consent caveat:** because tags load only after consent, visitors who decline are not measured, so Google Ads will under-count conversions. That is the price of the consent-first design; confirm with your legal advisor what your target markets require (the UK and EU expect consent for advertising cookies).
