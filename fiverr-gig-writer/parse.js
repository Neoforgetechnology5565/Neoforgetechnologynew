// Reads a pasted gig document (ChatGPT style, numbered sections) WITHOUT any AI.
// Nothing is rewritten: text is copied as written; problems are reported as warnings.
(function (root) {
  const clean = s => String(s || "").replace(/\*\*/g, "").replace(/`/g, "").replace(/^\s*>\s*/, "").replace(/\s+/g, " ").trim();
  const bullet = l => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim();

  const SECTIONS = [
    ["ignore", /portfolio|search keywords|^keywords\b|publishing checklist|launch checklist|^checklist|final recommendation/],
    ["title", /^(gig )?title\b/],
    ["category", /categor(y|ies)|gig metadata|^metadata/],
    ["tags", /search tags|^(five |5 )?tags\b/],
    ["image", /thumbnail|image prompt|gig image/],
    ["packages", /^packages?\b|packages? (and|&) pricing|^pricing/],
    ["description", /^(gig )?description\b/],
    ["requirements", /buyer requirements|^requirements|questionnaire/],
    ["faq", /frequently asked|^faqs?\b/]
  ];

  function headingOf(line) {                   // returns [sectionName, rest] if the line starts a known section
    const t = line.trim(); if (!t) return null;
    const marked = /^#{1,6}\s/.test(t) || /^\*\*.+\*\*:?$/.test(t) || /^\d+[.)]\s+\S/.test(t) || /^[A-Za-z][A-Za-z /&()-]{2,60}:$/.test(t);
    if (!marked) return null;
    const text = clean(t.replace(/^#{1,6}\s*/, "").replace(/^\d+[.)]\s*/, "")).replace(/:$/, "").toLowerCase();
    if (text.length > 80) return null;
    for (const [name, re] of SECTIONS) if (re.test(text)) return name;
    return null;
  }

  function splitSections(lines) {
    const out = []; let cur = { name: "pre", lines: [], head: "" };
    for (const l of lines) {
      const h = headingOf(l);
      if (h && !(h === "title" && cur.name === "title" && !cur.lines.some(x => x.trim()))) { out.push(cur); cur = { name: h, lines: [], head: l }; }
      else cur.lines.push(l);
    }
    out.push(cur); return out;
  }

  const splitVals = s => clean(s).replace(/\(.*?\)/g, "").replace(/\bif available\b/gi, "").split(/\s*(?:,|;|\/|\band\b)\s*/i).map(x => x.trim()).filter(Boolean);

  const NOT_META = /^(title|gig title|tags?|search tags?|positive keywords?|keywords?|note|notes|price|delivery|revisions?|description)$/i;
  const META_KEY = /categor|service type|expertise|language|technolog|software|tool|framework|platform|type|style|format|engine|industry|project|skill|specialt|niche|stack|library/i;
  function parseCategory(lines, loose) {
    const kv = [];
    for (const l of lines) {
      if (/^\s*\|/.test(l)) {
        const c = l.split("|").map(clean).filter(x => x !== "");
        if (c.length >= 2 && !/^[-: ]+$/.test(c[0]) && !/^field$/i.test(c[0])) kv.push([c[0], c[1]]);
      } else {
        const m = l.match(/^\s*(?:[-*•]\s*)?\**([A-Za-z][A-Za-z &/-]{1,40}?)\**\s*[:：]\s*(.+)$/);
        if (m && !NOT_META.test(clean(m[1])) && (!loose || META_KEY.test(clean(m[1])))) kv.push([clean(m[1]), clean(m[2])]);
      }
    }
    const res = { category: "", subcategory: "", serviceType: "", meta: [], rows: kv };
    for (const [k, v] of kv) {
      const key = k.toLowerCase();
      if (/^sub-?\s*category$/.test(key)) res.subcategory = v;
      else if (/^categor(y|ies)$/.test(key)) res.category = v;
      else if (/service type/.test(key)) res.serviceType = v;
      else res.meta.push(...splitVals(v));
    }
    const tidy = v => v.replace(/,?\s*if available\.?/i, "").trim();
    res.category = tidy(res.category); res.subcategory = tidy(res.subcategory); res.serviceType = tidy(res.serviceType);
    res.meta = [...new Set(res.meta)];
    return res;
  }

  function parseTags(lines) {
    let t = lines.map(l => bullet(clean(l))).filter(Boolean).filter(l => !/^use these|^five |^tags?:?$/i.test(l) && l.length <= 60);
    if (t.length === 1 && /,/.test(t[0])) t = t[0].split(",").map(x => x.trim()).filter(Boolean);
    return t;
  }

  function parsePackages(lines) {
    const blocks = []; let cur = null;
    const start = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(basic|standard|premium)\b\s*(?:[-–—:|]\s*(.*?))?\s*(?:\*\*)?\s*$/i;
    for (const l of lines) {
      const m = l.match(start);
      if (m && l.trim().length < 120) { cur = { tier: m[1].toLowerCase(), name: clean(m[2] || "").replace(/^\[|\]$/g, ""), lines: [] }; blocks.push(cur); }
      else if (cur) cur.lines.push(l);
    }
    if (!blocks.length) { const t = parsePackagesTable(lines); if (t) return t; }
    return ["basic", "standard", "premium"].map(tier => {
      const b = blocks.find(x => x.tier === tier); if (!b) return null;
      const txt = b.lines.map(clean);
      if (/^\$/.test(b.name)) b.name = "";
      let price = 0, days = 0, revisions = null, description = "", includes = [];
      for (let i = 0; i < b.lines.length; i++) {
        const l = txt[i];
        if (!price) { const m = l.match(/\$\s*(\d[\d,]*)/); if (m) price = parseInt(m[1].replace(/,/g, ""), 10); }
        if (!days) { const m = l.match(/(\d+)\s*[- ]?\s*days?\b/i); if (m) days = parseInt(m[1], 10); }
        if (revisions === null) { const m = l.match(/(\d+|unlimited)\s*[- ]?\s*revisions?\b/i) || l.match(/revisions?\s*[:=]\s*(\d+|unlimited)/i); if (m) revisions = /unlimited/i.test(m[1]) ? 99 : parseInt(m[1], 10); }
        const d = l.match(/^(?:package\s+)?description\s*:\s*(.+)$/i); if (d && !description) description = d[1];
        if (/^includes?\s*:?\s*$/i.test(l)) {
          for (let j = i + 1; j < b.lines.length; j++) {
            if (!txt[j]) continue;
            if (!/^\s*[-*•–]\s+/.test(b.lines[j])) break;
            includes.push(bullet(txt[j]));
          }
        }
      }
      return { tier, name: b.name, description, days, price, revisions: revisions ?? 1, includes };
    });
  }

  function parsePackagesTable(lines) {
    const rows = lines.filter(l => /^\s*\|/.test(l)).map(l => l.split("|").slice(1, -1).map(clean));
    const hi = rows.findIndex(r => r.filter(c => /^(basic|standard|premium)$/i.test(c)).length === 3);
    if (hi < 0) return null;
    const cols = rows[hi].map((c, i) => /^(basic|standard|premium)$/i.test(c) ? i : -1).filter(i => i >= 0);
    const pk = ["basic", "standard", "premium"].map(tier => ({ tier, name: "", description: "", days: 0, price: 0, revisions: 1, includes: [] }));
    for (const r of rows.slice(hi + 1)) {
      if (/^[-: ]+$/.test(r[0] || "")) continue;
      const label = (r[0] || "").toLowerCase();
      cols.forEach((ci, k) => {
        const v = r[ci] || "", p = pk[k];
        if (/package name|^name$|^title$/.test(label)) p.name = v;
        else if (/price|cost/.test(label)) { const m = v.match(/(\d[\d,]*)/); if (m) p.price = parseInt(m[1].replace(/,/g, ""), 10); }
        else if (/deliver|days|time/.test(label)) { const m = v.match(/(\d+)/); if (m) p.days = parseInt(m[1], 10); }
        else if (/revision/.test(label)) p.revisions = /unlimited/i.test(v) ? 99 : (parseInt((v.match(/(\d+)/) || [])[1], 10) || 1);
        else if (/description|summary/.test(label)) p.description = v;
        else if (/include|feature|deliverable|what/.test(label)) p.includes = v.split(/<br\s*\/?>|;|•|\n/).map(x => x.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
      });
    }
    return pk;
  }

  function parseRequirements(lines) {
    const qs = []; let cur = null, extra = false;
    for (const raw of lines) {
      const l = clean(raw); if (!l) continue;
      if (/additional project details/i.test(l) && l.length < 80) { cur = null; extra = true; continue; }
      if (/^(copy questionnaire|preview of|set these up|the preview above)/i.test(l)) { cur = null; continue; }
      const m = l.match(/^(?:Q\s*)?\d+[.)]\s*(.+)$/i);
      if (m) { cur = { q: m[1], opts: [] }; qs.push(cur); continue; }
      if (cur && l.length < 90 && !/[.!?:]$/.test(l)) cur.opts.push(bullet(l));
    }
    const out = qs.map(x => x.opts.length && !/options\s*:/i.test(x.q) ? `${x.q} Options: ${x.opts.join(" / ")}` : x.q);
    if (extra) out.push("Please share any additional project details.");
    return out;
  }

  function parseFaq(lines) {
    const out = []; let cur = null;
    for (const raw of lines) {
      const l = clean(raw); if (!l) continue;
      const q = l.match(/^Q\s*\d*\s*[.:)]\s*(.+)$/i);
      if (q) { cur = { question: q[1], answer: "" }; out.push(cur); continue; }
      if (cur) cur.answer = (cur.answer ? cur.answer + " " : "") + l.replace(/^A\s*\d*\s*[.:)]\s*/i, "");
    }
    return out;
  }

  function parseDescription(lines) {
    const ls = lines.map(l => l.replace(/\*\*/g, "").replace(/\s+$/, ""));
    while (ls.length && (!ls[0].trim() || /^(copy[- ]ready )?(gig )?description\s*:?$/i.test(ls[0].trim()))) ls.shift();
    while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
    return ls.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function limits(g) {
    const w = [], over = (v, n, what) => { if (String(v).length > n) w.push(`${what} is ${String(v).length} characters (Fiverr max ${n}).`); };
    over(g.title, 80, "Title"); over(g.description, 1200, "Description");
    if (g.tags.length > 5) w.push(`There are ${g.tags.length} tags; Fiverr allows 5.`);
    g.tags.forEach(t => { over(t, 20, `Tag "${t}"`); if (/[^A-Za-z0-9 ]/.test(t)) w.push(`Tag "${t}" has symbols; Fiverr tags allow letters and numbers only.`); });
    g.packages.forEach((p, i) => { if (!p) return; over(p.name, 25, `Package ${i + 1} name`); over(p.description, 100, `Package ${i + 1} description`); });
    g.faq.forEach((f, i) => { over(f.question, 100, `FAQ ${i + 1} question`); over(f.answer, 300, `FAQ ${i + 1} answer`); });
    g.requirements.forEach((r, i) => over(r, 400, `Requirement ${i + 1}`));
    return w;
  }

  function parseGig(raw) {
    const text = String(raw || "").replace(/\r/g, "").replace(/\\[ \t]*$/gm, "").replace(/\\([.()\[\]#+!*_>-])/g, "$1");   // markdown line-break and escape backslashes
    const secs = splitSections(text.split("\n")), get = n => secs.filter(s => s.name === n).flatMap(s => s.lines);
    const titleLine = get("title").map(clean).find(Boolean) || "";
    const g = {
      title: titleLine.replace(/^title\s*[:：]\s*/i, ""),
      cat: parseCategory(get("category")),
      tags: parseTags(get("tags")),
      packages: parsePackages(get("packages")),
      description: parseDescription(get("description")),
      requirements: parseRequirements(get("requirements")),
      faq: parseFaq(get("faq"))
    };
    const missing = [!g.title && "title", !g.cat.category && "category", !g.tags.length && "tags", g.packages.some(p => !p) && "packages (Basic, Standard, Premium)", !g.description && "description", !g.faq.length && "FAQs", !g.requirements.length && "requirements"].filter(Boolean);
    g.warnings = [...limits(g), ...(missing.length ? [`Not found in your paste: ${missing.join(", ")}.`] : [])];
    return g;
  }
  const prep = raw => String(raw || "").replace(/\r/g, "").replace(/\\[ \t]*$/gm, "").replace(/\\([.()\[\]#+!*_>-])/g, "$1").split("\n");
  const base = () => ({ tags: [], packages: [], faq: [], requirements: [], title: "", description: "" });

  // Overview box: title, category lines, tags (with or without headings)
  function parseOverview(text) {
    const lines = prep(text), secs = splitSections(lines), get = n => secs.filter(s => s.name === n).flatMap(s => s.lines);
    let title = get("title").map(clean).find(Boolean) || "";
    if (!title) { const m = lines.map(l => l.trim()).find(l => /^\**title\**\s*[:：]/i.test(l)); if (m) title = clean(m).replace(/^title\s*[:：]\s*/i, ""); }
    if (!title) { const first = lines.map(clean).find(l => l && !/^[|#]/.test(l) && !/^[A-Za-z][A-Za-z &/-]{1,30}\s*[:：]/.test(l) && !/^(tags?|search tags?)$/i.test(l)); if (first && first.length <= 120) title = first; }
    let tags = parseTags(get("tags"));
    if (!tags.length) { const m = lines.map(l => l.trim().match(/^\**(?:search )?tags?\**\s*[:：]\s*(.+)$/i)).find(Boolean); if (m) tags = m[1].split(/,|;/).map(clean).filter(Boolean); }
    if (!tags.length) {
      const i = lines.findIndex(l => /^\s*\**(?:#{1,6}\s*)?(?:search )?tags?\**\s*:?\s*$/i.test(l));
      if (i >= 0) { const blk = []; for (let j = i + 1; j < lines.length; j++) { const l = lines[j]; if (!l.trim()) { if (blk.length) break; continue; } if (/[:：]\s*$/.test(l) || /^\s*\|/.test(l)) break; blk.push(l); } tags = parseTags(blk); }
    }
    const catLines = get("category").length ? get("category") : lines;
    const cat = parseCategory(catLines, !get("category").length);
    const g = Object.assign(base(), { title, tags, cat });
    const w = limits(g); if (!title) w.push("No title found. Put it on the first line, or after “Gig title”."); if (!tags.length) w.push("No tags found."); if (!cat.category) w.push("No category found (write “Category: …”). I can derive it from your gig if you scan Fiverr's categories.");
    return Object.assign(g, { warnings: w });
  }
  function parsePricing(text) {
    const lines = prep(text), secs = splitSections(lines), sec = secs.filter(s => s.name === "packages").flatMap(s => s.lines);
    const packages = parsePackages(sec.length ? sec : lines);
    const g = Object.assign(base(), { packages }); const w = limits(g);
    if (packages.some(x => !x)) w.push("Not all three packages (Basic, Standard, Premium) were found.");
    return { packages, warnings: w };
  }
  function parseDescriptionBox(text) {
    const lines = prep(text), secs = splitSections(lines), has = secs.some(s => s.name === "description");
    let desc, faq = [];
    if (has) { desc = parseDescription(secs.filter(s => s.name === "description").flatMap(s => s.lines)); faq = parseFaq(secs.filter(s => s.name === "faq").flatMap(s => s.lines)); }
    else {
      const k = lines.findIndex(l => /^\s*(?:#{1,6}\s*)?\**\s*(faqs?|frequently asked)/i.test(l) || /^\s*\**Q\s*\d*\s*[.:)]\s*\S/.test(l));
      desc = parseDescription(k >= 0 ? lines.slice(0, k) : lines); if (k >= 0) faq = parseFaq(lines.slice(k));
    }
    const g = Object.assign(base(), { description: desc, faq }); const w = limits(g); if (!desc) w.push("No description found.");
    return { description: desc, faq, warnings: w };
  }
  function parseFaqBox(text) { const faq = parseFaq(prep(text)); const w = limits(Object.assign(base(), { faq })); if (!faq.length) w.push("No FAQs found (write “Q1. question” then the answer)."); return { faq, warnings: w }; }
  function parseRequirementsBox(text) { const requirements = parseRequirements(prep(text)); const w = limits(Object.assign(base(), { requirements })); if (!requirements.length) w.push("No numbered questions found."); return { requirements, warnings: w }; }

  // a whole gig document -> the text that belongs in each box
  function distribute(raw) {
    const secs = splitSections(prep(raw)), take = names => secs.filter(s => names.includes(s.name)).map(s => (s.head ? s.head + "\n" : "") + s.lines.join("\n").trim()).join("\n\n").trim();
    return { ov: take(["title", "category", "tags"]), pr: take(["packages"]), ds: take(["description"]), fq: take(["faq"]), rq: take(["requirements"]) };
  }

  root.parseGig = parseGig; root.GigParse = { parseOverview, parsePricing, parseDescriptionBox, parseFaqBox, parseRequirementsBox, distribute };
  if (typeof module !== "undefined") module.exports = { parseGig, ...root.GigParse };
})(typeof window !== "undefined" ? window : globalThis);
