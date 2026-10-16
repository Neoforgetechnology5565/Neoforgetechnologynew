# Fiverr Gig Writer (Chrome extension)

A side-panel wizard that follows Fiverr's gig-creation pages. On each page you generate, choose, click **Fill on page**, check it, and press Fiverr's **Next** yourself.

| Step | You give | Extension does |
|---|---|---|
| 1 Overview | 5 keywords | Suggests 5 titles; you pick one. Fills title, uses your keywords as the 5 tags, and picks Category / Subcategory / Service type etc. by reading the dropdown options Fiverr shows and choosing the best fit |
| 2 Pricing | Scope, delivery idea, budget | Suggests 3 pricing schemes (names, descriptions, prices, days); you pick one and it fills all 3 packages |
| 3 Description | Optional style note | Writes the description (max 1200 chars) in that style; editable before filling |
| 4 Requirements | – | Writes buyer questions and adds them |
| 5 Gallery | Optional style | Generates a 16:9 gig image with Google's image API and uploads it to the upload box |

## Install
1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Click the extension icon (opens the side panel) → ⚙ → paste your **Anthropic API key** and **Google AI (Gemini) API key** → Save.
3. Open Fiverr → Selling → Gigs → Create, keep that tab active, work through steps 1–5.

## Notes
- **Image**: Google Flow has no public API. This uses the Gemini API image models (default `imagen-4.0-generate-001`; change the model in Settings, e.g. a Gemini image model).
- Fiverr's page markup changes and isn't documented, so field detection is best-effort. If something is missed the panel says so; fill that field by hand. Report what failed and the selectors can be tuned.
- It never clicks Next/Save/Publish. Keep it that way: automated submitting can get a seller account flagged.
- Don't claim fake reviews/results in your gig.
