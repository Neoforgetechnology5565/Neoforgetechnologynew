// Derives the Fiverr category path from the gig text (no AI): scores every scanned category > subcategory > service type
// by how many of its (rare, meaningful) words appear in the gig, weighting title/tags above packages above description.
(function (root) {
  const STOP = new Set(["and", "the", "of", "a", "an", "for", "to", "with", "your", "or", "in", "on", "by", "is", "are", "i", "will", "you", "we", "my", "our", "other", "services", "service", "custom", "get", "from", "that", "this", "as", "at", "it", "be"]);
  const SUF = ["ations", "ation", "ings", "ing", "ers", "er", "ors", "ures", "ure", "ural", "als", "al", "ed", "es", "s"];
  function stem(w) {
    for (const s of SUF) if (w.length - s.length >= 4 && w.endsWith(s)) { w = w.slice(0, -s.length); break; }
    return w.replace(/([a-z])\1$/, "$1");                       // planning -> plann -> plan
  }
  const norm = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#. ]/g, " ").replace(/\s+/g, " ").trim();
  const toks = s => norm(s).split(" ").filter(w => w && !STOP.has(w)).map(stem).filter(w => w.length > 1);

  function makeIdf(allNames) {                                 // common words ("design", "development") count for less
    const f = new Map();
    for (const n of allNames) for (const t of new Set(toks(n))) f.set(t, (f.get(t) || 0) + 1);
    return t => 1 / (1 + Math.log(1 + (f.get(t) || 0)));
  }

  // the gig as fields of word-stems with a weight (title/tags 3, packages 2, description 1)
  function corpusFields(G) {
    const f = [], add = (text, w) => { const t = toks(text); if (t.length) f.push({ t, w }); };
    add(G.title, 3); G.tags.forEach(t => add(t, 3));
    [G.cat.category, G.cat.subcategory, G.cat.serviceType, ...G.cat.meta].forEach(t => add(t, 3));
    G.packages.filter(Boolean).forEach(p => { add(p.name, 2); add(p.description, 2); p.includes.forEach(i => add(i, 2)); });
    add(G.description, 1); G.faq.forEach(q => add(q.question, 1));
    return f;
  }
  function corpusWeights(fields) {                             // word -> 0..3
    const w = new Map(); for (const { t, w: x } of fields) for (const s of t) w.set(s, Math.max(w.get(s) || 0, x)); return w;
  }
  const hasRun = (hay, needle) => { for (let i = 0; i + needle.length <= hay.length; i++) { let ok = true; for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; } if (ok) return true; } return false; };

  const altsOfName = name => { const m = String(name).match(/\(([^)]+)\)/); return [String(name).replace(/\(.*?\)/g, " "), ...(m ? [m[1]] : [])]; };
  function fracScore(name, C, idf) {
    const ts = toks(name); if (!ts.length) return 0;
    let got = 0, all = 0;
    for (const t of ts) { const i = idf(t); all += i; got += i * Math.min(1, (C.w.get(t) || 0) / 3); }
    return all ? got / all : 0;
  }
  // a name is "strongly" present when it is written in full in the gig (several words), or its single word is in the title
  function strong(name, C) {
    const ts = toks(name); if (!ts.length) return false;
    if (ts.length >= 2) return C.fields.some(f => f.w >= 2 && hasRun(f.t, ts));
    return ts[0].length >= 3 && C.title.has(ts[0]);
  }
  const sameRun = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function nameScore(name, C, idf) {              // 0 .. ~2 ; for names with a bracketed acronym the better reading counts
    return Math.max(...altsOfName(name).map(a => {
      const ts = toks(a);
      return fracScore(a, C, idf) + 0.6 * (strong(a, C) ? 1 : 0) + (ts.length && C.tags.some(t => sameRun(t, ts)) ? 0.4 : 0);   // a whole tag equals the name
    }));
  }
  const ctxOf = G => { const fields = corpusFields(G); return { fields, w: corpusWeights(fields), title: new Set(toks(G.title)), tags: G.tags.map(toks) }; };

  // tree: [{category, subcategory}], svc: { subcategoryName: [serviceTypes] }
  function derive(G, tree, svc, idf) {
    const C = ctxOf(G), out = [];
    const svcOf = new Map(Object.entries(svc || {}).map(([k, v]) => [norm(k), v]));
    for (const { category, subcategory } of tree) {
      const sub = nameScore(subcategory, C, idf), cat = fracScore(category, C, idf);
      const types = svcOf.get(norm(subcategory)) || [];
      if (!types.length) out.push({ category, subcategory, serviceType: "", score: 0.8 * sub + 0.1 * cat });   // no service types known: a little less than a full path
      for (const t of types) out.push({ category, subcategory, serviceType: t, score: 0.45 * nameScore(t, C, idf) + 0.45 * sub + 0.1 * cat });
    }
    out.sort((a, b) => b.score - a.score);
    const top = [], seen = new Set();
    for (const c of out) { const k = c.category + "|" + c.subcategory; if (seen.has(k)) continue; seen.add(k); top.push(c); if (top.length === 3) break; }
    const best = top[0], second = top[1];
    const confident = !!best && best.score >= 0.9 && (!second || best.score - second.score >= 0.15);
    return { best, top, confident };
  }

  // service types of one subcategory, best first (so the page can try them in order)
  function rankServices(G, sub, svc, idf) {
    const types = svc[sub] || Object.entries(svc).find(([k]) => norm(k) === norm(sub))?.[1] || [];
    const C = ctxOf(G);
    return types.map(t => ({ name: t, score: nameScore(t, C, idf) })).sort((a, b) => b.score - a.score);
  }

  function matchName(want, list) {                             // exact, else closest by shared word stems (>= 0.6)
    const w = norm(want); if (!w) return null;
    for (const o of list) if (norm(o) === w) return o;
    const A = new Set(toks(want)); let best = null, top = 0;
    for (const o of list) { const B = new Set(toks(o)); const i = [...A].filter(x => B.has(x)).length, sc = i / (new Set([...A, ...B]).size || 1); if (sc > top) { top = sc; best = o; } }
    return top >= 0.6 ? best : null;
  }

  root.GigDerive = { makeIdf, derive, rankServices, matchName, norm, toks };
  if (typeof module !== "undefined") module.exports = root.GigDerive;
})(typeof window !== "undefined" ? window : globalThis);
