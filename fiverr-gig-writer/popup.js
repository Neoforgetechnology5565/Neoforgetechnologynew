const $ = id => document.getElementById(id);
let gig = null;
const fields = ["service", "skills", "audience", "tone", "budget"];

function status(msg, ok) { $("status").textContent = msg; $("status").className = ok ? "ok" : ""; }

chrome.storage.local.get(["apiKey", "form"]).then(({ apiKey, form }) => {
  if (!apiKey) $("keybox").open = true; else $("apiKey").value = apiKey;
  if (form) fields.forEach(f => form[f] && ($(f).value = form[f]));
});

$("saveKey").onclick = async () => {
  await chrome.storage.local.set({ apiKey: $("apiKey").value.trim() });
  status("Key saved.", true);
};

$("generate").onclick = async () => {
  const input = Object.fromEntries(fields.map(f => [f, $(f).value.trim()]));
  if (!input.service) return status("Enter the service you sell.");
  chrome.storage.local.set({ form: input });
  $("generate").disabled = true; status("Writing your gig…", true);
  const res = await chrome.runtime.sendMessage({ type: "GENERATE", input });
  $("generate").disabled = false;
  if (!res.ok) return status(res.error);
  gig = res.gig; status("Done. Review and edit before using.", true);
  $("rTitle").value = gig.title; $("rDesc").value = gig.description; $("rTags").value = gig.tags.join(", ");
  $("rExtra").textContent = JSON.stringify({ packages: gig.packages, faq: gig.faq, requirements: gig.requirements }, null, 2);
  $("result").hidden = false; counts();
};

function counts() {
  $("tlen").textContent = `${$("rTitle").value.length}/80`;
  $("dlen").textContent = `${$("rDesc").value.length}/1200`;
}
["rTitle", "rDesc"].forEach(i => $(i).addEventListener("input", counts));

function current() {
  return { ...gig, title: $("rTitle").value, description: $("rDesc").value,
    tags: $("rTags").value.split(",").map(t => t.trim()).filter(Boolean) };
}

$("fill").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/fiverr\.com/.test(tab.url || "")) return status("Open your Fiverr gig editor tab first.");
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: "FILL_GIG", gig: current() });
    status(r.filled.length ? `Filled: ${r.filled.join(", ")}. Check the rest manually.` : "Couldn't find fields on this page. Use Copy all.", !!r.filled.length);
  } catch { status("Reload the Fiverr tab, then try again."); }
};

$("copy").onclick = async () => {
  const g = current();
  const text = `TITLE:\n${g.title}\n\nDESCRIPTION:\n${g.description}\n\nTAGS:\n${g.tags.join(", ")}\n\nPACKAGES:\n${JSON.stringify(g.packages, null, 2)}\n\nFAQ:\n${(g.faq || []).map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")}\n\nREQUIREMENTS:\n${(g.requirements || []).join("\n")}`;
  await navigator.clipboard.writeText(text); status("Copied.", true);
};
