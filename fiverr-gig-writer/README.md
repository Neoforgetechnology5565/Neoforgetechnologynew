# Fiverr Gig Helper (Chrome extension, no AI)

Paste your gig text once. Each part of the gig has its own card and button; click it on the matching Fiverr page and it fills that page from your paste. Nothing is rewritten, nothing is sent anywhere, no API key, no cost.

## Install
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select this folder.
2. Pin the extension, open Fiverr → Selling → Gigs → Create, then click the extension icon (side panel).

## Use
1. Paste your gig document into the box. It is read instantly and, by default, starts filling the open Fiverr page and continues page by page. Check the previews and any ⚠ warnings.
2. On each Fiverr page click that page's button: **1 Overview**, **2 Scope & Pricing**, **3 Description & FAQ**, **4 Requirements**, **5 Gallery**.
3. Or tick *After filling, click Save & Continue* and click **Fill this page (auto-detect)** to go page by page. It never clicks Publish and stops at the Gallery.

## What it reads from the paste
Sections with headings such as *Gig title*, *Category and gig metadata* (table or `Field: value` lines), *Search tags*, *Packages and pricing* (Basic / Standard / Premium with price, delivery days, revisions, "Package description:", "Includes:" bullets), *Gig description*, *Buyer requirements* (numbered questions, options folded in as text), *FAQ* (`Q1. … answer`). Other sections (portfolio, keywords, checklist, image prompt) are ignored.

## Scan and derive
- **Scan Fiverr categories** (Overview card, once, on a fresh *Create a Gig* page with nothing selected) reads Fiverr's real categories and subcategories (about a minute) and keeps them. The panel shows what it identified.
- **Paste wins:** if your paste names a category and subcategory that exist on Fiverr, they are used as written. If the service type isn't in your paste or isn't offered, the best one is derived from your gig.
- **Derived:** if the paste has no category (or Fiverr has none like it), the category path is derived from your gig text: each real category / subcategory / service type is scored by how many of its words appear in the gig (title and tags count most; a name written in full counts most of all). If one clear winner emerges it is used and labelled *derived*; otherwise you get up to three suggestions to click.
- **Metadata:** options are ticked when they match your paste's table **or** are named in your gig text (title, tags, packages, description). The card says which came from where.

## How the pages are filled
- **Overview:** title, tags; category / subcategory / service type are matched to the options Fiverr really shows (exact name first, then closest; a closest match is reported). Metadata is ticked **only** for options that match values written in your paste; anything else is left for you and listed.
- **Scope & Pricing:** names, descriptions, prices, delivery days, revisions; the feature grid is ticked from each package's *Includes* bullets. Prices are never changed: if one is below Fiverr's minimum, it tells you.
- **Description & FAQ / Requirements:** copied as written. Over-limit text is warned about, not shortened.
- **Gallery:** your own images (choose files or Ctrl+V, up to 3, saved in the browser).

## Troubleshooting
The bottom button copies a report of the page's form fields; when a dropdown can't be opened the extension also copies a diagnostic report. Paste it to the developer.
