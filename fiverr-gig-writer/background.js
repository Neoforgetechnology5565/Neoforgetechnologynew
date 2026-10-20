chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini text generation (free tier available). Returns parsed JSON.
// Retries temporary errors (429/500/503) with backoff, then falls back to other Flash models.
async function callGemini(model, geminiKey, system, user, maxTokens) {
  return fetch(`${GEMINI}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system + "\nRespond with ONLY valid JSON." }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: Math.max(maxTokens, 4096), temperature: 0.8 }
    })
  });
}
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const TEMP = new Set([429, 500, 502, 503, 504]);

async function fallbackModels(geminiKey, current) {
  try {
    const r = await fetch(`${GEMINI}?pageSize=100`, { headers: { "x-goog-api-key": geminiKey } });
    const list = (await r.json()).models || [];
    return list.filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""))
      .filter(n => /flash/.test(n) && !/image|tts|live|audio|thinking-exp|preview-\d{2}-\d{2}/.test(n) && n !== current)
      .slice(0, 2);
  } catch { return []; }
}

async function claudeJSON(system, user, maxTokens = 2000) {
  const { geminiKey, textModel } = await chrome.storage.local.get(["geminiKey", "textModel"]);
  if (!geminiKey) throw new Error("Add your free Google AI (Gemini) API key in Settings first.");
  const primary = textModel || "gemini-3.8-flash";
  let res, tried = [primary], models = [primary];
  for (let m = 0; m < models.length; m++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await callGemini(models[m], geminiKey, system, user, maxTokens);
      if (res.ok || !TEMP.has(res.status)) break;
      await sleepMs(2000 * 2 ** attempt);               // 2s, 4s, 8s
    }
    if (res.ok || !TEMP.has(res.status)) break;
    if (m === 0) { models.push(...await fallbackModels(geminiKey, primary)); tried = models; }
  }
  if (!res.ok) throw new Error(`Gemini is busy or unavailable (${res.status}) after trying ${tried.join(", ")}. Wait a minute and try again. ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  try { return JSON.parse(text); }
  catch { const s = text.search(/[{[]/), e = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")); return JSON.parse(text.slice(s, e + 1)); }
}

const COPY_RULES = `You write Fiverr gigs that rank in search and convert. Be honest: no fake reviews, numbers, guarantees or claims the seller didn't state. Plain, natural English.`;

const handlers = {
  async ping() { return claudeJSON("Reply with the JSON {\"ok\":true}", "ping", 50); },
  // 5 keywords -> 5 title options
  async titles({ keywords, notes }) {
    return claudeJSON(COPY_RULES + `\nWrite 5 different gig titles. Each starts with "I will", max 80 characters, uses the main keywords naturally, no emojis, no hype. Different angles.
Shape: {"titles":["","","","",""]}`,
      `Keywords: ${keywords.join(", ")}\n${notes ? "Notes: " + notes : ""}`);
  },
  // choose the best option from a dropdown the page actually offers
  async pickMany({ label, options, title, keywords, max, context, guidance }) {
    return claudeJSON(`You choose which checkbox options of a Fiverr gig's metadata clearly apply to the seller's gig. Pick between 0 and ${max || 4} options, only from the list, exactly as written.
Only pick options that clearly apply to the gig's MAIN service. If none clearly apply, return an empty list. Never pick unrelated technologies or tools (for example, web frameworks or programming languages for an architectural drawing gig).
Shape: {"choices":["<option text>"]}`,
      `Gig title: ${title}\nKeywords: ${keywords.join(", ")}\nAbout the gig: ${context || "n/a"}\nAnalysis: ${guidance || "n/a"}\nSection: ${label || "(unlabelled)"}\nOptions:\n${options.map(o => "- " + o).join("\n")}`, 400);
  },
  // Analyse the gig and recommend the Fiverr category path (top 3 with confidence and reasons)
  async categorize({ title, scope, description, packages, hints, taxonomy, verified }) {
    return claudeJSON(`You analyse a Fiverr gig and recommend where it belongs on Fiverr.
First identify: the MAIN service, the deliverables, the target buyers, the tools and the industry. The main service is the strongest signal, NOT isolated keywords (a permit-drawing gig that mentions software is still architecture, not programming). If the gig covers several services choose the dominant one and describe the overlap in "ambiguity".
Then pick the best category path. ${verified ? "The provided list is the REAL, current list of options scanned from Fiverr: choose ONLY paths from it, copying category, subcategory and service type names exactly, and set inMapping true. If nothing fits well, return low confidence instead of inventing a path." : "Prefer paths from the provided suggested mappings."} If none fits, you may propose a path with "inMapping": false, but never present an invented path as certain. Return the 3 best candidates, best first, each with a calibrated confidence from 0 to 1 (lower it when the gig is ambiguous) and a one-sentence reason.
Also give: searchTags (up to 5, lowercase letters/numbers/spaces, max 20 chars each), positiveKeywords (up to 8) and metadataFields (names of metadata fields that are relevant to THIS service only; never list programming languages or web frameworks for non-software gigs).
Shape: {"mainService":"","deliverables":[""],"buyers":"","tools":[""],"industry":"","ambiguity":"","candidates":[{"category":"","subcategory":"","serviceType":"","confidence":0.0,"reason":"","inMapping":true,"searchTags":[""],"positiveKeywords":[""],"metadataFields":[""]}]}`,
      `Title: ${title}\nScope: ${scope || "n/a"}\nPackages: ${packages || "n/a"}\nHints from the seller: ${hints || "n/a"}\nDescription: ${description || "n/a"}\n\n${verified ? "Verified Fiverr options" : "Suggested mappings"} (category > subcategory: service types):\n${(taxonomy || []).map(t => `- ${t.category} > ${t.subcategory}: ${(t.serviceTypes || []).join(", ")}`).join("\n")}`, 3000);
  },
  // Decide which feature rows each package includes (checkbox rows -> true/false, dropdown rows -> option text)
  async matrix({ title, scope, packages, rows }) {
    return claudeJSON(`You fill the feature grid of a Fiverr gig's 3 packages (basic, standard, premium). For every row give 3 values, one per package, in that order.
Rules: only tick a feature that the seller's scope, the package description and its "Includes" list actually support; use the stated number of revisions when given; when unsure use false. Higher packages include everything lower packages include. For "check" rows values are booleans. For "select" rows values are one option copied exactly from that row's options (for revisions, give more in higher packages; pick sensible values).
Shape: {"rows":[{"index":0,"values":[false,true,true]}]}`,
      `Gig: ${title}\nScope: ${scope}\nPackages:\n${packages.map((p, i) => `${i + 1}. ${p.name} ($${p.price}, ${p.days} days, ${p.revisions ?? "?"} revisions): ${p.description}. Includes: ${(p.includes || []).join("; ") || "n/a"}`).join("\n")}\nRows:\n${rows.map((r, i) => `${i}. [${r.kind}] ${r.label}${r.options ? " options: " + r.options.join(" | ") : ""}`).join("\n")}`, 2500);
  },
  // "Write gig": turns ANY pasted text (rough notes or a finished document) into a Fiverr-standard gig
  async parsePaste({ text }) {
    const clean = text.replace(/\\\r?\n/g, "\n").replace(/\\$/gm, "").slice(0, 30000);   // markdown line-break backslashes
    const g = await claudeJSON(`You are a senior Fiverr gig writer. The seller pastes everything they have: it may be rough notes, a few lines, or a finished ChatGPT document. Produce ONE complete, well-structured gig that meets Fiverr's standards.

Rules:
- Use the seller's facts and wording where they exist. If something is missing, write it sensibly in Fiverr style. NEVER invent credentials, years of experience, clients, results, awards, certifications or reviews.
- Ignore portfolio ideas, long keyword lists, checklists and notes to self in the paste.
- title: starts with "I will", max 80 chars, main keyword early, natural wording, no emojis, no hype.
- tags: exactly 5, lowercase letters/numbers/spaces only, max 20 chars each, buyer-search terms.
- scope: 1-3 sentences on exactly what the seller delivers.
- categoryHints: short string naming the best Fiverr category, subcategory, service type, expertise, languages and technologies (use the seller's table if present).
- description: max 1200 characters, plain text, short paragraphs, "•" bullets. Hook for the buyer, what's included, who it's for, why choose the seller, then invite buyers to message before ordering. NO emails, phone numbers, links, or WhatsApp/Telegram/Skype mentions, no prices, no guarantees.
- packages: exactly 3 (basic, standard, premium), each {name max 25 chars, description max 100 chars, days integer, price integer USD, revisions integer, includes [short bullets]}. Use the seller's packages/prices if given, otherwise propose realistic ones. Scope and price must rise from basic to premium.
- faq: 4-5 items {question max 100 chars, answer max 300 chars}.
- requirements: 4-5 buyer questions, each under 380 chars, no line breaks; if a question has answer options, fold them in: "Question? Options: A / B / C".
Shape: {"title":"","categoryHints":"","tags":[],"scope":"","packages":[{"name":"","description":"","days":0,"price":0,"revisions":0,"includes":[]}],"description":"","faq":[{"question":"","answer":""}],"requirements":[]}`,
      clean, 7000);
    const notes = [];
    const cut = (s, n, what) => { s = String(s || "").trim(); if (s.length <= n) return s; notes.push(`${what} shortened to ${n} characters`); return s.slice(0, n).replace(/\s+\S*$/, ""); };
    const strip = t => String(t || "").replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "").replace(/\+?\d[\d\s().-]{8,}\d/g, "").replace(/^.*\b(whatsapp|telegram|skype|discord|wechat)\b.*$/gim, "");
    g.title = cut(String(g.title || "").replace(/^\s*(i will\s+)+/i, "I will "), 80, "Title");
    g.tags = [...new Set((g.tags || []).map(t => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 20).trim()).filter(Boolean))].slice(0, 5);
    g.packages = (g.packages || []).slice(0, 3).map(p => ({ ...p, name: cut(p.name, 25, "Package name"), description: cut(p.description, 100, "Package description"),
      days: Math.max(1, parseInt(p.days) || 1), price: Math.max(5, parseInt(String(p.price).replace(/[^\d]/g, "")) || 5), revisions: parseInt(p.revisions) || 1 }));
    if (g.packages.length === 3) g.packages.forEach((p, i) => { if (i && p.price <= g.packages[i - 1].price) { p.price = Math.round(g.packages[i - 1].price * 2.5 / 10) * 10; notes.push("Prices adjusted so they rise from Basic to Premium"); } });
    g.faq = (g.faq || []).slice(0, 8).map(f => ({ question: cut(f.question, 100, "FAQ question"), answer: cut(f.answer, 300, "FAQ answer") }));
    g.requirements = (g.requirements || []).map(r => cut(String(r).replace(/\s*\n\s*/g, " "), 380, "A requirement question"));
    const before = String(g.description || "").replace(/\\$/gm, "").trim();
    g.description = strip(before).replace(/\n{3,}/g, "\n\n").trim();
    if (g.description !== before) notes.push("Removed contact details/links from the description (Fiverr doesn't allow them)");
    if (g.description.length > 1200) {                       // Fiverr rejects > 1200 characters
      const orig = g.description.length;
      const s = await claudeJSON(`Shorten this Fiverr gig description to at most 1100 characters. Keep the opening hook, the bullet list (merge or trim bullets if needed), the contact-me-before-ordering line and the closing line. Keep the seller's wording; do not add claims.
Shape: {"description":""}`, g.description, 2500);
      g.description = String(s.description || g.description).trim();
      if (g.description.length > 1200) g.description = g.description.slice(0, 1200).replace(/\s+\S*$/, "");
      notes.push(`Description was ${orig} characters, shortened to ${g.description.length} (Fiverr max 1200)`);
    }
    g.notes = notes;
    return g;
  },
  async pick({ label, options, title, keywords, context, target, strict }) {
    return claudeJSON(`You choose the single best option in a Fiverr gig form dropdown. Pick only from the given options, exactly as written.
If a TARGET is given, choose the option that means the same as the target (ignore small wording differences). ${strict ? 'If no option is equivalent to the target, answer "NONE".' : "If no option is equivalent, choose the closest real option for this gig."}
Never choose an option that belongs to an unrelated field (for example web development for an architecture gig).
Shape: {"choice":"<option text, or NONE>"}`,
      `Gig title: ${title}\nKeywords: ${keywords.join(", ")}\nAbout the gig: ${context || "n/a"}\nTARGET: ${target || "(none)"}\nDropdown: ${label || "(unlabelled)"}\nOptions:\n${options.map(o => "- " + o).join("\n")}`, 300);
  },
  // scope + days idea + budget -> 3 complete pricing schemes to choose from
  async pricing({ title, scope, days, budget }) {
    return claudeJSON(COPY_RULES + `\nPropose 3 alternative pricing schemes (e.g. lean / balanced / premium-heavy). Each scheme has basic, standard, premium packages. Package name max 25 chars, description max 100 chars, days = integer delivery days, price = integer USD. Respect the seller's scope, delivery idea and budget; prices must rise from basic to premium.
Shape: {"options":[{"label":"","basic":{"name":"","description":"","days":0,"price":0},"standard":{...},"premium":{...}}]}`,
      `Gig: ${title}\nScope / what I can deliver: ${scope}\nDelivery idea: ${days || "you suggest"}\nBudget / price range: ${budget || "you suggest"}`, 2500);
  },
  async description({ title, keywords, scope, style }) {
    return claudeJSON(COPY_RULES + `\nWrite the gig description: max 1200 characters, plain text, short paragraphs, "-" bullets where useful. Cover who it's for, what the buyer gets, why choose the seller, and invite buyers to message before ordering. Follow the seller's style instructions if given.
Shape: {"description":""}`,
      `Gig: ${title}\nKeywords: ${keywords.join(", ")}\nScope: ${scope || "n/a"}\nStyle instructions: ${style || "professional and friendly"}`, 1500)
      .then(r => ({ description: String(r.description || "").slice(0, 1200) }));
  },
  async requirements({ title, scope }) {
    return claudeJSON(COPY_RULES + `\nWrite 3-5 short questions to ask the buyer after they order so work can start without back-and-forth. Each under 300 characters.
Shape: {"requirements":[""]}`, `Gig: ${title}\nScope: ${scope || "n/a"}`, 800);
  }
};

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  const h = handlers[msg.action];
  if (!h) return;
  h(msg.payload).then(r => send({ ok: true, result: r })).catch(e => send({ ok: false, error: e.message }));
  return true;
});
