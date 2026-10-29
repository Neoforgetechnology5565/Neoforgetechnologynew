/** Structured fields from item text by explicit rules (regular expressions and a small label list), checks between them, and a keyword classifier: a TypeScript port of services/document-ocr/app/extract.py. Nothing here is learned. */
export interface RawItem { id?: string; text: string; bbox: [number, number, number, number]; conf?: number | null; source?: string; char_x?: [number, number][] }
export interface FieldOut { id: string; page: number; type: string; label: string | null; raw: string; value: string; currency: string | null; bbox: number[]; bbox_approximate: boolean; item_id: string | null; origin: "rule_parsed" | "manual"; based_on: string; rule: string; ocr_confidence: number | null; flags: string[]; status: "unreviewed" | "confirmed" | "corrected" | "rejected"; original_value: string; current_value: string; note: string }
export interface Validation { rule: string; passed: boolean; detail: string; fields: string[] }
export const LOW_CONF = 0.85;
const MONTHS: Record<string, number> = Object.fromEntries(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].map((m, i) => [m, i + 1]));
const MON = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const RE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const RE_DMY_TEXT = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*${MON}\\.?,?\\s*(\\d{4})\\b`, "gi");
const RE_MDY_TEXT = new RegExp(`\\b${MON}\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})\\b`, "gi");
const RE_NUM_DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g;
const EMAIL_SRC = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}";
const CUR: Record<string, string> = { "£": "GBP", $: "USD", "€": "EUR", GBP: "GBP", USD: "USD", EUR: "EUR" };
const AMOUNT_SRC = "(?<cur>[£$€]|\\bUSD|\\bEUR|\\bGBP)\\s?(?<num>-?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?|-?\\d+(?:\\.\\d{1,2})?)|(?<num2>-?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})|-?\\d+\\.\\d{2})\\s?(?<cur2>USD|EUR|GBP)\\b";
const RE_PLAIN_AMOUNT = /^(?:-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)$/;
const PHONE_SRC = "(?<![\\w/])\\+?\\d[\\d\\s().-]{6,18}\\d(?!\\w)";
const RE_KV = /^\s*(?<label>[A-Za-z][A-Za-z0-9 .#/&()'%-]{1,40}?)\s*:\s*(?<value>\S.*)$/d;
const AMOUNT_LABELS = /\b(total|subtotal|sub-total|vat|tax|amount|balance|due|price|paid|deposit|fee|charge)\b/i, PHONE_LABELS = /\b(phone|tel|telephone|mobile|fax|call)\b/i;
const ID_LABELS = /(invoice|\binv\b|order|\bpo\b|purchase ?order|\bref|account|customer|number|\bno\b|no\.?$)/i;
const KNOWN_LABEL_ONLY = /^(grand total|total|subtotal|sub-total|vat|tax|amount due|balance due|balance|invoice date|due date|date)\s*:?$/i;
const full = (src: string, flags = "") => new RegExp(`^(?:${src})$`, flags);
const digits = (s: string) => (s.match(/\d/g) ?? []).length;
const isoDate = (y: number, m: number, d: number): string | null => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1 ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null; };
type DateHit = [number, number, string, string[], string | null];
export function parseDates(text: string): DateHit[] {
  const out: DateHit[] = [];
  for (const m of text.matchAll(RE_ISO)) { const v = isoDate(+m[1], +m[2], +m[3]); if (v) out.push([m.index!, m.index! + m[0].length, v, [], "ISO date yyyy-mm-dd"]); }
  for (const m of text.matchAll(RE_DMY_TEXT)) { const v = isoDate(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]); if (v) out.push([m.index!, m.index! + m[0].length, v, [], "day month-name year"]); }
  for (const m of text.matchAll(RE_MDY_TEXT)) { const v = isoDate(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]); if (v) out.push([m.index!, m.index! + m[0].length, v, [], "month-name day year"]); }
  for (const m of text.matchAll(RE_NUM_DATE)) {
    const a = +m[1], b = +m[2]; let y = +m[3]; if (y < 100) y += 2000; const s = m.index!, e = s + m[0].length;
    if (a > 12 && b <= 12) { const v = isoDate(y, b, a); if (v) out.push([s, e, v, [], "numeric dd/mm/yyyy (day > 12)"]); }
    else if (b > 12 && a <= 12) { const v = isoDate(y, a, b); if (v) out.push([s, e, v, [], "numeric mm/dd/yyyy (day > 12)"]); }
    else if (a === b) { const v = isoDate(y, a, b); if (v) out.push([s, e, v, [], "numeric date, day equals month"]); }
    else { const dm = isoDate(y, b, a), md = isoDate(y, a, b); if (dm && md) out.push([s, e, m[0], [`ambiguous: day/month order unknown (${dm} if day first, ${md} if month first)`], "numeric date, order ambiguous"]); }
  }
  return out.filter((d) => !out.some((o) => o !== d && o[0] <= d[0] && d[1] <= o[1] && o[1] - o[0] > d[1] - d[0]));
}
/** [value as plain decimal string, ISO currency or null, rule] when the whole text is a money amount. A bare number needs a money-like label. */
export function parseAmount(text: string, label: string | null): [string, string | null, string] | null {
  const t = text.trim(), m = full(AMOUNT_SRC).exec(t);
  if (m?.groups) { const num = m.groups.num ?? m.groups.num2, cur = CUR[(m.groups.cur ?? m.groups.cur2 ?? "").trim()] ?? null; return Number.isNaN(Number(num.replace(/,/g, ""))) ? null : [num.replace(/,/g, ""), cur, "currency amount"]; }
  if (label && AMOUNT_LABELS.test(label) && RE_PLAIN_AMOUNT.test(t)) return [t.replace(/,/g, ""), null, "number after a money label"];
  return null;
}
function subbox(it: RawItem, a: number, b: number): [number[], boolean] {
  const [x0, y0, x1, y1] = it.bbox, cx = it.char_x; if (cx && cx.length === it.text.length) return [[cx[a][0], y0, cx[b - 1][1], y1], false];
  const n = Math.max(it.text.length, 1); return [[x0 + ((x1 - x0) * a) / n, y0, x0 + ((x1 - x0) * b) / n, y1], true];
}
class Fields {
  out: FieldOut[] = []; n = 0; seen = new Set<string>();
  constructor(private page: number, private basedOn: (it: RawItem) => string) {}
  add(it: RawItem, a: number, b: number, type: string, label: string | null, value: string, rule: string, flags: string[] = [], currency: string | null = null) {
    const raw = it.text.slice(a, b), key = `${type}|${value}|${it.bbox[0].toFixed(2)}|${it.bbox[1].toFixed(2)}|${a}`; if (this.seen.has(key)) return; this.seen.add(key);
    const [box, approx] = subbox(it, a, b), conf = it.conf ?? null, fl = [...flags]; if (conf !== null && conf < LOW_CONF) fl.push(`low OCR confidence (${conf.toFixed(2)})`); this.n++;
    this.out.push({ id: `f${this.page}-${this.n}`, page: this.page, type, label, raw, value, currency, bbox: box.map((v) => Math.round(v * 1e5) / 1e5), bbox_approximate: approx, item_id: it.id ?? null, origin: "rule_parsed", based_on: this.basedOn(it), rule, ocr_confidence: conf, flags: fl, status: "unreviewed", original_value: value, current_value: value, note: "" });
  }
}
function typedValue(text: string, label: string | null): [string, string, string | null, string, string[]] | null {
  const t = text.trim(), ds = parseDates(t); if (ds.length === 1 && ds[0][0] === 0 && ds[0][1] === t.length) return ["date", ds[0][2], null, ds[0][4] ?? "date", ds[0][3]];
  if (full(EMAIL_SRC).test(t)) return ["email", t, null, "email address pattern", []];
  const am = parseAmount(t, label); if (am) return ["amount", am[0], am[1], am[2], am[1] ? ["currency inferred from the symbol"] : []];
  if (full(PHONE_SRC).test(t) && digits(t) >= 8 && digits(t) <= 15 && (t.startsWith("+") || (label && PHONE_LABELS.test(label)))) return ["phone", t.startsWith("+") ? t.replace(/[^\d+]/g, "") : t, null, "phone number pattern (+ prefix or phone label)", []];
  if (label && ID_LABELS.test(label) && /^[A-Za-z0-9][A-Za-z0-9\-/_.]{2,}$/.test(t) && /\d/.test(t)) return ["identifier", t, null, "identifier after an id-like label", []];
  return null;
}
export function extractFields(page: number, rows: RawItem[][], tableItems: Set<RawItem>, basedOn: (it: RawItem) => string): FieldOut[] {
  const F = new Fields(page, basedOn);
  for (const r of rows) for (let idx = 0; idx < r.length; idx++) {
    const it = r[idx]; if (tableItems.has(it)) continue; const text = it.text, m = RE_KV.exec(text);
    if (m?.groups && !m.groups.value.startsWith("//") && !/^\d{1,2}$/.test(m.groups.label.trim()) && m.groups.label.split(/\s+/).filter(Boolean).length <= 5 && !(/\d$/.test(m.groups.label) && /^\d/.test(m.groups.value) && !/ /.test(text.slice(m.indices!.groups!.label[1], m.indices!.groups!.value[0])))) {
      const label = m.groups.label.trim(), va = m.indices!.groups!.value[0], vb = text.length, tv = typedValue(m.groups.value, label);
      if (tv) F.add(it, va, vb, tv[0], label, tv[1], "label: value + " + tv[3], tv[4], tv[2]);
      else { F.add(it, va, vb, "text", label, m.groups.value.trim(), "label: value pair"); for (const [s, e, iso, fl, rule] of parseDates(m.groups.value)) F.add(it, va + s, va + e, "date", null, iso, rule ?? "date", fl); for (const em of m.groups.value.matchAll(new RegExp(EMAIL_SRC, "g"))) F.add(it, va + em.index!, va + em.index! + em[0].length, "email", null, em[0], "email address pattern"); }
      continue;
    }
    if (KNOWN_LABEL_ONLY.test(text.trim()) && idx + 1 < r.length && !tableItems.has(r[idx + 1])) { const nxt = r[idx + 1], label = text.trim().replace(/:$/, "").trim(), tv = typedValue(nxt.text, label); if (tv) F.add(nxt, 0, nxt.text.length, tv[0], label, tv[1], "known label followed by value on the same row + " + tv[3], tv[4], tv[2]); continue; }
    const tv = typedValue(text, null); if (tv && ["date", "email", "amount", "phone"].includes(tv[0])) { F.add(it, 0, text.length, tv[0], null, tv[1], "stand-alone " + tv[3], tv[4], tv[2]); continue; }
    for (const [s, e, iso, fl, rule] of parseDates(text)) F.add(it, s, e, "date", null, iso, "date inside text: " + (rule ?? "date"), fl);
    for (const em of text.matchAll(new RegExp(EMAIL_SRC, "g"))) F.add(it, em.index!, em.index! + em[0].length, "email", null, em[0], "email address pattern");
    for (const am of text.matchAll(new RegExp(AMOUNT_SRC, "g"))) if (am.groups?.cur || am.groups?.cur2) { const p = parseAmount(am[0], null); if (p) F.add(it, am.index!, am.index! + am[0].length, "amount", null, p[0], "currency amount inside text", p[1] ? ["currency inferred from the symbol"] : [], p[1]); }
    for (const ph of text.matchAll(new RegExp(PHONE_SRC, "g"))) { const s = ph[0]; if (s.startsWith("+") && digits(s) >= 8 && digits(s) <= 15 && !F.out.some((f) => f.type === "date" && f.item_id === (it.id ?? null) && f.raw === s)) F.add(it, ph.index!, ph.index! + s.length, "phone", null, s.replace(/[^\d+]/g, ""), "phone number pattern (+ prefix)"); }
  }
  return F.out;
}
const num = (s: string): number | null => { const n = Number(s.replace(/,/g, "")); return s.trim() === "" || Number.isNaN(n) ? null : n; };
const find = (fields: FieldOut[], ...names: string[]) => fields.find((f) => f.type === "amount" && f.label && names.includes(f.label.trim().toLowerCase())) ?? null;
const r2 = (n: number) => String(Math.round(n * 1e6) / 1e6);
export function validations(fields: FieldOut[], tables: { id: string; cells: string[][] }[]): Validation[] {
  const out: Validation[] = [], sub = find(fields, "subtotal", "sub-total"), tot = find(fields, "total", "grand total", "amount due", "balance due"), tax = fields.find((f) => f.type === "amount" && f.label && /^(vat|tax)\b/i.test(f.label.trim()));
  if (sub && tot && tax) { const a = num(sub.current_value), b = num(tax.current_value), c = num(tot.current_value); if (a !== null && b !== null && c !== null) out.push({ rule: "subtotal + tax = total", passed: Math.abs(a + b - c) <= 0.005, detail: `${a} + ${b} = ${r2(a + b)}; total shown ${c}`, fields: [sub.id, tax.id, tot.id] }); }
  for (const t of tables) {
    const head = t.cells.length ? t.cells[0].map((h) => h.trim().toLowerCase()) : [], col = (...keys: string[]) => { const i = head.findIndex((h) => keys.some((k) => h.includes(k))); return i < 0 ? null : i; };
    const q = col("qty", "quantity"), u = col("unit", "price", "rate"), a = col("amount", "line total", "total"); if (q === null || u === null || a === null || new Set([q, u, a]).size < 3) continue;
    const bad: string[] = [], amounts: number[] = []; let checked = 0;
    t.cells.slice(1).forEach((row, i) => { const nq = num(row[q]), nu = num(row[u]), na = num(row[a]); if (nq === null || nu === null || na === null) return; checked++; amounts.push(na); if (Math.abs(nq * nu - na) > 0.005) bad.push(`row ${i + 2}: ${nq} x ${nu} = ${r2(nq * nu)}, shown ${na}`); });
    if (checked) {
      out.push({ rule: `quantity x unit price = amount (${t.id})`, passed: !bad.length, detail: `${checked} row(s) checked` + (bad.length ? "; " + bad.join("; ") : ""), fields: [] });
      if (sub) { const s = num(sub.current_value); if (s !== null) { const tsum = amounts.reduce((x, y) => x + y, 0); out.push({ rule: `sum of table amounts = subtotal (${t.id})`, passed: Math.abs(tsum - s) <= 0.005, detail: `table sum ${r2(tsum)}; subtotal shown ${s}`, fields: [sub.id] }); } }
    }
  }
  const failed = new Set(out.filter((v) => !v.passed).flatMap((v) => v.fields)); for (const f of fields) if (failed.has(f.id)) f.flags.push("arithmetic check failed");
  return out;
}
const CLASSES: Record<string, string[]> = {
  invoice: ["invoice", "bill to", "invoice no", "invoice date", "due date", "subtotal", "vat", "tax", "total", "amount due", "qty", "quantity", "unit price", "payment terms"],
  receipt: ["receipt", "thank you for your purchase", "cash", "change", "card", "visa", "mastercard", "subtotal", "total", "tax", "cashier", "store"],
  letter: ["dear", "sincerely", "yours faithfully", "yours sincerely", "kind regards", "regards", "re:"],
  report: ["report", "period", "prepared by", "summary", "quarter", "monthly", "annual", "status", "on hand", "reorder"],
  terms_and_conditions: ["terms and conditions", "terms of service", "agreement", "liability", "governing law", "effective"],
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function classify(text: string, nTables: number) {
  const low = text.toLowerCase(), hits = Object.fromEntries(Object.entries(CLASSES).map(([c, ks]) => [c, ks.filter((k) => new RegExp(`(?<![a-z])${esc(k)}(?![a-z])`).test(low))])), scores = Object.fromEntries(Object.entries(hits).map(([c, v]) => [c, v.length]));
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]), [top, second] = ranked, label = top[1] >= 3 && top[1] - second[1] >= 2 ? top[0] : "unclassified";
  return { label, method: "keyword rules (not a trained classifier)", scores, matched: Object.fromEntries(Object.entries(hits).filter(([, v]) => v.length)), note: "A label needs at least 3 distinct keywords and a lead of 2 over the runner-up; otherwise the document is left unclassified.", tables_found: nTables };
}
