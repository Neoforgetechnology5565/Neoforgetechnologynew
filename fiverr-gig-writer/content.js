(() => {
if (window.__fgwLoaded) return;
window.__fgwLoaded = true;
// Runs on fiverr.com. Fiverr's markup changes often, so everything is located
// by labels/placeholders/roles rather than fixed selectors. Best-effort.
const rnd = () => String(Math.random()).slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const visible = el => !!(el.offsetParent || el.getClientRects().length);
function labelText(el) {
  const out = [];
  if (el.labels) for (const l of el.labels) out.push(l.innerText);
  const lb = el.getAttribute && el.getAttribute("aria-labelledby");
  if (lb) lb.split(" ").forEach(id => out.push(document.getElementById(id)?.innerText || ""));
  let n = el;
  for (let i = 0; i < 4 && n.parentElement; i++) {          // nearest container with a short caption
    n = n.parentElement;
    const t = (n.innerText || "").trim();
    if (t && t.length < 150 && t !== (el.value || "")) { out.push(t.split("\n")[0]); break; }
  }
  return out.join(" ");
}
const hint = el => [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("data-testid"), labelText(el)].join(" ").toLowerCase();
const all = (sel, re) => [...document.querySelectorAll(sel)].filter(el => visible(el) && (!re || re.test(hint(el))));
const rowText = el => { let n = el; for (let i = 0; i < 5 && n; i++, n = n.parentElement) if ((n.innerText || "").length > 3 && i >= 1) return (n.innerText || "").slice(0, 200).toLowerCase(); return ""; };

function setValue(el, value) {
  if (el.isContentEditable) { el.focus(); document.execCommand("selectAll", false); document.execCommand("insertText", false, value); return; }
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
const key = (el, k, code) => ["keydown", "keyup"].forEach(t => el.dispatchEvent(new KeyboardEvent(t, { key: k, code: k, keyCode: code, bubbles: true })));
const click = el => { ["mousedown", "mouseup", "click"].forEach(t => el.dispatchEvent(new MouseEvent(t, { bubbles: true }))); };

const COMBO = '[role=combobox],[aria-haspopup=listbox],select';
const optionEls = () => all('[role=option],[role=listbox] li,li[class*=option i],div[class*=option i]');

function dropdownOptions(el) {
  if (el.tagName === "SELECT") return [...el.options].filter(o => o.value && !/^select/i.test(o.text)).map(o => o.text.trim());
  return [...new Set(optionEls().map(o => o.innerText.trim()).filter(Boolean))];
}
const leafish = () => [...document.querySelectorAll("li,div,span,a,button,p,label")].filter(e => {
  if (!visible(e) || e.children.length > 2) return false;
  const t = (e.innerText || "").trim(); return t.length > 0 && t.length < 70;
});
// Opens a dropdown and returns its option texts. Custom dropdowns with no ARIA roles are detected
// by diffing which elements appeared after the click, and those are tagged data-fgw-opt.
async function openOptions(el) {
  if (el.tagName === "SELECT") return dropdownOptions(el);
  document.querySelectorAll("[data-fgw-opt]").forEach(e => delete e.dataset.fgwOpt);
  const before = new Set(leafish());
  click(el); await sleep(500);
  let texts;
  const roled = optionEls();
  if (roled.length) texts = roled.map(o => o.innerText.trim());
  else {
    const fresh = leafish().filter(e => !before.has(e));
    fresh.forEach(e => e.dataset.fgwOpt = "1");
    texts = fresh.map(e => e.innerText.trim());
  }
  return [...new Set(texts.filter(t => t && !t.includes("\n") && !/^\s*(select|choose)\b/i.test(t)))];
}
async function choose(el, matcher) {           // matcher: string or RegExp
  const ok = t => matcher instanceof RegExp ? matcher.test(t) : t.trim().toLowerCase() === String(matcher).trim().toLowerCase();
  if (el.tagName === "SELECT") {
    const o = [...el.options].find(o => ok(o.text)); if (!o) return false;
    setValue(el, o.value); return true;
  }
  const find = () => {
    let l = optionEls();
    if (!l.length) l = [...document.querySelectorAll("[data-fgw-opt]")].filter(visible);
    return l.find(o => ok(o.innerText));
  };
  let o = find();
  if (!o) { await openOptions(el); o = find(); }
  if (!o) return false; click(o); await sleep(250); return true;
}

const visitedTabs = new Set();
const isChecked = b => b.checked || b.getAttribute("aria-checked") === "true";
const optText = b => (b.labels?.[0]?.innerText || b.closest("label")?.innerText || b.parentElement?.innerText || "").trim();
function sectionLabel(el) {
  for (let n = el.parentElement, i = 0; n && i < 6; n = n.parentElement, i++) {
    const h = n.querySelector("h1,h2,h3,h4,h5,h6,legend,[class*=title i]");
    if (h && h.innerText.trim() && h.innerText.length < 100) return h.innerText.trim();
  }
  return "";
}

const isText = e => e.tagName === "TEXTAREA" || (e.tagName === "INPUT" && /^(text|number|tel|)$/.test(e.type));
const isCheckEl = e => /checkbox|switch/.test(e.type || e.getAttribute("role") || "");
function pricingGrid() {
  const heads = ["basic", "standard", "premium"].map(w => [...document.querySelectorAll("th,td,div,span,p,h3,h4,label")]
    .filter(e => visible(e) && (e.innerText || "").trim().toLowerCase() === w)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]);
  if (heads.some(h => !h)) return null;
  const rects = heads.map(h => h.getBoundingClientRect());
  const cx = rects.map(r => r.left + r.width / 2), half = Math.abs(cx[1] - cx[0]) / 2;
  const extras = [...document.querySelectorAll("*")].find(e => visible(e) && /^\s*add extra services\s*$/i.test(e.innerText || ""));
  const sel = "input:not([type=hidden]):not([type=file]),textarea,select,[role=combobox],[aria-haspopup=listbox],[role=checkbox],[role=switch]";
  const cols = [[], [], []];
  for (const e of document.querySelectorAll(sel)) {
    if (!visible(e) || (extras && (extras.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
    if (e.parentElement?.closest("[role=combobox],[aria-haspopup=listbox],select")) continue;   // inner search boxes
    const b = e.getBoundingClientRect(); if (b.top < rects[0].top - 5) continue;
    const mid = b.left + b.width / 2; let k = 0, d = 1e9;
    cx.forEach((x, i) => { if (Math.abs(mid - x) < d) { d = Math.abs(mid - x); k = i; } });
    if (d < half) cols[k].push(e);
  }
  cols.forEach(col => col.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top));
  return { cols, left: cx[0] - half };
}

const handlers = {
  // Clicks the page's Save & Continue / Next button. Never clicks Publish.
  async CLICK_NEXT() {
    const btns = [...document.querySelectorAll("button,a,[role=button]")].filter(b => visible(b) && !/publish/i.test(b.innerText || ""));
    let btn = btns.find(b => /^\s*(save\s*(&|and)\s*continue|continue|next)\s*$/i.test(b.innerText || ""));
    if (!btn) { const saves = btns.filter(b => /^\s*save\s*$/i.test(b.innerText || "")); btn = saves[saves.length - 1]; }  // bottom Save
    if (!btn) return { clicked: "", reason: "no Next/Save button found" };
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return { clicked: "", reason: "the button is disabled" };
    btn.scrollIntoView({ block: "center" }); await sleep(300); btn.click();
    return { clicked: btn.innerText.trim() };
  },
  async DETECT() {   // which Fiverr gig-editor page is open?
    const t = document.body.innerText;
    const page = /set your packages|add extra services/i.test(t) ? "pricing"
      : /gig title/i.test(t) && /search tags|positive keywords/i.test(t) ? "overview"
      : /get all the information you need from buyers/i.test(t) ? "requirements"
      : /briefly describe your gig|frequently asked questions/i.test(t) ? "description"
      : /gig gallery|gig images|gig video/i.test(t) ? "gallery" : "unknown";
    return { page };
  },
  async SCAN() {   // debugging aid: describe the form controls on this page
    const fields = all('input,textarea,select,[contenteditable=true],[role=textbox],[role=combobox],[aria-haspopup=listbox]').slice(0, 80).map(el => ({
      tag: el.tagName.toLowerCase(), type: el.type || "", role: el.getAttribute("role") || "", name: el.name || "", id: el.id || "",
      placeholder: el.placeholder || "", aria: el.getAttribute("aria-label") || "", testid: el.getAttribute("data-testid") || "",
      label: labelText(el).slice(0, 80), text: (el.innerText || "").slice(0, 40)
    }));
    return { url: location.href, fields };
  },
  async FILL_OVERVIEW({ title, tags }) {
    const filled = []; visitedTabs.clear();
    const t = all("input,textarea", /title|i will/)[0];
    if (t) { setValue(t, title.replace(/^I will\s*/i, "")); filled.push("title"); }
    const tg = all("input", /tag|keyword|search term/)[0];
    if (tg) {
      tg.focus();
      for (const x of tags) { setValue(tg, x); key(tg, "Enter", 13); await sleep(250); }
      filled.push("tags");
    }
    return { filled };
  },

  // Opens the next unfilled dropdown and reports its options.
  async NEXT_DROPDOWN() {
    const txt = e => (e.innerText || e.value || "").trim();
    let el = all(COMBO).find(e => !e.dataset.fgwDone && (e.tagName === "SELECT" ? (!e.value || (e.selectedIndex <= 0 && /^\s*(select|choose|-)/i.test(e.options[0]?.text || ""))) : (!txt(e) || /^\s*(select|choose)\b/i.test(txt(e)))));
    if (!el) el = leafish().find(e => !e.dataset.fgwDone && !e.closest("[data-fgw-done]") && /^\s*select (a |an )?[a-z]/i.test(e.innerText || ""));
    if (!el) return { found: false };
    el.dataset.fgwId = el.dataset.fgwId || rnd();
    const label = txt(el) && /^\s*select/i.test(txt(el)) ? txt(el) : rowText(el).split("\n")[0].trim();
    const options = await openOptions(el);
    el.dataset.fgwDone = "1";
    if (!options.length) return { found: false };
    return { found: true, id: el.dataset.fgwId, label, options };
  },
  async CHOOSE_OPTION({ id, text }) {
    const el = document.querySelector(`[data-fgw-id="${id}"]`);
    return { ok: !!el && await choose(el, text) };
  },

  // ---- Gig metadata: tabs with checkbox lists
  async NEXT_CHECKS() {
    const cur = all("input[type=checkbox],[role=checkbox]").filter(b => !b.dataset.fgwDone && !isChecked(b));
    const options = cur.map(b => ({ b, text: optText(b) }))
      .filter(o => o.text && o.text.length < 80 && !/agree|terms|cookie|newsletter|remember/i.test(o.text))
      .map(o => { o.b.dataset.fgwId = o.b.dataset.fgwId || rnd(); o.b.dataset.fgwDone = "1"; return { id: o.b.dataset.fgwId, text: o.text }; });
    if (!options.length) return { found: false };
    return { found: true, label: sectionLabel(cur[0]), options };
  },
  async CHOOSE_CHECKS({ ids }) {
    let n = 0;
    for (const id of ids) {
      const el = document.querySelector(`[data-fgw-id="${id}"]`);
      if (!el) continue;
      (el.labels?.[0] || el).click(); n++; await sleep(200);
    }
    return { count: n };
  },
  async NEXT_TAB() {
    const head = [...document.querySelectorAll("*")].find(e => visible(e) && /^\s*gig metadata\s*$/i.test(e.innerText || ""));
    if (!head) return { clicked: "" };
    let box = head.parentElement, tabs = [];
    for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
      tabs = [...box.querySelectorAll('[role=tab],li,button,a,[class*=tab i]')]
        .filter(e => visible(e) && !e.querySelector("input") && (e.innerText || "").trim().length > 1 && e.innerText.trim().length < 40 && !visitedTabs.has(e.innerText.trim()));
      if (tabs.length) break;
    }
    const t = tabs[0];
    if (!t) return { clicked: "" };
    visitedTabs.add(t.innerText.trim()); click(t); t.click();
    return { clicked: t.innerText.trim() };
  },

  // ---- Pricing: located by geometry (3 columns under the BASIC / STANDARD / PREMIUM headers)
  async PRICING_ROWS() {
    const g = pricingGrid(); if (!g) return { rows: [] };
    const leftLabel = ctrl => {
      const b = ctrl.getBoundingClientRect(), cy = b.top + b.height / 2;
      const area = e => { const r = e.getBoundingClientRect(); return r.width * r.height; };
      const c = [...document.querySelectorAll("th,td,div,span,p,label")].filter(e => {
        if (!visible(e) || e.querySelector("input,textarea,select")) return false;
        const t = (e.innerText || "").trim(); if (t.length < 2 || t.length > 60) return false;
        const r = e.getBoundingClientRect(); return r.right <= g.left + 8 && r.top <= cy && r.bottom >= cy && r.height < 80;
      }).sort((a, b) => area(a) - area(b));
      return c[0] ? c[0].innerText.trim().split("\n")[0] : "";
    };
    const rows = [];
    for (const base of g.cols[0].filter(e => !isText(e))) {
      const by = base.getBoundingClientRect().top;
      const mates = [1, 2].map(i => g.cols[i].find(e => !isText(e) && Math.abs(e.getBoundingClientRect().top - by) < 12));
      if (mates.some(m => !m)) continue;
      const els = [base, ...mates], label = leftLabel(base);
      if (!label || /deliver|price/i.test(label) || els.some(e => e.disabled || e.getAttribute("aria-disabled") === "true")) continue;
      els.forEach(e => e.dataset.fgwId = e.dataset.fgwId || rnd());
      const isCheck = els.every(isCheckEl);
      const r = { label, kind: isCheck ? "check" : "select", ids: els.map(e => e.dataset.fgwId) };
      if (!isCheck) {
        r.options = await openOptions(els[0]);
        if (els[0].tagName !== "SELECT") { key(els[0], "Escape", 27); document.body.click(); await sleep(200); }
      }
      rows.push(r);
    }
    return { rows };
  },
  async PRICING_APPLY({ rows }) {
    let n = 0;
    for (const r of rows) for (let i = 0; i < r.ids.length; i++) {
      const el = document.querySelector(`[data-fgw-id="${r.ids[i]}"]`);
      if (!el) continue;
      if (r.kind === "check") { if (isChecked(el) !== !!r.values[i]) { (el.labels?.[0] || el).click(); n++; await sleep(150); } }
      else if (r.values[i] && await choose(el, r.values[i])) { n++; await sleep(250); }
    }
    return { count: n };
  },

  async FILL_PRICING({ packages }) {
    const g = pricingGrid(); if (!g) return { filled: [] };
    const filled = new Set(); let days = 0;
    for (let i = 0; i < 3; i++) {
      const col = g.cols[i], p = packages[i], texts = col.filter(isText);   // name, description, ..., price
      if (texts[0]) { setValue(texts[0], p.name); filled.add("names"); }
      if (texts.length >= 3) { setValue(texts[1], p.description); filled.add("descriptions"); setValue(texts[texts.length - 1], String(p.price)); filled.add("prices"); }
      const dd = col.find(e => !isText(e) && !isCheckEl(e));
      if (dd && await choose(dd, new RegExp(`^\\s*${p.days}\\s*days?\\b`, "i"))) days++;
    }
    if (days) filled.add("delivery days");
    return { filled: [...filled] };
  },

  async FILL_DESCRIPTION({ text }) {
    const el = all("textarea,[contenteditable=true],[role=textbox]", /description|describe/)[0]
      || all("textarea,[contenteditable=true]").sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (!el) return { ok: false };
    setValue(el, text); return { ok: true };
  },

  async MIN_PRICE() {   // Fiverr shows "Package prices should include predefined options at a minimum of $90"
    const m = document.body.innerText.match(/minimum of \$\s*(\d+)/i);
    return { min: m ? Number(m[1]) : 0 };
  },

  async FILL_FAQ({ items }) {
    let count = 0;
    const boxes = () => all("textarea,input[type=text]").filter(e => !e.value && !/search/i.test(hint(e)));
    for (const f of items) {
      let b = boxes().filter(e => /question|answer|faq/.test(hint(e)));
      if (b.length < 2) {
        const add = [...document.querySelectorAll("button,a,[role=button]")].find(x => visible(x) && /add\s*(a\s*)?(new\s*)?(faq|question)/i.test(x.innerText));
        if (add) { add.scrollIntoView({ block: "center" }); click(add); await sleep(700); }
        b = boxes().filter(e => /question|answer|faq/.test(hint(e)));
        if (b.length < 2) b = boxes();
      }
      if (b.length < 2) break;
      const q = b.find(e => /question/.test(hint(e))) || b[0];
      const a = b.find(e => e !== q && /answer/.test(hint(e))) || b.find(e => e !== q);
      setValue(q, f.question); setValue(a, f.answer); await sleep(250);
      const confirm = [...document.querySelectorAll("button")].find(x => visible(x) && /^\s*add\s*$/i.test(x.innerText));
      if (confirm) { click(confirm); await sleep(700); }
      count++;
    }
    return { count };
  },

  async FILL_REQUIREMENTS({ items }) {
    let count = 0;
    const emptyBox = () => all("textarea,input[type=text]").find(e => !e.value && !/search/i.test(hint(e)));
    for (const q of items) {
      let box = emptyBox();
      if (!box) {
        const add = [...document.querySelectorAll("button,a,[role=button]")].find(b => visible(b) && /add\s*(a\s*)?(new\s*)?question/i.test(b.innerText));
        if (add) { add.scrollIntoView({ block: "center" }); click(add); await sleep(700); box = emptyBox(); }
      }
      if (!box) break;
      setValue(box, q);
      await sleep(200);
      const confirm = [...document.querySelectorAll("button")].find(b => visible(b) && /^\s*add\s*$/i.test(b.innerText));
      if (confirm) { click(confirm); await sleep(700); }
      count++;
    }
    return { count };
  },

  async UPLOAD_IMAGE({ dataUrl }) {
    const files = [...document.querySelectorAll("input[type=file]")].filter(i => !/video|pdf/i.test(i.accept || ""));
    const input = files.find(i => /image/.test(i.accept || "")) || files[0];
    if (!input) return { ok: false };
    const blob = await (await fetch(dataUrl)).blob();
    const dt = new DataTransfer(); dt.items.add(new File([blob], "gig-image.png", { type: blob.type || "image/png" }));
    input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  const h = handlers[msg.type]; if (!h) return;
  h(msg).then(send).catch(e => send({ ok: false, found: false, filled: [], count: 0, error: e.message }));
  return true;
});

})();
