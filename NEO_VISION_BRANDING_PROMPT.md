# Prompt: add the Branding admin page (logos + favicon) to the Neo Vision website

Paste everything below the line into the Claude session that works on the Neo Vision website.

---

You are working on the **Neo Vision** website (Next.js App Router + TypeScript + Tailwind, Firebase Firestore/Auth via the Admin SDK, Cloudinary, Vercel, admin CMS). Add a **Branding** page to the admin so I can upload my logos and icon myself and have them appear everywhere on the site without touching code. This already exists on our sister site Neo Forge Technology (repo `Neoforgetechnology5565/Neoforgetechnologynew`, branch `main`: `src/app/admin/(panel)/branding/page.tsx`, `src/lib/cloudinary.ts`, `src/components/Logo.tsx`, `src/app/layout.tsx`, `src/lib/jsonld.ts`). Read it if you can; otherwise build from this spec. Use **Neo Vision's** name, colours, fonts and navigation everywhere, never Neo Forge's.

Check first what this site already has (an existing logo component, favicon, settings document, admin upload helper) and extend it rather than duplicating it.

## Data
- One settings document `content/branding` (same pattern as the site's other CMS content, cached public read + `revalidateTag`/`revalidatePath` on save):
  - `logoLight`: MediaRef | null — logo for LIGHT backgrounds (dark lettering), used in the header
  - `logoDark`: MediaRef | null — logo for DARK backgrounds (white lettering), used in the footer
  - `icon`: MediaRef | null — square icon for favicon, app icon, browser tab
  - `autoTrim`: boolean (default true) — crop uniform empty margins around logos automatically
- zod schema; media URLs must be on our own Cloudinary cloud (reuse the existing media validator). Admin-only read/write through the existing admin route wrapper; add `branding` to the existing content API.

## Admin page (Admin → Branding)
- Three upload slots (Logo for light backgrounds, Logo for dark backgrounds, Square icon) using the existing signed direct-to-Cloudinary uploader, folder `branding`. Accept PNG/SVG/WebP/JPG.
- Live previews on the correct background (white for the light logo, dark for the dark logo), icon previews at 16, 32, 64 and 120 px, and a favicon-in-a-browser-tab preview.
- "Auto-crop empty margins" toggle (explain: logos exported on a big canvas still display tightly).
- "Remove" per slot to revert to the text name. Short guidance: transparent PNG/SVG about 1200 px wide for logos; icon at least 512×512 and square.
- Save button, success/error toasts, unsaved-changes state.

## Where it must show up
- **Header** uses `logoLight`; **footer** uses `logoDark`; if a logo is missing, fall back to the existing text wordmark so the site never breaks. Build a small `Logo` component with height-constrained `<img>` (`height`, `width: auto`, max width, `loading`, `decoding`), alt = site name.
- Cloudinary delivery helpers: `logoUrl(m, {h, trim})` → `e_trim:25` (when trimming) + `c_fit,h_{3×h},f_auto,q_auto` (SVG passes through unchanged); `iconUrl(m, size)` → `c_fill,g_auto,w_{size},h_{size},f_png` and force a `.png` extension; `ogLogoUrl(m, trim)` → PNG version capped at 240 px tall for server-side image generation.
- **Favicon / app icons:** in `generateMetadata` (root layout) set `icons` from the icon: 32×32 and 192×192 PNG plus `apple` 180×180. Keep the current static icon as the fallback when none is uploaded.
- **Share preview image** (`/opengraph-image` and `/twitter-image`, next/og): use the dark logo (via `ogLogoUrl`, fetched as a data URI with a 4 s timeout; any failure falls back to the text wordmark). Pages that define their own `openGraph` must include the default image explicitly.
- **JSON-LD** Organization/WebSite `logo` = the uploaded logo URL when present.
- Admin shell: use the logo (light or dark as appropriate) in the admin sidebar and login screen too, if it fits the existing design.

## Tests and deliverables
- Typecheck, lint, `next build`, and a browser run against the Firebase emulator: upload a logo and icon, confirm header, footer, favicon links, apple icon, OG image and JSON-LD change; remove them and confirm the text fallback returns; confirm the admin API is closed to unauthenticated and non-admin users.
- Commit in small steps; push to the designated branch and then `main`; update this site's master prompt/docs with a Branding section.
- Final report: what you added, what already existed, anything unverified. Then tell me which files to upload: logo for light backgrounds, logo for dark backgrounds, and the square icon, with sizes and formats.
