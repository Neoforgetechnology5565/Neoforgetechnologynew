"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "./DemoShell";
import { Shape } from "./cadshape";
import { useCadView } from "./useCadView";
import { BTN, FIELD, H3, LBL, PRIMARY, SEV, download, pill, stamp, toCsv } from "./ui";
import { ACTIONS, DRAWINGS, FIT, LAYER_TABLE, PROJECT, STANDARD_RULES, allIssues, buildSet, cleanup, layerInfo, organize, runKey, type ActionKey, type DrawingId, type LayerInfo } from "@/lib/demo-bricscad-data";
import { applyFix, area, expectedLayer, len, type Ent, type Finding } from "@/lib/demo-cad-data";
import type { Branding } from "@/lib/types";

const BRAND = "#55b52b", AMBER = "#f59e0b", RED = "#f87171";
type Doc = { ents: Ent[]; layers: LayerInfo[] };
interface Result { name: string; key: ActionKey; inspected: number; findings: Finding[]; lines?: string[]; score?: { rule: string; issues: number }[]; before?: number; after?: number; at: string; changed: number }

export default function BricsWorkbench({ branding }: { branding: Branding }) {
  const [origin] = useState(() => buildSet());
  const [docs, setDocs] = useState<Record<DrawingId, Doc>>(() => buildSet());
  const [active, setActive] = useState<DrawingId>("gf");
  const [sel, setSel] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hideDims, setHideDims] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [view, setView] = useState<"current" | "original" | "diff">("current");
  const [tab, setTab] = useState<"inspector" | "automation" | "results" | "history">("automation");
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState<{ key: ActionKey; steps: string[]; i: number } | null>(null);
  const [history, setHistory] = useState<{ t: string; drawing: string; text: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta = DRAWINGS.find((d) => d.id === active)!;
  const doc = docs[active], orig = origin[active];
  const yBase = active === "gf" || active === "ff" ? 14 : 10;
  const cv = useCadView(FIT[active], yBase);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setSel(null); setResult(null); setRunning(null); if (timer.current) clearTimeout(timer.current); }, [active]);

  const shownEnts = view === "original" ? orig.ents : doc.ents;
  const origIds = useMemo(() => new Map(orig.ents.map((e) => [e.id, e])), [orig]);
  const curIds = useMemo(() => new Set(doc.ents.map((e) => e.id)), [doc]);
  const removed = view === "diff" ? orig.ents.filter((e) => !curIds.has(e.id)) : [];
  const changedIds = useMemo(() => new Set(doc.ents.filter((e) => { const o = origIds.get(e.id); return !o || o.layer !== e.layer || o.text !== e.text || o.y1 !== e.y1 || o.x1 !== e.x1; }).map((e) => e.id)), [doc, origIds]);
  const flagged = useMemo(() => new Set((result?.findings ?? []).flatMap((f) => f.ids)), [result]);
  const layerOf = (n: string) => doc.layers.find((l) => l.name === n) ?? layerInfo(n);
  const counts = useMemo(() => { const m = new Map<string, number>(); shownEnts.forEach((e) => m.set(e.layer, (m.get(e.layer) ?? 0) + 1)); return m; }, [shownEnts]);
  const layerRows = view === "original" ? orig.layers : doc.layers;
  const visible = (e: Ent) => !hidden.has(e.layer) && !(hideDims && e.type === "dim") && !(!showGrid && e.type === "grid");
  const selected = shownEnts.find((e) => e.id === sel) ?? null;
  const badge = useMemo(() => Object.fromEntries((Object.keys(docs) as DrawingId[]).map((k) => [k, allIssues(docs[k].ents, docs[k].layers)])) as Record<DrawingId, number>, [docs]);
  const log = (text: string) => setHistory((h) => [{ t: stamp(), drawing: meta.file, text }, ...h].slice(0, 100));

  const put = (d: Doc) => setDocs((x) => ({ ...x, [active]: d }));
  const reset = () => { setDocs(buildSet()); setResult(null); setSel(null); setHidden(new Set()); setView("current"); setHistory([]); setHideDims(false); setShowGrid(true); cv.fit(); };

  const compute = (key: ActionKey): Result => {
    const a = ACTIONS.find((x) => x.key === key)!; const at = stamp();
    if (key === "cleanup") { const r = cleanup(doc.ents, doc.layers); return { name: a.name, key, inspected: doc.ents.length, findings: [], lines: r.lines, before: allIssues(doc.ents, doc.layers), after: allIssues(r.ents, r.layers), at, changed: changedCount(doc.ents, r.ents) }; }
    if (key === "organize") { const r = organize(doc.ents, doc.layers); return { name: a.name, key, inspected: doc.ents.length, findings: [], lines: r.lines, before: allIssues(doc.ents, doc.layers), after: allIssues(r.ents, r.layers), at, changed: changedCount(doc.ents, r.ents) }; }
    if (key === "standards") { const score = STANDARD_RULES.map((r) => ({ rule: r.rule, issues: runKey(r.key, doc.ents, doc.layers).findings.length })); const findings = STANDARD_RULES.flatMap((r) => runKey(r.key, doc.ents, doc.layers).findings); return { name: a.name, key, inspected: doc.ents.length, findings, score, at, changed: 0 }; }
    const r = runKey(key, doc.ents, doc.layers);
    const lines = key === "summary" ? r.findings.map((f) => f.message) : undefined;
    return { name: a.name, key, inspected: r.inspected, findings: key === "summary" ? [] : r.findings, lines, at, changed: new Set(r.findings.flatMap((f) => f.ids)).size };
  };
  const changedCount = (a: Ent[], b: Ent[]) => { const m = new Map(a.map((e) => [e.id, e])); return b.filter((e) => { const o = m.get(e.id); return !o || o.layer !== e.layer || o.text !== e.text || o.y1 !== e.y1 || o.x1 !== e.x1; }).length + a.filter((e) => !b.some((x) => x.id === e.id)).length; };

  const run = (key: ActionKey) => {
    if (running) return;
    const a = ACTIONS.find((x) => x.key === key)!;
    const steps = [`Reading ${doc.ents.length} objects from ${meta.file}`, `Inspecting ${doc.layers.length} layers`, "Applying the rule set", a.changes ? "Writing changes to the sample drawing" : "Compiling findings"];
    const res = compute(key);
    setTab("results"); setResult(null); setRunning({ key, steps, i: 0 });
    let i = 0;
    const tick = () => {
      i++;
      if (i < steps.length) { setRunning({ key, steps, i }); timer.current = setTimeout(tick, 230); return; }
      if (key === "cleanup") { const r = cleanup(doc.ents, doc.layers); put({ ents: r.ents, layers: r.layers as LayerInfo[] }); if (r.ents.length !== doc.ents.length || r.lines.length) setView("diff"); }
      if (key === "organize") { const r = organize(doc.ents, doc.layers); put({ ents: r.ents, layers: r.layers }); setView("diff"); }
      setResult(res); setRunning(null);
      log(`${res.name}: ${res.inspected} objects inspected, ${res.findings.filter((f) => f.severity !== "info").length || res.changed} ${res.key === "cleanup" || res.key === "organize" ? "objects changed" : "issues"}`);
      const first = res.findings.find((f) => f.ids[0]); if (first) setSel(first.ids[0]);
    };
    timer.current = setTimeout(tick, 230);
  };
  const fix = (f: Finding) => {
    const r = applyFix(doc.ents, doc.layers, f); put({ ents: r.ents, layers: r.layers as LayerInfo[] }); log(`Fixed: ${f.message}`);
    if (result) { const nd = { ents: r.ents, layers: r.layers as LayerInfo[] }; const k = result.key; const again = k === "standards" ? STANDARD_RULES.flatMap((x) => runKey(x.key, nd.ents, nd.layers).findings) : k === "cleanup" || k === "organize" || k === "summary" ? [] : runKey(k, nd.ents, nd.layers).findings; setResult({ ...result, findings: again, at: stamp(), score: k === "standards" ? STANDARD_RULES.map((x) => ({ rule: x.rule, issues: runKey(x.key, nd.ents, nd.layers).findings.length })) : result.score }); }
  };
  const locate = (f: Finding) => { const e = doc.ents.find((x) => x.id === f.ids[0]); if (e) { setSel(e.id); setTab("inspector"); cv.zoomTo(e); } };
  const issuesOf = result?.findings.filter((f) => f.severity !== "info") ?? [];
  const reportText = () => [`${meta.file} — ${result?.name ?? "no operation run"} (SAMPLE DATA, simulated demonstration)`, `Objects inspected: ${result?.inspected ?? 0} · Issues: ${issuesOf.length}`, "", ...(result?.lines ?? []), ...issuesOf.map((f) => `[${f.severity.toUpperCase()}] ${f.message} → ${f.action}`)].join("\n");

  const props = (e: Ent): [string, string][] => {
    const Y = (y: number) => (yBase - y).toFixed(3), rows: [string, string][] = [["Handle", e.handle], ["Object id", e.id], ["Type", e.type]];
    if (["wall", "window", "dim", "grid", "line"].includes(e.type)) rows.push(["Start", `${e.x1.toFixed(3)}, ${Y(e.y1)}`], ["End", `${e.x2!.toFixed(3)}, ${Y(e.y2!)}`], ["Length", `${len(e).toFixed(3)} m`]);
    else if (e.type === "door") rows.push(["Position", `${e.x1.toFixed(3)}, ${Y(e.y1)}`], ["Width", `${((e.w ?? 0) * 1000).toFixed(0)} mm`]);
    else if (e.type === "room") rows.push(["Name", e.name ?? ""], ["Size", `${e.w!.toFixed(2)} × ${e.h!.toFixed(2)} m`], ["Area", `${area(e).toFixed(2)} m²`]);
    else if (e.type === "circle") rows.push(["Centre", `${e.x1.toFixed(3)}, ${Y(e.y1)}`], ["Radius", `${((e.w ?? 0) * 1000).toFixed(0)} mm`]);
    else if (e.type === "text") rows.push(["Position", `${e.x1.toFixed(3)}, ${Y(e.y1)}`], ["Text height", `${((e.size ?? 0) * 1000).toFixed(0)} mm`]);
    else rows.push(["Position", `${e.x1.toFixed(3)}, ${Y(e.y1 + (e.h ?? 0))}`], ["Size", `${(e.w ?? 0).toFixed(2)} × ${(e.h ?? 0).toFixed(2)} m`]);
    return rows;
  };
  const annot = (e: Ent) => e.type === "room" ? doc.ents.find((x) => x.type === "text" && x.roomId === e.roomId)?.text?.replace("\n", " · ") ?? "No label" : e.type === "text" ? (e.text ?? "").replace(/\n/g, " · ") : e.type === "dim" ? `${(len(e) * 1000).toFixed(0)} mm` : e.text ?? "—";
  const selFindings = selected ? (result?.findings ?? []).filter((f) => f.ids.includes(selected.id) && f.severity !== "info") : [];

  const tabBtn = (k: typeof tab, l: string) => <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 px-2 py-2.5 text-xs sm:text-sm ${tab === k ? "border-b-2 border-blue-500 font-semibold text-blue-300" : "text-slate-400 hover:text-white"}`}>{l}</button>;

  return (
    <DemoShell branding={branding} app="BricsCAD Automation Workbench" project={`${PROJECT.name} · ${meta.file}`} status={PROJECT.status}
      actions={<><button type="button" onClick={() => download("bricscad-report-sample.txt", reportText())} className={BTN}>Export report</button><button type="button" onClick={reset} className={BTN}>Reset drawings</button></>}>
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[17rem_minmax(0,1fr)_22rem]">
        {/* Left: navigator and layers */}
        <aside aria-label="Drawing navigator and layers" className="order-2 border-t border-slate-800 bg-slate-900/60 lg:order-1 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <div className="border-b border-slate-800 p-3"><h2 className={H3}>Drawing set · {PROJECT.set}</h2>
            <ul className="mt-2 space-y-1">{DRAWINGS.map((d) => (
              <li key={d.id}><button type="button" onClick={() => setActive(d.id)} aria-current={active === d.id} className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left ${active === d.id ? "border-blue-500 bg-blue-600/15" : "border-slate-800 hover:border-slate-600"}`}>
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{d.title}</span><span className="block truncate font-mono text-[10px] text-slate-500">{d.file} · {d.scale}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge[d.id] ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>{badge[d.id] ? `${badge[d.id]} issues` : "clean"}</span></button></li>
            ))}</ul>
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between"><h2 className={H3}>Layers ({layerRows.length})</h2><span className="flex gap-1"><button type="button" onClick={() => setHidden(new Set())} className="text-[11px] text-blue-300 hover:underline">All on</button><button type="button" onClick={() => setHidden(new Set(layerRows.map((l) => l.name)))} className="text-[11px] text-slate-400 hover:underline">All off</button></span></div>
            <ul className="mt-2 space-y-0.5">{layerRows.map((l) => { const bad = l.name !== "0" && !/^[A-Z]-[A-Z]+(-[A-Z]+)*$/.test(l.name); const off = hidden.has(l.name); return (
              <li key={l.name} className="rounded px-1.5 py-1 text-xs hover:bg-slate-800">
                <div className="flex items-center gap-2">
                  <button type="button" role="switch" aria-checked={!off} aria-label={`${off ? "Show" : "Hide"} layer ${l.name}`} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(l.name)) n.delete(l.name); else n.add(l.name); return n; })} className={`h-4 w-7 shrink-0 rounded-full border ${off ? "border-slate-600 bg-slate-800" : "border-blue-500 bg-blue-600"}`}><span className={`block h-3 w-3 rounded-full bg-white transition ${off ? "translate-x-0.5" : "translate-x-3.5"}`} /></button>
                  <svg width="22" height="8" aria-hidden className="shrink-0"><line x1="0" y1="4" x2="22" y2="4" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash ? "5 3" : undefined} /></svg>
                  <span className={`flex-1 truncate font-mono ${off ? "text-slate-600" : "text-slate-200"}`}>{l.name}</span>{bad && <span title="Does not follow the naming standard" className="text-amber-400">⚠</span>}<span className="text-slate-500">{counts.get(l.name) ?? 0}</span>
                </div>
                <p className="ml-9 text-[10px] text-slate-500">{l.cat} · {l.lt}</p>
              </li>); })}</ul>
          </div>
        </aside>

        {/* Centre: CAD workspace */}
        <div className="order-1 min-w-0 space-y-2 p-3 sm:p-4 lg:order-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5"><button type="button" aria-pressed={cv.tool === "select"} className={pill(cv.tool === "select")} onClick={() => cv.setTool("select")}>Select</button><button type="button" aria-pressed={cv.tool === "pan"} className={pill(cv.tool === "pan")} onClick={() => cv.setTool("pan")}>Pan</button></span>
            <button type="button" className={BTN} aria-label="Zoom in" onClick={() => cv.zoomAt(0.8)}>＋</button><button type="button" className={BTN} aria-label="Zoom out" onClick={() => cv.zoomAt(1.25)}>－</button>
            <button type="button" className={BTN} onClick={cv.fit}>Fit to view</button><button type="button" className={BTN} onClick={cv.fit}>Reset view</button>
            <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={!hideDims} onChange={() => setHideDims((v) => !v)} />Dimensions</label>
            <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={showGrid} onChange={() => setShowGrid((v) => !v)} />Grid lines</label>
            <span className="ml-auto flex gap-0.5 rounded-md border border-slate-700 p-0.5" role="group" aria-label="Comparison view">{([["current", "Current"], ["original", "Original"], ["diff", "Differences"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={pill(view === k)}>{l}</button>)}</span>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#0a0f0c]">
            <svg ref={cv.svg} viewBox={`${cv.vb.x} ${cv.vb.y} ${cv.vb.w} ${cv.vb.h}`} className="block h-[50vh] min-h-[320px] w-full touch-none select-none lg:h-[64vh]" style={{ cursor: cv.tool === "pan" ? "grab" : "crosshair" }} role="img" aria-label={`${meta.title}. Click an object to select it.`}
              {...cv.handlers} onClick={() => !cv.moved.current && setSel(null)}>
              <defs><pattern id="bg" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#17221b" strokeWidth="0.02" /></pattern></defs>
              <rect x={-40} y={-40} width={110} height={110} fill="url(#bg)" />
              {removed.filter(visible).map((e) => <g key={`r${e.id}`} pointerEvents="none" opacity={0.7} strokeDasharray="0.3 0.2"><Shape e={e} color={RED} sw={2} /></g>)}
              {shownEnts.filter(visible).filter((e) => flagged.has(e.id) && view !== "original").map((e) => <g key={`h${e.id}`} pointerEvents="none" opacity={0.55}><Shape e={e} color={AMBER} sw={7} /></g>)}
              {shownEnts.filter(visible).map((e) => {
                const ch = view === "diff" && changedIds.has(e.id);
                return <g key={e.id} onClick={(ev) => { ev.stopPropagation(); if (!cv.moved.current) { setSel(e.id); setTab("inspector"); } }} style={{ cursor: "pointer" }}><Shape e={e} color={e.id === sel ? BRAND : ch ? "#9be26b" : layerOf(e.layer).color} sw={e.id === sel ? 2.6 : ch ? 2.2 : 1.25} /></g>;
              })}
            </svg>
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300">{meta.title} · {meta.scale} {view !== "current" && <b className="ml-1 text-amber-300">{view === "original" ? "ORIGINAL" : "DIFFERENCES: red = removed, green = changed"}</b>}</div>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-wrap justify-between gap-2 bg-slate-950/80 px-3 py-1 font-mono text-[11px] text-slate-400"><span>{cv.cursor ? `X ${cv.cursor[0].toFixed(3)}  Y ${cv.cursor[1].toFixed(3)}` : "X —  Y —"}</span><span>Zoom {cv.zoomPct}%</span><span>{shownEnts.length} objects · {sel ? `selected ${sel}` : "none selected"}</span></div>
          </div>
          <p className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] leading-snug text-slate-400">Browser-based demonstration on sample drawing geometry. It does not open or write DWG files and does not control the BricsCAD application.</p>
        </div>

        {/* Right: inspector / automation / results / history */}
        <aside aria-label="Inspector and automation" className="order-3 border-t border-slate-800 bg-slate-900/60 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="flex border-b border-slate-800">{tabBtn("automation", "Automation")}{tabBtn("results", "Results")}{tabBtn("inspector", "Inspector")}{tabBtn("history", "History")}</div>
          <div className="p-4">
            {tab === "automation" && (
              <ul className="space-y-2">{ACTIONS.map((a) => (
                <li key={a.key} className="rounded border border-slate-800 bg-slate-950 p-3"><div className="flex items-start justify-between gap-2"><div><h3 className="text-xs font-semibold text-white">{a.name}{a.changes && <span className="ml-2 rounded bg-amber-500/15 px-1.5 text-[10px] text-amber-300">modifies drawing</span>}</h3><p className="mt-1 text-[11px] leading-snug text-slate-400">{a.text}</p></div><button type="button" disabled={!!running} onClick={() => run(a.key)} className={`${PRIMARY} shrink-0 disabled:opacity-40`}>Run</button></div></li>
              ))}</ul>
            )}
            {tab === "results" && (
              running ? (
                <div role="status" aria-live="polite"><h3 className="text-sm font-semibold text-white">Running: {ACTIONS.find((a) => a.key === running.key)!.name}</h3><ol className="mt-3 space-y-1.5 text-xs">{running.steps.map((s, i) => <li key={i} className={i < running.i ? "text-blue-300" : i === running.i ? "text-white" : "text-slate-600"}>{i < running.i ? "✓" : i === running.i ? "…" : "·"} {s}</li>)}</ol></div>
              ) : !result ? <p className="text-xs leading-relaxed text-slate-500">No operation has been run on this drawing. Open the Automation tab and run one, for example the layer naming audit.</p> : (
                <div className="space-y-3">
                  <dl className="grid grid-cols-2 gap-2 text-xs">{[["Operation", result.name], ["Run at", result.at], ["Objects inspected", String(result.inspected)], [result.key === "cleanup" || result.key === "organize" ? "Objects changed" : "Issues detected", String(result.key === "cleanup" || result.key === "organize" ? result.changed : issuesOf.length)], ["Objects affected", String(result.key === "cleanup" || result.key === "organize" ? result.changed : new Set(issuesOf.flatMap((f) => f.ids)).size)], ["Status", result.key === "summary" ? "Complete" : (result.key === "cleanup" || result.key === "organize" ? "Applied to sample" : issuesOf.length ? "Needs attention" : "Passed")]].map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-white">{v}</dd></div>)}</dl>
                  {result.before !== undefined && <p className="rounded bg-blue-500/10 px-3 py-2 text-xs text-blue-200">Standards issues in this drawing: {result.before} → {result.after}. Use “Differences” in the workspace to see what changed.</p>}
                  {result.score && <table className="w-full text-xs"><tbody>{result.score.map((s) => <tr key={s.rule} className="border-t border-slate-800"><td className="py-1.5">{s.rule}</td><td className={`py-1.5 text-right font-semibold ${s.issues ? "text-amber-300" : "text-blue-300"}`}>{s.issues ? `${s.issues} issue${s.issues > 1 ? "s" : ""}` : "Pass"}</td></tr>)}</tbody></table>}
                  {result.lines && <ul className="space-y-1 rounded bg-slate-950 p-3 text-xs text-slate-300">{result.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
                  {issuesOf.length > 0 && <div className="flex flex-wrap gap-2"><button type="button" className={BTN} onClick={() => download("bricscad-findings-sample.csv", toCsv([["Severity", "Objects", "Finding", "Suggested action"], ...issuesOf.map((f) => [f.severity, f.ids.join(" "), f.message, f.action])]), "text/csv")}>Findings CSV</button></div>}
                  {issuesOf.length === 0 && !result.lines && <p className="rounded bg-blue-500/10 px-3 py-2 text-xs text-blue-300">✓ No issues found.</p>}
                  <ul className="space-y-1.5">{issuesOf.map((f, i) => (
                    <li key={i} className={`rounded border px-3 py-2 text-xs ${f.ids.includes(sel ?? "") ? "border-blue-500 bg-blue-600/10" : "border-slate-800 bg-slate-950"}`}>
                      <p><span className={`mr-1.5 rounded px-1 text-[10px] font-semibold uppercase ${SEV[f.severity]}`}>{f.severity}</span>{f.message}</p><p className="mt-1 text-slate-400">{f.action}</p>
                      <div className="mt-1.5 flex gap-2">{f.ids[0] && <button type="button" onClick={() => locate(f)} className="rounded border border-slate-600 px-2 py-0.5 text-[11px] hover:border-blue-500">Locate</button>}{f.fix && <button type="button" onClick={() => fix(f)} className="rounded border border-slate-600 px-2 py-0.5 text-[11px] hover:border-blue-500">Fix</button>}</div>
                    </li>))}</ul>
                </div>
              )
            )}
            {tab === "inspector" && (!selected ? <p className="text-xs leading-relaxed text-slate-500">Click an object in the drawing, or use Locate on a finding.</p> : (
              <div className="space-y-3">
                <dl className="space-y-1 rounded border border-slate-800 bg-slate-950 p-3 text-xs">{props(selected).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-mono text-slate-200">{v}</dd></div>)}<div className="flex justify-between gap-3"><dt className="text-slate-500">Annotation</dt><dd className="text-right text-slate-200">{annot(selected)}</dd></div></dl>
                <div><label className={LBL} htmlFor="b-layer">Layer</label><select id="b-layer" value={selected.layer} disabled={view === "original"} onChange={(e) => { const v = e.target.value; put({ ...doc, ents: doc.ents.map((x) => (x.id === selected.id ? { ...x, layer: v } : x)), layers: doc.layers.some((l) => l.name === v) ? doc.layers : [...doc.layers, layerInfo(v)] }); log(`CHPROP ${selected.id} layer → ${v}`); }} className={FIELD}>{LAYER_TABLE.filter((l) => !/^(walls2|DOORS|Elec|SECT|Trees)/.test(l.name) || l.name === selected.layer).map((l) => <option key={l.name}>{l.name}</option>)}</select><p className="mt-1 text-[10px] text-slate-500">Standard layer for this object: <span className="font-mono">{expectedLayer(selected)}</span></p></div>
                {selFindings.length === 0 ? <p className="rounded bg-blue-500/10 px-3 py-2 text-xs text-blue-300">✓ No findings for this object{result ? "" : " (run a check to validate)"}</p> : <ul className="space-y-1.5">{selFindings.map((f, i) => <li key={i} className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{f.message}</li>)}</ul>}
              </div>
            ))}
            {tab === "history" && <ul className="space-y-1.5 text-xs">{history.map((h, i) => <li key={i} className="rounded border border-slate-800 bg-slate-950 px-3 py-2"><span className="font-mono text-slate-500">{h.t}</span> <span className="text-slate-500">{h.drawing}</span><br />{h.text}</li>)}{!history.length && <li className="text-slate-500">No operations yet in this session.</li>}</ul>}
          </div>
        </aside>
      </div>
    </DemoShell>
  );
}
