const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let G = null, NAMES = [], stop = false, SCAN = null, SVC = {}, IDF = null, OVERRIDE = null, STOPSCAN = false;

const status = (m, ok) => { $("status").textContent = m; $("status").className = ok ? "ok" : ""; };
const card = (k, m, ok) => { $("st-" + k).textContent = m || ""; $("st-" + k).className = "st" + (ok ? " ok" : ""); };

// ---- talking to the Fiverr tab
async function page(type, data) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/fiverr\.com/.test(tab.url || "")) throw new Error("This tab isn't Fiverr. Click your Fiverr gig editor tab, then try again.");
  const send = () => chrome.tabs.sendMessage(tab.id, { type, ...data });
  try { return await send(); }
  catch {
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }); return await send(); }
    catch { throw new Error("Couldn't reach the Fiverr page. Reload the Fiverr tab and try again."); }
  }
}
fetch(chrome.runtime.getURL("fiverr-names.json")).then(r => r.json()).then(j => { NAMES = [...j.c, ...j.s, ...j.t]; IDF = GigDerive.makeIdf(NAMES); render(); }).catch(() => {});
fetch(chrome.runtime.getURL("fiverr-service-types.json")).then(r => r.json()).then(j => { SVC = j; }).catch(() => {});
chrome.storage.local.get("scan").then(v => { SCAN = v.scan || null; showScanInfo(); render(); });
const sendNames = () => NAMES.length ? page("SET_NAMES", { names: NAMES }) : null;
async function need(name, label) {
  const { page: p } = await page("DETECT", {});
  if (p !== name) throw new Error(`Open Fiverr's ${label} page first${p !== "unknown" ? ` (this looks like the ${p} page)` : ""}.`);
}
async function report(probe) { try { await navigator.clipboard.writeText(JSON.stringify(probe, null, 1)); } catch {} }

// ---- reading the paste
function read() {
  const text = $("paste").value; OVERRIDE = null; $("cands").innerHTML = "";
  chrome.storage.local.set({ paste: text });
  if (!text.trim()) { G = null; render(); return; }
  G = parseGig(text); render();
}
function categoryLine() {
  const c = G.cat, lit = [c.category, c.subcategory, c.serviceType].filter(Boolean).join(" › ");
  if (!SCAN || !IDF) return `Category: ${lit || "(not in your paste: scan Fiverr categories so I can derive it)"}${lit ? " (from your paste)" : ""}`;
  try { const t = chooseTarget(); if (t?.candidates) return `Category: ${lit ? lit + " (from your paste, not found on Fiverr)" : "not in your paste"}\nDerived suggestions: ${t.candidates.map(x => x.subcategory).join(" / ")} (you will be asked)`;
    if (t) return `Category: ${t.category} › ${t.subcategory}${t.serviceType[0] ? " › " + t.serviceType[0] : ""} (${t.source})`; } catch {}
  return `Category: ${lit || "(none)"}`;
}
function render() {
  const on = !!G;
  ["ov", "pr", "ds", "rq"].forEach(k => $("f-" + k).disabled = !on);
  $("fillThis").disabled = !on;
  if (!G) { $("pv-ov").textContent = "Nothing read yet."; ["pr", "ds", "rq"].forEach(k => $("pv-" + k).textContent = ""); $("warn").textContent = ""; return; }
  const c = G.cat;
  $("pv-ov").textContent = [`Title: ${G.title || "(not found)"}`, `Tags: ${G.tags.join(", ") || "(not found)"}`,
    categoryLine(),
    `Metadata to tick: ${c.meta.join(", ") || "(none)"}`].join("\n");
  $("pv-pr").textContent = G.packages.map((p, i) => p ? `${["Basic", "Standard", "Premium"][i]}: ${p.name || "(no name)"} · $${p.price} · ${p.days}d · ${p.revisions} rev\n   ${p.description}\n   Includes: ${p.includes.join("; ") || "-"}` : `${["Basic", "Standard", "Premium"][i]}: not found`).join("\n");
  $("pv-ds").textContent = `Description: ${G.description.length} characters\n${G.description.slice(0, 140)}${G.description.length > 140 ? "…" : ""}\nFAQs: ${G.faq.length}`;
  $("pv-rq").textContent = G.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n") || "(none found)";
  $("warn").textContent = G.warnings.length ? "⚠ " + G.warnings.join("\n⚠ ") : "";
}
$("read").onclick = read;
$("clear").onclick = () => { $("paste").value = ""; read(); };
let t; $("paste").addEventListener("input", () => { clearTimeout(t); t = setTimeout(read, 400); });
// Pasting is the trigger: read the text at once and start filling the open Fiverr page
$("paste").addEventListener("paste", () => setTimeout(() => {
  clearTimeout(t); read();
  if (G && $("onpaste").checked && !$("fillThis").disabled) $("fillThis").onclick();
}, 150));
for (const id of ["onpaste", "auto"]) {                       // remember the two switches
  chrome.storage.local.get(id).then(v => { if (id in v) $(id).checked = v[id]; });
  $(id).onchange = () => chrome.storage.local.set({ [id]: $(id).checked });
}
chrome.storage.local.get("paste").then(s => { if (s.paste) { $("paste").value = s.paste; read(); } });

// ---- the five fillers: each returns { ok, msg }
// ---- category: the paste wins; otherwise (or if Fiverr has no such option) derive it from the gig text using the scanned list
function showScanInfo() {
  $("scanInfo").textContent = SCAN ? `Scanned list: ${new Set(SCAN.items.map(i => i.category)).size} categories, ${SCAN.items.length} subcategories (${new Date(SCAN.at).toLocaleDateString()}).` : "Not scanned yet: categories can only be taken literally from your paste.";
}
function chooseTarget() {                       // -> { category, subcategory, serviceType[], source } or { candidates } or null
  const c = G.cat;
  if (OVERRIDE) return { ...OVERRIDE, source: "your choice" };
  if (!SCAN) return c.category ? { category: c.category, subcategory: c.subcategory, serviceType: c.serviceType, source: "your paste" } : null;
  const cats = [...new Set(SCAN.items.map(i => i.category))];
  const mc = GigDerive.matchName(c.category, cats);
  const subs = SCAN.items.filter(i => i.category === mc).map(i => i.subcategory);
  const ms = mc && c.subcategory ? GigDerive.matchName(c.subcategory, subs) : null;
  if (mc && ms) {                                // the paste names a real category and subcategory
    const ranked = GigDerive.rankServices(G, ms, SVC, IDF);
    const own = c.serviceType ? GigDerive.matchName(c.serviceType.replace(/\s*if available/i, "").split("/")[0].trim(), ranked.map(r => r.name)) : null;
    return { category: mc, subcategory: ms, serviceType: own ? [own, ...ranked.map(r => r.name)] : ranked.slice(0, 4).map(r => r.name), source: own ? "your paste" : "your paste (service type derived from your gig)" };
  }
  const d = GigDerive.derive(G, SCAN.items, SVC, IDF);
  if (!d.best) return null;
  const withSvc = x => ({ category: x.category, subcategory: x.subcategory, serviceType: [...new Set([x.serviceType, ...GigDerive.rankServices(G, x.subcategory, SVC, IDF).map(r => r.name)].filter(Boolean))], score: x.score });
  return d.confident ? { ...withSvc(d.best), source: "derived from your gig text" } : { candidates: d.top.map(withSvc) };
}
function showCandidates(list) {
  $("cands").innerHTML = ""; if (!list) return;
  const h = document.createElement("div"); h.className = "hint"; h.textContent = "I'm not sure. Choose the right category, then it fills:"; $("cands").append(h);
  list.forEach(x => { const b = document.createElement("button"); b.textContent = `${x.category} › ${x.subcategory}${x.serviceType[0] ? " › " + x.serviceType[0] : ""}`; b.onclick = () => { OVERRIDE = x; $("cands").innerHTML = ""; run("overview"); }; $("cands").append(b); });
}

async function fillOverview() {
  await need("overview", "Overview");
  await sendNames();
  const target = chooseTarget();
  if (target?.candidates) { showCandidates(target.candidates); return { ok: false, msg: "The paste doesn't pin down the category and I can't be sure from the gig text. Choose one of the suggestions below." }; }
  if (!target) return { ok: false, msg: SCAN ? "I couldn't derive a category from your gig." : "Your paste has no category. Click “Scan Fiverr categories” once so I can derive it from your gig, or choose it yourself on the page." };
  $("cands").innerHTML = "";
  const r = await page("FILL_OVERVIEW", { title: G.title, tags: G.tags.slice(0, 5) });
  if (!r.filled.length) return { ok: false, msg: "Couldn't find the title/tag boxes. Use the troubleshooting button and send me the report." };
  const parts = [`Filled ${r.filled.join(" and ")}.`];
  const c = await page("FILL_CATEGORIES", { category: target.category, subcategory: target.subcategory, serviceType: target.serviceType });
  if (c.probe) await report(c.probe);
  if (c.steps?.length) parts.push(`Category (${target.source}): ` + c.steps.map(s => s.choice).join(" › ") + ".");
  const near = (c.steps || []).filter(s => !s.exact && s.kind !== "serviceType");
  if (near.length) parts.push("Closest match used: " + near.map(s => `"${s.wanted}" → "${s.choice}"`).join(", ") + ". Check it.");
  if (c.error) return { ok: false, msg: parts.join(" ") + "\n" + c.error + (c.probe ? " I copied a page report to your clipboard: paste it in the chat." : "") };
  const corpus = [G.title, G.tags.join(" "), G.description, G.packages.filter(Boolean).map(p => [p.name, p.description, ...p.includes].join(" ")).join(" ")].join(" ");
  const m = await page("FILL_METADATA", { wanted: G.cat.meta, corpus });
  const fromPaste = m.ticked.filter(x => x.src === "paste").map(x => x.text), fromText = m.ticked.filter(x => x.src !== "paste").map(x => x.text);
  parts.push(m.ticked.length ? `Ticked${fromPaste.length ? " from your paste: " + fromPaste.join(", ") : ""}${fromText.length ? `${fromPaste.length ? "; " : ": "}found in your gig text: ${fromText.join(", ")}` : ""}.` : "Ticked nothing in Gig metadata.");
  const req = m.manual.filter(x => x.required), opt = m.manual.filter(x => !x.required);
  if (opt.length) parts.push(`Optional metadata with no match (left empty): ${opt.map(x => x.tab).join(", ")}.`);
  if (req.length) return { ok: false, msg: parts.join(" ") + `\nRequired metadata with nothing matching in your paste or gig text. Choose these yourself: ${req.map(x => x.tab).join(", ")}.` };
  return { ok: true, msg: parts.join(" ") };
}

// ---- scan: read Fiverr's real category > subcategory list from the open Create-a-Gig page
$("scanTax").onclick = async function () {
  STOPSCAN = false; this.disabled = true; $("stopScan").hidden = false;
  const items = [];
  try {
    await sendNames();
    const init = await page("TAX_INIT", {});
    if (!init.ok) throw new Error("I can't find the empty category and subcategory dropdowns. Open a fresh Create a Gig page (nothing selected) and try again.");
    const cats = (await page("TAX_LIST", { role: "category" })).options;
    if (!cats.length) { const probe = await page("PROBE_DROPDOWN", { role: "category" }); await report(probe); throw new Error("I couldn't open Fiverr's category dropdown. I copied a page report to your clipboard: paste it in the chat."); }
    for (let i = 0; i < cats.length && !STOPSCAN; i++) {
      status(`Scanning ${cats[i]} (${i + 1}/${cats.length})…`, true);
      if (!(await page("TAX_PICK", { role: "category", text: cats[i] })).ok) continue;
      await sleep(900);
      const subs = (await page("TAX_LIST", { role: "subcategory" })).options;
      subs.forEach(sb => items.push({ category: cats[i], subcategory: sb }));
      SCAN = { at: Date.now(), items: [...items] }; await chrome.storage.local.set({ scan: SCAN }); showScanInfo();   // keep progress
    }
    if (!items.length) throw new Error("Nothing was scanned.");
    status(`${STOPSCAN ? "Stopped. Saved" : "Done. Saved"} ${items.length} subcategories. Reload the Fiverr page before filling, because the scan changed the dropdowns.`, true);
    render();
  } catch (e) { status(e.message); }
  finally { this.disabled = false; $("stopScan").hidden = true; }
};
$("stopScan").onclick = () => { STOPSCAN = true; status("Stopping after this category…"); };

async function fillPricing() {
  await need("pricing", "Pricing");
  if (G.packages.some(p => !p)) return { ok: false, msg: "Your paste doesn't have all three packages (Basic, Standard, Premium)." };
  const r = await page("FILL_SCOPE_PRICING", { packages: G.packages });
  if (!r.filled.length) return { ok: false, msg: "Couldn't find the package boxes. Use the troubleshooting button and send me the report." };
  let msg = `Filled ${r.filled.join(", ")}. Feature grid: ${r.rows} rows, ${r.changes} ticks/choices set.`;
  if (r.unmatched.length) msg += `\nNot mentioned in any package's Includes, left unticked: ${r.unmatched.join(", ")}.`;
  if (r.min && G.packages.some(p => p.price < r.min)) return { ok: false, msg: msg + `\nFiverr's minimum package price here is $${r.min}, but your paste has ${G.packages.map(p => "$" + p.price).join(" / ")}. I left your prices as pasted: change them, then fill again.` };
  return { ok: true, msg };
}
async function fillDescription() {
  await need("description", "Description & FAQ");
  if (!G.description) return { ok: false, msg: "Your paste has no description." };
  const d = await page("FILL_DESCRIPTION", { text: G.description });
  if (!d.ok) return { ok: false, msg: "Couldn't find the description box." };
  let msg = "Description filled.";
  if (G.description.length > 1200) return { ok: false, msg: `Description filled, but it is ${G.description.length} characters and Fiverr's limit is 1200, so Fiverr won't accept it. Shorten it in your paste, then fill again.` };
  if (G.faq.length) { const f = await page("FILL_FAQ", { items: G.faq }); msg += ` Added ${f.count} of ${G.faq.length} FAQs.`; if (f.count < G.faq.length) return { ok: false, msg: msg + " Add the rest by hand." }; }
  return { ok: true, msg };
}
async function fillRequirements() {
  await need("requirements", "Requirements");
  if (!G.requirements.length) return { ok: false, msg: "Your paste has no buyer requirements." };
  const r = await page("FILL_REQUIREMENTS", { items: G.requirements });
  return { ok: r.count === G.requirements.length, msg: `Added ${r.count} of ${G.requirements.length} questions.${r.count < G.requirements.length ? " Add the rest by hand." : ""}` };
}

// ---- gallery: the user's own images, saved in this browser (IndexedDB)
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("fgw", 1); r.onupgradeneeded = () => r.result.createObjectStore("imgs", { autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbAll = async () => { const db = await idb(); return new Promise(res => { const out = []; const c = db.transaction("imgs").objectStore("imgs").openCursor(); c.onsuccess = e => { const cur = e.target.result; if (cur) { out.push({ key: cur.key, blob: cur.value }); cur.continue(); } else res(out); }; }); };
const idbAdd = async blob => { const db = await idb(); return new Promise(res => { const t = db.transaction("imgs", "readwrite"); t.objectStore("imgs").add(blob); t.oncomplete = res; }); };
const idbDel = async key => { const db = await idb(); return new Promise(res => { const t = db.transaction("imgs", "readwrite"); t.objectStore("imgs").delete(key); t.oncomplete = res; }); };
const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
async function renderImgs() {
  const list = await idbAll(); $("thumbs").innerHTML = "";
  list.forEach(({ key, blob }) => {
    const d = document.createElement("div"), img = document.createElement("img"), x = document.createElement("b");
    img.src = URL.createObjectURL(blob); x.textContent = "×"; x.title = "Remove"; x.onclick = async () => { await idbDel(key); renderImgs(); };
    d.append(img, x); $("thumbs").append(d);
  });
  $("f-gl").disabled = !list.length;
}
async function addImages(files) {
  let have = (await idbAll()).length;
  for (const f of files) { if (!/^image\//.test(f.type)) continue; if (have >= 3) { card("gl", "Fiverr allows 3 gig images. Remove one first."); break; } await idbAdd(f); have++; }
  renderImgs();
}
$("imgFiles").onchange = async e => { await addImages([...e.target.files]); e.target.value = ""; };
document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); addImages(f); } });
renderImgs();
async function fillGallery() {
  await need("gallery", "Gallery");
  const list = await idbAll(); if (!list.length) return { ok: false, msg: "Add your images first (choose files or Ctrl+V)." };
  const images = await Promise.all(list.map(async ({ blob }, i) => ({ dataUrl: await toDataUrl(blob), name: blob.name || `gig-${i + 1}.png`, type: blob.type })));
  const r = await page("UPLOAD_IMAGES", { images });
  return r.count ? { ok: true, msg: `Added ${r.count} image(s). Wait for Fiverr to finish uploading, then check them.` } : { ok: false, msg: "I couldn't find the image upload box on this page." };
}

// ---- buttons
const FILLERS = { overview: ["ov", fillOverview], pricing: ["pr", fillPricing], description: ["ds", fillDescription], requirements: ["rq", fillRequirements], gallery: ["gl", fillGallery] };
async function run(name) {
  const [k, fn] = FILLERS[name], btn = $("f-" + k); btn.disabled = true; card(k, "Working…", true);
  try { const r = await fn(); card(k, r.msg, r.ok); return r; }
  catch (e) { card(k, e.message); return { ok: false, msg: e.message }; }
  finally { btn.disabled = name !== "gallery" ? !G : false; if (name === "gallery") renderImgs(); }
}
Object.keys(FILLERS).forEach(n => $("f-" + FILLERS[n][0]).onclick = () => run(n));

// "Fill this page": detect the open page, fill it; with the checkbox, also click Save & Continue and go on to the next page
$("fillThis").onclick = async () => {
  stop = false; $("stopAuto").hidden = false; $("fillThis").disabled = true;
  try {
    for (let i = 0; i < 6 && !stop; i++) {
      const { page: p } = await page("DETECT", {});
      if (!FILLERS[p]) return status("I can't tell which Fiverr page this is. Open Overview, Pricing, Description, Requirements or Gallery.");
      status(`Filling the ${p} page…`, true);
      const r = await run(p);
      if (!r.ok) return status(`Stopped on the ${p} page. See the note on its card.`);
      if (p === "gallery" || !$("auto").checked || stop) return status(`${p[0].toUpperCase() + p.slice(1)} page filled. Check it, then click Save & Continue yourself.`, true);
      await sleep(600);
      const n = await page("CLICK_NEXT", {});
      if (!n.clicked) return status(`Filled the ${p} page but stopped: ${n.reason}.`);
      let moved = false;
      for (let k = 0; k < 20 && !stop; k++) { await sleep(600); try { if ((await page("DETECT", {})).page !== p) { moved = true; break; } } catch {} }
      if (!moved) return status(`Clicked "${n.clicked}" but Fiverr stayed on the ${p} page. A required field is probably missing. Check the page.`);
      await sleep(900);
    }
    status(stop ? "Stopped." : "Done. Check the page before going on.", true);
  } catch (e) { status(e.message); }
  finally { $("stopAuto").hidden = true; $("fillThis").disabled = !G; }
};
$("stopAuto").onclick = () => { stop = true; status("Stopping after this step…"); };

$("scan").onclick = async () => {
  try { const r = await page("SCAN", {}); await navigator.clipboard.writeText(JSON.stringify(r, null, 1)); status(`Copied a report of ${r.fields.length} fields. Paste it in the chat.`, true); }
  catch (e) { status(e.message); }
};
