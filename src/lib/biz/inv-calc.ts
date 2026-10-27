/** Stock is DERIVED from the movement ledger, so displayed quantities can never drift from the history. Valuation: weighted average cost. */
import type { Movement, Product } from "./seed-inv";
import { round2 } from "./util";

export const stockKey = (p: string, w: string) => `${p}|${w}`;
export function stockMap(moves: Movement[]) { const m = new Map<string, number>(); for (const x of moves) m.set(stockKey(x.productId, x.whId), (m.get(stockKey(x.productId, x.whId)) ?? 0) + x.qty); return m; }
export const qtyAt = (map: Map<string, number>, p: string, w: string) => map.get(stockKey(p, w)) ?? 0;
export const totalQty = (map: Map<string, number>, p: string, whs: { id: string }[]) => whs.reduce((a, w) => a + qtyAt(map, p, w.id), 0);

/** Weighted average cost per product, replayed chronologically. Receipts and openings add stock at their unit cost; issues, transfers and adjustments move stock at the running average. */
export function avgCosts(products: Product[], moves: Movement[]) {
  const sorted = [...moves].sort((a, b) => a.date.localeCompare(b.date) || Number(a.id.replace(/\D/g, "")) - Number(b.id.replace(/\D/g, "")));
  const st = new Map<string, { q: number; avg: number }>(); for (const p of products) st.set(p.id, { q: 0, avg: p.cost });
  for (const m of sorted) { const s = st.get(m.productId); if (!s) continue; const isIn = m.type === "Receipt" || m.type === "Opening"; if (isIn && m.qty > 0) { const c = m.unitCost ?? s.avg; s.avg = s.q + m.qty > 0 ? (s.q * s.avg + m.qty * c) / (s.q + m.qty) : c; } s.q += m.qty; }
  return new Map([...st].map(([id, s]) => [id, round2(s.avg * 10000) / 10000]));
}
export const valuation = (products: Product[], moves: Movement[]) => { const map = stockMap(moves), avg = avgCosts(products, moves); return products.map((p) => { const whTotal = [...map].filter(([k]) => k.startsWith(p.id + "|")).reduce((a, [, q]) => a + q, 0); return { id: p.id, qty: whTotal, avg: avg.get(p.id) ?? p.cost, value: round2(whTotal * (avg.get(p.id) ?? p.cost)) }; }); };
export const stockLevel = (qty: number, reorder: number) => (qty <= 0 ? "Out of stock" : qty <= reorder ? "Low" : "OK");
