"use client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import DemoShell from "./DemoShell";
import Stage3D, { type StageCtx, type View } from "./Stage3D";
import { AMBER, BRAND, buildBuilding, buildSite, type Built } from "./revit3d";
import { BTN, CARD, FIELD, H3, LBL, PRIMARY, SEV, download, pill, toCsv } from "./ui";
import { COST_CATS, DEFAULT_CONTINGENCY, DEFAULT_RATES, DEFAULT_WASTE, PROJECT, UNIT_OPTIONS, allowanceErrors, buildLines, price, summarize, type Allow, type CostCat, type Priced, type Rate, type Unit } from "@/lib/demo-qto-data";
import type { Branding } from "@/lib/types";

const VIEWS: Record<string, View> = { Iso: { pos: [31, 17, 33], target: [12, 3, 7] }, Top: { pos: [12, 48, 7.01], target: [12, 0, 7] }, Front: { pos: [12, 5, 46], target: [12, 3, 7] } };
const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const money2 = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Tab = "inspector" | "rates" | "allowances" | "summary" | "validation";
type SortKey = "id" | "name" | "cat" | "level" | "qty" | "subtotal";
const PAGE = 14;
const STAT: Record<string, string> = { priced: "bg-blue-500/15 text-blue-300", missing: "bg-red-500/15 text-red-300", mismatch: "bg-amber-500/15 text-amber-300", noqty: "bg-amber-500/15 text-amber-300" };
const STAT_L: Record<string, string> = { priced: "priced", missing: "missing rate", mismatch: "unit mismatch", noqty: "no quantity" };

export default function QtoEstimator({ branding }: { branding: Branding }) {
  const { lines, els } = useMemo(() => buildLines(), []);
  const elMap = useMemo(() => new Map(els.map((e) => [e.id, e])), [els]);
  const [rates, setRates] = useState<Rate[]>(DEFAULT_RATES);
  const [allow, setAllow] = useState<Allow>({ waste: DEFAULT_WASTE, contingency: DEFAULT_CONTINGENCY });
  const rows = useMemo(() => price(lines, rates), [lines, rates]);
  const aErr = useMemo(() => allowanceErrors(allow), [allow]);
  const S = useMemo(() => summarize(rows, allow), [rows, allow]);
  const [selRow, setSelRow] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [q, setQ] = useState(""); const [level, setLevel] = useState("All"); const [mat, setMat] = useState("All"); const [ecat, setEcat] = useState("All"); const [ccat, setCcat] = useState("All"); const [stat, setStat] = useState("All");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "id", dir: 1 });
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); const [mode, setMode] = useState<"shaded" | "xray">("shaded"); const [view, setView] = useState("Iso");
  const [ctx, setCtx] = useState<StageCtx | null>(null); const [built, setBuilt] = useState<{ b: Built; extra: Map<string, THREE.Mesh[]> } | null>(null);

  const row = rows.find((r) => r.id === selRow) ?? null;
  const selEl = row?.elId ?? null;
  const flagged = useMemo(() => new Set(rows.filter((r) => r.status !== "priced").map((r) => r.elId)), [rows]);
  const rateOf = (code: string) => rates.find((r) => r.code === code)!;

  const onReady = (c: StageCtx) => {
    c.scene.background = new THREE.Color(0x0d130f);
    c.scene.add(new THREE.HemisphereLight(0xdfeee0, 0x1b241d, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(30, 40, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 }); c.scene.add(sun);
    buildSite(c.scene).traverse((o) => { if (o.userData.site) o.userData.id = "RF-1"; });
    setCtx(c);
  };
  useEffect(() => {
    if (!ctx) return;
    const b = buildBuilding(els); ctx.pick.add(b.group);
    const extra = new Map<string, THREE.Mesh[]>(); const roofs: THREE.Mesh[] = [];
    ctx.scene.traverse((o) => { if (o.userData.id === "RF-1" && (o as THREE.Mesh).isMesh) roofs.push(o as THREE.Mesh); });
    roofs.forEach((m) => { m.material = (m.material as THREE.Material).clone(); extra.set("RF-1", [m]); ctx.pick.attach(m); });
    setBuilt({ b, extra });
    return () => { ctx.pick.remove(b.group); b.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); }); };
  }, [ctx, els]);
  useEffect(() => {
    if (!ctx || !built) return;
    const draw = (id: string, meshes: THREE.Mesh[]) => {
      const e = elMap.get(id), cat = e?.cat ?? "Roof", lv = e?.level ?? "Roof";
      const show = !hidden.has(cat) && !hidden.has(lv), on = id === selEl, fl = flagged.has(id), ghost = mode === "xray" && !on && !fl;
      meshes.forEach((m) => {
        m.visible = show; const mt = m.material as THREE.MeshStandardMaterial;
        if (mt.userData.base === undefined) { mt.userData.base = mt.color.getHex(); mt.userData.op = mt.opacity; mt.userData.tr = mt.transparent; }
        mt.color.setHex(on ? BRAND : mt.userData.base); mt.emissive.setHex(on ? BRAND : fl ? AMBER : 0); mt.emissiveIntensity = on ? 0.55 : fl ? 0.4 : 0;
        mt.transparent = ghost || mt.userData.tr; mt.opacity = ghost ? 0.15 : mt.userData.op; mt.depthWrite = !ghost; mt.needsUpdate = true;
      });
    };
    for (const [id, m] of built.b.byId) draw(id, m); for (const [id, m] of built.extra) draw(id, m);
    built.b.edges.forEach((l) => { const e = elMap.get(l.userData.edgeOf); l.visible = !!e && !hidden.has(e.cat) && !hidden.has(e.level); });
    ctx.invalidate();
  }, [ctx, built, elMap, selEl, flagged, hidden, mode]);
  const goView = (v: string) => { setView(v); ctx?.goto(VIEWS[v]); };
  const onPick = (o: THREE.Object3D | null) => { const id = o?.userData.id as string | undefined; if (!id) return setSelRow(null); const r = rows.find((x) => x.elId === id); setSelRow(r?.id ?? null); if (r) setTab("inspector"); };

  const table = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = rows.filter((r) => (level === "All" || r.level === level) && (mat === "All" || r.material === mat) && (ecat === "All" || r.cat === ecat) && (ccat === "All" || r.cost === ccat) && (stat === "All" || (stat === "ok" ? r.status === "priced" : r.status !== "priced")) && (!ql || `${r.id} ${r.elId} ${r.name} ${r.cat} ${r.material}`.toLowerCase().includes(ql)));
    return list.sort((a, b) => { const x = a[sort.k], y = b[sort.k]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [rows, q, level, mat, ecat, ccat, stat, sort]);
  useEffect(() => setPage(0), [q, level, mat, ecat, ccat, stat, sort]);
  const pages = Math.max(1, Math.ceil(table.length / PAGE)); const pageRows = table.slice(page * PAGE, page * PAGE + PAGE);
  const mats = useMemo(() => ["All", ...new Set(rows.map((r) => r.material))], [rows]);
  const th = (k: SortKey, label: string) => <th className="px-3 py-2 font-medium"><button type="button" aria-label={`Sort by ${label}`} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} className="flex items-center gap-1 hover:text-white">{label}{sort.k === k && <span aria-hidden>{sort.dir === 1 ? "▲" : "▼"}</span>}</button></th>;
  const setRate = (code: string, p: Partial<Rate>) => setRates((rs) => rs.map((r) => (r.code === code ? { ...r, ...p } : r)));
  const setWaste = (c: CostCat, v: string) => setAllow((a) => ({ ...a, waste: { ...a.waste, [c]: v === "" ? NaN : Number(v) } }));
  const resetAll = () => { setRates(DEFAULT_RATES); setAllow({ waste: DEFAULT_WASTE, contingency: DEFAULT_CONTINGENCY }); setSelRow(null); setQ(""); setLevel("All"); setMat("All"); setEcat("All"); setCcat("All"); setStat("All"); setHidden(new Set()); setMode("shaded"); goView("Iso"); setTab("summary"); };

  const takeoffCsv = () => toCsv([["Item", "Element", "Description", "Category", "Level", "Material", "Quantity", "Unit", "Rate", "Rate unit", "Subtotal", "Status"], ...rows.map((r) => [r.id, r.elId, r.name, r.cat, r.level, r.material, r.qty, r.unit, r.rate ?? "", r.rateUnit, r.subtotal.toFixed(2), STAT_L[r.status]])]);
  const scheduleCsv = () => toCsv([["Work item", "Description", "Unit", "Quantity", "Rate", "Cost category", "Net cost"], ...rates.map((rt) => { const l = rows.filter((r) => r.work === rt.code); return [rt.code, rt.name, rt.unit, l.reduce((s, r) => s + r.qty, 0).toFixed(2), rt.rate ?? "", rt.cost, l.reduce((s, r) => s + r.subtotal, 0).toFixed(2)]; })]);
  const costCsv = () => toCsv([["Cost category", "Lines", "Net", "Waste %", "Waste", "Total"], ...S.cats.map((c) => [c.cat, c.lines, c.net.toFixed(2), allow.waste[c.cat], c.waste.toFixed(2), c.total.toFixed(2)]), ["Subtotal incl. waste", "", S.net.toFixed(2), "", S.waste.toFixed(2), S.base.toFixed(2)], [`Contingency ${allow.contingency}%`, "", "", "", "", S.contingency.toFixed(2)], ["TOTAL", "", "", "", "", S.total.toFixed(2)]]);
  const summaryTxt = () => [`${PROJECT.name}: preliminary cost estimate (SAMPLE DATA, illustrative, not a quotation)`, `Session date: ${new Date().toISOString().slice(0, 10)} · Units: m, m², m³, nr · Currency: GBP (sample rates)`, "", ...S.cats.map((c) => `${c.cat}: net ${money(c.net)} + waste ${allow.waste[c.cat]}% ${money(c.waste)} = ${money(c.total)}`), "", `Subtotal: ${money(S.base)}`, `Contingency ${allow.contingency}% (applied once to the subtotal): ${money(S.contingency)}`, `TOTAL: ${money(S.total)}${S.complete ? "" : `  (PROVISIONAL: ${S.issues.length} line(s) not fully priced)`}`, "", "Assumptions: quantities derived from the sample model elements; unit rates are invented; waste applied per cost category; contingency applied once.", ...(S.issues.length ? ["", "Unpriced lines:", ...S.issues.map((i) => `  ${i.id} ${i.name}: ${i.issue}`)] : [])].join("\n");
  const maxCat = Math.max(...S.cats.map((c) => c.total), 1);
  const tabBtn = (k: Tab, l: string) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`flex-1 px-2 py-2.5 text-xs sm:text-sm ${tab === k ? "border-b-2 border-blue-500 font-semibold text-blue-300" : "text-slate-400 hover:text-white"}`}>{l}{k === "validation" && S.issues.length > 0 ? ` (${S.issues.length})` : ""}</button>;

  return (
    <DemoShell branding={branding} app="BIM Quantity Takeoff & Cost Estimator" project={`${PROJECT.name} · ${PROJECT.sub}`} status={S.complete ? PROJECT.status : "Provisional: some lines unpriced"}
      actions={<><button type="button" onClick={() => download("estimate-summary-sample.txt", summaryTxt())} className={BTN}>Export estimate</button><button type="button" onClick={resetAll} className={BTN}>Reset demo</button></>}>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{[["Net cost", money(S.net)], ["Waste allowance", money(S.waste)], ["Subtotal", money(S.base)], [`Contingency ${allow.contingency}%`, money(S.contingency)], ["Estimated total", aErr.length ? "—" : money(S.total)], ["Status", S.complete ? "Complete (illustrative)" : `Provisional · ${S.issues.length} unpriced`]].map(([k, v], i) => <div key={k} className={`rounded-lg border bg-slate-900 px-3 py-2 ${i === 4 ? "border-blue-500/50" : "border-slate-800"}`}><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p><p className={`font-display text-lg font-semibold ${i === 5 && !S.complete ? "text-amber-300" : "text-white"}`}>{v}</p></div>)}</div>
        {aErr.length > 0 && <ul role="alert" className="space-y-1">{aErr.map((e, i) => <li key={i} className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-200">✗ {e} The total is unavailable until this is corrected.</li>)}</ul>}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-3">
            <Stage3D className="h-[42vh] min-h-[300px] lg:h-[46vh]" home={VIEWS.Iso} onReady={onReady} onPick={onPick} shadows label="3D building model. Click an element to see its quantity."
              toolbar={<>
                <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{Object.keys(VIEWS).map((v) => <button key={v} type="button" onClick={() => goView(v)} className={pill(view === v)}>{v}</button>)}</span>
                <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{([["shaded", "Shaded"], ["xray", "X-ray"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className={pill(mode === k)}>{l}</button>)}</span>
                {["Level 1", "Level 2", "Roof"].map((l) => <button key={l} type="button" aria-pressed={!hidden.has(l)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(l)) n.delete(l); else n.add(l); return n; })} className={`rounded-md border border-slate-700 bg-slate-900/90 ${pill(!hidden.has(l))}`}>{l}</button>)}
              </>}>
              {row && <div className="absolute bottom-2 right-2 z-10 rounded bg-slate-950/85 px-3 py-1.5 text-xs"><span className="font-mono text-blue-300">{row.elId}</span> · {row.qty} {row.unit} · {money(row.subtotal)}</div>}
            </Stage3D>
            <div className="flex flex-wrap gap-1.5">{["Walls", "Doors", "Windows", "Columns", "Floors", "Roof"].map((c) => <label key={c} className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-xs"><input type="checkbox" checked={!hidden.has(c)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; })} />{c}</label>)}</div>

            <section className={CARD} aria-label="Quantity takeoff">
              <div className="flex flex-wrap items-end gap-2">
                <div><label className={LBL} htmlFor="tq">Search</label><input id="tq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item, element, description…" className={`${FIELD} w-44`} /></div>
                {([["tl", "Floor", level, setLevel, ["All", "Level 1", "Level 2", "Roof"]], ["tm", "Material", mat, setMat, mats], ["te", "Element", ecat, setEcat, ["All", "Walls", "Doors", "Windows", "Columns", "Floors", "Roof"]], ["tc", "Cost category", ccat, setCcat, ["All", ...COST_CATS]]] as const).map(([id, label, val, set, opts]) => <div key={id}><label className={LBL} htmlFor={id}>{label}</label><select id={id} value={val} onChange={(e) => set(e.target.value)} className={`${FIELD} w-32`}>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>)}
                <div><label className={LBL} htmlFor="ts">Status</label><select id="ts" value={stat} onChange={(e) => setStat(e.target.value)} className={`${FIELD} w-28`}><option value="All">All</option><option value="ok">Priced</option><option value="issues">With issues</option></select></div>
                <p className="ml-auto pb-1.5 text-xs text-slate-500">{table.length} of {rows.length} lines</p>
              </div>
              <div className="mt-3 overflow-x-auto rounded border border-slate-800"><table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400"><tr>{th("id", "Item")}{th("name", "Description")}{th("cat", "Element")}{th("level", "Floor")}{th("qty", "Qty")}<th className="px-3 py-2 font-medium">Unit</th><th className="px-3 py-2 font-medium">Rate</th>{th("subtotal", "Subtotal")}<th className="px-3 py-2 font-medium">Status</th></tr></thead>
                <tbody>{pageRows.map((r) => (
                  <tr key={r.id} onClick={() => { setSelRow(r.id); setTab("inspector"); }} aria-selected={selRow === r.id} className={`cursor-pointer border-t border-slate-800 ${selRow === r.id ? "bg-blue-600/20" : "hover:bg-slate-900"}`}>
                    <td className="px-3 py-1.5 font-mono text-slate-300">{r.id}</td><td className="max-w-[14rem] truncate px-3 py-1.5 text-slate-200">{r.name}</td><td className="px-3 py-1.5">{r.cat} <span className="font-mono text-[10px] text-slate-500">{r.elId}</span></td><td className="px-3 py-1.5">{r.level}</td><td className="px-3 py-1.5">{r.qty}</td><td className="px-3 py-1.5">{r.unit}</td><td className="px-3 py-1.5">{r.rate === null ? <span className="text-red-300">—</span> : `${money2(r.rate)}/${r.rateUnit}`}</td><td className="px-3 py-1.5 font-semibold text-white">{r.status === "priced" ? money(r.subtotal) : "—"}</td>
                    <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STAT[r.status]}`}>{STAT_L[r.status]}</span></td>
                  </tr>))}{!pageRows.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No lines match the filters.</td></tr>}</tbody></table></div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>Page {page + 1} of {pages}</span><span className="flex gap-2"><button type="button" className={`${BTN} disabled:opacity-40`} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button><button type="button" className={`${BTN} disabled:opacity-40`} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button></span></div>
            </section>
          </div>

          <aside aria-label="Estimate panels" className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/60 lg:sticky lg:top-2 lg:self-start">
            <div className="flex border-b border-slate-800">{tabBtn("summary", "Summary")}{tabBtn("inspector", "Quantity")}{tabBtn("rates", "Rates")}{tabBtn("allowances", "Allowances")}{tabBtn("validation", "Checks")}</div>
            <div className="max-h-[70vh] overflow-y-auto p-4 text-xs">
              {tab === "summary" && (
                <div className="space-y-3">
                  <table className="w-full"><thead className="text-slate-500"><tr><th className="py-1 text-left font-medium">Cost category</th><th className="py-1 text-right font-medium">Net</th><th className="py-1 text-right font-medium">+ Waste</th><th className="py-1 text-right font-medium">Total</th></tr></thead><tbody>{S.cats.map((c) => <tr key={c.cat} className="border-t border-slate-800"><td className="py-1.5">{c.cat}{c.bad > 0 && <span className="ml-1 text-amber-300" title={`${c.bad} unpriced line(s)`}>⚠</span>}<div className="mt-0.5 h-1.5 rounded bg-slate-800"><div className="h-1.5 rounded bg-blue-500" style={{ width: `${(c.total / maxCat) * 100}%` }} /></div></td><td className="py-1.5 text-right">{money(c.net)}</td><td className="py-1.5 text-right text-slate-400">{allow.waste[c.cat]}%</td><td className="py-1.5 text-right font-semibold text-white">{money(c.total)}</td></tr>)}</tbody>
                    <tfoot className="border-t border-slate-700"><tr><td className="py-1.5">Subtotal incl. waste</td><td /><td /><td className="py-1.5 text-right font-semibold">{money(S.base)}</td></tr><tr><td className="py-1">Contingency {allow.contingency}% (once, on subtotal)</td><td /><td /><td className="py-1 text-right">{money(S.contingency)}</td></tr><tr className="border-t border-slate-700"><td className="py-2 font-semibold text-white">Estimated total</td><td /><td /><td className="py-2 text-right font-display text-base font-semibold text-blue-300">{aErr.length ? "—" : money(S.total)}</td></tr></tfoot></table>
                  {!S.complete && <p className="rounded bg-amber-500/10 px-3 py-2 text-amber-200">Provisional: {S.issues.length} line(s) are not fully priced and are excluded. Open “Checks” to resolve them.</p>}
                  <div className="flex flex-wrap gap-2"><button type="button" className={PRIMARY} onClick={() => download("cost-breakdown-sample.csv", costCsv(), "text/csv")}>Cost breakdown (.csv)</button><button type="button" className={BTN} onClick={() => download("takeoff-sample.csv", takeoffCsv(), "text/csv")}>Takeoff (.csv)</button><button type="button" className={BTN} onClick={() => download("quantity-schedule-sample.csv", scheduleCsv(), "text/csv")}>Quantity schedule (.csv)</button></div>
                  <p className="text-[10px] leading-snug text-slate-500">Preliminary and illustrative. Rates are invented sample figures, not supplier quotations or market prices. This is not a formal construction quotation or a guaranteed budget.</p>
                </div>
              )}
              {tab === "inspector" && (!row ? <p className="leading-relaxed text-slate-500">Select a line in the table or an element in the 3D model to see how its quantity and cost were derived.</p> : (() => { const e = elMap.get(row.elId); const rt = rateOf(row.work); const wasteP = allow.waste[row.cost]; return (
                <div className="space-y-3"><div><p className="font-display text-base font-semibold text-white">{row.name}</p><p className="font-mono text-slate-500">{row.id} · element {row.elId}</p></div>
                  <dl className="space-y-1 rounded border border-slate-800 bg-slate-950 p-3">{[["Element", `${row.cat}${e ? ` · ${e.type}` : ""}`], ["Floor", row.level], ["Material", row.material || "—"], ["Work item", `${rt.code}: ${rt.name}`], ["Cost category", row.cost]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-200">{v}</dd></div>)}</dl>
                  <div><h3 className={H3}>How the quantity was derived</h3><ul className="mt-1.5 space-y-1 font-mono text-[11px] text-blue-200">{row.method.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
                  <div className="rounded border border-slate-800 bg-slate-950 p-3"><p className="text-slate-400">Cost</p><p className="font-mono text-[11px] text-slate-100">{row.qty} {row.unit} × {row.rate === null ? "(no rate)" : `${money2(row.rate)}/${row.rateUnit}`} = <b>{row.status === "priced" ? money2(row.subtotal) : "not priced"}</b></p>{row.status === "priced" && <p className="mt-1 text-slate-500">With {wasteP}% waste for {row.cost}: {money2(row.subtotal * (1 + wasteP / 100))}. Contingency is applied once to the whole estimate, not per line.</p>}</div>
                  {row.issue && <p className={`rounded px-3 py-2 ${SEV.warning}`}>{row.issue}. <button type="button" onClick={() => setTab("rates")} className="underline">Open rates</button></p>}
                </div>); })())}
              {tab === "rates" && (
                <div className="space-y-2"><p className="text-slate-400">Edit a unit rate or its unit. The unit must match the quantity unit of the work item.</p>
                  {rates.map((rt) => { const l = rows.filter((r) => r.work === rt.code); const qtyU = l[0]?.unit; const bad = l.some((r) => r.status === "missing" || r.status === "mismatch"); return (
                    <div key={rt.code} className={`rounded border p-2.5 ${bad ? "border-amber-500/50 bg-amber-500/5" : "border-slate-800 bg-slate-950"}`}>
                      <p className="font-medium text-slate-100">{rt.name}</p><p className="font-mono text-[10px] text-slate-500">{rt.code} · quantity {l.reduce((s, r) => s + r.qty, 0).toFixed(2)} {qtyU} · {l.length} line{l.length === 1 ? "" : "s"} · {rt.cost}</p>
                      <div className="mt-1.5 flex items-center gap-2"><span className="text-slate-500">£</span><input aria-label={`Rate for ${rt.name}`} type="number" min={0} step="any" value={rt.rate ?? ""} onChange={(e) => setRate(rt.code, { rate: e.target.value === "" ? null : Math.max(0, +e.target.value) })} className={`${FIELD} w-24`} /><span className="text-slate-500">per</span><select aria-label={`Rate unit for ${rt.name}`} value={rt.unit} onChange={(e) => setRate(rt.code, { unit: e.target.value as Unit })} className={`${FIELD} w-20`}>{UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}</select><span className="ml-auto font-semibold text-white">{money(l.reduce((s, r) => s + r.subtotal, 0))}</span></div>
                      {bad && <p className="mt-1 text-[11px] text-amber-300">{rt.rate === null ? "Enter a rate to price these lines." : `Quantities are in ${qtyU}; set the rate unit to ${qtyU}.`}</p>}
                    </div>); })}
                  <button type="button" className={BTN} onClick={() => setRates(DEFAULT_RATES)}>Reset rates</button></div>
              )}
              {tab === "allowances" && (
                <div className="space-y-3"><p className="text-slate-400">Waste is added per cost category on its net cost. Contingency is then added once on the subtotal. Nothing is applied twice.</p>
                  {COST_CATS.map((c) => <div key={c} className="flex items-center gap-2"><label htmlFor={`w-${c}`} className="flex-1 text-slate-200">{c} waste</label><input id={`w-${c}`} type="number" min={0} max={30} step={0.5} value={Number.isNaN(allow.waste[c]) ? "" : allow.waste[c]} onChange={(e) => setWaste(c, e.target.value)} className={`${FIELD} w-20`} /><span className="text-slate-500">%</span></div>)}
                  <div className="flex items-center gap-2 border-t border-slate-800 pt-3"><label htmlFor="cont" className="flex-1 font-semibold text-slate-100">Contingency (whole estimate)</label><input id="cont" type="number" min={0} max={30} step={0.5} value={Number.isNaN(allow.contingency) ? "" : allow.contingency} onChange={(e) => setAllow((a) => ({ ...a, contingency: e.target.value === "" ? NaN : Number(e.target.value) }))} className={`${FIELD} w-20`} /><span className="text-slate-500">%</span></div>
                  <button type="button" className={BTN} onClick={() => setAllow({ waste: DEFAULT_WASTE, contingency: DEFAULT_CONTINGENCY })}>Reset allowances</button></div>
              )}
              {tab === "validation" && (
                <div className="space-y-2">{S.issues.length === 0 && aErr.length === 0 ? <p className="rounded bg-blue-500/10 px-3 py-2 text-blue-300">✓ Every line is priced with matching units. The estimate is complete (illustrative).</p> : null}
                  {aErr.map((e, i) => <p key={i} className="rounded bg-red-500/10 px-3 py-2 text-red-200">✗ {e}</p>)}
                  {S.issues.map((r: Priced) => <button key={r.id} type="button" onClick={() => { setSelRow(r.id); setTab("inspector"); }} className="block w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-left hover:border-blue-500"><span className={`mr-1.5 rounded px-1 text-[10px] font-semibold uppercase ${STAT[r.status]}`}>{STAT_L[r.status]}</span><span className="font-mono">{r.id}</span> {r.name}<span className="block text-slate-400">{r.issue}</span></button>)}
                  <p className="text-[10px] text-slate-500">Checks: missing rates, incompatible units, missing or zero quantities, invalid allowances.</p></div>
              )}
            </div>
          </aside>
        </div>
        <p className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] leading-snug text-slate-400">Quantities are derived from the sample model elements in your browser. Prices are invented illustrative rates. This is a preliminary demonstration and not a quotation, a verified takeoff or a project budget.</p>
      </div>
    </DemoShell>
  );
}
