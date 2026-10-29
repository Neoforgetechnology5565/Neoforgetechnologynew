import assert from "node:assert/strict";
import { classify, extractFields, parseAmount, parseDates, validations, type FieldOut, type RawItem } from "./extract";
const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
const item = (text: string, x = 0.1, y = 0.1, conf: number | null = null, i = 1): RawItem => ({ id: `p1-l${i}`, text, bbox: [x, y, x + 0.01 * text.length, y + 0.02], conf, source: conf !== null ? "ocr_model" : "embedded_text" });
const fields = (texts: string[], conf: number | null = null) => extractFields(1, texts.map((t, k) => [item(t, 0.1, 0.1 + 0.05 * k, conf, k + 1)]), new Set(), (it) => it.source!);
const d = (s: string) => parseDates(s).map((x) => [x[2], x[3]] as [string, string[]]);
check("dates: all formats, ambiguity and impossible dates", () => {
  assert.deepEqual(d("2024-03-14"), [["2024-03-14", []]]); assert.deepEqual(d("14 March 2024"), [["2024-03-14", []]]); assert.equal(d("3rd Sept 2023")[0][0], "2023-09-03"); assert.deepEqual(d("March 14, 2024"), [["2024-03-14", []]]);
  assert.deepEqual(d("25/12/2024"), [["2024-12-25", []]]); assert.deepEqual(d("12/25/2024"), [["2024-12-25", []]]);
  const amb = d("03/04/2024"); assert.ok(amb[0][0] === "03/04/2024" && amb[0][1][0].includes("ambiguous") && amb[0][1][0].includes("2024-04-03") && amb[0][1][0].includes("2024-03-04"));
  assert.deepEqual(d("31/02/2024"), []); assert.deepEqual(d("2024-13-01"), []); assert.deepEqual(d("version 2.3.4 build 10"), []);
});
check("amounts need a currency or a money label", () => {
  assert.deepEqual(parseAmount("£1,234.50", null)!.slice(0, 2), ["1234.50", "GBP"]); assert.deepEqual(parseAmount("$ 7", null)!.slice(0, 2), ["7", "USD"]); assert.deepEqual(parseAmount("12.00 EUR", null)!.slice(0, 2), ["12.00", "EUR"]);
  assert.equal(parseAmount("138.84", null), null); assert.equal(parseAmount("138.84", "Total")![0], "138.84"); assert.equal(parseAmount("138.84", "Room number"), null); assert.equal(parseAmount("abc", "Total"), null);
});
check("key-values: typed and untyped", () => {
  const f = Object.fromEntries(fields(["Invoice No: INV-2024-0173", "Due Date: 13 April 2024", "Total: £138.84", "Email: a.b@example.com", "Phone: +44 20 7946 0123", "Bill To: Someone Ltd"]).map((x) => [x.label ?? x.type, x])) as Record<string, FieldOut>;
  assert.ok(f["Invoice No"].type === "identifier" && f["Invoice No"].value === "INV-2024-0173"); assert.ok(f["Due Date"].value === "2024-04-13" && f["Total"].value === "138.84" && f["Total"].currency === "GBP");
  assert.ok(f["Email"].value === "a.b@example.com" && f["Phone"].value === "+442079460123"); assert.ok(f["Bill To"].type === "text" && f["Bill To"].value === "Someone Ltd"); assert.ok(Object.values(f).every((x) => x.origin === "rule_parsed" && x.status === "unreviewed" && x.rule));
});
check("things that must not become fields", () => {
  assert.equal(fields(["Meeting at 10:30 in room 12", "see https://example.org/page", "Page 3 of 12", "Call 12345"]).length, 0);
  assert.deepEqual(fields(["Note: 123", "Ref: 123"]).map((x) => [x.label, x.type]), [["Note", "text"], ["Ref", "identifier"]]);
});
check("stand-alone values inside text", () => {
  const f = fields(["Contact accounts@example.com or +44 20 7946 0456 before 1 January 2024."]); assert.deepEqual(new Set(f.map((x) => `${x.type}|${x.value}`)), new Set(["email|accounts@example.com", "phone|+442079460456", "date|2024-01-01"]));
});
check("OCR confidence is carried and low values are flagged", () => {
  const f = fields(["Total: £138.84"], 0.62)[0]; assert.ok(f.ocr_confidence === 0.62 && f.based_on === "ocr_model" && f.flags.some((x) => x.includes("low OCR confidence")));
  const e = fields(["Total: £138.84"])[0]; assert.ok(e.ocr_confidence === null && e.based_on === "embedded_text" && e.flags.join() === "currency inferred from the symbol");
});
check("field boxes are exact with per-character positions and marked approximate otherwise", () => {
  const text = "Total: £138.84", exact: RawItem = { id: "p1-l1", text, bbox: [0.1, 0.1, 0.1 + text.length * 0.01, 0.12], char_x: [...text].map((_, k) => [0.1 + k * 0.01, 0.1 + (k + 1) * 0.01] as [number, number]), source: "embedded_text", conf: null };
  const f = extractFields(1, [[exact]], new Set(), (it) => it.source!)[0]; assert.ok(!f.bbox_approximate && Math.abs(f.bbox[0] - 0.17) < 1e-6 && Math.abs(f.bbox[2] - 0.24) < 1e-6);
  const { char_x: _c, ...rest } = exact; void _c; assert.ok(extractFields(1, [[{ ...rest, source: "ocr_model", conf: 0.9 }]], new Set(), (it) => it.source!)[0].bbox_approximate);
});
check("label and value in separate items on one row", () => { const f = extractFields(1, [[item("Total", 0.1, 0.5, null, 1), item("£138.84", 0.5, 0.5, null, 2)]], new Set(), (it) => it.source!); assert.ok(f.length === 1 && f[0].label === "Total" && f[0].value === "138.84"); });
check("validations pass and fail honestly", () => {
  const fl = (s: string, t: string, tot: string): FieldOut[] => [[1, "Subtotal", s], [2, "VAT (20%)", t], [3, "Total", tot]].map(([i, lab, v]) => ({ id: `f1-${i}`, type: "amount", label: lab, current_value: v, flags: [] }) as unknown as FieldOut);
  const table = { id: "t1-1", cells: [["Item", "Qty", "Unit price", "Amount"], ["a", "2", "3.00", "6.00"], ["b", "1", "4.50", "4.50"]] };
  assert.deepEqual(validations(fl("10.50", "2.10", "12.60"), [table]).map((v) => v.passed), [true, true, true]);
  const bad = validations(fl("10.50", "2.10", "12.70"), [{ ...table, cells: [table.cells[0], ["a", "2", "3.00", "6.50"], table.cells[2]] }]); assert.deepEqual(bad.map((v) => v.passed), [false, false, false]); assert.ok(bad[1].detail.includes("6.5"));
  assert.ok(validations([], [table])[0].passed); assert.deepEqual(validations(fl("1", "1", "1").slice(0, 2), []), []);
});
check("classifier needs evidence and says so", () => {
  const inv = classify("Invoice No: 1\nBill To: X\nSubtotal 1\nVAT 2\nTotal 3\nPayment terms", 1); assert.ok(inv.label === "invoice" && inv.matched.invoice.includes("subtotal") && inv.method.includes("not a trained classifier"));
  assert.equal(classify("The quick brown fox jumps over the lazy dog.", 0).label, "unclassified"); assert.equal(classify("Total", 0).label, "unclassified"); assert.equal(classify("", 0).label, "unclassified");
});
