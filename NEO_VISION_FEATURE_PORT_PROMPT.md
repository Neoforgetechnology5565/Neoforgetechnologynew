# Prompt: port the new Neo Forge features to the Neo Vision website

Paste everything below the line into the Claude session that works on the Neo Vision website.

---

You are working on the **Neo Vision** website (Next.js App Router + TypeScript + Tailwind, Firebase Firestore/Auth via the Admin SDK, Cloudinary, deployed on Vercel from GitHub `main`, with an admin CMS). I want you to add the features below, which were just built and tested on our sister site **Neo Forge Technology**.

**Source of truth:** the Neo Forge repo `Neoforgetechnology5565/Neoforgetechnologynew`, branch `main`. If you can read it (add it read-only), copy the logic from these files and adapt it. If you cannot, build from the spec below. The file `NEO_FORGE_MASTER_PROMPT.md` in that repo (section 12) describes all of it.

## Ground rules
- Study this site first: its data model, `lib/db`, schemas, admin shell, auth wrapper (`adminRoute`-style helper), Cloudinary upload helper, theme/fonts, existing SEO files. **Match its conventions, brand name, colours, domains and navigation.** Do not copy Neo Forge names, divisions or copy; use this site's own divisions/categories everywhere the Neo Forge code mentions them.
- Keep every admin API behind the existing admin check, validate with zod, strip HTML from text, rate-limit public endpoints, never expose secrets, and keep Firestore deny-all rules.
- Do not overbuild. Skip anything this site already has (check for an existing blog, sitemap, robots, JSON-LD, SMTP, PDF import before adding) and only fill the gaps.
- Test each feature (typecheck, lint, `next build`, and a real browser run against the Firebase emulator where possible). Commit in small steps and push to the designated branch, then to `main`. Update this site's master prompt/docs with what you add.
- Tell me at the end which environment variables I must add in Vercel, then I redeploy.

## 1. Blog / articles
- Admin **Blog** section: list, create, edit, delete; fields: title, slug (auto-unique), short summary, body, cover image + alt text, YouTube/Vimeo links, tags (≤8), author, optional related division/category, search title, search description (with a Google-result preview), status draft/published, `publishedAt` stamped on first publish.
- Body editor: Markdown textarea with a toolbar (H2, H3, bold, italic, link, bullet list, numbered list, quote, image upload to Cloudinary) and Write/Preview tabs. Toolbar buttons must not steal focus (`onMouseDown` preventDefault, `flushSync` before setting the caret).
- Safe Markdown renderer: **no raw HTML**; links limited to http/https/mailto/relative; images only from our Cloudinary cloud; supports `##`, `###`, lists, quotes, bold/italic, `---`.
- Public pages: `/blog` (cards), `/blog/[slug]` (hero, cover, on-this-page contents, body, video thumbnails, tags, related-service box, related articles, CTA), `/feed.xml` RSS, header and footer links. Published articles are added to `sitemap.xml` automatically.

## 2. Default share image + SEO
- `/opengraph-image` and `/twitter-image` (next/og) used as the default preview for pages without their own image; pages that define their own `openGraph` must also include the default image explicitly.
- JSON-LD (only what is visibly true): Organization + WebSite sitewide, Service on division pages, BreadcrumbList, CreativeWork on projects, BlogPosting on articles, FAQPage where FAQs are shown.

## 3. Email notifications (SMTP)
- `nodemailer` helper; env `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `NOTIFY_TO`. Send mail for new contact inquiries and new live chats (chat emails throttled to one per 10 minutes per conversation) using Next `after()` so the visitor is never blocked or shown an error if mail fails.
- Maintenance page: email status and a "Send test email" button with plain-English hints for common SMTP errors (535 auth, timeouts, 553 sender). `/api/health` reports `email: configured`.

## 4. PDF → article auto-fill
- New article page opens on a large **drag-and-drop zone** ("Drop your PDF here, or click to choose it") plus a "write it myself" link and a "Re-fill from a PDF" button inside the editor (confirm before overwriting).
- Flow: browser uploads the PDF to Cloudinary (signed, admin signer, folder `blog/imports`, as an image resource) → `POST /api/admin/posts/import-pdf { file }` (admin only, `maxDuration` 60, validate the URL is on our Cloudinary cloud, fetch ≤25 MB, check `%PDF-`; on 401/403 tell the admin to enable Cloudinary Settings → Security → "PDF and ZIP files delivery").
- Parse on the server with `unpdf` (`getDocumentProxy`, `getTextContent`) using heuristics: group items into lines by y; body font size = most common by characters; title = largest text on page 1 (fallbacks: PDF metadata title unless `about:blank`, then first line, then filename); larger sizes → `##` / `###`; join wrapped lines, de-hyphenate; bullets → `- `, numbers → `1. `; drop repeated headers/footers and page numbers; paragraph breaks from line gaps; excerpt = first paragraph ≥60 chars cut at a sentence ≤200 chars; tags from a vocabulary of this site's topics (top 5); division guessed by keyword hits (use this site's real division slugs!).
- Extract embedded images with `unpdf` `extractImages` + `sharp` (≥200×120 px, max 8, de-duplicated), upload each to Cloudinary; the first image ≥600 px wide becomes the cover, the rest are inserted after the text of their page. If none, design a cover (section 5).
- Also fill: cover alt text, search title (≤65), search description (≤160), YouTube/Vimeo links found in the text, and append a "Download the full PDF" link. Nothing is saved until the admin reviews and saves; always a draft with a banner showing pages/words/headings and warnings (scanned PDFs have no text and no OCR — warn; tables are not converted).
- Add `sharp` and `unpdf` to dependencies; add to `serverExternalPackages` if bundling complains.

## 5. Designed media (no AI image generation needed)
- `lib/media-gen.tsx` using `next/og` `ImageResponse` (bundled fonts work on Vercel): `renderCover(title, division)` → branded 1200×630 PNG (label, title, site name/domain, a division-specific graphic) and `renderFigure({kind: "flow" | "takeaways", title, items, alt})` → numbered-steps diagram or key-takeaways card. Do not use glyphs missing from the default font (use numbers, not ✓). Upload with the Cloudinary SDK `upload_stream` server-side into `neoforge`-style folder for this site.
- `POST /api/admin/posts/cover` and a **"Design a cover for me"** button in the editor's Media card.

## 6. AI article writer
- Server only: `@anthropic-ai/sdk`, env `ANTHROPIC_API_KEY` (trimmed, quotes stripped; configured only if length > 20), optional `ANTHROPIC_MODEL`. Models selectable in the UI: `claude-opus-5-5` (best quality, default) and `claude-sonnet-5-5` (faster, cheaper); validate against an allow-list.
- `POST /api/admin/posts/ai` (admin only, `maxDuration` 60): `action:"topics"` → 8 searchable topic ideas (title, angle, keyword, division) avoiding existing titles, optional focus; `action:"write"` → full article. Use `messages.create` with `output_config: { effort: "low", format: { type: "json_schema", schema } }`, `max_tokens` 3000/9000, 55 s timeout, typed error mapping (auth, rate limit, connection, refusal, max_tokens) to plain-English messages.
- The system prompt describes THIS company and its divisions and forbids invented statistics, client names, quotes, case studies or claims; Markdown only, no H1/images/links; 800–1100 words, 4–6 `##` sections with a list and an honest "limits" section, a soft closing pointer to the relevant service.
- The model also returns title, excerpt, tags, division slug, seoTitle, seoDescription, coverAlt and 1–2 `figures` (flow/takeaways) with `[[figure:N]]` markers in the content; the route renders the cover and figures (section 5), uploads them, replaces markers with Markdown images, and reports per-item warnings without losing the text.
- UI: a **Write with AI** panel under the PDF drop zone: model dropdown, optional focus, "Suggest topics" list, click a topic or type your own and "Write this article". If the key is missing show how to add it in Vercel and to redeploy; `/api/health` reports `ai: configured`. A banner on the filled draft says it is AI-written and must be fact-checked. Nothing is published automatically.

## Deliverables
1. All of the above working in this repo, tested, pushed.
2. A short list of Vercel environment variables to add (`ANTHROPIC_API_KEY`, the SMTP set, Cloudinary PDF delivery setting) and the exact steps.
3. This site's master prompt/docs updated.
4. A final report: what was added, what was skipped because it already existed, and anything you could not verify.
