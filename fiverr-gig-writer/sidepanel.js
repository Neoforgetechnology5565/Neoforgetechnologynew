const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = GigParse;
let NAMES = [], SCAN = null, SVC = {}, IDF = null, OVERRIDE = null, stop = false, STOPSCAN = false;
const D = { ov: null, pr: null, ds: null, fq: null, rq: null };           // what each box was read as
const BOXES = ["ov", "pr", "ds", "fq", "rq"];
const SECS = { ov: { page: "overview", label: "Overview" }, pr: { page: "pricing", label: "Scope & Pricing" }, ds: { page: "description", label: "Description & FAQ" }, rq: { page: "requirements", label: "Requirements" }, gl: { page: "gallery", label: "Gallery" } };
const CARD_OF = { ov: "ov", pr: "pr", ds: "ds", fq: "ds", rq: "rq" };

// ---- optional AI (Gemini, through the background script)
let HASKEY = false;
const aiOn = () => HASKEY && $("aiFill").checked;
function bg(action, payload) {
  return new Promise((res, rej) => chrome.runtime.sendMessage({ ai: action, payload }, r => chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : r?.ok ? res(r.result) : rej(new Error(r?.error || "The AI did not answer."))));
}
function gigBrief() {                           // a compact description of the gig, sent with AI requests
  const o = D.ov, pk = (D.pr?.packages || []).filter(Boolean);
  return [o?.title && `Title: ${o.title}`, o?.tags?.length && `Tags: ${o.tags.join(", ")}`,
    o?.cat && [o.cat.category, o.cat.subcategory, o.cat.serviceType].some(Boolean) && `Category notes: ${[o.cat.category, o.cat.subcategory, o.cat.serviceType].filter(Boolean).join(" > ")}`,
    o?.cat?.meta?.length && `Tools/values: ${o.cat.meta.join(", ")}`,
    pk.length && `Packages: ${pk.map(p => `${p.name} (${p.includes.join("; ")})`).join(" | ")}`,
    D.ds?.description && `Description: ${D.ds.description.slice(0, 700)}`].filter(Boolean).join("\n");
}
const fmt = {
  ov: o => [o.title, o.category && `Category: ${o.category}`, o.subcategory && `Subcategory: ${o.subcategory}`, o.serviceType && `Service type: ${o.serviceType}`,
    ...Object.entries(o.meta || {}).map(([k, v]) => `${k}: ${[].concat(v).join(", ")}`), `Tags: ${(o.tags || []).join(", ")}`].filter(Boolean).join("\n"),
  pr: p => (p.packages || []).map((x, i) => `${["Basic", "Standard", "Premium"][i]} - ${x.name}\n$${x.price}\n${x.days}-day delivery · ${x.revisions} revision${x.revisions == 1 ? "" : "s"}\nPackage description: ${x.description}\nIncludes:\n${(x.includes || []).map(i => "- " + i).join("\n")}`).join("\n\n"),
  fq: f => (f || []).map((x, i) => `Q${i + 1}. ${x.question}\n${x.answer}`).join("\n"),
  rq: r => (r || []).map((x, i) => `${i + 1}. ${x}`).join("\n")
};
const UNDO = {};
function setBox(k, text) { $("t-" + k).value = text; }
async function aiWrite(boxes, notes, label) {      // boxes: subset of ov, pr, ds, rq
  if (!HASKEY) throw new Error("Add your Gemini API key in the ✨ AI settings first.");
  const ctx = ["ov", "pr", "ds", "rq"].filter(b => !boxes.includes(b)).map(b => $("t-" + b).value.trim() && `[${b}] ${$("t-" + b).value.trim().slice(0, 600)}`).filter(Boolean).join("\n");
  const r = await bg("generate", { boxes, notes, ctx, taxonomy: boxes.includes("ov") && SCAN ? SCAN.items : null });
  for (const b of [...boxes, "fq"]) UNDO[b] = $("t-" + b).value;
  if (r.ov) setBox("ov", fmt.ov(r.ov));
  if (r.pr) setBox("pr", fmt.pr(r.pr));
  if (r.ds) { setBox("ds", r.ds.description || ""); setBox("fq", fmt.fq(r.ds.faq)); }
  if (r.rq) setBox("rq", fmt.rq(r.rq.requirements));
  BOXES.forEach(readBox); render(); saveBoxes();
  return r;
}
function wireAi() {
  for (const k of ["ov", "pr", "ds", "rq"]) {
    $("ai-" + k).onclick = async () => {
      const btn = $("ai-" + k); btn.disabled = true; card(k, "AI is writing…", true);
      try { await aiWrite([k], $("t-" + k).value + (k === "ds" && $("t-fq").value ? "\n" + $("t-fq").value : ""));
        $("un-" + k).hidden = false; card(k, "Written by AI from your notes. Read it, edit it, then fill. Undo AI brings your text back.", true); }
      catch (e) { card(k, e.message); } finally { btn.disabled = false; }
    };
    $("un-" + k).onclick = () => { for (const b of k === "ds" ? ["ds", "fq"] : [k]) if (b in UNDO) setBox(b, UNDO[b]); BOXES.forEach(readBox); render(); saveBoxes(); $("un-" + k).hidden = true; card(k, "Your text is back.", true); };
  }
  $("ai-all").onclick = async () => {
    const notes = $("master").value.trim() || ["ov", "pr", "ds", "fq", "rq"].map(b => $("t-" + b).value).join("\n\n");
    const btn = $("ai-all"); btn.disabled = true; status("AI is writing the whole gig from your notes…", true);
    try { await aiWrite(["ov", "pr", "ds", "rq"], notes); $("un-all").hidden = false; status("The AI wrote all the boxes. Read them, then fill the pages (or paste in a box to start).", true);
      if ($("onpaste").checked) { try { await page("DETECT", {}); startChain(); } catch {} } }
    catch (e) { status(e.message); } finally { btn.disabled = false; }
  };
  $("un-all").onclick = () => { for (const b of BOXES) if (b in UNDO) setBox(b, UNDO[b]); BOXES.forEach(readBox); render(); saveBoxes(); $("un-all").hidden = true; status("Your texts are back.", true); };
  $("gsave").onclick = async () => {
    const msg = (t, ok) => { $("gmsg").textContent = t; $("gmsg").className = "st" + (ok ? " ok" : ""); };
    const key = $("gkey").value.trim(); if (!key) return msg("Paste your Gemini API key first.");
    await chrome.storage.local.set({ geminiKey: key, geminiModel: $("gmodel").value.trim() }); HASKEY = true; msg("Saved. Testing…", true);
    try { await bg("ping", {}); msg("Saved ✓ The key works.", true); } catch (e) { msg("Saved, but the test failed: " + e.message); }
    $("aiState").textContent = "(on)";
  };
  $("aiFill").onchange = () => chrome.storage.local.set({ aiFill: $("aiFill").checked });
  chrome.storage.local.get(["geminiKey", "geminiModel", "aiFill"]).then(v => {
    HASKEY = !!v.geminiKey; $("gkey").value = v.geminiKey || ""; $("gmodel").value = v.geminiModel || "";
    if ("aiFill" in v) $("aiFill").checked = v.aiFill; $("aiState").textContent = HASKEY ? "(on)" : "(add a key to turn on)";
    if (!HASKEY) $("aiBox").open = true;
  });
}

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
const sendNames = () => NAMES.length ? page("SET_NAMES", { names: NAMES }) : null;
async function need(name, label) {
  const { page: p } = await page("DETECT", {});
  if (p !== name) throw new Error(`Open Fiverr's ${label} page first${p !== "unknown" ? ` (this looks like the ${p} page)` : ""}.`);
}
async function report(probe) { try { await navigator.clipboard.writeText(JSON.stringify(probe, null, 1)); } catch {} }

// ---- reading the boxes
const PARSERS = { ov: P.parseOverview, pr: P.parsePricing, ds: P.parseDescriptionBox, fq: P.parseFaqBox, rq: P.parseRequirementsBox };
function readBox(k) {
  const text = $("t-" + k).value;
  D[k] = text.trim() ? PARSERS[k](text) : null;
  if (k === "ov") { OVERRIDE = null; $("cands").innerHTML = ""; }
}
const faqList = () => (D.fq?.faq?.length ? D.fq.faq : D.ds?.faq) || [];
const gigView = () => ({                                    // the whole gig as far as the boxes describe it (for deriving a category)
  title: D.ov?.title || "", tags: D.ov?.tags || [], cat: D.ov?.cat || { category: "", subcategory: "", serviceType: "", meta: [] },
  packages: D.pr?.packages || [], description: D.ds?.description || "", faq: faqList(), requirements: D.rq?.requirements || []
});
const warn = d => d?.warnings?.length ? "\n⚠ " + d.warnings.join("\n⚠ ") : "";
function render() {
  const o = D.ov, c = o?.cat;
  $("pv-ov").textContent = o ? [`Title: ${o.title || "(not found)"}`, `Tags: ${o.tags.join(", ") || "(not found)"}`, categoryLine(), `Metadata to tick: ${c.meta.join(", ") || "(none)"}`].join("\n") + warn(o) : "";
  $("pv-pr").textContent = D.pr ? D.pr.packages.map((p, i) => p ? `${["Basic", "Standard", "Premium"][i]}: ${p.name || "(no name)"} · $${p.price} · ${p.days}d · ${p.revisions} rev\n   ${p.description}\n   Includes: ${p.includes.join("; ") || "-"}` : `${["Basic", "Standard", "Premium"][i]}: not found`).join("\n") + warn(D.pr) : "";
  const ds = D.ds, fl = faqList();
  $("pv-ds").textContent = ds || fl.length ? `Description: ${ds ? ds.description.length : 0} characters${ds ? "\n" + ds.description.slice(0, 120) + (ds.description.length > 120 ? "…" : "") : ""}\nFAQs: ${fl.length}` + warn(ds) + warn(D.fq) : "";
  $("pv-rq").textContent = D.rq ? D.rq.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n") + warn(D.rq) : "";
  $("f-ov").disabled = !o; $("f-pr").disabled = !D.pr; $("f-ds").disabled = !(ds || fl.length); $("f-rq").disabled = !D.rq;
}
function saveBoxes() { chrome.storage.local.set({ boxes: Object.fromEntries([...BOXES, "master"].map(k => [k, $(k === "master" ? "master" : "t-" + k).value])) }); }
let timers = {};
function onType(k) { clearTimeout(timers[k]); timers[k] = setTimeout(() => { readBox(k); render(); saveBoxes(); }, 400); }

// ---- the five fillers: each returns { ok, msg }
function categoryLine() {
  const c = D.ov.cat, lit = [c.category, c.subcategory, c.serviceType].filter(Boolean).join(" › ");
  if (!SCAN || !IDF) return `Category: ${lit || "(not in the box: scan Fiverr categories so I can derive it)"}${lit ? " (from your text)" : ""}`;
  try {
    const t = chooseTarget();
    if (t?.candidates) return `Category: ${lit ? lit + " (not found on Fiverr)" : "not in the box"}\nDerived suggestions: ${t.candidates.map(x => x.subcategory).join(" / ")} (you will be asked)`;
    if (t) return `Category: ${t.category} › ${t.subcategory}${t.serviceType[0] ? " › " + t.serviceType[0] : ""} (${t.source})`;
  } catch {}
  return `Category: ${lit || "(none)"}`;
}
function showScanInfo() {
  $("scanInfo").textContent = SCAN ? `Scanned list: ${new Set(SCAN.items.map(i => i.category)).size} categories, ${SCAN.items.length} subcategories (${new Date(SCAN.at).toLocaleDateString()}).` : "Not scanned yet: the category is taken literally from the box.";
}
function chooseTarget() {                       // -> { category, subcategory, serviceType[], source } | { candidates } | null
  const G = gigView(), c = G.cat;
  if (OVERRIDE) return { ...OVERRIDE, source: "your choice" };
  if (!SCAN) return c.category ? { category: c.category, subcategory: c.subcategory, serviceType: c.serviceType, source: "your text" } : null;
  const cats = [...new Set(SCAN.items.map(i => i.category))];
  const mc = GigDerive.matchName(c.category, cats);
  const subs = SCAN.items.filter(i => i.category === mc).map(i => i.subcategory);
  const ms = mc && c.subcategory ? GigDerive.matchName(c.subcategory, subs) : null;
  if (mc && ms) {                                // the text names a real category and subcategory
    const ranked = GigDerive.rankServices(G, ms, SVC, IDF);
    const own = c.serviceType ? GigDerive.matchName(c.serviceType.replace(/\s*if available/i, "").split("/")[0].trim(), ranked.map(r => r.name)) : null;
    return { category: mc, subcategory: ms, serviceType: own ? [own, ...ranked.map(r => r.name)] : ranked.slice(0, 4).map(r => r.name), source: own ? "your text" : "your text; service type derived from your gig" };
  }
  const d = GigDerive.derive(G, SCAN.items, SVC, IDF);
  if (!d.best) return null;
  const withSvc = x => ({ category: x.category, subcategory: x.subcategory, serviceType: [...new Set([x.serviceType, ...GigDerive.rankServices(G, x.subcategory, SVC, IDF).map(r => r.name)].filter(Boolean))], score: x.score });
  return d.confident ? { ...withSvc(d.best), source: "derived from your gig text" } : { candidates: d.top.map(withSvc) };
}
function showCandidates(list) {
  $("cands").innerHTML = ""; if (!list) return;
  const h = document.createElement("div"); h.className = "hint"; h.textContent = "I'm not sure. Choose the right category, then it fills:"; $("cands").append(h);
  list.forEach(x => { const b = document.createElement("button"); b.textContent = `${x.category} › ${x.subcategory}${x.serviceType[0] ? " › " + x.serviceType[0] : ""}`; b.onclick = () => { OVERRIDE = x; $("cands").innerHTML = ""; run("ov"); }; $("cands").append(b); });
}

async function fillOverview() {
  await need("overview", "Overview");
  const o = D.ov; await sendNames();
  let target = chooseTarget();
  if (aiOn() && target?.candidates) {            // unsure between candidates: let the AI choose one of them
    const cands = target.candidates, r = await bg("chooseCategory", { gig: gigBrief(), candidates: cands.map(x => `${x.category} > ${x.subcategory}${x.serviceType[0] ? " > " + x.serviceType[0] : ""}`) }).catch(() => null);
    if (r && Number.isInteger(r.index) && r.index >= 0 && r.index < cands.length) target = { ...cands[r.index], source: `chosen by AI${r.reason ? ": " + r.reason : ""}` };
  } else if (aiOn() && !target) {                // nothing to go on: the AI names a category, which the page then verifies
    const r = await bg("chooseCategory", { gig: gigBrief() }).catch(() => null);
    if (r?.category) target = { category: r.category, subcategory: r.subcategory || "", serviceType: r.serviceType || "", source: "suggested by AI, checked against Fiverr's options" };
  }
  if (target?.candidates) { showCandidates(target.candidates); return { ok: false, msg: "The box doesn't pin down the category and I can't be sure from the gig text. Choose one of the suggestions above." }; }
  if (!target) return { ok: false, msg: SCAN ? "I couldn't derive a category from your gig." : "No category in the box. Write “Category: …” / “Subcategory: …”, or scan Fiverr categories once so I can derive it, or choose it yourself on the page." };
  $("cands").innerHTML = "";
  const r = await page("FILL_OVERVIEW", { title: o.title, tags: o.tags.slice(0, 5) });
  if (!r.filled.length) return { ok: false, msg: "Couldn't find the title/tag boxes. Use the troubleshooting button and send me the report." };
  const parts = [`Filled ${r.filled.join(" and ")}.`];
  const c = await page("FILL_CATEGORIES", { category: target.category, subcategory: target.subcategory, serviceType: target.serviceType, ai: aiOn(), gig: gigBrief() });
  if (c.probe) await report(c.probe);
  if (c.steps?.length) parts.push(`Category (${target.source}): ` + c.steps.map(s => s.choice + (s.byAi ? " (AI)" : "")).join(" › ") + ".");
  const near = (c.steps || []).filter(s => !s.exact && s.kind !== "serviceType");
  if (near.length) parts.push("Closest match used: " + near.map(s => `"${s.wanted}" → "${s.choice}"`).join(", ") + ". Check it.");
  if (c.error) return { ok: false, msg: parts.join(" ") + "\n" + c.error + (c.probe ? " I copied a page report to your clipboard: paste it in the chat." : "") };
  const G = gigView();
  const corpus = [G.title, G.tags.join(" "), G.description, G.packages.filter(Boolean).map(p => [p.name, p.description, ...p.includes].join(" ")).join(" ")].join(" ");
  const m = await page("FILL_METADATA", { wanted: o.cat.meta, corpus, ai: aiOn(), gig: gigBrief() });
  const by = src => m.ticked.filter(x => x.src === src).map(x => x.text), fromBox = by("paste"), fromText = by("gig text"), fromAi = by("AI");
  const bits = [fromBox.length && `from the box: ${fromBox.join(", ")}`, fromText.length && `found in your gig text: ${fromText.join(", ")}`, fromAi.length && `chosen by AI: ${fromAi.join(", ")}`].filter(Boolean);
  parts.push(bits.length ? `Ticked ${bits.join("; ")}.` : "Ticked nothing in Gig metadata.");
  const req = m.manual.filter(x => x.required), opt = m.manual.filter(x => !x.required);
  if (opt.length) parts.push(`Optional metadata with no match (left empty): ${opt.map(x => x.tab).join(", ")}.`);
  if (req.length) return { ok: false, msg: parts.join(" ") + `\nRequired metadata with nothing matching. Choose these yourself: ${req.map(x => x.tab).join(", ")}.` };
  return { ok: true, msg: parts.join(" ") };
}
async function fillPricing() {
  await need("pricing", "Pricing");
  const pk = D.pr.packages;
  if (pk.some(p => !p)) return { ok: false, msg: "The box doesn't have all three packages (Basic, Standard, Premium)." };
  const r = await page("FILL_SCOPE_PRICING", { packages: pk, ai: aiOn(), gig: gigBrief() });
  if (!r.filled.length) return { ok: false, msg: "Couldn't find the package boxes. Use the troubleshooting button and send me the report." };
  let msg = `Filled ${r.filled.join(", ")}. Found ${r.rows} feature rows on the page, ${r.changes} ticks/choices set.`;
  if (r.unmatched.length) msg += `\nNot mentioned in any package, left unticked: ${r.unmatched.join(", ")}.`;
  if (r.min && pk.some(p => p.price < r.min)) return { ok: false, msg: msg + `\nFiverr's minimum package price here is $${r.min}, but you have ${pk.map(p => "$" + p.price).join(" / ")}. I left your prices as written: change them, then fill again.` };
  return { ok: true, msg };
}
async function fillDescription() {
  await need("description", "Description & FAQ");
  const desc = D.ds?.description || "", fl = faqList(); let msg = "";
  if (desc) {
    const d = await page("FILL_DESCRIPTION", { text: desc });
    if (!d.ok) return { ok: false, msg: "Couldn't find the description box." };
    msg = "Description filled.";
    if (desc.length > 1200) return { ok: false, msg: `Description filled, but it is ${desc.length} characters and Fiverr's limit is 1200, so Fiverr won't accept it. Shorten it in the box, then fill again.` };
  }
  if (fl.length) { const f = await page("FILL_FAQ", { items: fl }); msg += ` Added ${f.count} of ${fl.length} FAQs.`; if (f.count < fl.length) return { ok: false, msg: msg.trim() + " Add the rest by hand." }; }
  return { ok: true, msg: msg.trim() };
}
async function fillRequirements() {
  await need("requirements", "Requirements");
  const items = D.rq.requirements;
  const r = await page("FILL_REQUIREMENTS", { items });
  return { ok: r.count === items.length, msg: `Added ${r.count} of ${items.length} questions.${r.count < items.length ? " Add the rest by hand." : ""}` };
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

// ---- running a section
const FILL = { ov: fillOverview, pr: fillPricing, ds: fillDescription, rq: fillRequirements, gl: fillGallery };
const EMPTY = { ov: "Paste the Overview text in the box above, then fill.", pr: "Paste the pricing text in the box above, then fill.", ds: "Paste the description (and FAQ) in the boxes above, then fill.", rq: "Paste the requirements in the box above, then fill." };
async function run(k) {
  const btn = $("f-" + k); btn.disabled = true; card(k, "Working…", true);
  try {
    const has = { ov: D.ov, pr: D.pr, ds: D.ds || faqList().length, rq: D.rq, gl: true }[k];
    if (!has) { card(k, EMPTY[k]); return { ok: false, msg: EMPTY[k], empty: true }; }
    const r = await FILL[k](); card(k, r.msg, r.ok); return r;
  } catch (e) { card(k, e.message); return { ok: false, msg: e.message }; }
  finally { render(); if (k === "gl") renderImgs(); }
}
Object.keys(FILL).forEach(k => $("f-" + k).onclick = () => run(k));
const kOfPage = p => Object.keys(SECS).find(k => SECS[k].page === p);

// the chain: fill the open page; with the switch on, click Save & Continue and go on while the next page's box has text
async function startChain() {
  stop = false; $("stopAuto").hidden = false; $("fillThis").disabled = true;
  try {
    for (let i = 0; i < 6 && !stop; i++) {
      const { page: p } = await page("DETECT", {});
      const k = kOfPage(p);
      if (!k) return status("I can't tell which Fiverr page this is. Open Overview, Pricing, Description, Requirements or Gallery.");
      status(`Filling the ${SECS[k].label} page…`, true);
      const r = await run(k);
      if (r.empty) return status(`${SECS[k].label}: its box is empty. Paste the text into the box and it will fill.`);
      if (!r.ok) return status(`Stopped on the ${SECS[k].label} page. See the note on its card.`);
      if (k === "ds" && $("auto").checked && !(D.ds?.description && faqList().length))      // one page, two boxes: wait for the other one
        return status(`Description & FAQ: ${D.ds?.description ? "the FAQ box is empty. Paste your FAQs and they will be added" : "the description box is empty. Paste it and it will be added"}, or click Save & Continue yourself.`, true);
      if (k === "gl" || !$("auto").checked || stop) return status(`${SECS[k].label} page filled. Check it, then click Save & Continue yourself.`, true);
      await sleep(600);
      const n = await page("CLICK_NEXT", {});
      if (!n.clicked) return status(`Filled the ${SECS[k].label} page but stopped: ${n.reason}.`);
      let moved = false;
      for (let t = 0; t < 20 && !stop; t++) { await sleep(600); try { if ((await page("DETECT", {})).page !== p) { moved = true; break; } } catch {} }
      if (!moved) return status(`Clicked "${n.clicked}" but Fiverr stayed on the ${SECS[k].label} page. A required field is probably missing. Check the page.`);
      await sleep(900);
    }
    status(stop ? "Stopped." : "Done. Check the page before going on.", true);
  } catch (e) { status(e.message); }
  finally { $("stopAuto").hidden = true; $("fillThis").disabled = false; }
}
$("fillThis").onclick = startChain;
$("stopAuto").onclick = () => { stop = true; status("Stopping after this step…"); };

// pasting into a box: read it, and if the matching Fiverr page is open, fill that page right away
async function afterPaste(k) {
  readBox(k); render(); saveBoxes();
  if (!$("onpaste").checked) return;
  try {
    const { page: p } = await page("DETECT", {}), want = CARD_OF[k];
    if (kOfPage(p) === want) startChain();
    else card(want, `Read. Open Fiverr's ${SECS[want].label} page, then click Fill (or paste again).`, true);
  } catch (e) { card(CARD_OF[k], "Read. " + e.message, true); }
}
for (const k of BOXES) {
  $("t-" + k).addEventListener("input", () => onType(k));
  $("t-" + k).addEventListener("paste", () => setTimeout(() => afterPaste(k), 150));
}
// the optional whole-gig box splits into the five boxes
function spread() {
  const parts = P.distribute($("master").value);
  for (const k of BOXES) if (parts[k]) $("t-" + k).value = parts[k];
  BOXES.forEach(readBox); render(); saveBoxes();
  if (!Object.values(parts).some(Boolean)) status("I couldn't find sections (Gig title, Packages, Description…) in that text. Paste each part into its own box instead.");
  else status("Split into the boxes below. Check them.", true);
}
$("master").addEventListener("paste", () => setTimeout(async () => { spread(); if ($("onpaste").checked) { try { await page("DETECT", {}); startChain(); } catch {} } }, 150));
$("master").addEventListener("input", () => { clearTimeout(timers.m); timers.m = setTimeout(spread, 600); });
$("clear").onclick = () => { for (const k of BOXES) { $("t-" + k).value = ""; } $("master").value = ""; BOXES.forEach(readBox); render(); saveBoxes(); };

// ---- switches and saved texts
for (const id of ["onpaste", "auto"]) { chrome.storage.local.get(id).then(v => { if (id in v) $(id).checked = v[id]; }); $(id).onchange = () => chrome.storage.local.set({ [id]: $(id).checked }); }
chrome.storage.local.get(["boxes", "scan"]).then(v => {
  SCAN = v.scan || null; showScanInfo();
  if (v.boxes) { for (const k of BOXES) $("t-" + k).value = v.boxes[k] || ""; $("master").value = v.boxes.master || ""; }
  BOXES.forEach(readBox); render();
});

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
      SCAN = { at: Date.now(), items: [...items] }; await chrome.storage.local.set({ scan: SCAN }); showScanInfo();
    }
    if (!items.length) throw new Error("Nothing was scanned.");
    status(`${STOPSCAN ? "Stopped. Saved" : "Done. Saved"} ${items.length} subcategories. Reload the Fiverr page before filling, because the scan changed the dropdowns.`, true);
    render();
  } catch (e) { status(e.message); }
  finally { this.disabled = false; $("stopScan").hidden = true; }
};
$("stopScan").onclick = () => { STOPSCAN = true; status("Stopping after this category…"); };

wireAi();

$("scan").onclick = async () => {
  try { const r = await page("SCAN", {}); await navigator.clipboard.writeText(JSON.stringify(r, null, 1)); status(`Copied a report of ${r.fields.length} fields. Paste it in the chat.`, true); }
  catch (e) { status(e.message); }
};
