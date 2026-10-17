# Fiverr Gig Writer (Chrome extension)

A side-panel wizard that follows Fiverr's gig-creation pages. On each page you generate, choose, click **Fill on page**, check it, and press Fiverr's **Next** yourself.

| Step | You give | Extension does |
|---|---|---|
| 1 Overview | 5 keywords | Suggests 5 titles; you pick one. Fills title, uses your keywords as the 5 tags, and picks Category / Subcategory / Service type etc. by reading the dropdown options Fiverr shows and choosing the best fit |
| 2 Pricing | Scope, delivery idea, budget | Suggests 3 pricing schemes (names, descriptions, prices, days); you pick one and it fills all 3 packages |
| 3 Description | Optional style note | Writes the description (max 1200 chars) in that style; editable before filling |
| 4 Requirements | – | Writes buyer questions and adds them |
| 5 Gallery | Optional style | Writes an image prompt (free) to paste into Google Flow/Gemini; optionally generates the image with Google's API and uploads it |

## Install
1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Click the extension icon (opens the side panel) → ⚙ → paste your free **Google AI (Gemini) API key** (aistudio.google.com) → Save. One key does all the writing.
3. Open Fiverr → Selling → Gigs → Create, keep that tab active, work through steps 1–5.

## Notes
- **Writing** uses Gemini (default `gemini-3.8-flash`, free tier). **Image**: Google Flow has no public API, so the free route is copying the prompt into Flow/Gemini yourself; the optional in-panel generator uses a Google image model (may be paid).
- Fiverr's page markup changes and isn't documented, so field detection is best-effort. If something is missed the panel says so; fill that field by hand. Report what failed and the selectors can be tuned.
- It never clicks Next/Save/Publish. Keep it that way: automated submitting can get a seller account flagged.
- Don't claim fake reviews/results in your gig.
