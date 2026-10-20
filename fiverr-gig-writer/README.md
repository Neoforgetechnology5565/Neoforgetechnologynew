# Fiverr Gig Helper (Chrome extension, no AI)

Paste your gig text once. Each part of the gig has its own card and button; click it on the matching Fiverr page and it fills that page from your paste. Nothing is rewritten, nothing is sent anywhere, no API key, no cost.

## Install
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select this folder.
2. Pin the extension, open Fiverr → Selling → Gigs → Create, then click the extension icon (side panel).

## Use
1. Paste your gig document into the box (it is read instantly). Check the previews and any ⚠ warnings.
2. On each Fiverr page click that page's button: **1 Overview**, **2 Scope & Pricing**, **3 Description & FAQ**, **4 Requirements**, **5 Gallery**.
3. Or tick *After filling, click Save & Continue* and click **Fill this page (auto-detect)** to go page by page. It never clicks Publish and stops at the Gallery.

## What it reads from the paste
Sections with headings such as *Gig title*, *Category and gig metadata* (table or `Field: value` lines), *Search tags*, *Packages and pricing* (Basic / Standard / Premium with price, delivery days, revisions, "Package description:", "Includes:" bullets), *Gig description*, *Buyer requirements* (numbered questions, options folded in as text), *FAQ* (`Q1. … answer`). Other sections (portfolio, keywords, checklist, image prompt) are ignored.

## How the pages are filled
- **Overview:** title, tags; category / subcategory / service type are matched to the options Fiverr really shows (exact name first, then closest; a closest match is reported). Metadata is ticked **only** for options that match values written in your paste; anything else is left for you and listed.
- **Scope & Pricing:** names, descriptions, prices, delivery days, revisions; the feature grid is ticked from each package's *Includes* bullets. Prices are never changed: if one is below Fiverr's minimum, it tells you.
- **Description & FAQ / Requirements:** copied as written. Over-limit text is warned about, not shortened.
- **Gallery:** your own images (choose files or Ctrl+V, up to 3, saved in the browser).

## Troubleshooting
The bottom button copies a report of the page's form fields; when a dropdown can't be opened the extension also copies a diagnostic report. Paste it to the developer.
