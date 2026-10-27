import { SEED_RECEIPTS } from "./seed-proc";
import { hash01 } from "./util";

export type MoveType = "Opening" | "Receipt" | "Issue" | "Transfer out" | "Transfer in" | "Adjustment";
export interface Category { id: string; name: string }
export interface Warehouse { id: string; name: string; city: string }
export interface Product { id: string; sku: string; name: string; categoryId: string; unit: string; cost: number; price: number; reorder: number; reorderQty: number; supplierId: string; description: string }
export interface Movement { id: string; date: string; productId: string; whId: string; type: MoveType; qty: number; unitCost?: number; ref: string; note: string }

export const WAREHOUSES: Warehouse[] = [{ id: "w1", name: "Austin Main", city: "Austin, US" }, { id: "w2", name: "London Hub", city: "London, UK" }, { id: "w3", name: "Rotterdam Overflow", city: "Rotterdam, NL" }];
const CATS: Category[] = [{ id: "c1", name: "Electronics" }, { id: "c2", name: "Office furniture" }, { id: "c3", name: "Packaging" }, { id: "c4", name: "Safety equipment" }, { id: "c5", name: "Tools & hardware" }, { id: "c6", name: "Consumables" }];
// [sku, name, cat, unit, cost, price, supplier, scale (typical stock)]
const P: [string, string, string, string, number, number, string, number][] = [
  ["BS-200", "Barcode scanner BS-200", "c1", "each", 85, 139, "s5", 40], ["LP-4", "Label printer LP-4", "c1", "each", 140, 219, "s5", 25], ["WAP-6", "Wireless access point WAP-6", "c1", "each", 120, 189, "s5", 30], ["MN-24", "24-inch monitor MN-24", "c1", "each", 110, 169, "s5", 45], ["DK-100", "USB-C dock DK-100", "c1", "each", 60, 99, "s5", 60], ["RT-10", "Rugged tablet RT-10", "c1", "each", 310, 459, "s5", 15],
  ["EC-300", "Ergonomic chair EC-300", "c2", "each", 140, 229, "s4", 35], ["SD-120", "Standing desk SD-120", "c2", "each", 260, 399, "s4", 20], ["FC-4", "Filing cabinet 4-drawer", "c2", "each", 95, 149, "s4", 25], ["MT-8", "Meeting table (8 seat)", "c2", "each", 380, 579, "s4", 8],
  ["CB-S", "Cardboard box, small", "c3", "each", 0.45, 0.9, "s6", 2500], ["CB-L", "Cardboard box, large", "c3", "each", 0.95, 1.7, "s6", 1800], ["BW-50", "Bubble wrap roll 50 m", "c3", "roll", 14, 22, "s6", 120], ["PT-48", "Packing tape 48 mm", "c3", "roll", 1.8, 3.4, "s6", 600], ["PW-500", "Pallet stretch wrap", "c3", "roll", 9, 15, "s6", 150],
  ["SH-01", "Safety helmet", "c4", "each", 11, 19, "s9", 200], ["HV-02", "Hi-vis vest", "c4", "each", 6.5, 12, "s9", 300], ["SG-03", "Safety gloves (pair)", "c4", "pair", 3.2, 6.5, "s9", 500], ["FA-10", "First-aid kit", "c4", "each", 24, 39, "s9", 60],
  ["CD-18", "Cordless drill 18V", "c5", "each", 78, 125, "s7", 30], ["SS-40", "Socket set 40-piece", "c5", "set", 45, 74, "s7", 40], ["CT-100", "Cable ties (100 pack)", "c5", "pack", 2.2, 4.5, "s7", 800],
  ["PB-A4", "A4 paper (box of 5 reams)", "c6", "box", 22, 34, "s1", 180], ["TN-85", "Printer toner 85A", "c6", "each", 58, 89, "s1", 70], ["MP-12", "Marker pens (12 pack)", "c6", "pack", 4.5, 8.5, "s1", 250],
];
export const seedInv = () => {
  const products: Product[] = P.map(([sku, name, categoryId, unit, cost, price, supplierId, scale], i) => ({ id: `p${i + 1}`, sku, name, categoryId, unit, cost, price, supplierId, reorder: 0, reorderQty: Math.max(5, Math.round(scale * 0.5)), description: `${name}. Stocked in all three warehouses.` }));
  const mv: Movement[] = []; const on = new Map<string, number>(); let n = 1; const key = (p: string, w: string) => `${p}|${w}`; const qtyOf = (p: string, w: string) => on.get(key(p, w)) ?? 0;
  const push = (date: string, productId: string, whId: string, type: MoveType, qty: number, ref: string, note: string, unitCost?: number) => { if (qty === 0) return; on.set(key(productId, whId), qtyOf(productId, whId) + qty); mv.push({ id: `m${n++}`, date, productId, whId, type, qty, ref, note, unitCost }); };
  products.forEach((p, i) => {
    const scale = P[i][7]; const share = [0.5, 0.3, 0.2];
    WAREHOUSES.forEach((w, wi) => push("2025-10-01", p.id, w.id, "Opening", Math.round(scale * share[wi] * (0.8 + hash01(p.sku + w.id) * 0.5)), "OPENING", "Opening balance", p.cost));
    for (let m = 0; m < 6; m++) {
      const month = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"][m];
      const rd = `${month}-${String(8 + Math.floor(hash01(p.sku + month) * 10)).padStart(2, "0")}`; if (rd > "2026-03-15") continue;
      if (hash01(p.sku + month + "r") < 0.75) push(rd, p.id, "w1", "Receipt", Math.round(scale * (0.18 + hash01(p.sku + month + "q") * 0.25)), `GRN-${1000 + n}`, "Goods received from supplier", Math.round(p.cost * (0.97 + hash01(p.sku + month + "c") * 0.08) * 100) / 100);
      for (let wk = 0; wk < 4; wk++) { const d = `${month}-${String(4 + wk * 7).padStart(2, "0")}`; if (d > "2026-03-15") continue; const w = WAREHOUSES[(wk + i) % 3].id; const q = Math.min(Math.round(qtyOf(p.id, w) * (0.08 + hash01(p.sku + d) * 0.12)), qtyOf(p.id, w)); push(d, p.id, w, "Issue", -q, `SO-${2000 + n}`, "Issued to customer orders"); }
      if (hash01(p.sku + month + "t") < 0.2) { const d = `${month}-20`; if (d <= "2026-03-15") { const q = Math.min(Math.round(qtyOf(p.id, "w1") * 0.2), qtyOf(p.id, "w1")); const r = `TRF-${3000 + n}`; push(d, p.id, "w1", "Transfer out", -q, r, "Transfer to London Hub"); push(d, p.id, "w2", "Transfer in", q, r, "Transfer from Austin Main"); } }
    }
    if (hash01(p.sku + "adj") < 0.2) push("2026-02-27", p.id, "w1", "Adjustment", -Math.min(2, qtyOf(p.id, "w1")), "ADJ-0001", "Cycle count: damaged stock written off");
  });
  for (const r of SEED_RECEIPTS) for (const l of r.lines) push(r.date, l.productId, r.whId, "Receipt", l.qty, `GRN-${r.poNumber.slice(3)}-1`, `Goods received against ${r.poNumber}`, r.unitCosts[l.productId]);
  // shape the alert picture: two products out of stock, several low, the rest comfortable
  const total = (id: string) => WAREHOUSES.reduce((a, w) => a + qtyOf(id, w.id), 0);
  products.forEach((p, i) => { const t = total(p.id); const low = ["MN-24", "BW-50", "SH-01", "CD-18", "TN-85"].includes(p.sku); p.reorder = low ? t + Math.max(3, Math.round(t * 0.15)) : Math.max(2, Math.round(t * 0.35)); void i; });
  for (const sku of ["RT-10", "FA-10"]) { const p = products.find((x) => x.sku === sku)!; WAREHOUSES.forEach((w) => push("2026-03-12", p.id, w.id, "Issue", -qtyOf(p.id, w.id), `SO-${2500 + n}`, "Issued to customer orders")); p.reorder = 10; }
  mv.sort((a, b) => a.date.localeCompare(b.date) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return { categories: CATS, warehouses: WAREHOUSES, products, movements: mv, bins: {} as Record<string, string>, nextNo: { grn: 1000 + n, trf: 3000 + n, adj: 2 } };
};
