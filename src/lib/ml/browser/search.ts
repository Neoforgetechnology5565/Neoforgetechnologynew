"use client";
/** Semantic document search (IDF-weighted mean of word vectors + BM25 + hybrid) and content-based product recommendation, in the browser. Port of search.py and recommend.py. */
import { err, fileOf, LIMITS, numOf, sampleBlob, strOf, cleanName } from "./core";
import { openPdf, pageText } from "./pdf";
import { decodeImage, scaled, ctx2 } from "./core";
import { embed } from "./vision";

const STOP = new Set("a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those not no do does did have has had will would can could should may might i you he she we they them his her their our your my me us there here than then so such into over under about after before between also just more most other some any each".split(" "));
const tokens = (s: string) => s.toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) ?? [];
function chunks(text: string, target = 70, overlap = 15): string[] {
  text = text.replace(/\r/g, "").replace(/[ \t]+/g, " "); const sents = text.split(/(?<=[.!?])\s+|\n{2,}|\n(?=[#\-*] )/).map((s) => s.trim()).filter(Boolean), out: string[] = []; let cur: string[] = [], n = 0;
  for (const s of sents) { const w = s.split(/\s+/).length; if (cur.length && n + w > target) { out.push(cur.join(" ")); const keep: string[] = []; let m = 0; for (const t of [...cur].reverse()) { m += t.split(/\s+/).length; keep.unshift(t); if (m >= overlap) break; } cur = keep; n = keep.reduce((a, t) => a + t.split(/\s+/).length, 0); } cur.push(s); n += w; }
  if (cur.length) out.push(cur.join(" ")); return out.filter((c) => c.split(/\s+/).length >= 4);
}
/* word vectors: float16 rows decoded on demand */
const h2f = (h: number) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024); };
let wv: Promise<{ u16: Uint16Array; w2r: Record<string, number>; dim: number }> | null = null;
const loadWv = () => (wv ??= (async () => { const [b, w, m] = await Promise.all([fetch("/ml/models/vectors.f16").then((r) => r.arrayBuffer()), fetch("/ml/models/word2row.json").then((r) => r.json()), fetch("/ml/models/vectors.json").then((r) => r.json())]); return { u16: new Uint16Array(b), w2r: w as Record<string, number>, dim: (m as { dim: number }).dim }; })());
const rowCache = new Map<number, Float32Array>();
const rowOf = (v: Awaited<NonNullable<typeof wv>>, r: number) => { let x = rowCache.get(r); if (!x) { x = new Float32Array(v.dim); for (let i = 0; i < v.dim; i++) x[i] = h2f(v.u16[r * v.dim + i]); rowCache.set(r, x); } return x; };

interface Passage { n: number; text: string; tokens: string[] }
interface Doc { id: string; name: string; source: string; chars: number; passages: Passage[] }
const sessions = new Map<string, { docs: Doc[]; counter: number }>();
const ix = (s: string) => { if (!/^[0-9a-f]{16,32}$/.test(s || "")) err(400, "A session id of 16-32 hexadecimal characters is required (the demo generates one per browser)."); let x = sessions.get(s); if (!x) { x = { docs: [], counter: 0 }; sessions.set(s, x); } return x; };
async function summary(d: Doc) { const v = await loadWv(), toks = d.passages.flatMap((p) => p.tokens); return { id: d.id, name: d.name, source: d.source, characters: d.chars, passages: d.passages.length, terms: toks.length, terms_with_vectors: toks.filter((t) => t in v.w2r).length }; }
export async function list(session: string) { const x = ix(session); return { documents: await Promise.all(x.docs.map(summary)), limit: 30 }; }
export async function add(f: FormData) {
  const x = ix(strOf(f, "session") ?? ""); if (x.docs.length >= 30) err(422, "The index already holds 30 documents; remove one first.");
  const file = fileOf(f, "file"), sid = strOf(f, "sample_id"), text = strOf(f, "text"); if ([file, sid, text].filter((v) => v !== null && v !== "").length !== 1) err(400, "Send exactly one of: file, sample_id, text.");
  let name: string, body: string, src: string;
  if (sid) { const { blob, item } = await sampleBlob(sid, "text"); name = item.title; body = await blob.text(); src = "sample"; }
  else if (text !== null && text !== "") { if (text.length > 200000) err(413, "The pasted text is longer than 200,000 characters."); name = ((strOf(f, "title") ?? "Pasted text").trim().slice(0, 80)) || "Pasted text"; body = text; src = "pasted"; }
  else {
    const fl = file!; if (!fl.size) err(400, "The file is empty."); if (fl.size > LIMITS.max_doc_mb * 1e6) err(413, `The file is larger than the ${LIMITS.max_doc_mb} MB limit.`); name = cleanName(fl.name); src = "upload";
    const head = new Uint8Array(await fl.slice(0, 8).arrayBuffer());
    if (new TextDecoder().decode(head.slice(0, 5)) === "%PDF-") { const doc = await openPdf(await fl.arrayBuffer(), 60), parts: string[] = []; for (let i = 1; i <= doc.numPages; i++) parts.push(await pageText(doc, i)); body = parts.join("\n\n"); if (body.trim().length < 20) err(422, "This PDF has no text layer (it is probably a scan). Use the OCR demo first and paste the text."); }
    else { if ((head[0] === 0xff && head[1] === 0xd8) || (head[0] === 0x89 && head[1] === 0x50) || head.slice(0, 2).includes(0)) err(415, "Unsupported file type. Upload a PDF, TXT or Markdown file, or paste text."); body = await fl.text(); }
  }
  const ch = chunks(body); if (!ch.length) err(422, "No searchable text was found in this document.");
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; const d: Doc = { id: `d${x.docs.length + 1}-${h % 10000}`, name, source: src, chars: body.length, passages: ch.map((c, i) => ({ n: i + 1, text: c, tokens: tokens(c).filter((t) => !STOP.has(t)) })) };
  x.counter++; x.docs.push(d); return summary(d);
}
export function remove(did: string, session: string) { if (!/^d\d{1,3}-\d{1,5}$/.test(did)) err(404, "Document not found."); const x = ix(session), n = x.docs.length; x.docs = x.docs.filter((d) => d.id !== did); if (x.docs.length === n) err(404, "Document not found."); return { deleted: true }; }
export function reset(f: FormData) { ix(strOf(f, "session") ?? "").docs = []; return { cleared: true }; }
export async function query(f: FormData) {
  const x = ix(strOf(f, "session") ?? ""), q0 = strOf(f, "query") ?? "", mode = strOf(f, "mode") ?? "hybrid", k = Math.round(numOf(f, "k", 5)), alpha = numOf(f, "alpha", 0.5);
  if (!["semantic", "keyword", "hybrid"].includes(mode)) err(400, "mode must be semantic, keyword or hybrid."); if (!(k >= 1 && k <= 20 && alpha >= 0 && alpha <= 1) || !q0.trim() || q0.length > 500) err(400, "Provide a query of 1-500 characters, k 1-20 and alpha 0-1.");
  const v = await loadWv(), q = tokens(q0).filter((t) => !STOP.has(t)); if (!q.length) err(422, "The query has no searchable words (only stop words or symbols).");
  const items = x.docs.flatMap((d) => d.passages.map((p) => ({ did: d.id, name: d.name, p })));
  if (!items.length) return { results: [], query_terms: q, query_terms_with_vectors: q.filter((t) => t in v.w2r), mode };
  const N = items.length, df = new Map<string, number>(); for (const it of items) for (const t of new Set(it.p.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5)), avg = items.reduce((a, it) => a + it.p.tokens.length, 0) / N || 1, bm = new Array(N).fill(0);
  items.forEach((it, i) => { const tf = new Map<string, number>(); for (const t of it.p.tokens) tf.set(t, (tf.get(t) ?? 0) + 1); for (const t of new Set(q)) { const c = tf.get(t); if (c) bm[i] += (idf(t) * c * 2.2) / (c + 1.2 * (0.25 + (0.75 * it.p.tokens.length) / avg)); } });
  const emb = (ts: string[]) => { const acc = new Float32Array(v.dim); let ws = 0; for (const t of ts) { const r = v.w2r[t]; if (r !== undefined) { const w = idf(t), row = rowOf(v, r); for (let i = 0; i < v.dim; i++) acc[i] += w * row[i]; ws += w; } } if (!ws) return null; let n = 0; for (const a of acc) n += a * a; n = Math.sqrt(n) + 1e-9; return acc.map((a) => a / n); };
  const qe = emb(q), sem = new Array(N).fill(0); if (qe) items.forEach((it, i) => { const pe = emb(it.p.tokens); if (pe) { let d = 0; for (let j = 0; j < v.dim; j++) d += pe[j] * qe[j]; sem[i] = d; } });
  const notes: string[] = []; if (!qe && mode !== "keyword") notes.push("None of the query words has a word vector, so the semantic score is zero; try different words or keyword mode.");
  const norm = (a: number[]) => { const lo = Math.min(...a), hi = Math.max(...a); return hi > lo ? a.map((x) => (x - lo) / (hi - lo)) : a.map(() => 0); }, ns = norm(sem), nb = norm(bm);
  const score = mode === "semantic" ? sem : mode === "keyword" ? bm : sem.map((_, i) => alpha * ns[i] + (1 - alpha) * nb[i]), qs = new Set(q), results = [];
  for (const i of score.map((_, i) => i).sort((a, b) => score[b] - score[a]).slice(0, k)) { if (mode === "keyword" && bm[i] <= 0) continue; const it = items[i]; results.push({ doc_id: it.did, document: it.name, passage: it.p.n, text: it.p.text, score: score[i], semantic_similarity: sem[i], bm25: bm[i], matching_words: [...qs].filter((t) => it.p.tokens.includes(t)).sort() }); }
  return { results, mode, alpha: mode === "hybrid" ? alpha : null, query_terms: q, query_terms_with_vectors: q.filter((t) => t in v.w2r), notes, passages_searched: N };
}

/* ───────── product recommendation ───────── */
interface Item { id: string; name: string; category: string; brand: string; colour: string; material: string; price: number; image: string; description: string }
const SW = new Set("a about above after again against all am an and any are as at be because been before being below between both but by can did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with you your yours yourself yourselves".split(" "));
let cat: Promise<{ items: Item[]; img: Float32Array[]; tf: Map<string, number>[]; idf: Map<string, number>; terms: string[]; norms: number[] }> | null = null;
const words = (s: string) => (s.toLowerCase().match(/(?<![a-z0-9_])[a-z0-9_]{2,}(?![a-z0-9_])/g) ?? []).filter((w) => !SW.has(w));
const grams = (s: string) => { const w = words(s), o = [...w]; for (let i = 0; i + 1 < w.length; i++) o.push(`${w[i]} ${w[i + 1]}`); return o; };
const loadCat = () => (cat ??= (async () => {
  const items = (await (await fetch("/ml/samples/products/items.json")).json()) as Item[], img: Float32Array[] = [];
  for (const it of items) { const b = await (await fetch(`/ml/samples/products/${it.image}`)).blob(), c = await decodeImage(b); img.push(await embed(scaled(c, 224, 224))); void ctx2; }
  const docs = items.map((i) => grams([i.name, i.category, i.brand, i.colour, i.material, i.description].join(" "))), df = new Map<string, number>(); for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = items.length, idf = new Map([...df].map(([t, c]) => [t, Math.log((1 + n) / (1 + c)) + 1])), tf = docs.map((d) => { const m = new Map<string, number>(); for (const t of d) m.set(t, (m.get(t) ?? 0) + 1); const w = new Map<string, number>(); let s = 0; for (const [t, c] of m) { const x = (1 + Math.log(c)) * idf.get(t)!; w.set(t, x); s += x * x; } s = Math.sqrt(s) || 1; for (const [t, x] of w) w.set(t, x / s); return w; });
  return { items, img, tf, idf, terms: [...df.keys()], norms: [] as number[] };
})());
export async function products(q: URLSearchParams) {
  const c = await loadCat(), ql = (q.get("q") ?? "").toLowerCase().trim(), category = q.get("category"), limit = Math.min(300, Math.max(1, Number(q.get("limit") ?? 60)));
  const items = c.items.filter((i) => (!category || i.category === category) && (!ql || [i.name, i.category, i.brand, i.colour, i.material].join(" ").toLowerCase().includes(ql))).slice(0, limit);
  return { total: c.items.length, categories: [...new Set(c.items.map((i) => i.category))].sort(), items };
}
const dot = (a: Map<string, number>, b: Map<string, number>) => { let s = 0; for (const [t, x] of a) { const y = b.get(t); if (y) s += x * y; } return s; };
export async function similar(pid: string, q: URLSearchParams) {
  const c = await loadCat(), n = c.items.findIndex((i) => i.id === pid); if (n < 0) err(404, "Unknown product.");
  const k = Math.min(24, Math.max(1, Number(q.get("k") ?? 6))), w = Math.min(1, Math.max(0, Number(q.get("image_weight") ?? 0.5)));
  const imgS = c.img.map((v) => { let d = 0; for (let i = 0; i < v.length; i++) d += v[i] * c.img[n][i]; return d; }), txS = c.tf.map((t) => dot(t, c.tf[n])), score = imgS.map((s, i) => w * s + (1 - w) * txS[i]);
  const order = score.map((_, i) => i).filter((i) => i !== n).sort((a, b) => score[b] - score[a]).slice(0, k), base = c.items[n], ATTRS = ["category", "brand", "colour", "material"] as const;
  return { selected: base, image_weight: w, results: order.map((j) => { const it = c.items[j], contrib = [...c.tf[n]].map(([t, x]) => [t, x * (c.tf[j].get(t) ?? 0)] as const).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]); return { ...it, score: score[j], image_similarity: imgS[j], text_similarity: txS[j], shared_attributes: ATTRS.filter((a) => it[a] === base[a]), shared_terms: contrib }; }),
    method: `score = ${w.toFixed(2)} x image cosine (MobileNetV2 features) + ${(1 - w).toFixed(2)} x text cosine (TF-IDF of name, category, brand, colour, material and description)` };
}
