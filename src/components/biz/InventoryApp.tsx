"use client";
import { useMemo, useState } from "react";
import { logActivity, resetDb, useSlice } from "@/lib/biz/db";
import { avgCosts, qtyAt, stockLevel, stockMap, totalQty, valuation } from "@/lib/biz/inv-calc";
import type { Movement, MoveType, Product } from "@/lib/biz/seed-inv";
import { DEMO_TODAY, downloadCsv, fmtDate, groupBy, hash01, lastNMonths, money, moneyK, monthKey, monthLabel, num, round2, sum, uid } from "@/lib/biz/util";
import type { Branding } from "@/lib/types";
import { AppProviders, Badge, BarChart, BrandLogo, Btn, DataTable, DemoBadge, DemoLinks, Empty, FilterSelect, LineChart, Modal, Notice, Panel, PageHead, ResetButton, SelectIn, TextIn, useConfirm, useToast, type Col } from "./kit";

/* Warehouse workstation: a split-screen stock desk. A scan/search bar and warehouse selector sit on top, a narrow task rail on the left, the stock list in the middle and the selected product (with its bin on a floor map) beside it. */
const RAIL = [{ id: "stock", label: "Stock" }, { id: "alerts", label: "Low stock" }, { id: "valuation", label: "Valuation" }, { id: "receive", label: "Receipts" }, { id: "transfers", label: "Transfers" }, { id: "adjust", label: "Adjustments" }, { id: "history", label: "History" }, { id: "map", label: "Warehouse map" }];
const lvTone = (l: string) => (l === "OK" ? "green" : l === "Low" ? "amber" : "red") as "green" | "amber" | "red";
const AISLES = ["A", "B", "C", "D", "E", "F"], RACKS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function InventoryApp({ branding }: { branding: Branding }) {
  return (
    <AppProviders className="bg-slate-300 text-slate-800" note="Demonstration inventory software with fictional data. Stock levels are derived from the movement history. Resetting also resets the Procurement demo, because the two share stock.">
      <Workstation branding={branding} />
    </AppProviders>
  );
}
function Workstation({ branding }: { branding: Branding }) {
  const [screen, setScreen] = useState("stock"); const [sel, setSel] = useState<string | null>(null); const [wh, setWh] = useState(""); const [q, setQ] = useState(""); const [op, setOp] = useState<null | "receive" | "transfer" | "adjust">(null); const [newProd, setNewProd] = useState(false);
  const { inv, setInv, map, total, value, addMoves } = useInv(); const toastFn = useToast();
  const low = inv.products.filter((p) => total(p.id) <= p.reorder).length, out = inv.products.filter((p) => total(p.id) <= 0).length;
  const units = sum(inv.products, (p) => total(p.id)), val = sum(inv.products, (p) => value(p));
  const pick = (id: string) => { setSel(id); setScreen("stock"); };
  const scan = () => { const s = q.trim().toLowerCase(); if (!s) return; const hit = inv.products.find((p) => p.sku.toLowerCase() === s) ?? (inv.products.filter((p) => `${p.sku} ${p.name}`.toLowerCase().includes(s)).length === 1 ? inv.products.find((p) => `${p.sku} ${p.name}`.toLowerCase().includes(s)) : undefined); if (hit) { pick(hit.id); toastFn(`Found ${hit.sku}: ${hit.name}`); } else toastFn("No single product matches. Refine the search.", "red"); };
  void map; void setInv; void addMoves;
  return (
    <>
      <header className="no-print bg-slate-800 text-slate-100">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <BrandLogo branding={branding} height={28} />
          <div><h1 className="font-display text-lg font-semibold leading-tight text-white">NorthPeak Warehouse</h1><p className="text-sm leading-tight text-slate-300">Stock desk · weighted-average valuation</p></div>
          <form className="flex min-w-[260px] flex-1 items-center gap-2 sm:max-w-xl" onSubmit={(e) => { e.preventDefault(); scan(); }} role="search">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan barcode or search SKU / product…" aria-label="Scan barcode or search SKU or product" data-testid="scan-input" className="w-full rounded-md border-2 border-amber-400 bg-slate-900 px-3 py-2 text-[16px] text-white placeholder:text-slate-400" />
            <button type="submit" className="rounded-md bg-amber-400 px-4 py-2 text-[15px] font-semibold text-slate-900 hover:bg-amber-300" data-testid="scan-go">Find</button></form>
          <div role="group" aria-label="Warehouse" className="flex overflow-hidden rounded-md border border-slate-500 text-[15px]">{[{ id: "", name: "All warehouses" }, ...inv.warehouses].map((w) => <button key={w.id} type="button" aria-pressed={wh === w.id} onClick={() => setWh(w.id)} data-testid={`wh-pick-${w.id || "all"}`} className={`px-3 py-1.5 ${wh === w.id ? "bg-amber-400 font-semibold text-slate-900" : "text-slate-100 hover:bg-slate-700"}`}>{w.name}</button>)}</div>
          <div className="ml-auto flex flex-wrap items-center gap-2"><Btn kind="primary" onClick={() => setOp("receive")} testid="op-receive">Receive</Btn><Btn onClick={() => setOp("transfer")} testid="op-transfer">Transfer</Btn><Btn onClick={() => setOp("adjust")} testid="op-adjust">Adjust</Btn><Btn onClick={() => setNewProd(true)} testid="new-product">+ New product</Btn></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-700 bg-slate-900 px-4 py-1.5 text-[15px] text-slate-200"><span>Stock value <strong className="text-white tabular-nums" data-testid="kpi-value">{moneyK(val)}</strong></span><span>Units <strong className="text-white tabular-nums" data-testid="kpi-units">{num(units)}</strong></span><span>Products <strong className="text-white">{inv.products.length}</strong></span><span>Low <strong className={low ? "text-amber-300" : "text-white"} data-testid="kpi-low">{low}</strong></span><span>Out of stock <strong className={out ? "text-red-300" : "text-white"} data-testid="kpi-out">{out}</strong></span>
          <span className="ml-auto flex items-center gap-2"><DemoBadge /><ResetButton onReset={() => resetDb(["inv", "proc"])} label="Reset stock & orders" /><DemoLinks compact /></span></div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav aria-label="Warehouse tasks" className="no-print flex shrink-0 flex-row flex-wrap gap-1 bg-slate-700 p-2 lg:w-48 lg:flex-col">
          {RAIL.map((r) => <button key={r.id} type="button" data-nav={r.id} aria-current={screen === r.id ? "page" : undefined} onClick={() => setScreen(r.id)} className={`rounded-md px-3 py-2 text-left text-[15px] font-medium ${screen === r.id ? "bg-amber-400 text-slate-900" : "text-slate-100 hover:bg-slate-600"}`}>{r.label}{r.id === "alerts" && low > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 text-[13px] text-white">{low}</span>}</button>)}
        </nav>
        <main className="min-w-0 flex-1 p-3 sm:p-4" id="app-main">
          {screen === "stock" && <StockDesk wh={wh} q={q} sel={sel} setSel={setSel} openOp={setOp} />}
          {screen === "alerts" && <Alerts open={pick} />}
          {screen === "valuation" && <Reports />}
          {screen === "receive" && <Receive />}
          {screen === "transfers" && <Transfers />}
          {screen === "adjust" && <Adjust />}
          {screen === "history" && <Movements />}
          {screen === "map" && <Warehouses open={pick} wh={wh} />}
        </main>
      </div>
      {op && <OpModal kind={op} productId={sel ?? undefined} onClose={() => setOp(null)} />}
      {newProd && <ProductForm onClose={() => setNewProd(false)} onSave={(rec, opening) => { const id = uid("p"); setInv((s) => ({ ...s, products: [...s.products, { id, ...rec }] })); if (opening) addMoves([{ date: DEMO_TODAY, productId: id, whId: opening.whId, type: "Opening", qty: opening.qty, unitCost: rec.cost, ref: "OPENING", note: "Opening balance" }]); logActivity("Inventory", `Product created: ${rec.sku}`); toastFn("Product created"); setNewProd(false); pick(id); }} />}
    </>
  );
}
function useInv() {
  const [inv, setInv] = useSlice("inv"); const [proc] = useSlice("proc");
  const map = useMemo(() => stockMap(inv.movements), [inv.movements]); const avg = useMemo(() => avgCosts(inv.products, inv.movements), [inv.products, inv.movements]);
  const total = (p: string) => totalQty(map, p, inv.warehouses); const pName = (id: string) => inv.products.find((p) => p.id === id)?.name ?? "?"; const wName = (id: string) => inv.warehouses.find((w) => w.id === id)?.name ?? "?";
  const catName = (id: string) => inv.categories.find((c) => c.id === id)?.name ?? "?"; const supName = (id: string) => proc.suppliers.find((s) => s.id === id)?.name ?? "—";
  const value = (p: Product) => round2(total(p.id) * (avg.get(p.id) ?? p.cost));
  const addMoves = (ms: Omit<Movement, "id">[]) => setInv((s) => ({ ...s, movements: [...s.movements, ...ms.map((m, i) => ({ ...m, id: `m${Date.now()}${i}${Math.floor(Math.random() * 99)}` }))] }));
  return { inv, setInv, proc, map, avg, total, pName, wName, catName, supName, value, addMoves };
}
const levelOf = (q: number, p: Product) => stockLevel(q, p.reorder);

/* ───────── Bin locations (floor map) ───────── */
const binOf = (bins: Record<string, string> | undefined, pid: string, wid: string) => bins?.[`${pid}|${wid}`] ?? `${AISLES[Math.floor(hash01(pid + wid + "a") * 6)]}-${String(1 + Math.floor(hash01(pid + wid + "r") * 8)).padStart(2, "0")}-${1 + Math.floor(hash01(pid + wid + "l") * 3)}`;
function BinMap({ wid, highlight, compact, onBin, active }: { wid: string; highlight?: string; compact?: boolean; onBin?(cell: string): void; active?: string }) {
  const { inv, map } = useInv(); const cells = new Map<string, { id: string; q: number }[]>();
  for (const p of inv.products) { const q = qtyAt(map, p.id, wid); if (q > 0) { const b = binOf(inv.bins, p.id, wid); const key = b.slice(0, 4); cells.set(key, [...(cells.get(key) ?? []), { id: p.id, q }]); } }
  return (
    <div className="inline-block rounded-lg border border-slate-400 bg-slate-100 p-2" role="group" aria-label="Warehouse floor map" data-testid="bin-map">
      <div className="mb-1 grid" style={{ gridTemplateColumns: `28px repeat(${AISLES.length}, minmax(0, 1fr))` }}><span />{AISLES.map((a) => <span key={a} className="text-center text-sm font-semibold text-slate-600">Aisle {a}</span>)}</div>
      {RACKS.map((r) => <div key={r} className="grid gap-1 pb-1" style={{ gridTemplateColumns: `28px repeat(${AISLES.length}, minmax(0, 1fr))` }}><span className="self-center text-sm text-slate-500">{String(r).padStart(2, "0")}</span>
        {AISLES.map((a) => { const key = `${a}-${String(r).padStart(2, "0")}`; const items = cells.get(key) ?? []; const has = highlight && items.some((i) => i.id === highlight); const names = items.map((i) => `${inv.products.find((p) => p.id === i.id)?.sku} × ${i.q}`).join(", ");
          return <button key={key} type="button" onClick={() => onBin?.(key)} aria-label={`Bin ${key}: ${items.length} products${has ? ", contains the selected product" : ""}`} title={names || "Empty"} aria-pressed={active === key}
            className={`flex items-center justify-center rounded border text-sm tabular-nums ${compact ? "h-8" : "h-10"} ${has ? "border-amber-600 bg-amber-300 font-bold text-slate-900" : items.length ? "border-slate-400 bg-slate-300 text-slate-800" : "border-slate-300 bg-white text-slate-300"} ${active === key ? "ring-2 ring-blue-600" : ""}`}>{items.length || ""}</button>; })}</div>)}
      <p className="mt-1 text-sm text-slate-600">Each square is a rack; the number is how many products are stored there. {highlight ? "Amber = the selected product." : ""}</p>
    </div>
  );
}

/* ───────── Stock desk: list + contextual detail ───────── */
function StockDesk({ wh, q, sel, setSel, openOp }: { wh: string; q: string; sel: string | null; setSel(id: string | null): void; openOp(k: "receive" | "transfer" | "adjust"): void }) {
  const { inv, map, avg, total } = useInv(); const [cat, setCat] = useState(""); const [level, setLevel] = useState(""); const [edit, setEdit] = useState(false); const [cats, setCats] = useState(false);
  const qtyOf = (p: Product) => (wh ? qtyAt(map, p.id, wh) : total(p.id));
  const rows = inv.products.filter((p) => (!cat || p.categoryId === cat) && (!level || stockLevel(total(p.id), p.reorder) === level) && (!q || `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase())) && (!wh || qtyAt(map, p.id, wh) !== 0 || !!q));
  const cols: Col<Product>[] = [{ key: "sku", label: "SKU", render: (p) => <span className="whitespace-nowrap font-mono text-sm">{p.sku}</span> }, { key: "name", label: "Product", render: (p) => <span className="font-medium text-slate-900">{p.name}</span> }, ...(wh ? [{ key: "bin", label: "Bin", value: (p: Product) => binOf(inv.bins, p.id, wh), render: (p: Product) => <span className="whitespace-nowrap font-mono text-sm">{binOf(inv.bins, p.id, wh)}</span> } as Col<Product>] : []),
    { key: "qty", label: wh ? "In this warehouse" : "On hand", align: "right", value: qtyOf, render: (p) => `${num(qtyOf(p))} ${p.unit}` }, { key: "lv", label: "Level", value: (p) => stockLevel(total(p.id), p.reorder), render: (p) => <Badge tone={lvTone(stockLevel(total(p.id), p.reorder))}>{stockLevel(total(p.id), p.reorder)}</Badge> },
    { key: "val", label: "Value", align: "right", value: (p) => qtyOf(p) * (avg.get(p.id) ?? p.cost), render: (p) => money(qtyOf(p) * (avg.get(p.id) ?? p.cost), "USD", 0) }];
  const p = sel ? inv.products.find((x) => x.id === sel) : undefined;
  return (<div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,1fr)]">
    <section aria-label="Stock list" className="min-w-0 rounded-xl border border-slate-400 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-2xl font-semibold text-slate-900">Stock{wh ? ` · ${inv.warehouses.find((w) => w.id === wh)?.name}` : " · all warehouses"}</h2><Btn small onClick={() => setCats(true)} testid="manage-categories">Categories</Btn></div>
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} onRow={(r) => setSel(r.id)} exportName="inventory-products" pageSize={12} search={false} testid="product-table" dense rowClass={(r) => (r.id === sel ? "!bg-amber-100" : "")}
        toolbar={<><FilterSelect label="Category" value={cat} onChange={setCat} options={inv.categories.map((c) => ({ value: c.id, label: c.name }))} /><FilterSelect label="Level" value={level} onChange={setLevel} options={["OK", "Low", "Out of stock"]} /></>} />
    </section>
    <section aria-label="Selected product" className="min-w-0 rounded-xl border border-slate-400 bg-white p-4 shadow-sm xl:sticky xl:top-3 xl:self-start">
      {p ? <DetailPane key={p.id} p={p} wh={wh} openOp={openOp} onEdit={() => setEdit(true)} onGone={() => setSel(null)} /> : <div className="py-12 text-center"><p className="font-display text-xl text-slate-700">No product selected</p><p className="mt-1 text-[15px] text-slate-600">Scan or search a SKU above, or select a row. Its stock by warehouse, bin location and history appear here.</p></div>}
    </section>
    {edit && p && <EditProduct p={p} onClose={() => setEdit(false)} />}{cats && <CategoriesModal onClose={() => setCats(false)} />}
  </div>);
}
function EditProduct({ p, onClose }: { p: Product; onClose(): void }) {
  const { setInv } = useInv(); const toast = useToast();
  return <ProductForm existing={p} onClose={onClose} onSave={(rec) => { setInv((s) => ({ ...s, products: s.products.map((x) => (x.id === p.id ? { ...x, ...rec } : x)) })); toast("Product updated"); onClose(); }} />;
}
function DetailPane({ p, wh, openOp, onEdit, onGone }: { p: Product; wh: string; openOp(k: "receive" | "transfer" | "adjust"): void; onEdit(): void; onGone(): void }) {
  const { inv, setInv, map, avg, total, supName, catName, wName } = useInv(); const toast = useToast(); const confirm = useConfirm(); const id = p.id;
  const t = total(id); const lv = stockLevel(t, p.reorder); const best = wh || [...inv.warehouses].sort((a, b) => qtyAt(map, id, b.id) - qtyAt(map, id, a.id))[0]?.id || "";
  const [mapWh, setMapWh] = useState(best); const [re, setRe] = useState({ reorder: String(p.reorder), qty: String(p.reorderQty) }); const [bin, setBin] = useState(binOf(inv.bins, id, mapWh)); const [binCell, setBinCell] = useState("");
  const moves = inv.movements.filter((m) => m.productId === id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const cur = binOf(inv.bins, id, mapWh); const [ba, br, bl] = bin.split("-");
  const setPart = (i: number, v: string) => { const parts = bin.split("-"); parts[i] = v; setBin(parts.join("-")); };
  return (<>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono text-sm text-slate-600">{p.sku} · {catName(p.categoryId)}</p><h2 className="font-display text-2xl font-semibold leading-tight text-slate-900">{p.name}</h2><p className="text-sm text-slate-600">Supplier {supName(p.supplierId)}</p></div><Badge tone={lvTone(lv)}>{lv}</Badge></div>
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-100 p-3 text-[15px] sm:grid-cols-4"><div><dt className="text-sm text-slate-600">On hand</dt><dd className="font-display text-xl font-semibold tabular-nums" data-testid="pd-total">{num(t)} {p.unit}</dd></div><div><dt className="text-sm text-slate-600">Average cost</dt><dd className="font-semibold tabular-nums">{money(avg.get(id) ?? p.cost)}</dd></div><div><dt className="text-sm text-slate-600">Stock value</dt><dd className="font-semibold tabular-nums">{money(round2(t * (avg.get(id) ?? p.cost)), "USD", 0)}</dd></div><div><dt className="text-sm text-slate-600">Sell price</dt><dd className="font-semibold tabular-nums">{money(p.price)}</dd></div></dl>
    <div className="mt-3 flex flex-wrap gap-2"><Btn kind="primary" onClick={() => openOp("receive")} testid="pd-receive">Receive</Btn><Btn onClick={() => openOp("transfer")} testid="pd-transfer">Transfer</Btn><Btn onClick={() => openOp("adjust")} testid="pd-adjust">Adjust</Btn><Btn onClick={onEdit}>Edit</Btn>
      <Btn kind="danger" onClick={async () => { if (moves.length > 0 && await confirm(`Delete ${p.name} and its ${moves.length} movements? Prefer adjusting stock to zero instead.`)) { setInv((s) => ({ ...s, products: s.products.filter((x) => x.id !== id), movements: s.movements.filter((m) => m.productId !== id) })); toast("Product deleted", "amber"); onGone(); } }}>Delete</Btn></div>
    <h3 className="mt-5 text-base font-semibold text-slate-900">Stock by warehouse and bin</h3>
    <ul className="mt-1 divide-y divide-slate-200 text-[15px]">{inv.warehouses.map((w) => <li key={w.id}><button type="button" onClick={() => { setMapWh(w.id); setBin(binOf(inv.bins, id, w.id)); }} aria-pressed={mapWh === w.id} className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left ${mapWh === w.id ? "bg-amber-50" : "hover:bg-slate-50"}`}><span>{w.name}</span><span className="flex items-center gap-3"><span className="font-mono text-sm text-slate-600">{qtyAt(map, id, w.id) > 0 ? binOf(inv.bins, id, w.id) : "no bin"}</span><span className="font-medium tabular-nums" data-testid={`pd-wh-${w.id}`}>{num(qtyAt(map, id, w.id))}</span></span></button></li>)}</ul>
    <div className="mt-3 flex flex-wrap items-start gap-4"><BinMap wid={mapWh} highlight={id} compact onBin={setBinCell} active={binCell} />
      <div className="min-w-[200px] flex-1"><p className="text-sm text-slate-600">Bin in {wName(mapWh)}: <strong className="font-mono text-slate-900" data-testid="pd-bin">{cur}</strong></p>
        <div className="mt-2 grid grid-cols-3 gap-2"><SelectIn label="Bin aisle" value={ba} onChange={(e) => setPart(0, e.target.value)} options={AISLES} /><SelectIn label="Bin rack" value={br} onChange={(e) => setPart(1, e.target.value)} options={RACKS.map((r) => String(r).padStart(2, "0"))} /><SelectIn label="Bin level" value={bl} onChange={(e) => setPart(2, e.target.value)} options={["1", "2", "3"]} /></div>
        <Btn small className="mt-2" testid="save-bin" onClick={() => { setInv((s) => ({ ...s, bins: { ...(s.bins ?? {}), [`${id}|${mapWh}`]: bin } })); toast(`Bin set to ${bin}`); }}>Move to this bin</Btn>
        {binCell && <p className="mt-2 text-sm text-slate-700">Rack {binCell} holds: {inv.products.filter((x) => qtyAt(map, x.id, mapWh) > 0 && binOf(inv.bins, x.id, mapWh).startsWith(binCell)).map((x) => x.sku).join(", ") || "nothing"}</p>}
        <p className="mt-2 text-sm text-slate-500">Bin locations are demonstration data assigned automatically; changes are saved in this browser.</p></div></div>
    <h3 className="mt-5 text-base font-semibold text-slate-900">Reorder settings</h3>
    <div className="mt-1 flex flex-wrap items-end gap-2"><TextIn label="Reorder threshold" type="number" value={re.reorder} onChange={(e) => setRe({ ...re, reorder: e.target.value })} className="w-40" /><TextIn label="Reorder quantity" type="number" value={re.qty} onChange={(e) => setRe({ ...re, qty: e.target.value })} className="w-40" /><Btn kind="primary" testid="save-reorder" onClick={() => { if (!(Number(re.reorder) >= 0) || !(Number(re.qty) >= 1)) return toast("Threshold must be 0 or more and the order quantity at least 1.", "red"); setInv((s) => ({ ...s, products: s.products.map((x) => (x.id === id ? { ...x, reorder: Number(re.reorder), reorderQty: Number(re.qty) } : x)) })); toast("Reorder settings saved"); }}>Save</Btn></div>
    <h3 className="mt-5 text-base font-semibold text-slate-900">Recent movements <span className="text-sm font-normal text-slate-600">({moves.length} in total; full list under History)</span></h3>
    <div className="mt-1 max-h-60 overflow-auto"><table className="w-full text-[15px]"><thead className="sticky top-0 bg-slate-100 text-left text-sm text-slate-600"><tr><th className="p-1.5">Date</th><th className="p-1.5">Type</th><th className="p-1.5">Warehouse</th><th className="p-1.5 text-right">Qty</th><th className="p-1.5">Ref</th></tr></thead><tbody>{moves.slice(0, 12).map((m) => <tr key={m.id} className="border-t border-slate-100"><td className="p-1.5 whitespace-nowrap">{fmtDate(m.date)}</td><td className="p-1.5"><Badge tone={m.qty > 0 ? "green" : "slate"}>{m.type}</Badge></td><td className="p-1.5">{wName(m.whId)}</td><td className={`p-1.5 text-right tabular-nums ${m.qty > 0 ? "text-blue-700" : ""}`}>{m.qty > 0 ? "+" : ""}{m.qty}</td><td className="p-1.5 font-mono text-sm">{m.ref}</td></tr>)}</tbody></table></div>
    <div className="mt-4"><LineChart ariaLabel="Stock level over time" area height={120} series={[{ key: "qty", label: "Units" }]} data={(() => { let run = 0; const series = [...moves].reverse().map((m) => ({ label: monthKey(m.date), v: (run += m.qty) })); return lastNMonths(6).map((mo) => ({ label: monthLabel(mo), values: { qty: [...series].filter((x) => x.label <= mo).pop()?.v ?? 0 } })); })()} /></div>
  </>);
}

function ProductForm({ existing, onClose, onSave }: { existing?: Product; onClose(): void; onSave(p: Omit<Product, "id">, opening: { whId: string; qty: number } | null): void }) {
  const { inv, proc } = useInv(); const [f, setF] = useState({ sku: existing?.sku ?? "", name: existing?.name ?? "", categoryId: existing?.categoryId ?? inv.categories[0]?.id ?? "", unit: existing?.unit ?? "each", cost: String(existing?.cost ?? ""), price: String(existing?.price ?? ""), reorder: String(existing?.reorder ?? 10), reorderQty: String(existing?.reorderQty ?? 20), supplierId: existing?.supplierId ?? proc.suppliers[0]?.id ?? "", description: existing?.description ?? "" });
  const [open, setOpen] = useState({ whId: inv.warehouses[0]?.id ?? "", qty: "0" }); const [err, setErr] = useState<Record<string, string>>({});
  const save = () => { const e: Record<string, string> = {}; if (!/^[A-Za-z0-9-]{2,20}$/.test(f.sku.trim())) e.sku = "SKU: 2–20 letters, numbers or dashes"; else if (inv.products.some((p) => p.sku.toLowerCase() === f.sku.trim().toLowerCase() && p.id !== existing?.id)) e.sku = "That SKU already exists"; if (f.name.trim().length < 3) e.name = "Enter a product name"; if (!(Number(f.cost) > 0)) e.cost = "Cost must be above 0"; if (!(Number(f.price) >= Number(f.cost))) e.price = "Price should be at least the cost"; if (!(Number(f.reorder) >= 0)) e.reorder = "0 or more"; if (!(Number(f.reorderQty) >= 1)) e.reorderQty = "1 or more"; if (!existing && !(Number.isInteger(Number(open.qty)) && Number(open.qty) >= 0)) e.qty = "Whole number, 0 or more"; setErr(e);
    if (!Object.keys(e).length) onSave({ sku: f.sku.trim().toUpperCase(), name: f.name.trim(), categoryId: f.categoryId, unit: f.unit, cost: Number(f.cost), price: Number(f.price), reorder: Number(f.reorder), reorderQty: Number(f.reorderQty), supplierId: f.supplierId, description: f.description }, !existing && Number(open.qty) > 0 ? { whId: open.whId, qty: Number(open.qty) } : null); };
  return (<Modal title={existing ? `Edit ${existing.name}` : "New product"} wide onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} testid="save-product">Save product</Btn></>}>
    <div className="grid gap-3 sm:grid-cols-3"><TextIn label="SKU" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} error={err.sku} /><TextIn label="Product name" className="sm:col-span-2" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.name} />
      <SelectIn label="Category" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} options={inv.categories.map((c) => ({ value: c.id, label: c.name }))} /><SelectIn label="Unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} options={["each", "box", "pack", "roll", "pair", "set"]} /><SelectIn label="Preferred supplier" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })} options={proc.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
      <TextIn label="Unit cost (USD)" type="number" step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} error={err.cost} /><TextIn label="Sell price (USD)" type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} error={err.price} /><div />
      <TextIn label="Reorder threshold" type="number" value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value })} error={err.reorder} hint="Low-stock alert when total units ≤ this" /><TextIn label="Reorder quantity" type="number" value={f.reorderQty} onChange={(e) => setF({ ...f, reorderQty: e.target.value })} error={err.reorderQty} />
      {!existing && <><SelectIn label="Opening stock warehouse" value={open.whId} onChange={(e) => setOpen({ ...open, whId: e.target.value })} options={inv.warehouses.map((w) => ({ value: w.id, label: w.name }))} /><TextIn label="Opening quantity" type="number" value={open.qty} onChange={(e) => setOpen({ ...open, qty: e.target.value })} error={err.qty} /></>}
      <TextIn label="Description" className="sm:col-span-3" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div></Modal>);
}
function CategoriesModal({ onClose }: { onClose(): void }) {
  const { inv, setInv } = useInv(); const toast = useToast(); const [name, setName] = useState(""); const [err, setErr] = useState("");
  return (<Modal title="Product categories" small onClose={onClose} footer={<Btn onClick={onClose}>Done</Btn>}>
    <ul className="divide-y divide-slate-100">{inv.categories.map((c) => { const n = inv.products.filter((p) => p.categoryId === c.id).length; return <li key={c.id} className="flex items-center gap-2 py-2 text-sm"><input aria-label={`Rename ${c.name}`} defaultValue={c.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) { setInv((s) => ({ ...s, categories: s.categories.map((x) => (x.id === c.id ? { ...x, name: v } : x)) })); toast("Category renamed"); } }} className="w-full rounded border border-slate-300 px-2 py-1" /><span className="w-16 text-right text-xs text-slate-500">{n} items</span><Btn small kind="danger" aria-label={`Delete ${c.name}`} onClick={() => { if (n) return setErr(`"${c.name}" still has ${n} products. Move them first.`); setInv((s) => ({ ...s, categories: s.categories.filter((x) => x.id !== c.id) })); toast("Category deleted", "amber"); }}>✕</Btn></li>; })}</ul>
    <div className="mt-3 flex gap-2"><input aria-label="New category name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" /><Btn kind="primary" testid="add-category" onClick={() => { if (name.trim().length < 2) return setErr("Enter a category name."); if (inv.categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return setErr("That category exists."); setInv((s) => ({ ...s, categories: [...s.categories, { id: uid("c"), name: name.trim() }] })); setName(""); setErr(""); toast("Category added"); }}>Add</Btn></div>{err && <p role="alert" className="mt-2 text-sm text-red-600">{err}</p>}</Modal>);
}

/* ───────── Warehouse map ───────── */
function Warehouses({ open, wh }: { open(id: string): void; wh: string }) {
  const { inv, map, avg, catName } = useInv(); const [sel, setSel] = useState(wh || inv.warehouses[0]?.id || ""); const [cell, setCell] = useState("");
  const stats = inv.warehouses.map((w) => { const items = inv.products.map((p) => ({ p, q: qtyAt(map, p.id, w.id) })).filter((x) => x.q > 0); return { w, skus: items.length, units: sum(items, (x) => x.q), val: round2(sum(items, (x) => x.q * (avg.get(x.p.id) ?? x.p.cost))) }; });
  const rows = inv.products.map((p) => ({ p, q: qtyAt(map, p.id, sel) })).filter((x) => x.q !== 0);
  const cols: Col<(typeof rows)[number]>[] = [{ key: "sku", label: "SKU", value: (r) => r.p.sku }, { key: "name", label: "Product", value: (r) => r.p.name, render: (r) => <button className="font-medium text-blue-700 hover:underline" onClick={() => open(r.p.id)}>{r.p.name}</button> }, { key: "cat", label: "Category", value: (r) => catName(r.p.categoryId) }, { key: "q", label: "Units", align: "right", value: (r) => r.q }, { key: "v", label: "Value", align: "right", value: (r) => r.q * (avg.get(r.p.id) ?? r.p.cost), render: (r) => money(r.q * (avg.get(r.p.id) ?? r.p.cost), "USD", 0) }];
  return (<><PageHead title="Warehouse map" sub="Select a warehouse to see its floor map and exactly what it holds. Select a rack square to list what is stored there." />
    <ul className="grid gap-3 md:grid-cols-3">{stats.map((s) => <li key={s.w.id}><button type="button" aria-pressed={sel === s.w.id} onClick={() => setSel(s.w.id)} data-testid={`wh-${s.w.id}`} className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm ${sel === s.w.id ? "border-blue-600 ring-1 ring-blue-600" : "border-slate-200 hover:border-blue-400"}`}><span className="font-display text-lg font-semibold">{s.w.name}</span><span className="block text-xs text-slate-500">{s.w.city}</span><span className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><span><b className="block font-display text-lg">{num(s.units)}</b>units</span><span><b className="block font-display text-lg">{s.skus}</b>SKUs</span><span><b className="block font-display text-lg">{moneyK(s.val)}</b>value</span></span></button></li>)}</ul>
    <div className="mt-4 grid gap-4 xl:grid-cols-[auto_1fr]"><BinMap wid={sel} onBin={(c) => setCell(cell === c ? "" : c)} active={cell} />
      <div className="min-w-0 rounded-xl bg-white p-3 shadow-sm"><DataTable rows={cell ? rows.filter((r) => binOf(inv.bins, r.p.id, sel).startsWith(cell)) : rows} columns={cols} rowKey={(r) => r.p.id} exportName={`inventory-${sel}`} pageSize={12} testid="wh-table" toolbar={cell ? <span className="text-[15px] font-medium">Rack {cell} <button type="button" className="ml-2 text-blue-700 underline" onClick={() => setCell("")}>show all</button></span> : undefined} /></div></div></>);
}

/* ───────── Movements ───────── */

function Movements() {
  const { inv, pName, wName } = useInv(); const [type, setType] = useState(""); const [wh, setWh] = useState(""); const [prod, setProd] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const rows = [...inv.movements].filter((m) => (!type || m.type === type) && (!wh || m.whId === wh) && (!prod || m.productId === prod) && (!from || m.date >= from) && (!to || m.date <= to)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const cols: Col<Movement>[] = [{ key: "date", label: "Date", render: (m) => fmtDate(m.date) }, { key: "type", label: "Type", render: (m) => <Badge tone={m.qty > 0 ? "green" : "slate"}>{m.type}</Badge> }, { key: "p", label: "Product", value: (m) => pName(m.productId) }, { key: "w", label: "Warehouse", value: (m) => wName(m.whId) }, { key: "qty", label: "Qty", align: "right", render: (m) => <span className={m.qty > 0 ? "text-blue-700" : ""}>{m.qty > 0 ? "+" : ""}{m.qty}</span> }, { key: "ref", label: "Reference" }, { key: "note", label: "Note" }];
  return (<><PageHead title="Stock movement history" sub="Every receipt, issue, transfer and adjustment. Stock on hand is the sum of these rows." />
    <DataTable rows={rows} columns={cols} rowKey={(m) => m.id} pageSize={15} exportName="inventory-movements" testid="move-table" toolbar={<><FilterSelect label="Type" value={type} onChange={setType} options={["Opening", "Receipt", "Issue", "Transfer out", "Transfer in", "Adjustment"]} /><FilterSelect label="Warehouse" value={wh} onChange={setWh} options={inv.warehouses.map((w) => ({ value: w.id, label: w.name }))} /><FilterSelect label="Product" value={prod} onChange={setProd} options={inv.products.map((p) => ({ value: p.id, label: p.name }))} /><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-sm" /></>}
      footer={<tr><td colSpan={4} className="px-3 py-2 text-right">Net units of {rows.length} filtered movements</td><td className="px-3 py-2 text-right tabular-nums" data-testid="move-net">{sum(rows, (m) => m.qty)}</td><td colSpan={2} /></tr>} /></>);
}

/* ───────── Operations ───────── */
function OpModal({ kind, productId, onClose }: { kind: "receive" | "transfer" | "adjust"; productId?: string; onClose(): void }) {
  return (<Modal title={kind === "receive" ? "Receive goods" : kind === "transfer" ? "Transfer stock" : "Adjust stock"} onClose={onClose} footer={null}><OpForm kind={kind} productId={productId} onDone={onClose} /></Modal>);
}
function OpForm({ kind, productId, onDone }: { kind: "receive" | "transfer" | "adjust"; productId?: string; onDone?(): void }) {
  const { inv, map, avg, addMoves, supName } = useInv(); const toast = useToast();
  const [f, setF] = useState({ productId: productId ?? inv.products[0]?.id ?? "", whId: inv.warehouses[0]?.id ?? "", toId: inv.warehouses[1]?.id ?? "", qty: "", cost: "", ref: "", note: "", date: DEMO_TODAY, reason: "Cycle count" }); const [err, setErr] = useState("");
  const p = inv.products.find((x) => x.id === f.productId); const avail = p ? qtyAt(map, p.id, f.whId) : 0; const q = Number(f.qty);
  const submit = () => {
    if (!p) return setErr("Choose a product.");
    if (kind === "receive") { if (!(Number.isInteger(q) && q > 0)) return setErr("Quantity must be a whole number above 0."); const c = f.cost === "" ? (avg.get(p.id) ?? p.cost) : Number(f.cost); if (!(c > 0)) return setErr("Unit cost must be above 0."); const ref = f.ref.trim() || `GRN-${Date.now().toString().slice(-6)}`; addMoves([{ date: f.date, productId: p.id, whId: f.whId, type: "Receipt", qty: q, unitCost: c, ref, note: f.note || `Goods received (${supName(p.supplierId)})` }]); logActivity("Inventory", `Received ${q} × ${p.sku}`); toast(`Received ${q} ${p.unit} of ${p.name}`); }
    if (kind === "transfer") { if (f.whId === f.toId) return setErr("The source and destination warehouses must be different."); if (!(Number.isInteger(q) && q > 0)) return setErr("Quantity must be a whole number above 0."); if (q > avail) return setErr(`Only ${avail} available in the source warehouse. You cannot transfer ${q}.`); const ref = `TRF-${Date.now().toString().slice(-6)}`; const wn = (id: string) => inv.warehouses.find((w) => w.id === id)?.name; addMoves([{ date: f.date, productId: p.id, whId: f.whId, type: "Transfer out", qty: -q, ref, note: `To ${wn(f.toId)}${f.note ? `: ${f.note}` : ""}` }, { date: f.date, productId: p.id, whId: f.toId, type: "Transfer in", qty: q, ref, note: `From ${wn(f.whId)}${f.note ? `: ${f.note}` : ""}` }]); logActivity("Inventory", `Transferred ${q} × ${p.sku}`); toast(`Transferred ${q} ${p.unit}: stock updated in both warehouses`); }
    if (kind === "adjust") { if (!(Number.isInteger(q) && q >= 0)) return setErr("Enter the counted quantity (a whole number, 0 or more)."); const d = q - avail; if (d === 0) return setErr("The counted quantity equals the system quantity: nothing to adjust."); if (!f.note.trim()) return setErr("Add a note explaining the adjustment."); addMoves([{ date: f.date, productId: p.id, whId: f.whId, type: "Adjustment", qty: d, ref: `ADJ-${Date.now().toString().slice(-6)}`, note: `${f.reason}: ${f.note.trim()}` }]); logActivity("Inventory", `Adjusted ${p.sku} by ${d}`); toast(`Stock adjusted by ${d > 0 ? "+" : ""}${d}`); }
    setErr(""); setF({ ...f, qty: "", note: "", ref: "", cost: "" }); onDone?.();
  };
  return (<div><div className="grid gap-3 sm:grid-cols-2">
    <SelectIn label="Product" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} options={inv.products.map((x) => ({ value: x.id, label: `${x.sku} · ${x.name}` }))} />
    <SelectIn label={kind === "transfer" ? "From warehouse" : "Warehouse"} value={f.whId} onChange={(e) => setF({ ...f, whId: e.target.value })} options={inv.warehouses.map((w) => ({ value: w.id, label: w.name }))} />
    {kind === "transfer" && <SelectIn label="To warehouse" value={f.toId} onChange={(e) => setF({ ...f, toId: e.target.value })} options={inv.warehouses.map((w) => ({ value: w.id, label: w.name }))} />}
    <TextIn label={kind === "adjust" ? "Counted quantity" : "Quantity"} type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} hint={kind !== "receive" ? `System quantity in source: ${avail}` : undefined} />
    {kind === "receive" && <><TextIn label="Unit cost (blank = current average)" type="number" step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /><TextIn label="Delivery / PO reference" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></>}
    {kind === "adjust" && <SelectIn label="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} options={["Cycle count", "Damaged", "Lost", "Found", "Data correction"]} />}
    <TextIn label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /><TextIn label={kind === "adjust" ? "Note (required)" : "Note"} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={kind === "adjust" ? "" : "sm:col-span-2"} /></div>
    {err && <p role="alert" className="mt-3 text-sm text-red-600" data-testid="op-error">{err}</p>}<div className="mt-4 flex justify-end"><Btn kind="primary" onClick={submit} testid="op-submit">{kind === "receive" ? "Record receipt" : kind === "transfer" ? "Transfer stock" : "Apply adjustment"}</Btn></div></div>);
}
function OpPage({ kind, title, sub, types }: { kind: "receive" | "transfer" | "adjust"; title: string; sub: string; types: MoveType[] }) {
  const { inv, pName, wName } = useInv(); const rows = [...inv.movements].filter((m) => types.includes(m.type) && m.type !== "Opening").sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 60);
  const cols: Col<Movement>[] = [{ key: "date", label: "Date", render: (m) => fmtDate(m.date) }, { key: "ref", label: "Reference" }, { key: "p", label: "Product", value: (m) => pName(m.productId) }, { key: "w", label: "Warehouse", value: (m) => wName(m.whId) }, { key: "type", label: "Type" }, { key: "qty", label: "Qty", align: "right", render: (m) => `${m.qty > 0 ? "+" : ""}${m.qty}` }, { key: "note", label: "Note" }];
  return (<><PageHead title={title} sub={sub} /><div className="grid gap-4 xl:grid-cols-[420px_1fr]"><Panel title="New entry"><OpForm kind={kind} /></Panel><DataTable rows={rows} columns={cols} rowKey={(m) => m.id} exportName={`inventory-${kind}`} testid={`${kind}-table`} defaultSort={{ key: "date", dir: -1 }} /></div></>);
}
const Receive = () => <OpPage kind="receive" title="Goods received" sub="Record deliveries. Stock and the average cost update immediately." types={["Receipt"]} />;
const Transfers = () => <OpPage kind="transfer" title="Warehouse transfers" sub="Move stock between warehouses. Transfers cannot exceed the stock available in the source warehouse." types={["Transfer out", "Transfer in"]} />;
const Adjust = () => <OpPage kind="adjust" title="Stock adjustment" sub="Enter what you counted. The system books the difference as an adjustment movement." types={["Adjustment"]} />;

/* ───────── Alerts ───────── */
function Alerts({ open }: { open(id: string): void }) {
  const { inv, setInv, total, supName } = useInv(); const [proc, setProc] = useSlice("proc"); const toast = useToast(); const [recv, setRecv] = useState<string | null>(null);
  const rows = inv.products.map((p) => ({ p, q: total(p.id), lv: levelOf(total(p.id), p) })).filter((r) => r.lv !== "OK").sort((a, b) => a.q - b.q);
  const makeReq = (p: Product) => { const n = proc.nextNo.req; setProc((s) => ({ ...s, nextNo: { ...s.nextNo, req: n + 1 }, requisitions: [{ id: uid("rq"), number: `REQ-${n}`, requesterId: "e22", date: DEMO_TODAY, dept: "Operations", status: "Draft", lines: [{ productId: p.id, qty: p.reorderQty, price: p.cost }], justification: `Low-stock alert: ${p.name} (${total(p.id)} on hand, reorder at ${p.reorder}).` }, ...s.requisitions] })); logActivity("Inventory", `Draft requisition REQ-${n} created for ${p.sku}`); toast(`Draft requisition REQ-${n} created in Procurement`); };
  const cols: Col<(typeof rows)[number]>[] = [{ key: "sku", label: "SKU", value: (r) => r.p.sku }, { key: "name", label: "Product", value: (r) => r.p.name, render: (r) => <button className="font-medium text-blue-700 hover:underline" onClick={() => open(r.p.id)}>{r.p.name}</button> }, { key: "lv", label: "Level", render: (r) => <Badge tone={lvTone(r.lv)}>{r.lv}</Badge> }, { key: "q", label: "On hand", align: "right" }, { key: "re", label: "Reorder at", align: "right", value: (r) => r.p.reorder }, { key: "short", label: "Shortfall", align: "right", value: (r) => Math.max(0, r.p.reorder - r.q) }, { key: "sug", label: "Suggested order", align: "right", value: (r) => r.p.reorderQty }, { key: "sup", label: "Supplier", value: (r) => supName(r.p.supplierId) },
    { key: "act", label: "", noSort: true, noCsv: true, render: (r) => <div className="flex gap-1"><Btn small onClick={() => makeReq(r.p)} aria-label={`Create requisition for ${r.p.name}`}>Create requisition</Btn><Btn small onClick={() => setRecv(r.p.id)} aria-label={`Receive ${r.p.name}`}>Receive</Btn></div> }];
  void setInv;
  return (<><PageHead title="Low-stock alerts" sub="Products at or below their reorder threshold (total across all warehouses)." />{rows.length === 0 ? <Empty>No alerts. Every product is above its reorder threshold.</Empty> : <DataTable rows={rows} columns={cols} rowKey={(r) => r.p.id} exportName="inventory-low-stock" testid="alert-table" />}
    <Notice tone="blue">“Create requisition” adds a draft requisition to the Procurement demo (shared local data). Nothing is sent to a supplier.</Notice>{recv && <OpModal kind="receive" productId={recv} onClose={() => setRecv(null)} />}</>);
}

/* ───────── Reports ───────── */
function Reports() {
  const { inv, avg, total, value, catName, wName, map } = useInv(); const [tab, setTab] = useState("val"); const vals = valuation(inv.products, inv.movements);
  const byCat = Object.entries(groupBy(inv.products, (p) => catName(p.categoryId))).map(([cat, ps]) => ({ cat, units: sum(ps, (p) => total(p.id)), value: round2(sum(ps, (p) => value(p))) }));
  const exportVal = () => downloadCsv("inventory-valuation", [["SKU", "Product", "Category", "Units", "Average cost (weighted)", "Value"], ...inv.products.map((p) => [p.sku, p.name, catName(p.categoryId), total(p.id), avg.get(p.id) ?? p.cost, value(p)])]);
  const exportWh = () => downloadCsv("inventory-stock-by-warehouse", [["SKU", "Product", ...inv.warehouses.map((w) => w.name), "Total"], ...inv.products.map((p) => [p.sku, p.name, ...inv.warehouses.map((w) => qtyAt(map, p.id, w.id)), total(p.id)])]);
  const months = lastNMonths(6); const types: MoveType[] = ["Receipt", "Issue", "Transfer out", "Adjustment"]; void wName; void vals;
  return (<><PageHead title="Inventory reports" sub="Valuation method: weighted average cost, replayed from the movement ledger." actions={<><Btn onClick={exportVal} testid="export-valuation">Export valuation CSV</Btn><Btn onClick={exportWh} testid="export-wh">Export stock by warehouse CSV</Btn></>} />
    <div className="mb-3 flex gap-1">{[["val", "Valuation by category"], ["moves", "Movements by month"]].map(([id, l]) => <Btn key={id} kind={tab === id ? "primary" : "default"} small onClick={() => setTab(id)}>{l}</Btn>)}</div>
    {tab === "val" ? <Panel pad={false}><table className="w-full text-sm" data-testid="valuation-table"><thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr><th className="p-2">Category</th><th className="p-2 text-right">Units</th><th className="p-2 text-right">Value</th></tr></thead><tbody>{byCat.map((c) => <tr key={c.cat} className="border-t"><td className="p-2 font-medium">{c.cat}</td><td className="p-2 text-right tabular-nums">{num(c.units)}</td><td className="p-2 text-right tabular-nums">{money(c.value, "USD", 0)}</td></tr>)}</tbody><tfoot className="border-t-2 bg-slate-50 font-semibold"><tr><td className="p-2">Total</td><td className="p-2 text-right tabular-nums">{num(sum(byCat, (c) => c.units))}</td><td className="p-2 text-right tabular-nums" data-testid="valuation-total">{money(sum(byCat, (c) => c.value), "USD", 0)}</td></tr></tfoot></table></Panel> :
      <Panel title="Units moved by type"><BarChart ariaLabel="Movements by month" data={months.map((m) => ({ label: monthLabel(m), values: Object.fromEntries(types.map((t) => [t, Math.abs(sum(inv.movements.filter((x) => monthKey(x.date) === m && x.type === t), (x) => x.qty))])) }))} series={types.map((t) => ({ key: t, label: t }))} /></Panel>}
    <p className="mt-3 text-xs text-slate-500">Weighted average cost: each receipt blends its unit cost with the current stock; issues, transfers and adjustments leave the average unchanged. Not an accounting standard election: a demonstration method.</p></>);
}

