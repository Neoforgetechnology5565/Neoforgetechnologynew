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

- **Colors: white and blue.** White page, stone/slate neutrals, **blue accent** (blue-600 on white, blue-400/500 on dark), dark navy/slate-950 bands for hero, one division, CTA and footer. No amber/orange, no neon.
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
10. **Maintenance** — one-click, repeatable migrations.

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
