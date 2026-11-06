// Side panel opens from the toolbar icon. Optional AI (Gemini) lives here; nothing is called unless the user saved a key and uses an AI button/switch.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const GEM = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const TEMP = new Set([0, 429, 500, 502, 503, 504]);
let thinkingOK = true;                       // ask Gemini not to "think" (faster); dropped automatically if the model rejects it

async function callOnce(model, key, system, user, maxTokens) {
  const gc = { responseMimeType: "application/json", maxOutputTokens: Math.max(maxTokens, 2048), temperature: 0.7 };
  if (thinkingOK) gc.thinkingConfig = { thinkingBudget: 0 };
  let res;
  try {
    res = await fetch(`${GEM}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system + "\nRespond with ONLY valid JSON." }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: gc
      })
    });
  } catch (e) { return { ok: false, status: 0, text: async () => String(e?.message || e) }; }
  if (res.status === 400 && thinkingOK && /thinking/i.test(await res.clone().text())) { thinkingOK = false; return callOnce(model, key, system, user, maxTokens); }
  return res;
}

async function firstFlashModel(key, not) {      // when the configured model is gone, pick another Flash model the key can use
  try {
    const r = await fetch(`${GEM}?pageSize=100`, { headers: { "x-goog-api-key": key } });
    return ((await r.json()).models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""))
      .find(n => /flash/.test(n) && !/image|tts|live|audio|embedding/.test(n) && n !== not) || null;
  } catch { return null; }
}

async function gemini(system, user, maxTokens = 3000) {
  const { geminiKey, geminiModel } = await chrome.storage.local.get(["geminiKey", "geminiModel"]);
  if (!geminiKey) throw new Error("Add your Gemini API key in the AI settings first.");
  let model = geminiModel || DEFAULT_MODEL, res, switched = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await callOnce(model, geminiKey, system, user, maxTokens);
    if (res.ok) break;
    if (res.status === 404 && !switched) { const m = await firstFlashModel(geminiKey, model); switched = true; if (m) { model = m; continue; } }
    if (!TEMP.has(res.status)) break;
    await sleepMs(1500 * 2 ** Math.min(attempt, 2));
  }
  if (!res.ok) {
    const t = (await res.text()).slice(0, 300);
    if (res.status === 0) throw new Error(`Can't reach Google's Gemini service (${t.slice(0, 80)}). Check your internet, VPN, firewall or ad-blocker.`);
    if (res.status === 400 && /api key/i.test(t)) throw new Error("Google rejected the Gemini API key. Check it in the AI settings.");
    if (res.status === 403) throw new Error("Google refused the request (403). The key may not be allowed to use Gemini.");
    if (res.status === 404) throw new Error(`Gemini model "${model}" was not found. Type a current model name in the AI settings.`);
    if (res.status === 429) throw new Error("Gemini rate limit reached. Wait a minute and try again.");
    throw new Error(`Gemini API ${res.status}: ${t}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  try { return JSON.parse(text); }
  catch { const s = text.search(/[{[]/), e = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")); return JSON.parse(text.slice(s, e + 1)); }
}

const RULES = `Write for Fiverr. Use the seller's own facts. NEVER invent credentials, years of experience, clients, results, awards, certifications or reviews. No emails, phone numbers, links, or WhatsApp/Telegram/Skype/Discord mentions anywhere, no prices inside descriptions, no guarantees. Plain natural English, no emojis, no hype.
Limits: title starts with "I will" and is at most 80 characters; tags exactly 5, letters/numbers/spaces only, at most 20 characters each; package name at most 25 characters; package description at most 100 characters; gig description at most 1200 characters including spaces; FAQ question at most 100 and answer at most 300 characters; each buyer requirement at most 380 characters on one line.`;

const SHAPES = {
  ov: `"ov":{"title":"I will ...","category":"","subcategory":"","serviceType":"","meta":{"<Field name, e.g. Software>":["value"]},"tags":["","","","",""]}`,
  pr: `"pr":{"packages":[{"tier":"basic","name":"","price":0,"days":0,"revisions":0,"description":"","includes":["short bullet"]},{"tier":"standard",...},{"tier":"premium",...}]}  (price in whole USD, rising from basic to premium; scope rising too)`,
  ds: `"ds":{"description":"hook, bullet list with •, how you work, an invitation to message before ordering, closing line","faq":[{"question":"","answer":""}]}  (4-5 FAQs)`,
  rq: `"rq":{"requirements":["question? Options: A / B / C"]}  (4-6 questions; fold any answer choices into the same line as "Options: A / B / C")`
};

const handlers = {
  async ping() { return gemini('Reply with the JSON {"ok":true}', "ping", 50); },

  // notes -> the requested boxes (ov, pr, ds, rq) in structured form
  async generate({ boxes, notes, ctx, taxonomy }) {
    const tax = taxonomy?.length ? `\nChoose "category" and "subcategory" ONLY from this real Fiverr list, copied exactly (Category > Subcategory):\n${taxonomy.slice(0, 700).map(t => `${t.category} > ${t.subcategory}`).join("\n")}` : "";
    return gemini(
      `You are a senior Fiverr gig writer. Turn the seller's notes into the requested parts of a gig.\n${RULES}${tax}\nIf the notes already contain a part (a title, prices, a description, questions), KEEP the seller's wording and only fix what breaks a limit. Fill gaps in the seller's style.\nReturn JSON with exactly these keys: ${boxes.join(", ")}.\n${boxes.map(b => SHAPES[b]).join("\n")}`,
      `Seller's notes:\n${notes || "(none)"}\n\nOther parts of the gig already written (for consistency):\n${ctx || "(none)"}`, 6000);
  },

  // choose the category path (from candidates, or free-form names that the page will then verify)
  async chooseCategory({ gig, candidates }) {
    return gemini(
      `You choose where a Fiverr gig belongs. ${candidates?.length ? "Pick exactly ONE of the numbered candidates and return its index." : "Name the best Fiverr category, subcategory and service type."}\nThe main service is the strongest signal, not isolated keywords.\nShape: {"index":0,"category":"","subcategory":"","serviceType":"","reason":"one sentence"}`,
      `Gig:\n${gig}\n\n${candidates?.length ? "Candidates:\n" + candidates.map((c, i) => `${i}. ${c}`).join("\n") : ""}`, 600);
  },

  async pick({ label, options, gig, target, strict }) {
    return gemini(
      `You choose one option in a Fiverr gig form dropdown. Pick only from the options, copied exactly. If a TARGET is given choose the option meaning the same. ${strict ? 'If nothing fits, answer "NONE".' : "If nothing is equivalent, pick the closest real option."} Never choose an unrelated option.\nShape: {"choice":"option or NONE"}`,
      `Gig:\n${gig}\nTARGET: ${target || "(none)"}\nDropdown: ${label || "(unlabelled)"}\nOptions:\n${options.map(o => "- " + o).join("\n")}`, 300);
  },

  async pickMany({ label, options, gig, wanted, max }) {
    return gemini(
      `You choose which checkbox options of a Fiverr gig's metadata clearly apply to the gig. Pick 0 to ${max || 5} options, only from the list, copied exactly. Only options that clearly apply to the gig's main service; if none do, return an empty list. Never pick unrelated technologies (for example web frameworks for an architecture gig).\nShape: {"choices":["option"]}`,
      `Gig:\n${gig}\nValues the seller already listed: ${(wanted || []).join(", ") || "none"}\nGroup: ${label || "(unlabelled)"}\nOptions:\n${options.map(o => "- " + o).join("\n")}`, 400);
  },

  async matrix({ gig, packages, rows }) {
    return gemini(
      `You fill the feature grid of a Fiverr gig's 3 packages (basic, standard, premium). For each row give 3 booleans, one per package. Tick a feature only if the seller's package text supports it; when unsure use false.\nShape: {"rows":[{"index":0,"values":[false,true,true]}]}`,
      `Gig:\n${gig}\nPackages:\n${packages.map((p, i) => `${i + 1}. ${p.name} ($${p.price}): ${p.description}. Includes: ${(p.includes || []).join("; ") || "n/a"}`).join("\n")}\nRows:\n${rows.map((r, i) => `${i}. ${r.label}`).join("\n")}`, 1500);
  }
};

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  const h = msg && msg.ai && handlers[msg.ai];
  if (!h) return;
  h(msg.payload || {}).then(r => send({ ok: true, result: r })).catch(e => send({ ok: false, error: e.message }));
  return true;
});
