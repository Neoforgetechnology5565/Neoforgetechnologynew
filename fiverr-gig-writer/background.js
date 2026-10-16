chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini text generation (free tier available). Returns parsed JSON.
async function claudeJSON(system, user, maxTokens = 2000) {
  const { geminiKey, textModel } = await chrome.storage.local.get(["geminiKey", "textModel"]);
  if (!geminiKey) throw new Error("Add your free Google AI (Gemini) API key in Settings first.");
  const res = await fetch(`${GEMINI}/${textModel || "gemini-2.5-flash"}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system + "\nRespond with ONLY valid JSON." }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: Math.max(maxTokens, 4096), temperature: 0.8 }
    })
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  try { return JSON.parse(text); }
  catch { const s = text.search(/[{[]/), e = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")); return JSON.parse(text.slice(s, e + 1)); }
}

const COPY_RULES = `You write Fiverr gigs that rank in search and convert. Be honest: no fake reviews, numbers, guarantees or claims the seller didn't state. Plain, natural English.`;

const handlers = {
  // 5 keywords -> 5 title options
  async titles({ keywords, notes }) {
    return claudeJSON(COPY_RULES + `\nWrite 5 different gig titles. Each starts with "I will", max 80 characters, uses the main keywords naturally, no emojis, no hype. Different angles.
Shape: {"titles":["","","","",""]}`,
      `Keywords: ${keywords.join(", ")}\n${notes ? "Notes: " + notes : ""}`);
  },
  // choose the best option from a dropdown the page actually offers
  async pick({ label, options, title, keywords }) {
    return claudeJSON(`You choose the single best option in a Fiverr gig form dropdown for a seller's gig. Pick only from the given options, exactly as written.
Shape: {"choice":"<option text>"}`,
      `Gig title: ${title}\nKeywords: ${keywords.join(", ")}\nDropdown: ${label || "(unlabelled)"}\nOptions:\n${options.map(o => "- " + o).join("\n")}`, 300);
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
  },
  // Image prompt only (free): paste it into Google Flow / Gemini yourself
  async imagePrompt({ title, keywords, style }) {
    return claudeJSON(`Write one detailed text-to-image prompt for a Fiverr gig cover image: clean, professional, eye-catching, 16:9, subject clearly tied to the service. Do NOT include any text, letters, logos or watermarks in the image.
Shape: {"prompt":""}`, `Gig: ${title}\nKeywords: ${keywords.join(", ")}\nVisual style: ${style || "modern, clean, vibrant"}`, 500);
  },
  // Optional: generate the image with Google's API (image models may be paid)
  async image({ prompt }) {
    const { geminiKey, imageModel } = await chrome.storage.local.get(["geminiKey", "imageModel"]);
    if (!geminiKey) throw new Error("Add your Google AI (Gemini) API key in Settings first.");
    const model = imageModel || "imagen-4.0-generate-001";
    const base = `${GEMINI}/${model}`;
    const headers = { "content-type": "application/json", "x-goog-api-key": geminiKey };
    let b64, mime = "image/png";
    if (/^imagen/.test(model)) {
      const r = await fetch(`${base}:predict`, { method: "POST", headers,
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "16:9" } }) });
      if (!r.ok) throw new Error(`Google image API ${r.status}: ${(await r.text()).slice(0, 250)}`);
      const p = (await r.json()).predictions?.[0];
      b64 = p?.bytesBase64Encoded; mime = p?.mimeType || mime;
    } else {
      const r = await fetch(`${base}:generateContent`, { method: "POST", headers,
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt + " Aspect ratio 16:9." }] }], generationConfig: { responseModalities: ["IMAGE"] } }) });
      if (!r.ok) throw new Error(`Google image API ${r.status}: ${(await r.text()).slice(0, 250)}`);
      const part = ((await r.json()).candidates?.[0]?.content?.parts || []).find(x => x.inlineData);
      b64 = part?.inlineData?.data; mime = part?.inlineData?.mimeType || mime;
    }
    if (!b64) throw new Error("Google returned no image. Try another image model in Settings.");
    return { dataUrl: `data:${mime};base64,${b64}` };
  }
};

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  const h = handlers[msg.action];
  if (!h) return;
  h(msg.payload).then(r => send({ ok: true, result: r })).catch(e => send({ ok: false, error: e.message }));
  return true;
});
