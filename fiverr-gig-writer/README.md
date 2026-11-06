# Fiverr Gig Helper (Chrome extension, no AI)

One paste box per Fiverr gig page. Open a page, paste that page's text into its box, and the page is filled. Nothing is rewritten, nothing is sent anywhere, no API key, no cost.

## Install
1. `chrome://extensions` → **Developer mode** → **Load unpacked** → select this folder.
2. Pin the extension, open Fiverr → Selling → Gigs → Create, then click the extension icon (side panel).

## Use
| Fiverr page | Paste into | What it can contain |
|---|---|---|
| Overview | **1 · Overview** | title, `Category:` / `Subcategory:` / `Service type:` lines (or a table), metadata values (`Software: AutoCAD, Revit`), `Tags: a, b, c` (or one per line) |
| Scope & Pricing | **2 · Pricing** | Basic / Standard / Premium blocks (name, price, delivery days, revisions, `Package description:`, `Includes:` bullets) or a table with Basic / Standard / Premium columns |
| Description & FAQ | **3 · Description** and **FAQ** | the description (FAQs may be put under it) and `Q1. question` + answer lines |
| Requirements | **4 · Requirements** | numbered questions, answer options on the lines below |
| Gallery | **5 · Gallery** | your own images (choose files or Ctrl+V, up to 3) |

Headings are not needed in a box. You can also paste a whole gig document into **Paste the whole gig once** and it is split into the boxes.

- *Fill the page as soon as I paste*: pasting into a box fills the matching Fiverr page (if another page is open it tells you which one to open).
- *After filling, click Save & Continue*: goes on to the next page and fills it if its box has text, otherwise stops and tells you which box to paste. It never clicks Publish.

## Scan and derive
- **Scan Fiverr categories** (Overview card, once, on a fresh *Create a Gig* page with nothing selected) reads Fiverr's real categories and subcategories (about a minute) and keeps them.
- **Your text wins:** if the box names a category and subcategory that exist on Fiverr they are used as written; a missing service type is derived from your gig.
- **Derived:** with no category in the box, the path is derived from the gig text: every real category / subcategory / service type is scored by how many of its words appear in your gig (title and tags count most; a name written in full counts most). A clear winner is used and labelled *derived*; otherwise you get up to three suggestions to click.
- **Metadata:** options are ticked when they match values in the box **or** are named in your gig text; the card says which.

## How the pages are filled
- **Overview:** title, tags, category / subcategory / service type matched to the options Fiverr really shows (exact name first, then closest, reported); metadata ticked only for matching options, the rest listed for you.
- **Pricing:** names, descriptions, prices, delivery days, revisions; the feature grid is ticked from each package's *Includes*, name and description. Prices are never changed: below Fiverr's minimum it tells you.
- **Description & FAQ / Requirements:** copied as written. Over-limit text is warned about, not shortened.

## Troubleshooting
The bottom button copies a report of the page's form fields; if a dropdown can't be opened the extension also copies a diagnostic report. Paste it to the developer.
