const $ = id => document.getElementById(id);
const S = { titles: [], pricing: [], image: null };
const KEYS = ["keywords", "notes", "scope", "days", "budget", "style", "imgStyle", "desc", "req", "imgPrompt"];

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

// ---- persistence / tabs / settings
chrome.storage.local.get(["geminiKey", "textModel", "imageModel", "form"]).then(s => {
  $("textModel").value = s.textModel || ""; $("geminiKey").value = s.geminiKey || ""; $("imageModel").value = s.imageModel || "";
  KEYS.forEach(k => s.form?.[k] && ($(k).value = s.form[k]));
  if (!s.geminiKey) $("settings").hidden = false; counts();
});
KEYS.forEach(k => $(k).addEventListener("input", () => {
  chrome.storage.local.set({ form: Object.fromEntries(KEYS.map(x => [x, $(x).value])) }); counts();
}));
const counts = () => $("dlen").textContent = `${$("desc").value.length}/1200`;
$("gear").onclick = () => $("settings").hidden = !$("settings").hidden;
$("saveSettings").onclick = async () => {
  await chrome.storage.local.set({ textModel: $("textModel").value.trim(), geminiKey: $("geminiKey").value.trim(), imageModel: $("imageModel").value.trim() });
  status("Settings saved.", true);
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
    for (let i = 0; i < 8; i++) {                       // category -> subcategory -> service type -> ...
      const d = await page("NEXT_DROPDOWN", {});
      if (!d.found) break;
      const p = await chrome.runtime.sendMessage({ action: "pick", payload: { label: d.label, options: d.options, title: t, keywords: tags } });
      if (!p.ok) throw new Error(p.error);
      await page("CHOOSE_OPTION", { id: d.id, text: p.result.choice });
      status(`${d.label || "Dropdown"}: ${p.result.choice}`, true);
      await sleep(900);
    }
    status("Overview filled. Check it, then click Next on Fiverr." + (long.length ? ` Note: Fiverr tags max 20 chars: ${long.join(", ")}` : ""), true);
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
    const r = await page("FILL_PRICING", { packages: [o.basic, o.standard, o.premium] });
    status(`Filled: ${r.filled.join(", ") || "nothing found"}. Check it, then click Next on Fiverr.`, !!r.filled.length);
  } catch (e) { status(e.message); }
};

// ---- 3 description
$("genDesc").onclick = async function () {
  if (!title()) return status("Pick a title in step 1 first.");
  const r = await ai("description", { title: title(), keywords: kw(), scope: $("scope").value, style: $("style").value }, this);
  $("desc").value = r.description; counts(); $("fillDesc").disabled = false;
};
$("fillDesc").onclick = async () => {
  try { const r = await page("FILL_DESCRIPTION", { text: $("desc").value });
    status(r.ok ? "Description filled. Check it, then click Next on Fiverr." : "Couldn't find the description box.", r.ok);
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
$("genPrompt").onclick = async function () {
  if (!title()) return status("Pick a title in step 1 first.");
  const r = await ai("imagePrompt", { title: title(), keywords: kw(), style: $("imgStyle").value }, this);
  $("imgPrompt").value = r.prompt;
};
$("copyPrompt").onclick = async () => { await navigator.clipboard.writeText($("imgPrompt").value); status("Prompt copied. Paste it into Google Flow / Gemini.", true); };
$("genImg").onclick = async function () {
  if (!$("imgPrompt").value.trim()) return status("Write the image prompt first.");
  const r = await ai("image", { prompt: $("imgPrompt").value }, this);
  S.image = r.dataUrl; $("preview").src = r.dataUrl; $("preview").hidden = false;
  $("uploadImg").disabled = $("dlImg").disabled = false;
};
$("uploadImg").onclick = async () => {
  try { const r = await page("UPLOAD_IMAGE", { dataUrl: S.image });
    status(r.ok ? "Image added to the upload box. Wait for it to finish, then click Next." : "No upload box found. Use Download and upload it manually.", r.ok);
  } catch (e) { status(e.message); }
};
$("dlImg").onclick = () => { const a = document.createElement("a"); a.href = S.image; a.download = "gig-image.png"; a.click(); };

$("scan").onclick = async () => {
  try { const r = await page("SCAN", {});
    await navigator.clipboard.writeText(JSON.stringify(r, null, 1));
    status(`Scanned ${r.fields.length} fields. Copied to clipboard. Paste it to me in the chat.`, true);
  } catch (e) { status(e.message); }
};
