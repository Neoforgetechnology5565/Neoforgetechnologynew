// Runs on fiverr.com. Fiverr's markup changes often, so everything is located
// by labels/placeholders/roles rather than fixed selectors. Best-effort.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const visible = el => !!(el.offsetParent || el.getClientRects().length);
const hint = el => [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("data-testid")].join(" ").toLowerCase();
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

const handlers = {
  async FILL_OVERVIEW({ title, tags }) {
    const filled = [];
    const t = all("input,textarea", /title|i will/)[0];
    if (t) { setValue(t, title.replace(/^I will\s*/i, "")); filled.push("title"); }
    const tg = all("input", /tag/)[0];
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
