# Fiverr Gig Writer (Chrome extension)

Generates a complete Fiverr gig (title, description, 5 tags, 3 packages, FAQ, buyer requirements) with Claude, and fills the text fields in your Fiverr gig editor.

## Install
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `fiverr-gig-writer` folder.
3. Click the extension, paste your Anthropic API key (console.anthropic.com), Save.

## Use
1. Describe your service in the popup → **Write my gig**.
2. Edit the result.
3. Open Fiverr → Selling → Gigs → Create/Edit, then click **Fill into Fiverr page** (or **Copy all** and paste manually).

## Notes
- You stay in control: it fills text only; you review and click Publish yourself. It does not auto-post or auto-message buyers (against Fiverr's terms).
- Fiverr changes its page markup often; if auto-fill misses a field, use **Copy all**. Packages/FAQ are copy-only.
- Your API key is stored in `chrome.storage.local` and sent only to api.anthropic.com. Use a key with a spend limit.
- Don't claim fake reviews/results in your gig; Fiverr may remove misleading gigs.
