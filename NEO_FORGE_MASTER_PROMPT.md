# NEO FORGE TECHNOLOGY — COMPLETE WEBSITE + CMS BUILD (MASTER PROMPT)

Build a production-quality, fully functional website **and** admin CMS for **Neo Forge Technology**. This is a real working product, not a visual mock-up. Everything the administrator needs must be possible from the admin interface — no CLI commands, scripts or manual database edits.

---

## 1. COMPANY & POSITIONING

Neo Forge Technology is a **software engineering and advanced-technology company**, not a generic web agency and not an architecture company. Capabilities:

Computer Vision · Machine Learning · Deep Learning · AI · AI Automation · CRM · HRM · ERP · Business Process Automation · CAD software development · BIM software development · Revit plugins · AutoCAD plugins · SketchUp extensions & Dynamic Components · BricsCAD development · Engineering software · Custom software.

The site must immediately communicate: **Software + AI + Automation + Engineering Technology.**

Do not make unsupported claims. Technology lists are presented as *relevant technologies/capabilities*, never as "we use all of these on every project". Do not invent clients, results or case studies — the portfolio starts empty and is filled through the admin.

---

## 2. TECHNOLOGY STACK (do not add other services)

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind CSS, reusable components |
| Database | Firebase **Firestore** |
| Auth | Firebase **Authentication** (Email/Password **and Google**) |
| Media/files | **Cloudinary** (never Firebase Storage) |
| Hosting | **Vercel**, deployed from **GitHub**, production branch = `main` |

All Firestore access goes through the **Firebase Admin SDK on the server**. Firestore rules are deny-all for clients. Secrets only in Vercel environment variables.

### Required Vercel environment variables
```
NEXT_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID / _APP_ID
FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
ADMIN_EMAILS                    (comma-separated emails allowed to become admin)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY (digits only), CLOUDINARY_API_SECRET
NEXT_PUBLIC_SITE_URL
```

### Hard-won deployment requirements (build these in from the start)
1. `next.config`: `serverExternalPackages: ["firebase-admin", "google-gax", "@grpc/grpc-js", "@google-cloud/firestore"]`.
2. `package.json`: `"overrides": { "jose": "^4.15.9" }` — otherwise firebase-admin crashes on Vercel with `require() of ES Module .../jose`.
3. Accept the Firebase private key pasted any way (with quotes, literal `\n`, or real newlines).
4. Public pages must **never crash** if Firestore is unavailable — fall back to defaults.
5. `GET /api/health` — deployment self-check returning **only booleans / short error text, never secret values**: which env vars are missing; Firestore read OK; Firestore write OK (write+delete scratch doc); a step-by-step dry run of the live-chat start path; Firebase Auth OK; Cloudinary variables sane (API key must be digits-only; detect when the secret was pasted into the key field). Every probe has an 8 s timeout so the page never hangs. Failed API calls return a short error `code`.
6. Next.js ≥15 conventions (async `params`/`searchParams`), `next-env.d.ts` committed, declare `*.css` module for TS.

---

## 3. INFORMATION ARCHITECTURE

Three structural divisions (in code, because they drive routes), each with CMS-managed **sub-categories**:

**01 Computer Vision / ML / DL** (`/computer-vision`) — Computer Vision, Object Detection, Tracking, Video Analytics, OCR, AI Inspection, Edge AI, Machine Learning, Deep Learning. Default flow: *Video → AI Model → Detection → Analytics*.
**02 CRM / HRM / ERP & AI Automation** (`/crm-hrm-erp`) — CRM, HRM, ERP, AI Automation, Workflow Automation, AI Agents, Business Intelligence. Flow: *Lead → Workflow → Automation → Dashboard*.
**03 CAD / BIM & Engineering Software** (`/cad-bim`) — Revit, AutoCAD, SketchUp, SketchUp Dynamic Components, BricsCAD, BIM, CAD Automation, Engineering Software. Flow: *CAD Software → Plugin → Automation → Output*.

Default sub-categories are **seeded automatically** (with one-sentence descriptions) by idempotent migrations; admins can add/edit/reorder/disable/delete them, add descriptions and capabilities. New sub-categories must never require code changes.

Each division page lists its capability groups (full lists below), CMS sub-category cards, a solution-flow diagram, recent projects and a CTA. Capability content:

- **CV/ML/DL:** Computer Vision (object detection, tracking, image recognition, video analytics, OCR, image/video processing, segmentation, pose estimation, visual inspection, face detection, feature extraction); Machine Learning (classification, regression, predictive models, anomaly detection, recommendation systems, custom ML pipelines); Deep Learning (neural networks, CNNs, transformers, vision models, custom training, optimisation, deployment); AI (applications, APIs, agents, intelligent automation, generative AI integrations, AI analytics); Edge AI; relevant technologies: NVIDIA Jetson, TensorRT, DeepStream, CUDA, OpenCV, PyTorch, TensorFlow, ONNX, MediaPipe, YOLO. Present professionally — not a logo wall.
- **CRM/HRM/ERP & AI automation:** CRM (sales, leads, customers, pipeline, sales automation, support, marketing automation, retention, analytics, AI-powered CRM); HRM (employees, recruitment, ATS, payroll, attendance, self-service, performance, training, benefits, HR automation); ERP (finance, accounting, procurement, inventory, warehouse, supply chain, manufacturing, project management, operations, reporting); AI Automation (workflow automation, AI agents, document processing, email/lead/support automation, BPA, data extraction, AI reporting, intelligent workflows).
- **CAD/BIM & engineering software (software development & automation, NOT architectural design):** Revit (plugins, API, BIM/family/parameter/model automation, data extraction, workflow automation, custom tools); AutoCAD (plugins, API, AutoLISP, .NET, CAD automation, custom commands, drawing automation, data extraction, batch processing); SketchUp (extensions, Ruby API, automation, Dynamic Components, parametric components, custom tools, model automation); BricsCAD (plugins, automation, custom commands, API, workflow automation); BIM (automation, data processing, model data extraction, IFC, model coordination, parametric modelling, workflow automation); Engineering software (calculators, design automation, parametric tools, configuration software, technical software, custom engineering apps).
- **Technology page/section** (`/technology`) grouped as AI/CV · Software · CAD/BIM (Python, C++, OpenCV, PyTorch, TensorFlow, YOLO, ONNX, TensorRT, CUDA, DeepStream, MediaPipe; Next.js, TypeScript, Node.js, FastAPI, PostgreSQL, Firebase, Docker, REST APIs; Revit API, AutoCAD API, AutoLISP, .NET, SketchUp Ruby API & Dynamic Components, BricsCAD API, IFC) with a note that these are relevant, not exhaustive.
- **"Why Neo Forge Technology":** Technical Depth · Custom Development · Cross-Domain Expertise · Scalable Architecture · Production Focus.

---

## 4. SITE STRUCTURE & NAVIGATION (modelled on the Neo Vision Team site)

**Main navigation (desktop):** Home · Computer Vision / AI ▾ · CRM / HRM / ERP ▾ · CAD / BIM ▾ · Live Chat · About · Contact · **[Start a Project]** button.
(Portfolio is **not** in the header; it remains reachable by links/footer.) The three division items open dropdowns that list that division's **CMS sub-categories** (name + description) with a "View all" link. **Mobile:** hamburger with expandable (+/−) division sections. Skip-to-content link. Admin is never linked in nav or footer.

**Routes**
```
/                                   home
/computer-vision  /crm-hrm-erp  /cad-bim            division landing pages
/{division}/{sub-category}                           sub-category page (its published projects)
/{division}/{sub-category}/{project}                 canonical case-study URL
/portfolio  /portfolio/{division}                    portfolio overview / per-division with filter
/portfolio/{division}/{project}                      legacy URL → 301/307 to canonical when categorised
/technology  /about  /contact  /live-chat
/admin/**   /api/**   /api/health   sitemap.xml   robots.txt
```
Unknown sub-category/project → proper 404 page.

**Home page order:** dark hero (slideshow of featured-project covers; animated technical SVG visual when none) with 3 core-capability cards → Division 01 (white) with sub-category cards → Division 02 (dark band) → Division 03 (white) → Featured projects (pale band) → About blurb → Why choose us → Technologies → FAQ → dark CTA band → footer.

Hero copy (editable in admin): eyebrow "Software engineering · AI · Automation · CAD/BIM"; heading **"SOFTWARE. AI. AUTOMATION. ENGINEERING."**; text "Neo Forge Technology builds intelligent software, AI systems, business automation platforms and specialized CAD/BIM solutions for complex real-world workflows."; primary CTA "Start a Project", secondary "Explore Our Work".

**Footer:** company blurb + contact details, three division columns listing their sub-categories, links (Portfolio, Technology, Live Chat, About, Contact), social links. Hidden inside `/admin`.

**Floating contact widget** (bottom-right): button → menu (Chat with us / WhatsApp / Email) → popup chat. Dedicated `/live-chat` page with the same chat inline.

---

## 5. DESIGN DIRECTION

- **Colors: the logo's green and black on white.** White page, neutral greys, **green accent** (#34821d on white for text/buttons, #55b52b–#7acf48 on dark, black text on bright-green buttons), near-black (#0a0a0a) bands for hero, one division, CTA and footer. Implemented by remapping Tailwind's `blue` to the green scale and `slate` to neutral greys in `tailwind.config.ts`, plus the admin tokens (`forge`, `ink`, `paper`, `signal`) and the generated covers/share image/email button. No amber/orange, no neon.
- **Typography: Georgia** (serif) for headings **and** body — a system font, no downloads. Small technical labels in the admin may use monospace.
- **Shape language (like Neo Vision):** rounded-2xl cards, rounded-full pill buttons/chips, hairline borders, hover lift + soft shadow, generous spacing, sticky white header with blur, subtle animations (respect `prefers-reduced-motion`).
- Premium, technical, engineering-oriented: technical diagrams, solution-flow steps, code/CAD wireframe motifs. Avoid generic SaaS look, cheap stock AI imagery, excessive gradients.
- Fully responsive (desktop, laptop, tablet, mobile) — no horizontal overflow; special care for dropdowns, galleries, project pages, forms, chat, uploads and the admin.

---

## 6. PROJECT / PORTFOLIO SYSTEM

Fields: title, slug (auto, unique per division), division, sub-category, short summary, description, cover image, gallery, PDFs, additional files, **video links**, optional uploaded video, technology stack, features, challenge, solution, results, custom solution-flow steps (≤6), featured flag, draft/published, manual order, created/updated dates. Sub-category name/slug denormalised on the project and kept in sync when a category is renamed.

**Case-study page:** dark hero with breadcrumb → cover image → overview + side facts (division, category, technology chips) → solution-flow diagram → Challenge / Solution → Features → Visuals (video thumbnails + gallery with lightbox) → Results → Documents (PDF first-page thumbnails, file downloads) → Related projects (same division/category) → CTA ("Have a similar project? Let's talk."). JSON-LD, Open Graph with cover image.

### Video links (YouTube / Vimeo)
- In the admin project editor, **paste one or more (≤6) YouTube or Vimeo links** (Enter or Add); a **thumbnail preview** appears instantly; reorder/remove; duplicates and non-YouTube/Vimeo links are refused with a clear message; validated again server-side.
- Supported shapes: youtube.com/watch, youtu.be, /embed, /shorts, /live, m.youtube.com; vimeo.com/ID, player.vimeo.com/video/ID, unlisted `vimeo.com/ID/hash`, channel URLs.
- Public page shows each as a **clickable thumbnail with a play button** (YouTube thumbnail from i.ytimg.com with fallback; Vimeo via oEmbed, cached 24 h, graceful placeholder). Click opens a modal player (youtube-nocookie / player.vimeo.com, autoplay, Esc to close) and an "Open on YouTube/Vimeo ↗" link. Cloudinary-uploaded video files remain a fallback option.

---

## 7. ADMIN CMS (`/admin`, not linked anywhere, but genuinely secured)

**Security:** Firebase Auth → server exchanges the ID token for an **httpOnly, SameSite=Strict, Secure session cookie** (5 days). Admin = Firebase **custom claim `admin: true`**, granted on first sign-in to an **email-verified** account whose email is in `ADMIN_EMAILS` (the login page sends the verification email if needed; claim-refresh handled). Every admin page and API route verifies signature, expiry, **revocation** and the claim server-side (middleware only does a first bounce). Origin check on mutations, rate limits, zod validation + markup stripping, sign-out **revokes** the user's tokens. Admin pages `noindex`.

**Login page:** **Continue with Google** button (popup, friendly errors for popup-blocked / unauthorized-domain / provider-not-enabled) plus email + password. Only allow-listed admins get a session.

**Admin sections:**
1. **Dashboard** — total/published/draft projects, inquiries (unread), unread chat messages, visits, page views, unique visitors, recent activity.
2. **Projects** — list with filter, publish/unpublish, feature, up/down ordering, edit, delete, view; full editor (all fields above, drag-and-drop uploads with progress, gallery reorder, PDF thumbnail preview, YouTube/Vimeo link field, Save draft / Save & publish).
3. **Categories** — create/edit/delete (blocked if projects use it)/reorder/enable-disable, description, capabilities, per division.
4. **Site content** — Homepage (hero text, CTAs, capability cards, featured-project picker), About (headline, description, approach, capabilities), Contact & chat (email, phone, **WhatsApp**, location, social links, chat on/off, greeting).
5. **Branding** — upload **logo for light backgrounds** (header), **logo for dark backgrounds** (footer) and a **square icon** (favicon/apple-touch/tab). Live previews on the right background, icon previews at 16/32/64/120 px, "auto-crop empty margins" toggle (Cloudinary `e_trim`, because logos are often exported on big canvases), remove-to-revert-to-text-name, guidance (transparent PNG/SVG ≈1200 px wide; icon ≥512×512 square). Header uses the light logo, footer the dark logo, favicon from the icon; text wordmark until uploaded.
6. **FAQs** — add/edit/delete/reorder/show-hide (a few generic starter FAQs seeded).
7. **Inquiries** — inbox (name, email, company, project type, date, status, message, attachments), mark read/unread, delete.
8. **Live chat** — conversation list with unread badges, thread view, reply, attach file, delete; **polling** (not realtime listeners).
9. **Analytics** — total visits, unique visitors, page views, 30-day chart, popular pages, project views, countries.
10. **Maintenance** — one-click, repeatable migrations, plus email-notification status and test button.
11. **Blog** — see section 12.

**Migrations:** versioned, idempotent, auto-run when an admin opens the console, also re-runnable manually; never overwrite edited content (seed categories with descriptions, seed FAQs, backfill project fields, backfill category slugs, fill blank default descriptions).

---

## 8. CLOUDINARY UPLOADS

Browser → **signed direct upload** to Cloudinary (server signs `timestamp`, fixed `folder` under `neoforge/…`, and `allowed_formats`) → store `{url, publicId, resourceType, format, bytes, name, width, height}` in Firestore → render with `f_auto,q_auto` + responsive `srcset`. Admin signer requires admin session. A separate, rate-limited **public signer** (images + PDF only) serves the contact form and chat. Server validation requires media URLs to be on the configured Cloudinary cloud. Client-side size limits (image 15 MB, video 100 MB, other 50 MB).
- Supported: JPG, PNG, WEBP, GIF, **SVG** (logos), PDF, MP4/WEBM/MOV, plus zip/dwg/dxf/rvt/rfa/skp/rbz/ifc/json/csv/txt/docx/xlsx/pptx/dll/bundle.
- PDFs uploaded as image resources → first-page thumbnail via URL transform (`pg_1`).
- Note: Cloudinary Settings → Security must allow PDF/ZIP delivery.

---

## 9. CONTACT, CHAT, ANALYTICS

- **Contact form:** name, email, company, project type (Computer Vision, Machine Learning, Deep Learning, AI, CRM, HRM, ERP, AI Automation, Revit, AutoCAD, SketchUp, BricsCAD, BIM, CAD Automation, Custom Software, Other), technology division (preselected from `?division=`), budget, timeline, description, attachments. Honeypot, rate limit, origin check, server validation; stored in Firestore.
- **Live chat:** visitor starts a conversation (name, optional email, message), receives a per-conversation secret token (constant-time compared), polls every 4 s while open (20 s when closed, unread badge), can attach image/PDF; admin replies from the admin inbox. WhatsApp fallback when a number is configured.
- **Analytics:** first-party, cookie-less beacon; random visitor id in localStorage; respects Do-Not-Track; ignores bots, `/admin`, `/api`; stores daily counters (views, visits, unique visitors, pages, countries via host geo header, project views); no IP/user-agent stored.

---

## 10. SEO & PERFORMANCE

Per-page metadata/titles/descriptions, canonical URLs, Open Graph/Twitter, semantic HTML, image alt text, JSON-LD on projects, `sitemap.xml` (pages, divisions, sub-categories, projects), `robots.txt` (disallow `/admin`, `/api`). Cached Firestore reads with tag/path invalidation on every admin write; lazy-loaded images; Cloudinary transforms; no large media on first load; `noindex` on admin. Security headers (nosniff, frame options, referrer policy, permissions policy, HSTS).

---

## 11. DONE-WHEN (test the complete flow, desktop **and** mobile)

Admin login (password and Google) → create category → create project → upload image/PDF to Cloudinary → add YouTube/Vimeo link and see thumbnail → save to Firestore → publish → view at the canonical `/{division}/{sub-category}/{project}` URL and in the sub-category page, portfolio and homepage (if featured) → click the video thumbnail to play → submit the contact form → read it in the admin inbox → start a live chat → reply from admin and see it arrive → upload logos/icon in Branding and see header, footer and favicon change → edit homepage text → view analytics → sign out and confirm `/admin` and admin APIs are gated. `/api/health` must return `ok: true` on the deployed site. No manual database edits at any point.

Keep the stack lean: Next.js + Firebase + Cloudinary + Vercel + GitHub only.

---

## 12. SEO & GROWTH ADD-ONS

**Blog (`/blog`, `/blog/{slug}`, `/feed.xml`)** — admin **Blog** section: title, slug, short summary, article body with a toolbar editor (H2/H3, bold, italic, link, lists, quote, **image upload to Cloudinary**) and Write/Preview tabs, cover image + alt text, YouTube/Vimeo links (thumbnail → player), tags, author, optional related division, optional search title/description with a Google-result preview, draft/published (publishedAt stamped on first publish). Body is a **safe Markdown subset rendered without raw HTML** (links limited to http/https/mailto/relative, images only from Cloudinary). Public pages: blog list, article page (hero, cover, "On this page" contents, body, video thumbnails, tags, **related-service box** linking to the division/portfolio, related articles, CTA), RSS feed, header + footer links, "From the blog" row on the matching division page. Published articles are added to `sitemap.xml` automatically, so each post needs no manual submission in Search Console.

**PDF auto-fill for articles** — New article starts with a choice: *Write it myself* or *Upload a PDF and auto-fill* (also “Re-fill from a PDF” inside the editor). The PDF is uploaded to Cloudinary (`blog/imports`), then `POST /api/admin/posts/import-pdf` downloads it (≤25 MB), reads the text with `unpdf` and, by font size/position heuristics, builds the title (largest first-page text), summary, `##`/`###` headings, paragraphs, lists, tags and a guessed division, dropping repeated headers/footers and page numbers. Nothing is saved until the admin reviews and saves (always a draft). Scanned/image-only PDFs give a warning (no OCR); images and tables are not converted. Requires Cloudinary “PDF and ZIP files delivery” enabled. The import also fills everything else: pictures embedded in the PDF are extracted (sharp), uploaded to Cloudinary and placed after the text of their page (the first big one becomes the cover; if none, a branded cover is designed from the title), plus cover alt text, search title/description, YouTube/Vimeo links found in the text, and a “Download the full PDF” link at the end.

**AI article writer** — the New article page also has a *Write with AI* panel: “Suggest topics” returns 8 searchable ideas (avoiding existing titles, optional focus), and picking one (or typing your own) drafts a full 800–1100 word article with title, summary, tags, division and SEO fields into the editor as a draft. Server-side only (`/api/admin/posts/ai`, `@anthropic-ai/sdk`, structured JSON output, model `ANTHROPIC_MODEL` default `claude-opus-5-5`, requires `ANTHROPIC_API_KEY`; usage is billed by Anthropic). The prompt forbids invented statistics, clients or quotes; the editor shows a fact-check banner and nothing is published automatically. The AI also designs the media: a branded 1200×630 cover (division-specific graphic) and 1–2 diagrams (workflow steps or key takeaways) rendered server-side with next/og and uploaded to Cloudinary, inserted into the article at marker positions; plus cover alt text and search fields. It cannot produce photographs. A “Design a cover for me” button in the editor's Media card does the cover on demand.

**Default share-preview image** — `/opengraph-image` and `/twitter-image` generate a 1200×630 branded card (uses the uploaded dark-background logo when present, else a text wordmark) for every page without its own image; pages that define their own Open Graph (articles, projects, divisions) pass it explicitly because Next drops the file-based image otherwise. Project/article covers are used when present.

**Structured data (JSON-LD, only what is visibly true)** — Organization + WebSite on every page (logo from Branding, email/phone and social links from Site content, no invented address/reviews/ratings); Service on division pages; BreadcrumbList on division, sub-category, project and article pages; CreativeWork on projects; BlogPosting on articles; FAQPage on home and About for the FAQs shown there.

**Email notifications (optional)** — via **SMTP using the owner's own mailbox** (e.g. Zoho Mail; `smtp.zoho.com:465`; app password if 2-step is on) with `nodemailer` and Next `after()` so sending never delays or fails a visitor request. Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, optional `NOTIFY_TO` (default: contact email in Site content, then SMTP_USER), `MAIL_FROM`. Emails: new contact inquiry (Reply-To = visitor, user text HTML-escaped, link to admin inbox) and new live chat (follow-up messages throttled to one email per 10 minutes per conversation). Admin → Maintenance shows email status and a **Send a test email** button; `/api/health` reports `email: configured | not configured (optional)`.

## 13. Legal pages and privacy notice

**Legal pages** — `/privacy` and `/terms`, linked in the footer, in the sitemap, with canonical URLs. Text is stored in `content/legal` (Admin → Site content → Legal pages): two Markdown textareas, a “Last updated” text, `{{company}}` / `{{email}}` / `{{phone}}` placeholders filled from Site content, and reset-to-template buttons. Starter templates (`src/lib/legal-defaults.ts`) cover data collected (contact form, chat, optional visitor statistics), purposes, processors (Vercel, Firebase, Cloudinary, Zoho), retention, cookies/local storage, rights and ICO complaint, security, children, and for the terms: use of the site, services under separate agreement, IP, no guarantees, liability, governing law (England and Wales). They are templates, not legal advice — review before relying on them.

**Privacy notice** — a small banner (Accept / Decline) stored in `localStorage` (`nf_consent`). No cookies are set for visitors. The first-party page-view tracker runs only after Accept (`ANALYTICS_REQUIRES_CONSENT` in `src/lib/consent.ts`; set false to track unless declined). The contact form and chat start form show a “you agree to our Privacy Policy” line.

## 14. Service landing pages, reviews and speed

**Service landing pages** — removed on request (the `/services` index, the 24 `/services/[slug]` pages and their footer, division-page and sitemap links). Reviews remain on the homepage. Restore from git history (commit `fc4583a`) if needed.

**Reviews** — Admin → Reviews (name, role, text, 0–5 stars, source and link, visible, order). Shown as a quote section on the home page and every service page; nothing is shown until real reviews are added. Star-rating markup (AggregateRating + Review on the Service JSON-LD) is added automatically only when 3 or more visible reviews have a rating. The admin page warns to add only genuine, permitted reviews.

**Speed** — images are lazy-loaded with responsive `srcset` and `f_auto,q_auto`; the hero slide is 1280 px with high fetch priority for the first image; photo uploads are shrunk on upload by Cloudinary (`c_limit,w_2400,h_2400,q_auto:good`, signed, not applied to PDFs/SVG/GIF).

## 15. Auto-replies and live indicators

**AI replies in live chat** — each visitor message gets a short reply from an AI assistant (`src/lib/ai-reply.ts`, `src/lib/auto-reply.ts`), labelled “AI assistant” with a typing indicator and a disclosure line; max 8 AI replies per chat, 40 per IP per hour; it stops permanently once an admin replies (`humanTakeover`). The prompt forbids prices, delivery times, invented clients/results and rule changes by the visitor; it can only answer and ask up to two questions. Without an API key the first message still gets a fixed “automatic reply”. Model: `ANTHROPIC_CHAT_MODEL` (default `claude-sonnet-5-5`).

**Enquiry acknowledgement email** — after the contact form is saved, the owner is emailed (as before) and the sender gets an acknowledgement email (AI-written when a key is set, otherwise a fixed template), at most one per address per 24 h, recorded on the inquiry (`autoReply`) and shown in Admin → Inquiries. Both behaviours have switches in Admin → Site content → Contact & chat (`aiChatReply`, `aiEmailReply`).

**Live indicators in admin** — the sidebar polls `/api/admin/counts` every 12 s: number badges on Inquiries and Live chat (unread), “N visitors online now”, a pop-up when a visitor arrives or a new message/inquiry comes in, and the unread total in the browser tab title. “Online now” uses an anonymous heartbeat (`/api/presence`, random in-memory id per page load, nothing stored on the visitor's device, no IP stored), counted over the last 90 seconds; the Privacy Policy template describes it and the AI replies.

## 16. Chat choices, emailed replies and visitor notifications

**Choices right after the first message** — email is required to start a chat (and for the contact form), and the visitor is never asked for an email or phone number. Straight after their first message they get a short welcome and two choices: **A. Continue with AI for my enquiry** (the AI answers their first message and keeps going) or **B. Talk to the Developer** (the AI stops, the chat is flagged “Wants Developer” in admin, the owner gets an alert email and the visitor a confirmation). They can tap a button or type “a” / “b”; typing anything else just continues with the AI. No AI call is made until they pick A. Your first reply clears the flag and permanently stops the AI for that chat. On submission the visitor is emailed a confirmation at the address they entered (chat and enquiry; one per address per day).

**Every chat message is also emailed to the visitor, instantly, online or not** — each message we put into the chat, with the whole conversation so far (both sides) underneath so the inbox holds every message (your replies, the AI's replies, the welcome with the A/B choices, and the Developer confirmation) is emailed at once to the address the visitor entered, using one fixed subject (“Your conversation with Neo Forge Technology”) so Gmail keeps the whole conversation in one thread. Safeguards: an address can start only 3 chats a day that auto-email it, and there are per-chat caps (60 automatic, 150 from you). Enquiries can be answered from Admin → Inquiries (“Reply by email”), also sent to the address entered.

**Notifications on the visitor's phone or browser (opt-in Web Push)** — after starting a chat or sending an enquiry the visitor can tap “Notify me on this device when you reply”. Replies then trigger a notification even when the site is closed (service worker `public/sw.js`, `src/lib/push.ts`, `web-push`). Needs a VAPID key pair: generate in Admin → Maintenance, then add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (optional `VAPID_SUBJECT`) in Vercel and redeploy. Subscriptions are stored per chat/enquiry behind a secret token; expired ones are removed automatically. iPhone requires the site to be added to the Home Screen.


## 17. Auto-fill a project from a video link

- Admin → Projects → editor has an **Auto-fill from a video link** card: paste a YouTube or Vimeo link, tick which fields to fill (project title, description, short summary by default; also technologies, key features, challenge, solution, results, cover image = the video's thumbnail, division and sub-category), then **Scan video and fill**. Existing text in ticked fields asks for confirmation before it is replaced; unticked fields are never touched. The link is added to the project's video links. Nothing is saved until the admin saves.
- `POST /api/admin/projects/from-video { url, cover? }` (admin only, `maxDuration` 60) → `src/lib/video-import.ts`: reads the video's title, description, keywords and (when available) captions via oEmbed and the public watch page (best-effort scraping; if a part fails the rest still works and a warning is shown). With `ANTHROPIC_API_KEY` the AI writes the fields from that material only (never invents facts, ignores instructions inside the material, leaves unsupported fields empty); without it the description is copied as written and technologies/division are guessed by keywords. Thumbnails come only from allow-listed hosts (ytimg.com, vimeocdn.com) and are uploaded to Cloudinary (`projects`).
- Always review the filled text before publishing.

## 18. Navigation, Services, Pricing and Booking

- Header: **Home · Services ▾ · Portfolio ▾ · Pricing · About · Blog · Contact**, plus buttons **Book a Consultation** (`/book`) and **Start a Project** (`/contact`). Services opens a menu of every sub-category grouped by the three areas (CMS categories, so admin edits appear automatically); Portfolio opens the three areas (`/portfolio/<division>`). Mobile menu has the same two expandable groups.
- `/services`: three sections (one per area) with a card per sub-category: description and capability chips from the CMS, "Ask about this" (contact form with the area preselected) and "See related work". Projects are NOT shown here; they live under `/portfolio` (three sections, one per area, each with all its projects).
- `/pricing`: no prices. Explains that every project is quoted to its scope, the four cost factors and the three steps to a quote. Edit the wording in `src/app/pricing/page.tsx` if you want to publish real price ranges.
- `/book`: same enquiry form as `/contact` with the message prefilled for a consultation (no calendar integration). Enquiries arrive in the Admin inbox and by email like any other.
- Footer and `sitemap.xml` include Services, Pricing and Book.
- **Service detail pages** (restored, 24): each card on `/services` opens `/services/<slug>` with the service's features ("what you get"), good-fit list, typical uses, 4-step process, technologies, FAQs, related services/articles and a contact CTA (content in `src/lib/services.ts` + `services-extra.ts`; categories map to pages through `SERVICE_FOR_CATEGORY`; a category without a page links to the contact form). Services pages carry no portfolio or "related work" links — all projects live only under **Portfolio**, whose menu lists just the three areas (each opens `/portfolio/<division>` with its projects). Service pages are in the sitemap.
- Division pages (`/computer-vision` etc.) show each sub-category card with "Features, what we can do and ask about this →" linking to its service page. The header **Contact** item opens a hover menu with **Live chat** (`/live-chat`) and **Send an enquiry** (`/contact`); the mobile menu lists both.
