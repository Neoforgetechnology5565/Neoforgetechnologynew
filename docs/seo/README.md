# SEO service pages

Eight service landing pages plus the main Services page. Content lives in `src/lib/landing-pages-a.ts` and `landing-pages-b.ts` (typed in `landing-types.ts`); one layout (`components/landing/LandingPageView.tsx`) renders them; each route is a three-line file.

| URL | Primary keyword |
|---|---|
| `/computer-vision-development` | Computer Vision Development Company |
| `/ai-development` | AI Software Development |
| `/cctv-analytics` | CCTV Analytics Software |
| `/anpr-software` | ANPR Software Development |
| `/3d-reconstruction` | 3D Reconstruction Services |
| `/cad-bim-development` | CAD and BIM Software Development |
| `/crm-erp-development` | CRM and ERP Software Development |
| `/medical-imaging-ai` | Medical Imaging AI Development |
| `/services` | Software Development Services |

Each page: SEO hero (H1, two CTAs, drawn illustration), overview, 9-11 capability cards, use cases, technologies, six-step process, an honest "limits" box (accuracy, hardware, validation), related demos and related `/services/…` pages, FAQ, contact CTA. Metadata: unique absolute title and description, self-referencing canonical, Open Graph and Twitter. JSON-LD: WebPage, Service, BreadcrumbList, FAQPage (FAQ text is the visible FAQ). `/services` uses CollectionPage, ItemList, BreadcrumbList, FAQPage.

## Linking
Home (services block) → `/services` → each page → related demos/portfolio → `/contact`. Footer lists all eight. Each page links back to `/services`; each existing `/services/[slug]` page links up to its hub (`HUB_FOR_SERVICE` in `lib/services-hub.ts`). All nine are in `sitemap.xml`; `robots.txt` blocks only `/admin` and `/api`.

## Note on `/services/computer-vision-development`
That older page covers the same topic from the service-detail side. The new `/computer-vision-development` is the overview page; they are cross-linked, not duplicates, but if Search Console shows them competing for the same query, consider a 301 from one to the other.

## Honesty rules (enforced by `npm run test:seo`)
No client names, results, accuracy percentages, guarantees or superlatives. Medical: not diagnostic. CCTV: no universal camera compatibility. ANPR: accuracy depends on image quality, placement, lighting and plate formats, and the public demo does not read plates. 3D: states what needs a server or GPU.

## Tests
`npm run test:seo` (content), `npm run test:seo:ui` (a running production build: status, indexability, metadata, canonical, structured data, headings, links, sitemap, robots, mobile, weight).

## After deployment
Nothing here proves Google has indexed or will rank the pages. In Google Search Console: submit `https://www.neoforgetechnologies.com/sitemap.xml`, then URL Inspection → "Request indexing" for `/services` and each of the eight pages, and check the Pages report for exclusions.
