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
    const out = []; let cur = { name: "pre", lines: [] };
    for (const l of lines) {
      const h = headingOf(l);
      if (h && !(h === "title" && cur.name === "title" && !cur.lines.some(x => x.trim()))) { out.push(cur); cur = { name: h, lines: [] }; }
      else cur.lines.push(l);
    }
    out.push(cur); return out;
  }

  const splitVals = s => clean(s).replace(/\(.*?\)/g, "").replace(/\bif available\b/gi, "").split(/\s*(?:,|;|\/|\band\b)\s*/i).map(x => x.trim()).filter(Boolean);

  function parseCategory(lines) {
    const kv = [];
    for (const l of lines) {
      if (/^\s*\|/.test(l)) {
        const c = l.split("|").map(clean).filter(x => x !== "");
        if (c.length >= 2 && !/^[-: ]+$/.test(c[0]) && !/^field$/i.test(c[0])) kv.push([c[0], c[1]]);
      } else {
        const m = l.match(/^\s*(?:[-*•]\s*)?\**([A-Za-z][A-Za-z &/-]{1,40}?)\**\s*[:：]\s*(.+)$/);
        if (m) kv.push([clean(m[1]), clean(m[2])]);
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
  root.parseGig = parseGig;
  if (typeof module !== "undefined") module.exports = { parseGig };
})(typeof window !== "undefined" ? window : globalThis);
