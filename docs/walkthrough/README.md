# Admin Demo Walkthrough Manager

A private tool for the site administrator: pick any demo, then walk through its interface automatically or step by step, with subtitles and highlights. **You record the screen yourself; the tool does not record anything.**

Open it at **Admin → Demo Walkthrough** (`/admin/walkthroughs`).

## Nothing changes for visitors
- The tool lives only in the admin area. The public demo pages, portfolio, routes and navigation are untouched: no buttons, attributes or scripts are added to them. Existing `data-testid` attributes are used as targets, so no `data-tour-id` had to be added (it is supported too).
- The demo runs inside the admin page in a same-origin iframe; the overlay is drawn by the admin page, never by the demo.
- `scripts/test-walkthrough-security.mjs` checks that no public page or script contains walkthrough code.

## Access control
- `/admin/walkthroughs` is inside the `(panel)` layout, which verifies the session cookie (signature, expiry, revocation) and the admin claim on the server.
- Every API route (`/api/admin/walkthroughs`, `/api/admin/walkthroughs/[key]`) is wrapped in `adminRoute`: same-origin check for writes, then the admin claim. Visitors get 401/403; there is no public walkthrough endpoint.

## Two modes
- **Automated**: opens the demo, shows the introduction, then runs each step on its own: highlight, subtitle, actions, wait, next. Pause, resume, previous, next, restart, stop, subtitles on/off and fullscreen are always available, and you can click the demo yourself at any time.
- **Manual**: shows each step only when you press Next or Previous.

## What a step can do
Navigate to a section, click, open a tab, choose a dropdown option, scroll, select a bundled sample, upload a bundled sample file into a file input, highlight an element, open a modal or report, wait for an element, load another page of the demo. Targets are `tid:<data-testid>`, `tour:<data-tour-id>`, `tab:Label`, `btn:Label`, `nav:Label`, `text:Label`, `scope >> selector`, or any CSS selector. If a target is missing, that step is skipped and listed in the completion summary.

## Safe by construction
- Buttons whose label looks like a change are never clicked (delete, remove, send, e-mail, pay, checkout, publish, submit, save, create, add, new, approve, reject, confirm, import…). Tabs and navigation are always allowed. An action can carry an explicit `allow` flag for harmless cases (for example "Import sample model" in demo 22); delete, send, pay, publish and sign-out labels are refused even then.
- While a walkthrough runs, the demo's write requests (anything but GET/HEAD) and all cross-origin requests are refused and counted. Per walkthrough, `sandboxApi` lets the suite demos 11–21 create their own anonymous sample project (POST/PUT/PATCH to `/api/bim` and `/api/cctv` only).
- Steps marked **Prepared presentation data** show a bundled sample state; the overlay says it is not a new processing result. Steps marked **Live demo** run the real demo.
- Export buttons are highlighted, not pressed, so no files are downloaded during a tour.

## Editing without code
Select a demo → **Edit steps**: title, subtitle, duration, highlight target, actions, live/prepared badge, order, duplicate, delete, enable/disable. **Test step** opens the demo at that step; **Preview automated run** plays your unsaved edits. Saved edits live in the Firestore collection `walkthroughs` (one document per demo) and override the built-in version; **Reset to built-in** deletes the saved edit. Without Firebase configured the tool still runs and previews, but cannot save.

## Built-in walkthroughs
All 57 demos found in the catalogues (`src/lib/walkthrough/registry.ts` reads `CV_DEMOS`, `ERP_COVERED`, `DEMOS` and `SUITE`) have a hand-written, project-specific walkthrough (`defaults.ts`, `defaults-more.ts`): 366 steps. A demo added later appears automatically with a generated **Draft** until someone writes its steps.

Status labels in the manager:
- *(no label)* the built-in steps were all run against the real interface (`test-walkthrough-all.mjs` fails if one cannot find its element).
- **Partly checked** (CAD/BIM suite 11–21): the start screen and sample list were verified; the later steps need the demo's server back-end, which was not available where this was built, so run each once on the live site.
- **Draft**: generated from the demo's description.

## Tests
`npm run test:walkthrough` (registry, schema, safety rules, built-ins), `npm run test:walkthrough:ui` (stage behaviour on seven demo types, manager UI with a mocked API, access control), `npm run test:walkthrough:all` (every built-in walkthrough on its real demo). The UI tests need a running production build (`BASE=http://localhost:3011`).
