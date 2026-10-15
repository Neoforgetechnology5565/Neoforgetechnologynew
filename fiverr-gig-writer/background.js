const MODEL = "claude-sonnet-5-5";

const SYSTEM = `You are an expert Fiverr gig copywriter. You write gigs that rank in Fiverr search and convert buyers.
Rules:
- Title: starts with "I will", max 80 characters, includes the main keyword, no hype or emojis.
- Description: max 1200 characters, plain text with short paragraphs and "-" bullets. Cover who it's for, what the buyer gets, why choose the seller, and a call to message before ordering. No false claims, no fake reviews or numbers.
- Tags: exactly 5, each max 20 characters, lowercase, search-relevant.
- Packages: basic, standard, premium. Each has name (max 25 chars), description (max 100 chars), deliveryDays (integer), price (integer USD).
- FAQ: 3 items with question and answer.
- Requirements: 3 short questions to ask the buyer after ordering.
Respond with ONLY valid JSON, no markdown fences, in this shape:
{"title":"","description":"","tags":[""],"packages":{"basic":{"name":"","description":"","deliveryDays":0,"price":0},"standard":{...},"premium":{...}},"faq":[{"question":"","answer":""}],"requirements":[""]}`;

async function generateGig(input) {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) throw new Error("Add your Anthropic API key in the extension first.");

  const userMsg = [
    `Service: ${input.service}`,
    input.skills && `My skills/experience: ${input.skills}`,
    input.audience && `Target buyers: ${input.audience}`,
    input.tone && `Tone: ${input.tone}`,
    input.budget && `Price range: ${input.budget}`,
    input.extra && `Extra notes: ${input.extra}`
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || "").join("").trim();
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const gig = JSON.parse(json);
  gig.title = (gig.title || "").slice(0, 80);
  gig.description = (gig.description || "").slice(0, 1200);
  gig.tags = (gig.tags || []).slice(0, 5).map(t => String(t).slice(0, 20));
  return gig;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GENERATE") {
    generateGig(msg.input)
      .then(gig => sendResponse({ ok: true, gig }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async
  }
});
