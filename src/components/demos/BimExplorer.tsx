"use client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import DemoShell from "./DemoShell";
import Stage3D, { type StageCtx, type View } from "./Stage3D";
import { AMBER, BRAND, buildBuilding, buildSite, type Built } from "./revit3d";
import { BTN, FIELD, H3, LBL, PRIMARY, SEV, download, pill, toCsv } from "./ui";
import { BCATS, CHECKS, CLASS_TITLE, IFC, LEVEL_NAMES, PROJECT, ROOMS, allFindings, buildBim, categoryTable, metrics, relations, runCheck, type BCat, type BimEl, type CheckKey, type Finding } from "@/lib/demo-bim-data";
import type { Branding } from "@/lib/types";

const VIEWS: Record<string, View> = { Iso: { pos: [31, 17, 33], target: [12, 3, 7] }, Top: { pos: [12, 48, 7.01], target: [12, 0, 7] }, Front: { pos: [12, 5, 46], target: [12, 3, 7] }, Right: { pos: [50, 5, 7], target: [12, 3, 7] } };
type Tab = "table" | "validation" | "dashboard";
type SortKey = "id" | "cat" | "name" | "level" | "material" | "area" | "volume" | "status";
const PAGE = 12;

export default function BimExplorer({ branding }: { branding: Branding }) {
  const els = useMemo(() => buildBim(), []);
  const byId = useMemo(() => new Map(els.map((e) => [e.id, e])), [els]);
  const all = useMemo(() => allFindings(els), [els]);
  const M = useMemo(() => metrics(els), [els]);
  const sevOf = useMemo(() => { const m = new Map<string, string>(); for (const f of all) if (m.get(f.id) !== "error") m.set(f.id, f.severity); return m; }, [all]);

  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("table");
  const [hidden, setHidden] = useState<Set<BCat>>(new Set());
  const [levelF, setLevelF] = useState<"All" | (typeof LEVEL_NAMES)[number]>("All");
  const [isolate, setIsolate] = useState(false);
  const [mode, setMode] = useState<"shaded" | "xray" | "wire">("shaded");
  const [view, setView] = useState("Iso");
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState<BCat | "All">("All");
  const [statusF, setStatusF] = useState<"All" | "ok" | "issues">("All");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "id", dir: 1 });
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<{ name: string; inspected: number; findings: Finding[] } | null>(null);
  const [ctx, setCtx] = useState<StageCtx | null>(null);
  const [built, setBuilt] = useState<{ b: Built; extra: Map<string, THREE.Mesh[]> } | null>(null);

  const flagged = useMemo(() => new Set((report?.findings ?? []).map((f) => f.id)), [report]);
  const selected = sel ? byId.get(sel) ?? null : null;
  const status = (e: BimEl) => sevOf.get(e.id) ?? "ok";

  const onReady = (c: StageCtx) => {
    c.scene.background = new THREE.Color(0x0d130f);
    c.scene.add(new THREE.HemisphereLight(0xdfeee0, 0x1b241d, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(30, 40, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 }); c.scene.add(sun);
    const site = buildSite(c.scene);
    site.traverse((o) => { if (o.userData.site) { o.userData.id = "RF-1"; } });
    setCtx(c);
  };
  useEffect(() => {
    if (!ctx) return;
    const b = buildBuilding(els.filter((e) => e.src).map((e) => e.src!));
    ctx.pick.add(b.group);
    const extra = new Map<string, THREE.Mesh[]>();
    ctx.scene.traverse((o) => { if (o.userData.id === "RF-1" && (o as THREE.Mesh).isMesh) { const m = o as THREE.Mesh; m.material = (m.material as THREE.Material).clone(); extra.set("RF-1", [m]); ctx.pick.attach(m); } });
    const rg = new THREE.Group();
    for (const r of ROOMS) { const w = r.x1 - r.x0 - 0.3, d = r.y1 - r.y0 - 0.3; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: BRAND, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set((r.x0 + r.x1) / 2, (r.level === "Level 1" ? 0 : 3.2) + 0.05, (r.y0 + r.y1) / 2); m.userData.id = r.id; rg.add(m); extra.set(r.id, [m]); }
    ctx.pick.add(rg);
    setBuilt({ b, extra });
    return () => { ctx.pick.remove(b.group); ctx.pick.remove(rg); b.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); }); };
  }, [ctx, els]);
  useEffect(() => {
    if (!ctx || !built) return;
    const draw = (id: string, meshes: THREE.Mesh[]) => {
      const e = byId.get(id); if (!e) return;
      const levelOk = levelF === "All" || e.level === levelF, show = !hidden.has(e.cat) && levelOk;
      const on = id === sel, fl = flagged.has(id);
      const ghost = (mode === "xray" || (isolate && !!sel)) && !on && !fl;
      meshes.forEach((m) => {
        m.visible = show;
        const mt = m.material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
        if (mt.userData.base === undefined) { mt.userData.base = mt.color.getHex(); mt.userData.op = mt.opacity; mt.userData.tr = mt.transparent; }
        mt.color.setHex(on ? BRAND : mt.userData.base);
        if (mt.emissive) { mt.emissive.setHex(on ? BRAND : fl ? AMBER : 0); mt.emissiveIntensity = on ? 0.55 : fl ? 0.45 : 0; }
        else if (e.cat === "Rooms") { mt.color.setHex(on ? BRAND : fl ? AMBER : BRAND); mt.opacity = on ? 0.45 : fl ? 0.35 : 0.07; }
        if (e.cat !== "Rooms") { mt.transparent = ghost || mt.userData.tr; mt.opacity = ghost ? 0.14 : mt.userData.op; mt.depthWrite = !ghost; mt.wireframe = mode === "wire"; }
        mt.needsUpdate = true;
      });
    };
    for (const [id, meshes] of built.b.byId) draw(id, meshes);
    for (const [id, meshes] of built.extra) draw(id, meshes);
    built.b.edges.forEach((l) => { const e = byId.get(l.userData.edgeOf); l.visible = !!e && !hidden.has(e.cat) && (levelF === "All" || e.level === levelF) && mode !== "wire"; });
    ctx.invalidate();
  }, [ctx, built, byId, sel, flagged, hidden, levelF, mode, isolate]);
  const goView = (v: string) => { setView(v); ctx?.goto(VIEWS[v]); };
  const onPick = (o: THREE.Object3D | null) => setSel((o?.userData.id as string | undefined) ?? null);

  // table
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = els.filter((e) => (catF === "All" || e.cat === catF) && (levelF === "All" || e.level === levelF) && (statusF === "All" || (statusF === "ok" ? status(e) === "ok" : status(e) !== "ok")) && (!ql || `${e.id} ${e.name} ${e.mark} ${e.cat} ${e.material} ${e.ifc} ${e.classification}`.toLowerCase().includes(ql)));
    const val = (e: BimEl) => (sort.k === "status" ? status(e) : (e[sort.k as keyof BimEl] as string | number));
    return list.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [els, q, catF, levelF, statusF, sort, sevOf]);
  useEffect(() => setPage(0), [q, catF, levelF, statusF, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const th = (k: SortKey, label: string) => <th key={k} className="px-3 py-2 font-medium"><button type="button" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} className="flex items-center gap-1 hover:text-white" aria-label={`Sort by ${label}`}>{label}{sort.k === k && <span aria-hidden>{sort.dir === 1 ? "▲" : "▼"}</span>}</button></th>;

  const run = (k: CheckKey | "all") => {
    if (k === "all") { setReport({ name: "All checks", inspected: els.filter((e) => e.cat !== "Rooms").length, findings: all }); return; }
    const r = runCheck(k, els); setReport({ name: CHECKS.find((c) => c.key === k)!.name, inspected: r.inspected, findings: r.findings });
  };
  const inventoryCsv = () => toCsv([["Id", "GlobalId", "Category", "IFC class", "Name", "Level", "Material", "Mark", "Classification", "Area m2", "Volume m3", "Status"], ...rows.map((e) => [e.id, e.globalId, e.cat, e.ifc, e.name, e.level, e.material, e.mark, e.classification, e.area, e.volume, status(e)])]);
  const reportCsv = () => toCsv([["Severity", "Element", "Finding"], ...(report?.findings ?? all).map((f) => [f.severity, f.id, f.message])]);
  const catCsv = () => toCsv([["Category", "IFC class", "Count", "Area m2", "Volume m3"], ...categoryTable(els).map((c) => [c.cat, c.ifc, c.count, c.area, c.volume])]);
  const tabBtn = (k: Tab, l: string) => <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`px-4 py-2.5 text-sm ${tab === k ? "border-b-2 border-blue-500 font-semibold text-blue-300" : "text-slate-400 hover:text-white"}`}>{l}</button>;
  const maxCat = Math.max(...categoryTable(els).map((c) => c.count));
  const toggleCat = (c: BCat) => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const grp = "rounded border border-slate-800 bg-slate-950";
  const kv = (k: string, v: string | number) => <div key={k} className="flex justify-between gap-3 py-0.5"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="break-all text-right font-mono text-slate-200">{v === "" ? "—" : v}</dd></div>;

  return (
    <DemoShell branding={branding} app="BIM Model Data Explorer" project={`${PROJECT.name} · ${PROJECT.sub}`} status={PROJECT.status}
      actions={<><button type="button" onClick={() => download("inventory-sample.csv", inventoryCsv(), "text/csv")} className={BTN}>Export inventory</button><button type="button" onClick={() => { setSel(null); setReport(null); setHidden(new Set()); setLevelF("All"); setIsolate(false); setMode("shaded"); setQ(""); setCatF("All"); setStatusF("All"); setSort({ k: "id", dir: 1 }); goView("Iso"); setTab("table"); }} className={BTN}>Reset view</button></>}>
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[16rem_minmax(0,1fr)_21rem]">
        {/* model tree */}
        <aside aria-label="Model tree" className="order-2 border-t border-slate-800 bg-slate-900/60 p-3 lg:order-1 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <h2 className={H3}>Model tree</h2>
          <details open className="mt-2 text-sm"><summary className="cursor-pointer font-semibold text-white">{PROJECT.name} <span className="text-xs font-normal text-slate-500">({els.length})</span></summary>
            {LEVEL_NAMES.map((lv) => { const inLv = els.filter((e) => e.level === lv); return (
              <details key={lv} open={lv !== "Roof"} className="ml-3 mt-1 border-l border-slate-800 pl-2">
                <summary className="cursor-pointer text-xs"><button type="button" onClick={(ev) => { ev.preventDefault(); setLevelF(levelF === lv ? "All" : lv); }} className={levelF === lv ? "font-semibold text-blue-300" : "text-slate-200 hover:text-white"}>{lv}</button> <span className="text-slate-500">({inLv.length})</span></summary>
                {BCATS.filter((c) => inLv.some((e) => e.cat === c)).map((c) => { const list = inLv.filter((e) => e.cat === c); return (
                  <details key={c} className="ml-3 mt-0.5"><summary className="cursor-pointer text-xs"><button type="button" onClick={(ev) => { ev.preventDefault(); setCatF(catF === c ? "All" : c); setTab("table"); }} className={catF === c ? "font-semibold text-blue-300" : "text-slate-300 hover:text-white"}>{c}</button> <span className="text-slate-500">({list.length})</span></summary>
                    <ul className="ml-3 max-h-40 overflow-auto">{list.map((e) => <li key={e.id}><button type="button" onClick={() => setSel(e.id)} className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] ${sel === e.id ? "bg-blue-600/25 text-blue-200" : "text-slate-400 hover:bg-slate-800"}`}>{status(e) !== "ok" && <span className="text-amber-400">⚠ </span>}<span className="font-mono">{e.id}</span> {e.mark || "—"}</button></li>)}</ul>
                  </details>); })}
              </details>); })}
          </details>
          <p className="mt-3 text-[10px] leading-snug text-slate-500">Click a level or category to filter the table. Click an element to select it in the model.</p>
        </aside>

        {/* centre */}
        <div className="order-1 min-w-0 space-y-3 p-3 sm:p-4 lg:order-2">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{[["Elements", M.total], ["Categories", M.categories], ["Levels", M.levels], ["Complete", `${M.complete}/${M.total}`], ["Findings", M.findings], ["Materials", M.materials]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p><p className={`font-display text-lg font-semibold ${k === "Findings" && M.findings ? "text-amber-300" : "text-white"}`}>{v}</p></div>)}</div>
          <Stage3D className="h-[44vh] min-h-[300px] lg:h-[50vh]" home={VIEWS.Iso} onReady={onReady} onPick={onPick} shadows label="3D building model. Click an element to inspect its data."
            toolbar={<>
              <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{Object.keys(VIEWS).map((v) => <button key={v} type="button" onClick={() => goView(v)} className={pill(view === v)}>{v}</button>)}</span>
              <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{([["shaded", "Shaded"], ["xray", "X-ray"], ["wire", "Wireframe"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className={pill(mode === k)}>{l}</button>)}</span>
              <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{(["All", ...LEVEL_NAMES] as const).map((l) => <button key={l} type="button" onClick={() => setLevelF(l)} className={pill(levelF === l)}>{l === "All" ? "All levels" : l}</button>)}</span>
              <button type="button" aria-pressed={isolate} disabled={!sel} onClick={() => setIsolate((v) => !v)} className={`rounded-md border border-slate-700 bg-slate-900/90 ${pill(isolate)} disabled:opacity-40`}>Isolate selection</button>
            </>}>
            {selected && <div className="absolute bottom-2 right-2 z-10 rounded bg-slate-950/85 px-3 py-1.5 text-xs"><span className="font-mono text-blue-300">{selected.id}</span> · {selected.cat} · {selected.name}</div>}
          </Stage3D>
          <div className="flex flex-wrap gap-1.5">{BCATS.map((c) => <label key={c} className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-xs"><input type="checkbox" checked={!hidden.has(c)} onChange={() => toggleCat(c)} />{c}</label>)}</div>

          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="flex flex-wrap border-b border-slate-800" role="tablist">{tabBtn("table", "Data table")}{tabBtn("validation", `Validation${report ? ` (${report.findings.length})` : ""}`)}{tabBtn("dashboard", "Dashboard")}</div>
            {tab === "table" && (
              <div className="p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className={LBL} htmlFor="bq">Search</label><input id="bq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Id, name, mark, material…" className={`${FIELD} w-48`} /></div>
                  <div><label className={LBL} htmlFor="bc">Category</label><select id="bc" value={catF} onChange={(e) => setCatF(e.target.value as BCat | "All")} className={`${FIELD} w-32`}><option>All</option>{BCATS.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div><label className={LBL} htmlFor="bl">Level</label><select id="bl" value={levelF} onChange={(e) => setLevelF(e.target.value as typeof levelF)} className={`${FIELD} w-28`}><option>All</option>{LEVEL_NAMES.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div><label className={LBL} htmlFor="bs">Status</label><select id="bs" value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)} className={`${FIELD} w-28`}><option value="All">All</option><option value="ok">Valid</option><option value="issues">With findings</option></select></div>
                  <p className="ml-auto pb-1.5 text-xs text-slate-500">{rows.length} of {els.length} elements</p>
                </div>
                <div className="mt-3 overflow-x-auto rounded border border-slate-800"><table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400"><tr>{th("id", "Id")}{th("cat", "Category")}{th("name", "Name / type")}{th("level", "Level")}{th("material", "Material")}{th("area", "Area m²")}{th("volume", "Volume m³")}{th("status", "Status")}</tr></thead>
                  <tbody>{pageRows.map((e) => (
                    <tr key={e.id} onClick={() => setSel(e.id)} aria-selected={sel === e.id} className={`cursor-pointer border-t border-slate-800 ${sel === e.id ? "bg-blue-600/20" : "hover:bg-slate-900"}`}>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{e.id}</td><td className="px-3 py-1.5">{e.cat}</td><td className="max-w-[16rem] truncate px-3 py-1.5 text-slate-300">{e.name}</td><td className="px-3 py-1.5">{e.level}</td><td className="px-3 py-1.5">{e.material || <span className="text-amber-400">—</span>}</td><td className="px-3 py-1.5">{e.area || "—"}</td><td className="px-3 py-1.5">{e.volume || "—"}</td>
                      <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${status(e) === "ok" ? "bg-blue-500/15 text-blue-300" : SEV[status(e)]}`}>{status(e) === "ok" ? "valid" : status(e)}</span></td>
                    </tr>))}
                    {!pageRows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No elements match the filters.</td></tr>}</tbody></table></div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>Page {page + 1} of {pages}</span><span className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={`${BTN} disabled:opacity-40`}>Previous</button><button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className={`${BTN} disabled:opacity-40`}>Next</button></span></div>
              </div>
            )}
            {tab === "validation" && (
              <div className="p-3">
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => run("all")} className={PRIMARY}>Run all checks</button>{CHECKS.map((c) => <button key={c.key} type="button" title={c.text} onClick={() => run(c.key)} className={BTN}>{c.name}</button>)}</div>
                {!report ? <p className="mt-3 text-sm text-slate-500">Run a check to list the affected elements. Select a finding to see the element in the model and its properties.</p> : (
                  <div className="mt-3">
                    <dl className="grid grid-cols-3 gap-3 text-xs"><div><dt className="text-slate-500">Check</dt><dd className="font-semibold text-white">{report.name}</dd></div><div><dt className="text-slate-500">Elements inspected</dt><dd className="font-semibold text-white">{report.inspected}</dd></div><div><dt className="text-slate-500">Findings</dt><dd className={`font-semibold ${report.findings.length ? "text-amber-300" : "text-blue-300"}`}>{report.findings.length}</dd></div></dl>
                    <div className="mt-2 flex gap-2"><button type="button" className={BTN} onClick={() => download("validation-findings-sample.csv", reportCsv(), "text/csv")}>Findings (.csv)</button></div>
                    {report.findings.length === 0 ? <p className="mt-3 rounded bg-blue-500/10 px-3 py-2 text-xs text-blue-300">✓ No findings.</p> : <div className="mt-3 max-h-72 overflow-auto rounded border border-slate-800"><table className="w-full text-left text-xs"><tbody>{report.findings.map((f, i) => <tr key={i} onClick={() => setSel(f.id)} className={`cursor-pointer border-t border-slate-800 first:border-t-0 ${sel === f.id ? "bg-blue-600/20" : "hover:bg-slate-900"}`}><td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV[f.severity]}`}>{f.severity}</span></td><td className="px-3 py-1.5 font-mono">{f.id}</td><td className="px-3 py-1.5 text-slate-300">{f.message}</td></tr>)}</tbody></table></div>}
                  </div>
                )}
              </div>
            )}
            {tab === "dashboard" && (
              <div className="grid gap-4 p-3 lg:grid-cols-2">
                <div><h3 className={H3}>Elements by category</h3><ul className="mt-2 space-y-1.5">{categoryTable(els).map((c) => <li key={c.cat} className="flex items-center gap-2 text-xs"><span className="w-16 text-slate-300">{c.cat}</span><span className="h-2 rounded bg-blue-500" style={{ width: `${(c.count / maxCat) * 50}%`, minWidth: 4 }} /><span className="text-slate-400">{c.count}</span><span className="ml-auto font-mono text-slate-500">{IFC[c.cat]}</span></li>)}</ul><button type="button" className={`${BTN} mt-3`} onClick={() => download("category-summary-sample.csv", catCsv(), "text/csv")}>Category summary (.csv)</button></div>
                <div><h3 className={H3}>Materials in use</h3><ul className="mt-2 space-y-1 text-xs">{[...els.reduce((m, e) => (e.material ? m.set(e.material, (m.get(e.material) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-slate-300">{k}</span><span className="text-slate-500">{v}</span></li>)}</ul>
                  <h3 className={`${H3} mt-4`}>Classification codes</h3><ul className="mt-2 space-y-1 text-xs">{Object.entries(els.reduce<Record<string, number>>((m, e) => { if (e.classification) m[e.classification] = (m[e.classification] ?? 0) + 1; return m; }, {})).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-slate-300"><span className="font-mono">{k}</span> {CLASS_TITLE[k]}</span><span className="text-slate-500">{v}</span></li>)}<li className="flex justify-between text-amber-300"><span>Unclassified built elements</span><span>{els.filter((e) => e.cat !== "Rooms" && !e.classification).length}</span></li></ul></div>
              </div>
            )}
          </div>
          <p className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] leading-snug text-slate-400">Sample dataset in the browser: invented elements shaped like IFC data. It is not an IFC file and the identifiers are not real GUIDs.</p>
        </div>

        {/* inspector */}
        <aside aria-label="Property inspector" className="order-3 border-t border-slate-800 bg-slate-900/60 p-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <h2 className={H3}>Property inspector</h2>
          {!selected ? <p className="mt-3 text-xs leading-relaxed text-slate-500">Select an element in the 3D model, the tree, the table or a validation finding.</p> : (
            <div className="mt-3 space-y-2 text-xs">
              <p className="font-display text-base font-semibold text-white">{selected.name}</p>
              <details open className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Identity</summary><dl className="mt-1">{kv("Id", selected.id)}{kv("GlobalId", selected.globalId)}{kv("IFC class", selected.ifc)}{kv("Category", selected.cat)}{kv("Mark", selected.mark)}</dl></details>
              <details open className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Geometry</summary><dl className="mt-1">{selected.width ? kv("Width", `${selected.width} m`) : null}{selected.length ? kv("Length", `${selected.length} m`) : null}{kv("Height", `${selected.height} m`)}{selected.thickness ? kv("Thickness", `${selected.thickness * 1000} mm`) : null}</dl></details>
              <details className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Materials and type</summary><dl className="mt-1">{kv("Type", selected.type)}{kv("Material", selected.material)}{kv("Manufacturer", selected.manufacturer)}</dl></details>
              <details className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Classification</summary><dl className="mt-1">{kv("Code", selected.classification)}{kv("Title", CLASS_TITLE[selected.classification] ?? "")}</dl></details>
              <details className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Location</summary><dl className="mt-1">{kv("Level", selected.level)}{kv("Elevation", `${selected.z.toFixed(2)} m`)}{kv("X, Y", `${selected.x}, ${selected.y}`)}</dl></details>
              <details className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Quantities</summary><dl className="mt-1">{kv("Area", selected.area ? `${selected.area} m²` : "")}{kv("Volume", selected.volume ? `${selected.volume} m³` : "")}</dl></details>
              <details className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Parameters</summary><dl className="mt-1">{kv("Fire rating", selected.fire)}{kv("Comments", selected.comments)}</dl></details>
              <details open className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Validation</summary>{all.filter((f) => f.id === selected.id).length === 0 ? <p className="mt-1 text-blue-300">✓ No findings</p> : <ul className="mt-1 space-y-1">{all.filter((f) => f.id === selected.id).map((f, i) => <li key={i} className="rounded bg-amber-500/10 px-2 py-1.5 text-amber-200"><span className={`mr-1 rounded px-1 text-[10px] font-semibold uppercase ${SEV[f.severity]}`}>{f.severity}</span>{f.message}</li>)}</ul>}</details>
              <details open className={`${grp} p-3`}><summary className="cursor-pointer font-semibold text-slate-200">Relationships</summary>{(() => { const rel = relations(selected, els); return rel.length === 0 ? <p className="mt-1 text-slate-500">No relationships.</p> : <ul className="mt-1 space-y-0.5">{rel.map((r, i) => <li key={i}><button type="button" onClick={() => setSel(r.id)} className="flex w-full justify-between rounded px-1.5 py-0.5 text-left hover:bg-slate-800"><span className="text-slate-500">{r.kind}</span><span className="font-mono text-blue-300">{r.id} {byId.get(r.id)?.mark || ""}</span></button></li>)}</ul>; })()}</details>
              <div className="flex flex-wrap gap-2 pt-1"><button type="button" className={BTN} onClick={() => download(`${selected.id}-properties-sample.json`, JSON.stringify({ ...selected, src: undefined, validation: all.filter((f) => f.id === selected.id), relationships: relations(selected, els) }, null, 2), "application/json")}>Export JSON</button><button type="button" className={BTN} onClick={() => setSel(null)}>Clear</button></div>
            </div>
          )}
        </aside>
      </div>
    </DemoShell>
  );
}

