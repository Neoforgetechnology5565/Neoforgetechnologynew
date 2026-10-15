// Fills gig text into the Fiverr editor when asked from the popup.
// Fiverr's markup changes often, so fields are located heuristically.
function setValue(el, value) {
  if (el.isContentEditable) {
    el.focus(); document.execCommand("selectAll", false); document.execCommand("insertText", false, value);
    return;
  }
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
const hint = el => [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("data-testid")].join(" ").toLowerCase();
const visible = el => el.offsetParent !== null;

function find(re, selector) {
  return [...document.querySelectorAll(selector)].find(el => visible(el) && re.test(hint(el)));
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.type !== "FILL_GIG") return;
  const filled = [], g = msg.gig;
  const title = find(/title|i will/, "input,textarea");
  if (title) { setValue(title, g.title.replace(/^I will\s*/i, "")); filled.push("title"); }
  const desc = find(/description|describe/, "textarea,[contenteditable=true],[role=textbox]")
    || [...document.querySelectorAll("textarea,[contenteditable=true]")].filter(visible).sort((a, b) => b.clientHeight - a.clientHeight)[0];
  if (desc) { setValue(desc, g.description); filled.push("description"); }
  const tags = find(/tag/, "input");
  if (tags) {
    for (const t of g.tags) { setValue(tags, t); tags.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })); }
    filled.push("tags");
  }
  sendResponse({ filled });
});
