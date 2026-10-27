"use client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import DemoShell from "./DemoShell";
import Stage3D, { type StageCtx, type View } from "./Stage3D";
import { AMBER, BASE, BRAND, buildBuilding, buildSite, type Built } from "./revit3d";
import {
  CATS, CHECKS, ELEV, FIRE, LEVELS, PROJECT, TYPES, allFindings, applyAll, applyFix, buildModel, health, runCheck, schedule, typeDef,
  type Cat, type CheckKey, type El, type Finding, type QRow,
} from "@/lib/demo-revit-data";
import type { Branding } from "@/lib/types";

type Section = "overview" | "explorer" | "elements" | "automation" | "validation" | "schedule" | "reports";
const NAV: [Section, string][] = [["overview", "Project Overview"], ["explorer", "BIM Model Explorer"], ["elements", "Elements & Categories"], ["automation", "Automation Tools"], ["validation", "Model Validation"], ["schedule", "Quantities & Schedules"], ["reports", "Reports & Export"]];
const VIEWS: Record<string, View> = { Iso: { pos: [31, 17, 33], target: [12, 3, 7] }, Top: { pos: [12, 48, 7.01], target: [12, 0, 7] }, Front: { pos: [12, 5, 46], target: [12, 3, 7] }, Right: { pos: [50, 5, 7], target: [12, 3, 7] } };
const stamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const field = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500";
const card = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500";
const sevCls: Record<string, string> = { error: "bg-red-500/15 text-red-300", warning: "bg-amber-500/15 text-amber-300", info: "bg-blue-500/15 text-blue-300" };
const download = (name: string, text: string, type = "text/plain") => {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

interface Report { check: string; scope: string; inspected: number; findings: Finding[]; at: string }

export default function RevitDashboard({ branding }: { branding: Branding }) {
  const [els, setEls] = useState<El[]>(() => buildModel());
  const [sel, setSel] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [levelF, setLevelF] = useState<"All" | (typeof LEVELS)[number]>("All");
  const [hidden, setHidden] = useState<Set<Cat>>(new Set());
  const [mode, setMode] = useState<"shaded" | "xray" | "wire">("shaded");
  const [view, setView] = useState("Iso");
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState<Cat | "All">("All");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<{ t: string; text: string }[]>([]);
  const [toolCat, setToolCat] = useState<Cat | "All">("All");
  const [schedCat, setSchedCat] = useState<Cat>("Doors");
  const [snap, setSnap] = useState<{ cat: Cat; rows: QRow[]; at: string; stale: boolean } | null>(null);
  const [ctx, setCtx] = useState<StageCtx | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);

  const all = useMemo(() => allFindings(els), [els]);
  const flaggedAll = useMemo(() => new Set(all.map((f) => f.id)), [all]);
  const flagged = useMemo(() => new Set((report?.findings ?? []).map((f) => f.id)), [report]);
  const selected = els.find((e) => e.id === sel) ?? null;
  const score = health(all);
  const note = (text: string) => setHistory((h) => [{ t: stamp(), text }, ...h].slice(0, 100));
  const touch = () => setSnap((s) => (s ? { ...s, stale: true } : s));

  // ---- 3D scene ----
  const onReady = (c: StageCtx) => {
    c.scene.background = new THREE.Color(0x0d130f);
    c.scene.add(new THREE.HemisphereLight(0xdfeee0, 0x1b241d, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 40, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    c.scene.add(sun); buildSite(c.scene);
    setCtx(c);
  };
  const geomKey = useMemo(() => els.map((e) => `${e.id}${e.type}${e.width}${e.height}`).join("|"), [els]);
  useEffect(() => {
    if (!ctx) return;
    const b = buildBuilding(els);
    ctx.pick.add(b.group); setBuilt(b);
    return () => { ctx.pick.remove(b.group); b.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); ctx.invalidate(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, geomKey]);
  useEffect(() => {
    if (!ctx || !built) return;
    const map = new Map(els.map((e) => [e.id, e]));
    for (const [id, meshes] of built.byId) {
      const e = map.get(id); if (!e) continue;
      const show = !hidden.has(e.cat) && (levelF === "All" || levelF === e.level);
      const on = id === sel, fl = flagged.has(id);
      meshes.forEach((m) => {
        m.visible = show;
        const mt = m.material as THREE.MeshStandardMaterial;
        if (mt.userData.base === undefined) { mt.userData.base = mt.color.getHex(); mt.userData.op = mt.opacity; mt.userData.tr = mt.transparent; }
        mt.color.setHex(on ? BRAND : mt.userData.base);
        mt.emissive.setHex(on ? BRAND : fl ? AMBER : 0x000000); mt.emissiveIntensity = on ? 0.55 : fl ? 0.45 : 0;
        const ghost = mode === "xray" && !on && !fl;
        mt.transparent = ghost || mt.userData.tr; mt.opacity = ghost ? 0.16 : mt.userData.op; mt.depthWrite = !ghost;
        mt.wireframe = mode === "wire"; mt.needsUpdate = true;
      });
    }
    built.edges.forEach((l) => { const e = map.get(l.userData.edgeOf); l.visible = !!e && !hidden.has(e.cat) && (levelF === "All" || levelF === e.level) && mode !== "wire"; });
    ctx.invalidate();
  }, [ctx, built, els, sel, flagged, hidden, levelF, mode]);
  const goView = (v: string) => { setView(v); ctx?.goto(VIEWS[v]); };
  const onPick = (o: THREE.Object3D | null) => { const id = o?.userData.id as string | undefined; setSel(id ?? null); if (id && section === "overview") setSection("explorer"); };

  // ---- editing ----
  const edit = (id: string, patch: Partial<El>, label: string) => { setEls((a) => a.map((e) => (e.id === id ? { ...e, ...patch } : e))); touch(); note(`${id}: ${label}`); };
  const changeType = (e: El, type: string) => { const t = typeDef(e.cat, type); edit(e.id, { type, material: t.material, width: t.width ?? e.width, height: t.height ?? e.height, thickness: t.thickness ?? e.thickness, fire: t.fire ?? e.fire }, `type → ${type}`); };
  const reset = () => { setEls(buildModel()); setSel(null); setReport(null); setHistory([]); setSnap(null); setHidden(new Set()); setLevelF("All"); setMode("shaded"); setQ(""); setCatF("All"); setOnlyIssues(false); goView("Iso"); setSection("overview"); };

  // ---- automation ----
  const run = (key: CheckKey, cat: Cat | "All" = "All") => {
    const r = runCheck(key, els, cat);
    const name = CHECKS.find((c) => c.key === key)!.name;
    setReport({ check: name, scope: cat === "All" ? "Entire model" : cat, inspected: r.inspected, findings: r.findings, at: stamp() });
    note(`${name} (${cat === "All" ? "entire model" : cat}): ${r.inspected} elements inspected, ${r.findings.length} issues`);
    setSection("validation");
    if (r.findings[0]) setSel(r.findings[0].id);
  };
  const fixOne = (f: Finding) => {
    const next = applyFix(els, f); setEls(next); touch(); note(`Fixed ${f.id}: ${f.action}`);
    if (report) { const key = CHECKS.find((c) => c.name === report.check)!.key; const r = runCheck(key, next, report.scope === "Entire model" ? "All" : (report.scope as Cat)); setReport({ ...report, findings: r.findings, inspected: r.inspected, at: stamp() }); }
  };
  const fixAll = () => {
    if (!report) return;
    const { els: next, fixed } = applyAll(els, report.findings); setEls(next); touch(); note(`Applied ${fixed} suggested fixes from “${report.check}”`);
    const key = CHECKS.find((c) => c.name === report.check)!.key; const r = runCheck(key, next, report.scope === "Entire model" ? "All" : (report.scope as Cat));
    setReport({ ...report, findings: r.findings, inspected: r.inspected, at: stamp() });
  };
  const makeSchedule = (cat: Cat = schedCat) => { setSchedCat(cat); setSnap({ cat, rows: schedule(els, cat), at: stamp(), stale: false }); note(`Schedule generated: ${cat}`); };

  // ---- table ----
  const shown = els.filter((e) => (catF === "All" || e.cat === catF) && (levelF === "All" || e.level === levelF) && (!q || `${e.id} ${e.type} ${e.mark} ${e.cat}`.toLowerCase().includes(q.toLowerCase())) && (!onlyIssues || flaggedAll.has(e.id)));
  const counts = CATS.map((c) => ({ c, n: els.filter((e) => e.cat === c).length }));
  const maxN = Math.max(...counts.map((x) => x.n));

  const reportText = () => {
    const r = report;
    const lines = [`${PROJECT.name} — BIM automation report (SAMPLE DATA, simulated demonstration)`, `Generated ${new Date().toISOString()}`, "", r ? `Check: ${r.check} · Scope: ${r.scope}` : "Check: full model audit", `Elements inspected: ${r ? r.inspected : els.length}`, `Issues found: ${(r ? r.findings : all).length}`, ""];
    for (const f of r ? r.findings : all) lines.push(`[${f.severity.toUpperCase()}] ${f.message} → ${f.action}`);
    return lines.join("\n");
  };
  const csv = () => ["Severity,Element,Message,Suggested action", ...(report ? report.findings : all).map((f) => [f.severity, f.id, f.message, f.action].map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n");

  const total = snap ? snap.rows.reduce((s, r) => s + r.count, 0) : 0;
  const btn = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white";
  const primary = "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500";
  const pill = (on: boolean) => `rounded px-2.5 py-1 text-xs font-medium ${on ? "bg-blue-600 text-white" : "bg-slate-900/90 text-slate-300 hover:bg-slate-800"}`;

  return (
    <DemoShell branding={branding} app="Revit BIM Automation Studio" project={`${PROJECT.name} · ${PROJECT.sub}`} status={`Status: ${PROJECT.status}`}
      actions={<><button type="button" onClick={() => download("harbour-point-report-sample.txt", reportText())} className={btn}>Export report</button><button type="button" onClick={reset} className={btn}>Reset demo</button></>}>
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[13.5rem_minmax(0,1fr)_19rem]">
        <nav aria-label="Studio sections" className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/60 p-2 lg:block lg:space-y-1 lg:border-b-0 lg:border-r">
          {NAV.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setSection(k)} aria-current={section === k} className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm lg:w-full ${section === k ? "bg-blue-600/20 font-semibold text-blue-300" : "text-slate-300 hover:bg-slate-800"}`}>
              {label}{k === "validation" && report && report.findings.length > 0 && <span className="ml-2 rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-300">{report.findings.length}</span>}
            </button>
          ))}
          <dl className="hidden space-y-2 border-t border-slate-800 px-1 pt-4 text-xs lg:block">
            <div className="flex justify-between"><dt className="text-slate-400">Elements</dt><dd className="font-semibold text-white">{els.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Open issues</dt><dd className={`font-semibold ${all.length ? "text-amber-400" : "text-blue-400"}`}>{all.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Model health</dt><dd className="font-semibold text-white">{score}%</dd></div>
          </dl>
        </nav>

        <div className="min-w-0 space-y-3 p-3 sm:p-4">
          <Stage3D className="h-[46vh] min-h-[300px] lg:h-[54vh]" home={VIEWS.Iso} onReady={onReady} onPick={onPick} shadows label="3D view of the sample office building. Click an element to select it."
            toolbar={<>
              <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{Object.keys(VIEWS).map((v) => <button key={v} type="button" onClick={() => goView(v)} className={pill(view === v)}>{v}</button>)}</span>
              <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5">{([["shaded", "Shaded"], ["xray", "X-ray"], ["wire", "Wireframe"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setMode(k)} className={pill(mode === k)}>{l}</button>)}</span>
            </>}>
            <div className="absolute right-2 top-2 z-10 flex gap-0.5 rounded-md border border-slate-700 bg-slate-900/90 p-0.5" role="group" aria-label="Level">
              {(["All", ...LEVELS] as const).map((l) => <button key={l} type="button" onClick={() => setLevelF(l)} className={pill(levelF === l)}>{l === "All" ? "All levels" : l}</button>)}
            </div>
            {selected && <div className="absolute bottom-2 right-2 z-10 rounded bg-slate-950/85 px-3 py-1.5 text-xs"><span className="font-mono text-blue-300">{selected.id}</span> · {selected.cat} · {selected.type}</div>}
          </Stage3D>

          {section === "overview" && (
            <div className="grid gap-3 xl:grid-cols-2">
              <section className={card}>
                <h2 className="font-display text-lg font-semibold text-white">{PROJECT.name}</h2>
                <p className="text-xs text-slate-400">{PROJECT.sub}. Invented sample data for demonstration.</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                  {[["Levels", "2 (+ roof)"], ["Footprint", "24 m × 14 m"], ["Gross floor area", `${PROJECT.gfa} m²`], ["Storey height", "3.2 m"], ["Structural grid", "3 × 2 bays"], ["Design stage", PROJECT.status]].map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-100">{v}</dd></div>)}
                </dl>
                <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Elements by category</h3>
                <ul className="space-y-1.5">{counts.map(({ c, n }) => <li key={c} className="flex items-center gap-2 text-xs"><span className="w-16 text-slate-300">{c}</span><span className="h-2 rounded bg-blue-500" style={{ width: `${(n / maxN) * 55}%` }} /><span className="text-slate-400">{n}</span></li>)}</ul>
              </section>
              <section className={card}>
                <h2 className="font-display text-lg font-semibold text-white">Model health</h2>
                <div className="mt-2 flex items-center gap-4">
                  <p className="font-display text-5xl font-semibold text-white">{score}<span className="text-xl text-slate-500">%</span></p>
                  <div className="text-xs text-slate-300"><p>{all.filter((f) => f.severity === "error").length} errors · {all.filter((f) => f.severity === "warning").length} warnings</p><p className="mt-1 text-slate-500">Based on the three checks below.</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">{CHECKS.map((c) => <button key={c.key} type="button" onClick={() => run(c.key)} className={primary}>Run {c.name.toLowerCase()}</button>)}</div>
                <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recent activity</h3>
                <ul className="space-y-1 text-xs">{history.slice(0, 4).map((h, i) => <li key={i} className="flex gap-3"><span className="font-mono text-slate-500">{h.t}</span><span>{h.text}</span></li>)}{!history.length && <li className="text-slate-500">No activity yet. Run a check or select an element in the 3D view.</li>}</ul>
              </section>
            </div>
          )}

          {section === "explorer" && (
            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-white">BIM Model Explorer</h2>
              <p className="text-xs text-slate-400">Toggle categories and levels in the 3D view, or open an element to select it.</p>
              <div className="mt-3 flex flex-wrap gap-2">{CATS.map((c) => <label key={c} className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-xs"><input type="checkbox" checked={!hidden.has(c)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; })} /><span className="inline-block h-2 w-2 rounded-full" style={{ background: `#${BASE[c].toString(16).padStart(6, "0")}` }} />{c}</label>)}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {LEVELS.map((l) => (
                  <details key={l} open className="rounded border border-slate-800 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-100">{l} <span className="text-xs font-normal text-slate-500">elevation {ELEV[l].toFixed(1)} m</span></summary>
                    {CATS.map((c) => { const list = els.filter((e) => e.level === l && e.cat === c); return (
                      <details key={c} className="ml-3 mt-1"><summary className="cursor-pointer text-xs text-slate-300">{c} <span className="text-slate-500">({list.length})</span></summary>
                        <ul className="ml-3 mt-1 space-y-0.5">{list.map((e) => <li key={e.id}><button type="button" onClick={() => setSel(e.id)} className={`w-full rounded px-2 py-0.5 text-left text-[11px] ${sel === e.id ? "bg-blue-600/25 text-blue-200" : "text-slate-400 hover:bg-slate-800"}`}><span className="font-mono">{e.id}</span> {e.mark || "—"} · {e.type}</button></li>)}</ul>
                      </details>); })}
                  </details>
                ))}
              </div>
            </section>
          )}

          {section === "elements" && (
            <section className={card}>
              <div className="flex flex-wrap items-end gap-2">
                <div><label className={lbl} htmlFor="cf">Category</label><select id="cf" value={catF} onChange={(e) => setCatF(e.target.value as Cat | "All")} className={`${field} w-32`}><option>All</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><label className={lbl} htmlFor="q">Search</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Id, type, mark…" className={`${field} w-44`} /></div>
                <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-300"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />Only elements with issues</label>
                <p className="ml-auto pb-1.5 text-xs text-slate-500">{shown.length} of {els.length} elements</p>
              </div>
              <div className="mt-3 max-h-80 overflow-auto rounded border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr>{["Id", "Category", "Type", "Level", "Mark", "Fire rating", "Assembly", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{shown.map((e) => (
                    <tr key={e.id} onClick={() => setSel(e.id)} className={`cursor-pointer border-t border-slate-800 ${e.id === sel ? "bg-blue-600/20" : "hover:bg-slate-900"}`}>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{e.id}</td><td className="px-3 py-1.5">{e.cat}</td><td className="px-3 py-1.5 text-slate-300">{e.type}</td><td className="px-3 py-1.5">{e.level}</td>
                      <td className="px-3 py-1.5">{e.mark || <span className="text-amber-400">—</span>}</td><td className="px-3 py-1.5">{e.fire}</td><td className="px-3 py-1.5">{e.assembly || <span className="text-amber-400">—</span>}</td><td className="px-3 py-1.5 text-amber-400">{flaggedAll.has(e.id) ? "⚠" : ""}</td>
                    </tr>))}
                    {!shown.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No elements match the filters.</td></tr>}</tbody>
                </table>
              </div>
            </section>
          )}

          {section === "automation" && (
            <div className="grid gap-3 lg:grid-cols-2">
              {CHECKS.map((c) => (
                <section key={c.key} className={card}>
                  <h2 className="text-sm font-semibold text-white">{c.name}</h2><p className="mt-1 text-xs text-slate-400">{c.text}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div><label className={lbl} htmlFor={`s-${c.key}`}>Scope</label><select id={`s-${c.key}`} value={toolCat} onChange={(e) => setToolCat(e.target.value as Cat | "All")} className={`${field} w-36`}><option value="All">Entire model</option>{CATS.map((x) => <option key={x}>{x}</option>)}</select></div>
                    <button type="button" onClick={() => run(c.key, toolCat)} className={primary}>Run check</button>
                  </div>
                </section>
              ))}
              <section className={card}>
                <h2 className="text-sm font-semibold text-white">Generate element schedule</h2><p className="mt-1 text-xs text-slate-400">Quantities grouped by type for a category.</p>
                <button type="button" onClick={() => { makeSchedule(); setSection("schedule"); }} className={`${primary} mt-3`}>Generate sample schedule</button>
              </section>
              <section className={`${card} lg:col-span-2`}>
                <h2 className="text-sm font-semibold text-white">Illustrative Revit API code</h2>
                <p className="mt-1 text-xs text-slate-400">What the parameter audit would look like inside Revit. It is not executed here; this demo runs the same rules on the sample data in your browser.</p>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-3 text-[11px] leading-relaxed text-blue-200">{`var findings = new List<Finding>();
foreach (Element e in new FilteredElementCollector(doc).WhereElementIsNotElementType())
{
    var mark = e.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString();
    if (string.IsNullOrWhiteSpace(mark))
        findings.Add(new Finding(e.Id, Severity.Warning, "Missing Mark"));
    var fire = e.LookupParameter("Fire Rating")?.AsString();
    if (e.Category.Id.IntegerValue != (int)BuiltInCategory.OST_Windows && (fire ?? "None") == "None")
        findings.Add(new Finding(e.Id, Severity.Error, "Missing Fire Rating"));
}`}</pre>
              </section>
            </div>
          )}

          {section === "validation" && (
            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-white">Model Validation</h2>
              {!report ? (
                <div className="mt-3 text-sm text-slate-400"><p>No check has been run yet. Run one to list the affected elements.</p><div className="mt-3 flex flex-wrap gap-2">{CHECKS.map((c) => <button key={c.key} type="button" onClick={() => run(c.key)} className={primary}>{c.name}</button>)}</div></div>
              ) : (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
                    {[["Operation", report.check], ["Scope", report.scope], ["Elements inspected", report.inspected], ["Issues detected", report.findings.length], ["Status", report.findings.length ? "Needs attention" : "Passed"]].map(([k, v]) => <div key={String(k)}><dt className="text-slate-500">{k}</dt><dd className={`font-semibold ${k === "Status" ? (report.findings.length ? "text-amber-300" : "text-blue-300") : "text-white"}`}>{v}</dd></div>)}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.findings.some((f) => f.fix) && <button type="button" onClick={fixAll} className={primary}>Apply all suggested fixes</button>}
                    <button type="button" onClick={() => download("findings-sample.csv", csv(), "text/csv")} className={btn}>Download findings (CSV)</button>
                    <span className="text-[11px] text-slate-500 self-center">Affected elements glow amber in the 3D view. Click a row to select one.</span>
                  </div>
                  {report.findings.length === 0 ? <p className="mt-4 rounded bg-blue-500/10 px-3 py-2 text-sm text-blue-300">✓ No issues found in this scope.</p> : (
                    <div className="mt-3 max-h-80 overflow-auto rounded border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr>{["Severity", "Element", "Finding", "Suggested action", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                        <tbody>{report.findings.map((f, i) => (
                          <tr key={i} onClick={() => { setSel(f.id); const lv = els.find((e) => e.id === f.id)?.level; if (lv && levelF !== "All" && levelF !== lv) setLevelF("All"); }} className={`cursor-pointer border-t border-slate-800 ${f.id === sel ? "bg-blue-600/20" : "hover:bg-slate-900"}`}>
                            <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${sevCls[f.severity]}`}>{f.severity}</span></td>
                            <td className="px-3 py-1.5 font-mono">{f.id}</td><td className="px-3 py-1.5 text-slate-300">{f.message}</td><td className="px-3 py-1.5 text-slate-400">{f.action}</td>
                            <td className="px-3 py-1.5">{f.fix && <button type="button" onClick={(e) => { e.stopPropagation(); fixOne(f); }} className="rounded border border-slate-600 px-2 py-0.5 text-[11px] hover:border-blue-500">Fix</button>}</td>
                          </tr>))}</tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {section === "schedule" && (
            <section className={`${card} max-w-3xl`}>
              <h2 className="font-display text-lg font-semibold text-white">Quantities & Schedules</h2>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div><label className={lbl} htmlFor="sc">Category</label><select id="sc" value={schedCat} onChange={(e) => setSchedCat(e.target.value as Cat)} className={`${field} w-40`}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
                <button type="button" onClick={() => makeSchedule()} className={primary}>Generate schedule</button>
                {snap && <button type="button" onClick={() => download(`${snap.cat.toLowerCase()}-schedule-sample.csv`, ["Type,Count,Quantity,Unit,Detail", ...snap.rows.map((r) => [r.type, r.count, r.qty, r.unit, r.detail].map((c) => `"${c}"`).join(","))].join("\n"), "text/csv")} className={btn}>Download CSV</button>}
              </div>
              {snap && (<div className="mt-3">
                {snap.stale && <p className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">The model changed since this schedule was generated. Generate it again.</p>}
                <table className="w-full overflow-hidden rounded border border-slate-800 text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400"><tr>{["Type", "Count", "Quantity", "Unit", "Detail"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{snap.rows.map((r) => <tr key={r.type} className="border-t border-slate-800"><td className="px-3 py-2">{r.type}</td><td className="px-3 py-2">{r.count}</td><td className="px-3 py-2 font-semibold text-white">{r.qty}</td><td className="px-3 py-2 text-slate-400">{r.unit}</td><td className="px-3 py-2 text-slate-400">{r.detail}</td></tr>)}</tbody>
                  <tfoot><tr className="border-t border-slate-700 bg-slate-900"><td className="px-3 py-2 font-semibold">Total: {snap.cat}</td><td className="px-3 py-2 font-semibold">{total}</td><td colSpan={3} className="px-3 py-2 text-slate-400">generated {snap.at}</td></tr></tfoot>
                </table></div>)}
            </section>
          )}

          {section === "reports" && (
            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-white">Reports & Export</h2>
              <p className="mt-1 text-xs text-slate-400">{report ? `Report for “${report.check}” (${report.scope}).` : "No check run yet: this is the full-model audit."} Downloads contain sample data only.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!report && <button type="button" onClick={() => run("params")} className={primary}>Run parameter audit</button>}
                <button type="button" onClick={() => download("harbour-point-report-sample.txt", reportText())} className={primary}>Download report (.txt)</button>
                <button type="button" onClick={() => download("findings-sample.csv", csv(), "text/csv")} className={btn}>Findings (.csv)</button>
                <button type="button" onClick={() => download("harbour-point-elements-sample.json", JSON.stringify(els, null, 2), "application/json")} className={btn}>Model data (.json)</button>
              </div>
              <pre className="mt-3 max-h-72 overflow-auto rounded bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">{reportText()}</pre>
              <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Activity log</h3>
              <ul className="space-y-1 text-xs">{history.map((h, i) => <li key={i} className="flex gap-3"><span className="font-mono text-slate-500">{h.t}</span><span>{h.text}</span></li>)}{!history.length && <li className="text-slate-500">Nothing yet.</li>}</ul>
            </section>
          )}
        </div>

        <aside aria-label="Element inspector" className="border-t border-slate-800 bg-slate-900/60 p-4 lg:border-l lg:border-t-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Element inspector</h2>
          {!selected ? <p className="mt-4 text-xs leading-relaxed text-slate-500">Click any element in the 3D view, the explorer, the table or a validation result to inspect and edit it.</p> : (
            <div className="mt-3 space-y-3">
              <div><p className="font-mono text-sm text-white">{selected.id}</p><p className="text-xs text-slate-400">{selected.cat} · {selected.level} (elev. {ELEV[selected.level].toFixed(1)} m){selected.host ? ` · host ${selected.host}` : ""}</p></div>
              <div><label className={lbl} htmlFor="p-type">Type</label><select id="p-type" value={selected.type} onChange={(e) => changeType(selected, e.target.value)} className={field}>{TYPES[selected.cat].map((t) => <option key={t.name}>{t.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl} htmlFor="p-mark">Mark</label><input id="p-mark" key={selected.id + selected.mark} defaultValue={selected.mark} onBlur={(e) => e.target.value !== selected.mark && edit(selected.id, { mark: e.target.value.slice(0, 20) }, `mark → ${e.target.value || "(empty)"}`)} className={field} /></div>
                <div><label className={lbl} htmlFor="p-asm">Assembly code</label><input id="p-asm" key={selected.id + selected.assembly} defaultValue={selected.assembly} onBlur={(e) => e.target.value !== selected.assembly && edit(selected.id, { assembly: e.target.value.slice(0, 12) }, `assembly code → ${e.target.value || "(empty)"}`)} className={field} /></div>
              </div>
              <div><label className={lbl} htmlFor="p-fire">Fire rating</label><select id="p-fire" value={selected.fire} onChange={(e) => edit(selected.id, { fire: e.target.value }, `fire rating → ${e.target.value}`)} className={field}>{FIRE.map((f) => <option key={f}>{f}</option>)}</select></div>
              <div><label className={lbl} htmlFor="p-com">Comments</label><textarea id="p-com" key={selected.id + selected.comments} defaultValue={selected.comments} rows={2} onBlur={(e) => e.target.value !== selected.comments && edit(selected.id, { comments: e.target.value.slice(0, 200) }, "comments updated")} className={field} /></div>
              {(selected.cat === "Doors" || selected.cat === "Windows") && (
                <div className="grid grid-cols-2 gap-2">{(["width", "height"] as const).map((k) => <div key={k}><label className={lbl} htmlFor={`p-${k}`}>{k} (m)</label><input id={`p-${k}`} type="number" step="0.05" min="0.5" max="2.4" key={selected.id + k + selected[k]} defaultValue={selected[k]} onBlur={(e) => { const v = Math.min(2.4, Math.max(0.5, +e.target.value || selected[k])); if (v !== selected[k]) edit(selected.id, { [k]: v }, `${k} → ${v} m`); }} className={field} /></div>)}</div>
              )}
              <dl className="space-y-1 rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Material</dt><dd>{selected.material}</dd></div>
                {selected.cat === "Walls" && <><div className="flex justify-between"><dt className="text-slate-500">Length</dt><dd>{selected.length.toFixed(1)} m</dd></div><div className="flex justify-between"><dt className="text-slate-500">Thickness</dt><dd>{selected.thickness * 1000} mm</dd></div><div className="flex justify-between"><dt className="text-slate-500">Gross area</dt><dd>{(selected.length * selected.height).toFixed(1)} m²</dd></div><div className="flex justify-between"><dt className="text-slate-500">Volume</dt><dd>{(selected.length * selected.height * selected.thickness).toFixed(2)} m³</dd></div></>}
                {selected.cat === "Floors" && <><div className="flex justify-between"><dt className="text-slate-500">Area</dt><dd>{(selected.length * selected.width).toFixed(0)} m²</dd></div><div className="flex justify-between"><dt className="text-slate-500">Volume</dt><dd>{(selected.length * selected.width * selected.thickness).toFixed(1)} m³</dd></div></>}
                {selected.cat === "Columns" && <div className="flex justify-between"><dt className="text-slate-500">Volume</dt><dd>{(selected.width * selected.width * selected.height).toFixed(2)} m³</dd></div>}
                {(selected.cat === "Doors" || selected.cat === "Windows") && <div className="flex justify-between"><dt className="text-slate-500">Opening area</dt><dd>{(selected.width * selected.height).toFixed(2)} m²</dd></div>}
              </dl>
              <div>
                <p className={lbl}>Validation status</p>
                {(() => { const fs = all.filter((f) => f.id === selected.id); return fs.length === 0 ? <p className="rounded bg-blue-500/10 px-3 py-2 text-xs text-blue-300">✓ No issues</p> : (
                  <ul className="space-y-1.5">{fs.map((f, i) => <li key={i} className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><span className={`mr-1.5 rounded px-1 text-[10px] font-semibold uppercase ${sevCls[f.severity]}`}>{f.severity}</span>{f.message.replace(`${selected.id} `, "")}<span className="mt-1 block text-amber-300/70">{f.action}</span>{f.fix && <button type="button" onClick={() => fixOne(f)} className="mt-1 rounded border border-amber-500/40 px-2 py-0.5 text-[11px] hover:bg-amber-500/10">Apply fix</button>}</li>)}</ul>); })()}
              </div>
            </div>
          )}
        </aside>
      </div>
    </DemoShell>
  );
}
