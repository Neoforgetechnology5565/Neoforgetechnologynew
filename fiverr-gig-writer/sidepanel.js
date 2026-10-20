const $ = id => document.getElementById(id);
const S = { titles: [], pricing: [], image: null, faq: [], hints: "", cat: null, scanned: null };
let TAX = window.DEFAULT_TAXONOMY;
const KEYS = ["keywords", "notes", "scope", "days", "budget", "style", "desc", "req"];

const status = (m, ok) => { $("status").textContent = m; $("status").className = ok ? "ok" : ""; };
const kw = () => $("keywords").value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 5);
const chosen = name => document.querySelector(`input[name=${name}]:checked`)?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ai(action, payload, btn) {
  if (btn) btn.disabled = true; status("Working…", true);
  try {
    const r = await chrome.runtime.sendMessage({ action, payload });
    if (!r.ok) throw new Error(r.error);
    status("Done.", true); return r.result;
  } catch (e) { status(e.message); throw e; } finally { if (btn) btn.disabled = false; }
}
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
const title = () => chosen("title");
const ctx = () => `${S.cat?.analysisText || ""}\n${S.hints || ""}\n${$("scope").value}\n${$("desc").value}`.trim().slice(0, 1200);
const esc = x => String(x ?? "").replace(/"/g, "&quot;");

// ---- persistence / tabs / settings
chrome.storage.local.get(["geminiKey", "textModel", "form", "taxonomy", "scanned"]).then(s => {
  if (Array.isArray(s.taxonomy) && s.taxonomy.length) TAX = s.taxonomy;
  if (s.scanned?.items?.length) { TAX = s.scanned.items; S.scanned = s.scanned; }
  showScanInfo();
  $("taxJson").value = JSON.stringify(TAX, null, 1);
  $("textModel").value = s.textModel || ""; $("geminiKey").value = s.geminiKey || "";
  KEYS.forEach(k => s.form?.[k] && ($(k).value = s.form[k]));
  if (!s.geminiKey) $("settings").hidden = false; counts();
});
KEYS.forEach(k => $(k).addEventListener("input", () => {
  chrome.storage.local.set({ form: Object.fromEntries(KEYS.map(x => [x, $(x).value])) }); counts();
}));
const counts = () => $("dlen").textContent = `${$("desc").value.length}/1200`;
$("gear").onclick = () => $("settings").hidden = !$("settings").hidden;
$("saveSettings").onclick = async () => {
  const msg = (t, ok) => { $("saveMsg").textContent = t; $("saveMsg").style.color = ok ? "#117a45" : "#b00"; };
  const key = $("geminiKey").value.trim();
  if (!key) return msg("Paste your key first.");
  try {
    await chrome.storage.local.set({ textModel: $("textModel").value.trim(), geminiKey: key });
    const back = await chrome.storage.local.get("geminiKey");
    if (back.geminiKey !== key) return msg("Could not save to Chrome storage. Reload the extension and try again.");
    msg("Saved. Testing key…", true);
    const r = await chrome.runtime.sendMessage({ action: "ping", payload: {} });
    msg(r.ok ? "Saved ✓ Key works." : "Saved, but the key test failed: " + r.error, r.ok);
  } catch (e) { msg("Error: " + e.message); }
};
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".step").forEach(s => s.hidden = s.id !== "s" + b.dataset.step);
});

// ---- 1 overview
$("genTitles").onclick = async function () {
  if (kw().length < 1) return status("Enter your keywords first.");
  const r = await ai("titles", { keywords: kw(), notes: $("notes").value }, this);
  $("titles").innerHTML = r.titles.map((t, i) =>
    `<label><input type="radio" name="title" value="${t.replace(/"/g, "&quot;")}" ${i ? "" : "checked"}>${t}</label>`).join("");
  $("fillOverview").disabled = false;
};
$("fillOverview").onclick = async function () {
  this.disabled = true;
  try {
    const t = title(), tags = kw();
    const long = tags.filter(x => x.length > 20);
    const r = await page("FILL_OVERVIEW", { title: t, tags });
    if (!r.filled.length) status("Couldn't find the title/tag boxes. Click \"Scan page\" at the bottom and send me the result.");
    else status(`Filled ${r.filled.join(", ")}. Picking categories…`, true);
    const plan = await ensureCategory();                  // {category, subcategory, serviceType, metadata}
    await sleep(2500);                                    // Fiverr suggests categories from the title
    const sg = (await page("READ_SUGGESTIONS", {})).items || [];
    let usedSuggestion = false;
    for (const x of sg) {                                 // use a Fiverr suggestion only if it matches our analysis
      const [sc, ss] = x.text.split(/\s*[>›»]\s*/);
      if (sc && ss && bestMatch(plan.category, [sc]) && bestMatch(plan.subcategory, [ss])) {
        await page("CLICK_SUGGESTION", { id: x.id }); usedSuggestion = true; await sleep(1200);
        status(`Used Fiverr's suggested category: ${x.text}`, true); break;
      }
    }
    if (!usedSuggestion && sg.length) status(`Fiverr suggests: ${sg.map(x => x.text).join("; ")}. Using ${plan.category} › ${plan.subcategory} from your gig instead.`, true);
    for (let i = 0; i < 8; i++) {                         // category -> subcategory -> service type -> ...
      const d = await page("NEXT_DROPDOWN", {});
      if (!d.found) break;
      const kind = /sub\s*-?\s*categor/i.test(d.label) ? "subcategory" : /categor/i.test(d.label) ? "category" : /service\s*type/i.test(d.label) ? "serviceType" : "other";
      const target = plan[kind];
      let choice = target ? bestMatch(target, d.options) : null, note = "";
      if (!choice) {
        const strict = kind === "category" || kind === "subcategory";
        const p = await chrome.runtime.sendMessage({ action: "pick", payload: { label: d.label, options: d.options, title: t, keywords: tags, context: ctx(), target, strict, fiverrSuggestions: sg.map(x => x.text) } });
        if (!p.ok) throw new Error(p.error);
        choice = d.options.find(o => norm(o) === norm(p.result.choice)) || null;   // must be a real option on the page
        if (!choice && strict) throw new Error(`Fiverr's list has no ${kind} matching "${target}". Choose it yourself on the page (options include: ${d.options.slice(0, 8).join(", ")}), then click Fill this Fiverr page again.`);
        if (choice && target) note = " (closest available option)";
      }
      if (choice) { await page("CHOOSE_OPTION", { id: d.id, text: choice }); status(`${d.label || "Dropdown"}: ${choice}${note}`, true); }
      await sleep(900);
    }
    status("Selecting gig metadata…", true);
    for (let i = 0; i < 10; i++) {                      // metadata tabs -> checkbox lists
      const c = await page("NEXT_CHECKS", {});
      if (c.found) {
        const p = await chrome.runtime.sendMessage({ action: "pickMany", payload: { label: c.label, options: c.options.map(o => o.text), title: t, keywords: tags, max: 4, context: ctx(), guidance: S.cat?.analysisText + " Relevant metadata: " + ($("catMeta").value || "n/a") } });
        if (!p.ok) throw new Error(p.error);
        const want = p.result.choices.map(x => x.trim().toLowerCase());
        const ids = c.options.filter(o => want.includes(o.text.trim().toLowerCase())).map(o => o.id);
        await page("CHOOSE_CHECKS", { ids });
        status(`${c.label || "Metadata"}: ${p.result.choices.join(", ")}`, true);
        await sleep(600);
      }
      const tab = await page("NEXT_TAB", {});
      if (!tab.clicked && !c.found) break;
      await sleep(800);
    }
    status("Overview filled. Check it (especially Gig metadata), then click Next on Fiverr." + (long.length ? ` Note: Fiverr tags max 20 chars: ${long.join(", ")}` : ""), true);
  } catch (e) { status(e.message); } finally { this.disabled = false; }
};

// ---- 2 pricing
$("genPricing").onclick = async function () {
  if (!title()) return status("Pick a title in step 1 first.");
  if (!$("scope").value.trim()) return status("Describe your scope first.");
  const r = await ai("pricing", { title: title(), scope: $("scope").value, days: $("days").value, budget: $("budget").value }, this);
  S.pricing = r.options;
  $("pricing").innerHTML = r.options.map((o, i) => `<label><input type="radio" name="price" value="${i}" ${i ? "" : "checked"}><b>${o.label}</b>
    <small>${["basic", "standard", "premium"].map(k => `${o[k].name}: $${o[k].price}, ${o[k].days} days\n  ${o[k].description}`).join("\n")}</small></label>`).join("");
  $("fillPricing").disabled = false;
};
$("fillPricing").onclick = async function () {
  try {
    const o = S.pricing[chosen("price")];
    let pk = [o.basic, o.standard, o.premium].map(p => ({ ...p }));
    const adj = [], min = (await page("MIN_PRICE", {})).min;          // Fiverr shows a minimum package price
    if (min && $("improve").checked) pk.forEach((p, i) => {
      const was = Number(p.price); let np = Math.max(was, min);
      if (i && np <= pk[i - 1].price) np = Math.round(pk[i - 1].price * 2.5 / 10) * 10;
      if (np !== was) adj.push(`${["Basic", "Standard", "Premium"][i]} $${was} → $${np}`); p.price = np;
    });
    const r = await page("FILL_PRICING", { packages: pk });
    status(`Filled: ${r.filled.join(", ") || "nothing found"}. Now ticking features…`, !!r.filled.length);
    const g = await page("PRICING_ROWS", {});
    if (g.rows.length) {
      const m = await chrome.runtime.sendMessage({ action: "matrix", payload: { title: title(), scope: $("scope").value, packages: pk, rows: g.rows } });
      if (!m.ok) throw new Error(m.error);
      const apply = m.result.rows.map(x => ({ ...g.rows[x.index], values: x.values })).filter(x => x.ids);
      const a = await page("PRICING_APPLY", { rows: apply });
      status(`Filled pricing and ${g.rows.length} feature rows (${a.count} changes). Check everything, then click Next on Fiverr.`, true);
      if (min && !$("improve").checked && pk.some(p => Number(p.price) < min)) status(`Fiverr requires package prices of at least $${min}, but your paste has ${pk.map(p => "$" + p.price).join(" / ")}. I left your prices as pasted. Change them on the page or in your paste (or tick "Let AI write / improve for me"), then continue.`);
      else if (adj.length) status(`Filled pricing and features. Raised prices to Fiverr's $${min} minimum: ${adj.join(", ")}. Check everything.`, true);
    } else status("Pricing filled, but I couldn't find the feature tick boxes. Tick them by hand, or click Scan page and send me the result.", true);
  } catch (e) { status(e.message); }
};

// ---- 3 description
$("genDesc").onclick = async function () {
  if (!title()) return status("Pick a title in step 1 first.");
  const r = await ai("description", { title: title(), keywords: kw(), scope: $("scope").value, style: $("style").value }, this);
  $("desc").value = r.description; counts(); $("fillDesc").disabled = false;
};
$("fillDesc").onclick = async () => {
  try {
    const r = await page("FILL_DESCRIPTION", { text: $("desc").value });
    if (!r.ok) return status("Couldn't find the description box.");
    if ($("desc").value.length > 1200) return status(`Description filled, but it is ${$("desc").value.length} characters and Fiverr's limit is 1200, so Fiverr will not accept it. Shorten it in your paste (or tick "Let AI write / improve for me"), then continue.`);
    let msg = "Description filled.";
    if (S.faq?.length) { const f = await page("FILL_FAQ", { items: S.faq }); msg += ` Added ${f.count} of ${S.faq.length} FAQs.`; }
    status(msg + " Check it, then click Next on Fiverr.", true);
  } catch (e) { status(e.message); }
};

// ---- 4 requirements
$("genReq").onclick = async function () {
  if (!title()) return status("Pick a title in step 1 first.");
  const r = await ai("requirements", { title: title(), scope: $("scope").value }, this);
  $("req").value = r.requirements.join("\n"); $("fillReq").disabled = false;
};
$("fillReq").onclick = async () => {
  try { const items = $("req").value.split("\n").map(s => s.trim()).filter(Boolean);
    const r = await page("FILL_REQUIREMENTS", { items });
    status(`Filled ${r.count} of ${items.length} questions. Check it, then click Next on Fiverr.`, r.count > 0);
  } catch (e) { status(e.message); }
};

// ---- 5 gallery
// ---- 5 gallery: the user's own images, saved in this browser (IndexedDB)
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("fgw", 1); r.onupgradeneeded = () => r.result.createObjectStore("imgs", { autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbAll = async () => { const db = await idb(); return new Promise(res => { const out = []; const c = db.transaction("imgs").objectStore("imgs").openCursor(); c.onsuccess = e => { const cur = e.target.result; if (cur) { out.push({ key: cur.key, blob: cur.value }); cur.continue(); } else res(out); }; }); };
const idbAdd = async blob => { const db = await idb(); return new Promise(res => { const t = db.transaction("imgs", "readwrite"); t.objectStore("imgs").add(blob); t.oncomplete = res; }); };
const idbDel = async key => { const db = await idb(); return new Promise(res => { const t = db.transaction("imgs", "readwrite"); t.objectStore("imgs").delete(key); t.oncomplete = res; }); };
const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

async function renderImgs() {
  const list = await idbAll();
  $("thumbs").innerHTML = "";
  list.forEach(({ key, blob }) => {
    const d = document.createElement("div"), img = document.createElement("img"), x = document.createElement("b");
    img.src = URL.createObjectURL(blob); x.textContent = "×"; x.title = "Remove";
    x.onclick = async () => { await idbDel(key); renderImgs(); };
    d.append(img, x); $("thumbs").append(d);
  });
  $("uploadImg").disabled = !list.length;
  return list;
}
async function addImages(files) {
  let have = (await idbAll()).length;
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    if (have >= 3) { status("Fiverr allows 3 gig images. Remove one first."); break; }
    await idbAdd(f); have++;
  }
  renderImgs();
}
$("imgFiles").onchange = async e => { await addImages([...e.target.files]); e.target.value = ""; };
document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); addImages(f); } });
renderImgs();

async function uploadSaved() {
  const list = await idbAll();
  if (!list.length) return { count: 0 };
  const images = await Promise.all(list.map(async ({ blob }, i) => ({ dataUrl: await toDataUrl(blob), name: blob.name || `gig-${i + 1}.png`, type: blob.type })));
  return page("UPLOAD_IMAGES", { images });
}
$("uploadImg").onclick = async () => {
  try { status("Uploading…", true); const r = await uploadSaved();
    status(r.count ? `Added ${r.count} image(s). Wait for Fiverr to finish uploading, check them, then click Save & Continue.` : "I couldn't find the image upload box on this page.", !!r.count);
  } catch (e) { status(e.message); }
};

$("scan").onclick = async () => {
  try { const r = await page("SCAN", {});
    await navigator.clipboard.writeText(JSON.stringify(r, null, 1));
    status(`Scanned ${r.fields.length} fields. Copied to clipboard. Paste it to me in the chat.`, true);
  } catch (e) { status(e.message); }
};

// ---- 0 paste from ChatGPT
$("parsePaste").onclick = async function () {
  const text = $("paste").value.trim();
  if (!text) return status("Paste your notes or gig text first.");
  const g = await ai("parsePaste", { text, exact: !$("improve").checked }, this);
  S.faq = g.faq || []; S.hints = g.categoryHints || "";
  const set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event("input")); };
  const warn = [];
  if (g.title) {
    $("titles").innerHTML = `<label><input type="radio" name="title" value="${esc(g.title)}" checked>${g.title}</label>`;
    $("fillOverview").disabled = false;
    if (g.title.length > 80) warn.push("title is over 80 characters");
  }
  set("keywords", (g.tags || []).join(", "));
  set("scope", g.scope || g.description || "");
  if ((g.packages || []).length === 3) {
    const [a, b, c] = g.packages; S.pricing = [{ label: "From your paste", basic: a, standard: b, premium: c }];
    $("pricing").innerHTML = `<label><input type="radio" name="price" value="0" checked><b>From your paste</b><small>${g.packages.map(p => `${p.name}: $${p.price}, ${p.days} days\n  ${p.description}`).join("\n")}</small></label>`;
    $("fillPricing").disabled = false;
  }
  set("desc", g.description || ""); if (g.description) { $("fillDesc").disabled = false; if (g.descriptionOriginalLength) warn.push(`description was ${g.descriptionOriginalLength} characters, shortened to ${g.description.length} (Fiverr max 1200)`); }
  set("req", (g.requirements || []).join("\n")); if ((g.requirements || []).length) $("fillReq").disabled = false;
  $("pasteSummary").textContent = [
    `Title: ${g.title || "(none found)"}`, `Tags: ${(g.tags || []).join(", ") || "(none)"}`,
    `Packages: ${(g.packages || []).length === 3 ? g.packages.map(p => `${p.name} $${p.price}/${p.days}d`).join(" / ") : "(not found)"}`,
    `Description: ${(g.description || "").length} chars`, `FAQs: ${S.faq.length}`, `Requirements: ${(g.requirements || []).length}`,
    warn.length ? "⚠ " + warn.join("; ") : "", ...(g.warnings || []).map(w => "⚠ " + w)].filter(Boolean).join("\n");
  $("fillThis").disabled = false;
  S.noteText = (g.notes || []).join("; ");
  if (S.noteText) $("pasteSummary").textContent += "\nFixed for Fiverr: " + S.noteText;
  if (!$("improve").checked && (g.warnings || []).some(w => /characters \(Fiverr max|tags; Fiverr/.test(w))) S.overLimit = true; else S.overLimit = false;
  status("Gig written. Analyzing the category…", true);
  try { await runCategorize(); }
  catch (e) { return status("Gig written, but the category analysis failed: " + e.message + " Choose the category below, then click Fill this Fiverr page."); }
  const conf = S.cat?.chosen?.confidence ?? 0;
  if (conf < 0.75) return status(`Gig written. I'm not sure about the category (${Math.round(conf * 100)}% confidence). Pick one of the suggestions below or change it, then click Fill this Fiverr page.`);
  status("Gig written." + ($("auto").checked ? " Filling the current Fiverr page…" : " Open a Fiverr gig page and click Fill this Fiverr page."), true);
  if ($("auto").checked) { try { await page("DETECT", {}); $("fillThis").onclick(); } catch { status("Gig written. Open your Fiverr gig page, then click Fill this Fiverr page again."); } }
};

const FILL = { overview: "fillOverview", pricing: "fillPricing", description: "fillDesc", requirements: "fillReq" };
async function fillCurrent() {
  const { page: p } = await page("DETECT", {});
  if (p === "gallery") {
    const r = await uploadSaved();
    return { p, stop: r.count ? `Gallery: added ${r.count} of your saved image(s). Wait for the uploads to finish, check everything, then click Save & Continue and Publish yourself.` : "Reached the Gallery page. Add your images in the Gallery tab (or drag them in), then click Save & Continue yourself." };
  }
  if (!FILL[p]) return { p, stop: "I can't tell which Fiverr page this is. Open Overview, Pricing, Description or Requirements." };
  const btn = $(FILL[p]);
  if (btn.disabled) return { p, stop: `Your paste has nothing for the ${p} page.` };
  status(`Detected the ${p} page. Filling…`, true);
  await btn.onclick.call(btn);
  return { p, ok: $("status").className === "ok", msg: $("status").textContent };
}

$("fillThis").onclick = async () => {
  S.stop = false;
  try {
    if (!$("auto").checked) { const r = await fillCurrent(); if (r.stop) status(r.stop); return; }
    $("stopAuto").hidden = false; $("fillThis").disabled = true;
    for (let i = 0; i < 6 && !S.stop; i++) {
      const r = await fillCurrent();
      if (r.stop) return status(r.stop);
      if (!r.ok) return status(`Stopped on the ${r.p} page: ${r.msg || "it wasn't filled completely"}`);
      if (S.stop) break;
      await sleep(800);
      const n = await page("CLICK_NEXT", {});
      if (!n.clicked) return status(`Filled the ${r.p} page but stopped: ${n.reason}. Check the page for missing fields.`);
      let moved = false;                                   // wait for Fiverr to load the next page
      for (let t = 0; t < 20 && !S.stop; t++) { await sleep(700); try { if ((await page("DETECT", {})).page !== r.p) { moved = true; break; } } catch {} }
      if (!moved) return status(`Clicked "${n.clicked}" but Fiverr stayed on the ${r.p} page. A required field is probably missing. Check the page.`);
      await sleep(1500);
    }
    status(S.stop ? "Stopped." : "Auto-continue finished. Check the page before going on.", true);
  } catch (e) { status(e.message); }
  finally { $("stopAuto").hidden = true; $("fillThis").disabled = false; }
};
$("stopAuto").onclick = () => { S.stop = true; status("Stopping after the current step…"); };

// ---- category analysis: recommend category / subcategory / service type / metadata, editable by hand
const norm = x => String(x ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = x => new Set(norm(x).split(" ").filter(w => w && !["and", "the", "of", "a", "for"].includes(w)).map(w => w.replace(/s$/, "")));
function bestMatch(target, options) {              // fuzzy match of a wanted name against Fiverr's real options
  const t = norm(target); let best = null, top = 0;
  for (const o of options) {
    const n = norm(o); if (n === t) return o;
    const A = toks(target), B = toks(o), inter = [...A].filter(w => B.has(w)).length;
    const sc = Math.max(inter / (new Set([...A, ...B]).size || 1), (n.includes(t) || t.includes(n)) ? 0.7 : 0);
    if (sc > top) { top = sc; best = o; }
  }
  return top >= 0.6 ? best : null;
}
const uniq = a => [...new Set(a)];
function fillSel(sel, values, cur) { sel.innerHTML = values.map(v => `<option>${esc(v)}</option>`).join(""); if (cur && values.includes(cur)) sel.value = cur; else if (values.length) sel.value = values[0]; }
function refreshST(st, keepMeta) {
  const rows = TAX.filter(t => t.category === $("catCat").value && t.subcategory === $("catSub").value);
  const sts = uniq(rows.flatMap(t => t.serviceTypes || [])); if (st && !sts.includes(st)) sts.push(st);
  fillSel($("catST"), sts, st);
  if (!keepMeta) $("catMeta").value = uniq(rows.flatMap(t => t.metadata || [])).join(", ");
}
function refreshSub(sub, st, keepMeta) {
  const subs = uniq(TAX.filter(t => t.category === $("catCat").value).map(t => t.subcategory)); if (sub && !subs.includes(sub)) subs.push(sub);
  fillSel($("catSub"), subs, sub); refreshST(st, keepMeta);
}
function renderCategory(c) {
  const cats = uniq(TAX.map(t => t.category)); if (c.category && !cats.includes(c.category)) cats.push(c.category);
  fillSel($("catCat"), cats, c.category); refreshSub(c.subcategory, c.serviceType, true);
  $("catMeta").value = (c.metadataFields || []).join(", ");
  $("catTags").textContent = `Suggested tags: ${(c.searchTags || []).join(", ") || "-"}\nPositive keywords: ${(c.positiveKeywords || []).join(", ") || "-"}`;
  $("catBox").hidden = false;
}
function renderCandidates() {
  const c = S.cat; if (!c) return;
  const low = (c.chosen?.confidence ?? 0) < 0.75;
  $("catWhy").textContent = `Main service: ${c.mainService || "?"}\nConfidence: ${Math.round((c.chosen?.confidence ?? 0) * 100)}%${low ? " (low, please choose)" : ""}. ${c.chosen?.reason || ""}${c.ambiguity ? "\nAmbiguity: " + c.ambiguity : ""}${c.chosen?.inMapping === false ? "\nThis path is not in my mapping list; it will only be used if Fiverr actually shows it." : ""}`;
  $("catCands").innerHTML = c.candidates.map((x, i) => `<label><input type="radio" name="cand" value="${i}" ${x === c.chosen ? "checked" : ""}><b>${Math.round(x.confidence * 100)}%</b> ${esc(x.category)} › ${esc(x.subcategory)} › ${esc(x.serviceType)}<small>${esc(x.reason)}</small></label>`).join("");
  $("catCands").querySelectorAll("input").forEach(r => r.onchange = () => { c.chosen = c.candidates[r.value]; c.manual = false; c.analysisText = analysisOf(c); renderCategory(c.chosen); renderCandidates(); });
}
const analysisOf = c => `Main service: ${c.mainService}. Deliverables: ${(c.deliverables || []).join(", ")}. Tools: ${(c.tools || []).join(", ")}. Industry: ${c.industry}. Category: ${c.chosen?.category} > ${c.chosen?.subcategory} > ${c.chosen?.serviceType}.`;
async function runCategorize() {
  const pk = S.pricing[0] ? [S.pricing[0].basic, S.pricing[0].standard, S.pricing[0].premium].map(p => p.name).join(", ") : "";
  const r = await ai("categorize", { title: title() || "", scope: $("scope").value, description: $("desc").value.slice(0, 1200), packages: pk, hints: S.hints,
    taxonomy: TAX.map(t => ({ category: t.category, subcategory: t.subcategory, serviceTypes: t.serviceTypes })), verified: !!S.scanned });
  r.candidates = (r.candidates || []).map(x => ({ ...x, confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)) })).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  if (!r.candidates.length) throw new Error("No category suggestions came back.");
  r.chosen = r.candidates[0]; r.manual = false; r.analysisText = analysisOf(r); S.cat = r;
  renderCategory(r.chosen); renderCandidates();
}
const readCat = () => ({ category: $("catCat").value, subcategory: $("catSub").value, serviceType: $("catST").value, metadata: $("catMeta").value.split(",").map(x => x.trim()).filter(Boolean) });
async function ensureCategory() {                  // used before filling the Overview page
  if (!S.cat) { await runCategorize(); }
  if (!S.cat.manual && (S.cat.chosen?.confidence ?? 0) < 0.75) {
    document.querySelector('#tabs button[data-step="0"]').click();
    throw new Error("I'm not sure about the category. Choose one of the suggestions in the Paste tab, then fill again.");
  }
  return readCat();
}
const manual = () => { if (S.cat) { S.cat.manual = true; S.cat.chosen = { ...(S.cat.chosen || {}), ...readCat(), confidence: 1 }; S.cat.analysisText = analysisOf(S.cat); } };
$("catCat").onchange = () => { refreshSub(null, null); manual(); };       // changing the category resets incompatible choices
$("catSub").onchange = () => { refreshST(null); manual(); };
$("catST").onchange = manual;
$("catMeta").oninput = () => { if (S.cat) S.cat.manual = true; };
$("reCat").onclick = async function () { try { await runCategorize(); } catch (e) { status(e.message); } };
$("useTags").onclick = () => { const t = S.cat?.chosen?.searchTags; if (t?.length) { $("keywords").value = t.join(", "); $("keywords").dispatchEvent(new Event("input")); status("Tags replaced with the suggested ones.", true); } };
$("saveTax").onclick = async () => {
  try { const v = JSON.parse($("taxJson").value); if (!Array.isArray(v) || !v.every(t => t.category && t.subcategory)) throw new Error("Each item needs category and subcategory.");
    TAX = v; await chrome.storage.local.set({ taxonomy: v }); $("saveMsg").textContent = "Mappings saved."; $("saveMsg").style.color = "#117a45";
  } catch (e) { $("saveMsg").textContent = "Mappings not saved: " + e.message; $("saveMsg").style.color = "#b00"; }
};
$("resetTax").onclick = async () => { TAX = window.DEFAULT_TAXONOMY; await chrome.storage.local.remove("taxonomy"); $("taxJson").value = JSON.stringify(TAX, null, 1); $("saveMsg").textContent = "Mappings reset."; };

// ---- scan Fiverr's real category list (category > subcategory > service type) from the open Create-a-Gig page
function showScanInfo() {
  const sc = S.scanned;
  $("scanInfo").textContent = sc ? `Using the VERIFIED list scanned ${new Date(sc.at).toLocaleString()}: ${uniq(sc.items.map(i => i.category)).length} categories, ${sc.items.length} subcategories.`
    : "Using suggested mappings (not verified). Scan Fiverr to use its real category names.";
}
$("scanTax").onclick = async function () {
  S.stopScan = false; this.disabled = true; $("stopScan").hidden = false;
  const items = [];
  try {
    const init = await page("TAX_INIT", {});
    if (!init.ok) throw new Error("I can't find the empty category and subcategory dropdowns. Open a fresh Create a Gig page (nothing selected) and try again.");
    const cats = (await page("TAX_LIST", { role: "category" })).options;
    if (!cats.length) throw new Error("I couldn't read the category list.");
    for (let i = 0; i < cats.length && !S.stopScan; i++) {
      status(`Scanning ${cats[i]} (${i + 1}/${cats.length})…`, true);
      if (!(await page("TAX_PICK", { role: "category", text: cats[i] })).ok) continue;
      await sleep(1200);
      const subs = (await page("TAX_LIST", { role: "subcategory" })).options;
      for (let j = 0; j < subs.length && !S.stopScan; j++) {
        status(`Scanning ${cats[i]} (${i + 1}/${cats.length}) › ${subs[j]} (${j + 1}/${subs.length})`, true);
        let sts = [];
        if (!(await page("TAX_PICK", { role: "subcategory", text: subs[j] })).ok) continue;
        if ($("scanST").checked) { await sleep(1200); sts = (await page("TAX_LIST", { role: "service" })).options; }
        items.push({ category: cats[i], subcategory: subs[j], serviceTypes: sts });
      }
      if (items.length) { S.scanned = { at: Date.now(), items: [...items] }; await chrome.storage.local.set({ scanned: S.scanned }); }   // keep progress
    }
    if (!items.length) throw new Error("Nothing was scanned.");
    S.scanned = { at: Date.now(), items }; TAX = items; await chrome.storage.local.set({ scanned: S.scanned });
    $("taxJson").value = JSON.stringify(TAX, null, 1); showScanInfo();
    status(`${S.stopScan ? "Stopped. Saved" : "Done. Saved"} ${items.length} subcategories. Reload the Fiverr page before writing a gig, because the scan changed the dropdowns.`, true);
  } catch (e) {
    if (items.length) { S.scanned = { at: Date.now(), items }; TAX = items; await chrome.storage.local.set({ scanned: S.scanned }); showScanInfo(); }
    status(e.message);
  } finally { this.disabled = false; $("stopScan").hidden = true; }
};
$("stopScan").onclick = () => { S.stopScan = true; status("Stopping after this step…"); };
