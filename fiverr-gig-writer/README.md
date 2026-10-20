# Fiverr Gig Writer (Chrome extension)

A side-panel wizard that follows Fiverr's gig-creation pages. On each page you generate, choose, click **Fill on page**, check it, and press Fiverr's **Next** yourself.

| Step | You give | Extension does |
|---|---|---|
| 1 Overview | 5 keywords | Suggests 5 titles; you pick one. Fills title, uses your keywords as the 5 tags, and picks Category / Subcategory / Service type etc. by reading the dropdown options Fiverr shows and choosing the best fit |
| 2 Pricing | Scope, delivery idea, budget | Suggests 3 pricing schemes (names, descriptions, prices, days); you pick one and it fills all 3 packages |
| 3 Description | Optional style note | Writes the description (max 1200 chars) in that style; editable before filling |
| 4 Requirements | – | Writes buyer questions and adds them |
| 5 Gallery | Your own images (choose files or Ctrl+V, up to 3, saved in the browser) | Uploads them to the Fiverr gallery |

## Install
1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Click the extension icon (opens the side panel) → ⚙ → paste your free **Google AI (Gemini) API key** (aistudio.google.com) → Save. One key does all the writing.
3. Open Fiverr → Selling → Gigs → Create, keep that tab active, work through steps 1–5.

## Notes
- **Writing** uses Gemini (default `gemini-3.8-flash`, free tier). **Image**: Google Flow has no public API, so the free route is copying the prompt into Flow/Gemini yourself; the optional in-panel generator uses a Google image model (may be paid).
- Fiverr's page markup changes and isn't documented, so field detection is best-effort. If something is missed the panel says so; fill that field by hand. Report what failed and the selectors can be tuned.
- It never clicks Next/Save/Publish. Keep it that way: automated submitting can get a seller account flagged.
- Don't claim fake reviews/results in your gig.

## Category analysis
After **Write gig**, the Paste tab shows a Category section: the gig is analysed (main service, deliverables, tools, industry) and the top 3 category paths are suggested with a confidence score and reason. You can change category / subcategory / service type by hand (changing the category resets the rest). Below 75% confidence it asks you to choose instead of filling. Mappings are **suggestions**, editable in Settings (⚙ > Category mappings); when filling, the extension only selects options Fiverr actually shows and stops rather than substituting a different category.

## Scan Fiverr categories
In the Paste tab click **Scan Fiverr categories** on a fresh *Create a Gig* Overview page (nothing selected). The extension opens Fiverr's own dropdowns one by one and saves the real category > subcategory > service type list in this browser. Category analysis then chooses only from that verified list, and filling uses Fiverr's exact names. It never saves or publishes anything; reload the Fiverr page afterwards.

## Exact mode (default)
**Write gig** uses exactly what you pasted: Gemini only locates the title, tags, packages, description, FAQs and requirements and guides the category choice. Nothing is rewritten, shortened or invented. Problems (over Fiverr's limits, missing fields, a price below Fiverr's minimum) are shown as warnings, not silently changed. Tick *Let AI write / improve for me* for the old behaviour (fill gaps, shorten, raise prices to the minimum). Fiverr's own "Suggested categories" (when shown) are only a hint for the category choice.
