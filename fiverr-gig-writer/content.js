(() => {
if (window.__fgwLoaded) return;
window.__fgwLoaded = true;
// Runs on fiverr.com. Fiverr's markup changes often, so everything is located
// by labels/placeholders/roles rather than fixed selectors. Best-effort.
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
async function choose(el, matcher) {           // matcher: string or RegExp
  const ok = t => matcher instanceof RegExp ? matcher.test(t) : t.trim().toLowerCase() === String(matcher).trim().toLowerCase();
  if (el.tagName === "SELECT") {
    const o = [...el.options].find(o => ok(o.text)); if (!o) return false;
    setValue(el, o.value); return true;
  }
  if (!optionEls().length) { click(el); await sleep(350); }
  const o = optionEls().find(o => ok(o.innerText));
  if (!o) return false; click(o); await sleep(250); return true;
}

const visitedTabs = new Set();
const rnd = () => String(Math.random()).slice(2);
const isChecked = b => b.checked || b.getAttribute("aria-checked") === "true";
const optText = b => (b.labels?.[0]?.innerText || b.closest("label")?.innerText || b.parentElement?.innerText || "").trim();
function sectionLabel(el) {
  for (let n = el.parentElement, i = 0; n && i < 6; n = n.parentElement, i++) {
    const h = n.querySelector("h1,h2,h3,h4,h5,h6,legend,[class*=title i]");
    if (h && h.innerText.trim() && h.innerText.length < 100) return h.innerText.trim();
  }
  return "";
}

const handlers = {
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
    const el = all(COMBO).find(e => !e.dataset.fgwDone && (
      e.tagName === "SELECT" ? (!e.value || e.selectedIndex <= 0) : /select|choose|^\s*$/i.test((e.innerText || e.value || "").trim())));
    if (!el) return { found: false };
    el.dataset.fgwId = el.dataset.fgwId || String(Math.random()).slice(2);
    if (el.tagName !== "SELECT") { click(el); await sleep(450); }
    const options = dropdownOptions(el);
    el.dataset.fgwDone = "1";
    if (!options.length) return { found: false };
    const label = rowText(el).split("\n")[0].trim();
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

  // ---- Pricing feature grid: rows of 3 checkboxes / dropdowns (one per package)
  async PRICING_ROWS() {
    const SEL = "input[type=checkbox],[role=checkbox],[role=switch],[role=combobox],[aria-haspopup=listbox],select";
    const extras = [...document.querySelectorAll("*")].find(e => visible(e) && /^\s*add extra services\s*$/i.test(e.innerText || ""));
    const ctrls = all(SEL).filter(el => !extras || !(extras.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    const rows = new Map();
    for (const el of ctrls) {
      let n = el.parentElement;
      while (n && all(SEL).filter(x => n.contains(x) && ctrls.includes(x)).length < 3) n = n.parentElement;
      if (!n) continue;
      const inRow = ctrls.filter(x => n.contains(x));
      if (inRow.length === 3) rows.set(n, inRow);
    }
    const out = [];
    for (const [row, els] of rows) {
      const label = (row.innerText || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || "";
      if (!label || /^\$?\d/.test(label) || /^price|deliver/i.test(label)) continue;
      const isCheck = els.every(e => /checkbox|switch/.test(e.type || e.getAttribute("role") || ""));
      els.forEach(e => e.dataset.fgwId = e.dataset.fgwId || rnd());
      const r = { label, kind: isCheck ? "check" : "select", ids: els.map(e => e.dataset.fgwId) };
      if (!isCheck) {
        if (els[0].tagName !== "SELECT") { click(els[0]); await sleep(350); }
        r.options = dropdownOptions(els[0]);
        if (els[0].tagName !== "SELECT") { key(els[0], "Escape", 27); document.body.click(); await sleep(150); }
      }
      out.push(r);
    }
    return { rows: out };
  },
  async PRICING_APPLY({ rows }) {
    let n = 0;
    for (const r of rows) for (let i = 0; i < r.ids.length; i++) {
      const el = document.querySelector(`[data-fgw-id="${r.ids[i]}"]`);
      if (!el) continue;
      if (r.kind === "check") { if (isChecked(el) !== !!r.values[i]) { (el.labels?.[0] || el).click(); n++; await sleep(120); } }
      else if (r.values[i] && await choose(el, r.values[i])) { n++; await sleep(200); }
    }
    return { count: n };
  },

  async FILL_PRICING({ packages }) {
    const filled = [];
    const names = all("input,textarea", /package.?name|name your package|title/);
    const descs = all("textarea,input", /describe|description|details/).filter(e => !names.includes(e));
    const prices = all("input", /price|amount/).length >= 3 ? all("input", /price|amount/) : all('input[type=number]');
    packages.forEach((p, i) => {
      if (names[i]) { setValue(names[i], p.name); }
      if (descs[i]) { setValue(descs[i], p.description); }
      if (prices[i]) { setValue(prices[i], String(p.price)); }
    });
    if (names.length) filled.push("names"); if (descs.length) filled.push("descriptions"); if (prices.length) filled.push("prices");
    const dds = all(COMBO).filter(e => /deliver/.test(rowText(e)));
    let n = 0;
    for (let i = 0; i < Math.min(dds.length, packages.length); i++)
      if (await choose(dds[i], new RegExp(`^\\s*${packages[i].days}\\s*days?\\b`, "i"))) n++;
    if (n) filled.push("delivery days");
    return { filled };
  },

  async FILL_DESCRIPTION({ text }) {
    const el = all("textarea,[contenteditable=true],[role=textbox]", /description|describe/)[0]
      || all("textarea,[contenteditable=true]").sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (!el) return { ok: false };
    setValue(el, text); return { ok: true };
  },

  async FILL_REQUIREMENTS({ items }) {
    let count = 0;
    for (const q of items) {
      let box = all("textarea,input[type=text]", /question|requirement/).find(e => !e.value);
      if (!box) {
        const add = [...document.querySelectorAll("button,a,[role=button]")].find(b => visible(b) && /add.*question|add new/i.test(b.innerText));
        if (add) { click(add); await sleep(400); box = all("textarea,input[type=text]", /question|requirement/).find(e => !e.value); }
      }
      if (!box) break;
      setValue(box, q);
      const confirm = [...document.querySelectorAll("button")].find(b => visible(b) && /^\s*add\s*$/i.test(b.innerText));
      if (confirm) { click(confirm); await sleep(400); }
      count++;
    }
    return { count };
  },

  async UPLOAD_IMAGE({ dataUrl }) {
    const input = [...document.querySelectorAll("input[type=file]")].find(i => !i.accept || /image/.test(i.accept));
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
