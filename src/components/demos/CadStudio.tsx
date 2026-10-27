"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DemoShell from "./DemoShell";
import { CHECKS, DRAWING, EXPECTED, LAYERS, LAYER_RE, applyFix, area, bbox, buildDrawing, len, runCheck, type CheckKey, type Ent, type Finding, type Layer } from "@/lib/demo-cad-data";
import type { Branding } from "@/lib/types";

type VB = { x: number; y: number; w: number; h: number };
const FIT: VB = { x: -2.6, y: -3.3, w: 25.2, h: 21 };
const BRAND = "#55b52b", AMBER = "#f59e0b";
const field = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500";
const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500";
const sevCls: Record<string, string> = { error: "bg-red-500/15 text-red-300", warning: "bg-amber-500/15 text-amber-300", info: "bg-blue-500/15 text-blue-300" };
const download = (name: string, text: string, type = "text/plain") => { const u = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };
const ANNO = new Set(["text", "ttlb", "grid"]);

interface Report { name: string; inspected: number; findings: Finding[]; at: string; keys: CheckKey[] }

function Shape({ e, color, sw = 1.25, extra }: { e: Ent; color: string; sw?: number; extra?: ReactNode }) {
  const p = { stroke: color, strokeWidth: sw, fill: "none", vectorEffect: "non-scaling-stroke" as const, strokeLinejoin: "round" as const };
  const hit = { stroke: "transparent", strokeWidth: 12, fill: "none", vectorEffect: "non-scaling-stroke" as const };
  switch (e.type) {
    case "wall": { const t = e.t ?? 0.3, h = e.y1 === e.y2; const x = Math.min(e.x1, e.x2!), y = Math.min(e.y1, e.y2!);
      return <rect x={h ? x : e.x1 - t / 2} y={h ? e.y1 - t / 2 : y} width={h ? Math.max(len(e), 0.02) : t} height={h ? t : Math.max(len(e), 0.02)} {...p} fill={`${color}22`} />; }
    case "door": { const w = e.w!, d = e.dir ?? 1;
      if (e.horiz) { const hx = e.x1 - w / 2; return <g><path d={`M${hx} ${e.y1} L${hx} ${e.y1 + d * w} M${hx} ${e.y1 + d * w} A${w} ${w} 0 0 ${d === 1 ? 0 : 1} ${e.x1 + w / 2} ${e.y1}`} {...p} /><line x1={hx} y1={e.y1} x2={e.x1 + w / 2} y2={e.y1} {...hit} /></g>; }
      const hy = e.y1 - w / 2; return <g><path d={`M${e.x1} ${hy} L${e.x1 + d * w} ${hy} M${e.x1 + d * w} ${hy} A${w} ${w} 0 0 ${d === 1 ? 1 : 0} ${e.x1} ${e.y1 + w / 2}`} {...p} /><line x1={e.x1} y1={hy} x2={e.x1} y2={e.y1 + w / 2} {...hit} /></g>; }
    case "window": { const t = e.t ?? 0.3, h = e.y1 === e.y2!;
      return h ? <g><rect x={e.x1} y={e.y1 - t / 2} width={len(e)} height={t} {...p} /><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y1} {...p} /></g> : <g><rect x={e.x1 - t / 2} y={e.y1} width={t} height={len(e)} {...p} /><line x1={e.x1} y1={e.y1} x2={e.x1} y2={e.y2} {...p} /></g>; }
    case "room": return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} strokeDasharray="0.25 0.15" fill="rgba(85,181,43,0.04)" />{extra}</g>;
    case "dim": { const off = e.h ?? 1, horiz = e.y1 === e.y2!, L = len(e) * 1000;
      if (horiz) { const y = e.y1 + off; return <g><line x1={e.x1} y1={e.y1} x2={e.x1} y2={y} {...p} strokeWidth={0.7} /><line x1={e.x2} y1={e.y1} x2={e.x2} y2={y} {...p} strokeWidth={0.7} /><line x1={e.x1} y1={y} x2={e.x2} y2={y} {...p} /><line x1={e.x1} y1={y} x2={e.x2} y2={y} {...hit} /><text x={(e.x1 + e.x2!) / 2} y={y - 0.12} fontSize={0.28} fill={color} textAnchor="middle">{L.toFixed(0)}</text></g>; }
      const x = e.x1 + off; return <g><line x1={e.x1} y1={e.y1} x2={x} y2={e.y1} {...p} strokeWidth={0.7} /><line x1={e.x1} y1={e.y2} x2={x} y2={e.y2} {...p} strokeWidth={0.7} /><line x1={x} y1={e.y1} x2={x} y2={e.y2} {...p} /><line x1={x} y1={e.y1} x2={x} y2={e.y2} {...hit} /><text transform={`translate(${x - 0.12} ${(e.y1 + e.y2!) / 2}) rotate(-90)`} fontSize={0.28} fill={color} textAnchor="middle">{L.toFixed(0)}</text></g>; }
    case "text": return <text x={e.x1} y={e.y1} fontSize={e.size ?? 0.3} fill={color} textAnchor={e.y1 < -1 ? "start" : "middle"} style={{ cursor: "pointer" }}>{(e.text ?? "").split("\n").map((l, i) => <tspan key={i} x={e.x1} dy={i ? (e.size ?? 0.3) * 1.3 : 0}>{l}</tspan>)}</text>;
    case "furn": return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} fill={`${color}18`} />{(e.w ?? 0) >= 2 && <text x={e.x1 + e.w! / 2} y={e.y1 + e.h! / 2 + 0.1} fontSize={0.22} fill={color} textAnchor="middle">{e.name}</text>}</g>;
    case "col": return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} fill={`${color}66`} /><path d={`M${e.x1} ${e.y1} l${e.w} ${e.h} M${e.x1 + e.w!} ${e.y1} l${-e.w!} ${e.h}`} {...p} strokeWidth={0.7} /></g>;
    case "grid": return <g><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...p} strokeDasharray="0.6 0.2 0.1 0.2" /><line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} {...hit} /><circle cx={e.x1} cy={e.y1 - 0.4} r={0.4} {...p} /><text x={e.x1} y={e.y1 - 0.3} fontSize={0.4} fill={color} textAnchor="middle">{e.text}</text></g>;
    default: { const lines = (e.text ?? "").split("|"); return <g><rect x={e.x1} y={e.y1} width={e.w} height={e.h} {...p} /><line x1={e.x1} y1={e.y1 + 1} x2={e.x1 + e.w!} y2={e.y1 + 1} {...p} strokeWidth={0.7} />{lines.map((l, i) => <text key={i} x={e.x1 + 0.3} y={e.y1 + 0.7 + i * 0.7} fontSize={i === 0 ? 0.5 : 0.3} fill={color}>{l}</text>)}</g>; }
  }
}

export default function CadStudio({ branding }: { branding: Branding }) {
  const [ents, setEnts] = useState<Ent[]>(() => buildDrawing());
  const [layers, setLayers] = useState<Layer[]>(LAYERS);
  const [sel, setSel] = useState<string | null>(null);
  const [vb, setVb] = useState<VB>(FIT);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [hiddenL, setHiddenL] = useState<Set<string>>(new Set());
  const [hideDims, setHideDims] = useState(false);
  const [hideAnno, setHideAnno] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [q, setQ] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [log, setLog] = useState<string[]>(["Command: drawing opened (sample data)"]);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [panel, setPanel] = useState<"layers" | "checks">("layers");
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const say = (s: string) => setLog((l) => [s, ...l].slice(0, 30));

  const layerOf = (n: string) => layers.find((l) => l.name === n) ?? { name: n, color: "#fb923c" };
  const flagged = useMemo(() => new Set((report?.findings ?? []).flatMap((f) => f.ids)), [report]);
  const selected = ents.find((e) => e.id === sel) ?? null;
  const visible = (e: Ent) => !hiddenL.has(e.layer) && !(hideDims && e.type === "dim") && !(hideAnno && ANNO.has(e.type)) && !(!showGrid && e.type === "grid");
  const counts = useMemo(() => { const m = new Map<string, number>(); ents.forEach((e) => m.set(e.layer, (m.get(e.layer) ?? 0) + 1)); return m; }, [ents]);
  const matches = q.trim() ? ents.filter((e) => `${e.id} ${e.handle} ${e.type} ${e.layer} ${e.text ?? ""} ${e.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : [];

  // ---- view ----
  const toSvg = (cx: number, cy: number) => { const s = svg.current!, m = s.getScreenCTM()!.inverse(), pt = new DOMPoint(cx, cy).matrixTransform(m); return { x: pt.x, y: pt.y }; };
  const fit = () => { const s = svg.current; if (!s) return setVb(FIT); const a = (s.clientWidth || 1) / (s.clientHeight || 1); const w = Math.max(FIT.w, FIT.h * a), h = w / a; setVb({ x: FIT.x + FIT.w / 2 - w / 2, y: FIT.y + FIT.h / 2 - h / 2, w, h }); };
  const zoomAt = (f: number, c?: { x: number; y: number }) => setVb((v) => { const p = c ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 }; return { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: v.w * f, h: v.h * f }; });
  useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const s = svg.current; if (!s) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, toSvg(e.clientX, e.clientY)); };
    s.addEventListener("wheel", wheel, { passive: false });
    return () => s.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const zoomTo = (e: Ent) => { const b = bbox(e), s = svg.current!, a = (s.clientWidth || 1) / (s.clientHeight || 1); const w = Math.max(b.w * 2.2, 5), h = Math.max(b.h * 2.2, 5 / a); const W = Math.max(w, h * a), H = W / a; setVb({ x: b.x + b.w / 2 - W / 2, y: b.y + b.h / 2 - H / 2, w: W, h: H }); };
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; moved.current = false; };
  const onMove = (e: React.PointerEvent) => {
    const p = toSvg(e.clientX, e.clientY); setCursor([p.x, 12 - p.y]);
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (!moved.current && Math.hypot(dx, dy) > 3) { moved.current = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); }
    if (moved.current && (tool === "pan" || e.buttons === 4 || e.shiftKey)) { const k = svg.current!.getScreenCTM()!.a; setVb((v) => ({ ...v, x: v.x - dx / k, y: v.y - dy / k })); drag.current = { x: e.clientX, y: e.clientY }; }
  };
  const onUp = () => { drag.current = null; };
  const pick = (id: string | null) => { if (!moved.current) setSel(id); };

  // ---- checks ----
  const run = (keys: CheckKey[], name: string) => {
    let inspected = 0; const findings: Finding[] = [];
    for (const k of keys) { const r = runCheck(k, ents, layers); inspected = Math.max(inspected, r.inspected); findings.push(...r.findings); }
    setReport({ name, inspected, findings, at: new Date().toLocaleTimeString(), keys });
    say(`Command: ${name.toUpperCase()} → ${inspected} objects, ${findings.filter((f) => f.severity !== "info").length} issues`);
    const first = findings.find((f) => f.ids[0]); if (first) { setSel(first.ids[0]); }
  };
  const rerun = (r: Report, e: Ent[], l: Layer[]) => { const findings: Finding[] = []; let inspected = 0; for (const k of r.keys) { const x = runCheck(k, e, l); inspected = Math.max(inspected, x.inspected); findings.push(...x.findings); } setReport({ ...r, findings, inspected, at: new Date().toLocaleTimeString() }); };
  const fix = (f: Finding) => { const r = applyFix(ents, layers, f); setEnts(r.ents); setLayers(r.layers); say(`Fixed: ${f.message}`); if (report) rerun(report, r.ents, r.layers); };
  const fixAll = () => { if (!report) return; let e = ents, l = layers, n = 0; for (const f of report.findings) { if (!f.fix) continue; const r = applyFix(e, l, f); e = r.ents; l = r.layers; n++; } setEnts(e); setLayers(l); say(`Applied ${n} suggested fixes`); rerun(report, e, l); };
  const locate = (f: Finding) => { const id = f.ids[0]; if (!id) return; setSel(id); const e = ents.find((x) => x.id === id); if (e) zoomTo(e); };
  const reset = () => { setEnts(buildDrawing()); setLayers(LAYERS); setSel(null); setReport(null); setHiddenL(new Set()); setHideDims(false); setHideAnno(false); setShowGrid(true); setQ(""); setLog(["Command: drawing reset to the original sample"]); setTool("select"); fit(); };
  const reportText = () => [`${DRAWING.name} — drawing automation report (SAMPLE DATA, simulated demonstration)`, report ? `Check: ${report.name} · ${report.inspected} objects inspected` : "No check run yet", "", ...(report?.findings ?? []).map((f) => `[${f.severity.toUpperCase()}] ${f.message}${f.action ? " → " + f.action : ""}`)].join("\n");

  const props = (e: Ent) => {
    const rows: [string, string][] = [["Handle", e.handle], ["Object id", e.id], ["Type", e.type]];
    const Y = (y: number) => (12 - y).toFixed(3);
    if (e.type === "wall" || e.type === "window" || e.type === "dim" || e.type === "grid") { rows.push(["Start", `${e.x1.toFixed(3)}, ${Y(e.y1)}`], ["End", `${e.x2!.toFixed(3)}, ${Y(e.y2!)}`], ["Length", `${len(e).toFixed(3)} m`]); if (e.t) rows.push(["Thickness", `${(e.t * 1000).toFixed(0)} mm`]); }
    else if (e.type === "door") rows.push(["Position", `${e.x1.toFixed(3)}, ${Y(e.y1)}`], ["Width", `${((e.w ?? 0) * 1000).toFixed(0)} mm`], ["Swing", e.dir === 1 ? "down/right" : "up/left"]);
    else if (e.type === "room") rows.push(["Name", e.name ?? ""], ["Corner", `${e.x1.toFixed(3)}, ${Y(e.y1 + e.h!)}`], ["Size", `${e.w!.toFixed(2)} × ${e.h!.toFixed(2)} m`], ["Area", `${area(e).toFixed(2)} m²`]);
    else if (e.type === "text") rows.push(["Position", `${e.x1.toFixed(3)}, ${Y(e.y1)}`], ["Height", `${e.size} m`]);
    else rows.push(["Position", `${e.x1.toFixed(3)}, ${Y(e.y1 + (e.h ?? 0))}`], ["Size", `${(e.w ?? 0).toFixed(2)} × ${(e.h ?? 0).toFixed(2)} m`]);
    return rows;
  };
  const assoc = (e: Ent) => e.type === "room" ? ents.find((x) => x.type === "text" && x.roomId === e.roomId)?.text?.replace("\n", " · ") ?? "No label" : e.type === "text" && e.roomId ? `Label of ${ents.find((x) => x.type === "room" && x.roomId === e.roomId)?.name}` : e.type === "dim" ? `${(len(e) * 1000).toFixed(0)} mm` : "—";

  const tb = (on: boolean) => `rounded px-2.5 py-1 text-xs font-medium ${on ? "bg-blue-600 text-white" : "bg-slate-900/90 text-slate-300 hover:bg-slate-800"}`;
  const btn = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white";
  const primary = "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500";
  const issues = report?.findings.filter((f) => f.severity !== "info") ?? [];

  return (
    <DemoShell branding={branding} app="AutoCAD Drawing Automation Studio" project={`${DRAWING.name} · ${DRAWING.title}`} status={DRAWING.status}
      actions={<><button type="button" onClick={() => download("drawing-report-sample.txt", reportText())} className={btn}>Export report</button><button type="button" onClick={reset} className={btn}>Reset drawing</button></>}>
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[17rem_minmax(0,1fr)_21rem]">
        {/* Left: layers / checks */}
        <aside aria-label="Layers and checks" className="order-2 border-t border-slate-800 bg-slate-900/60 lg:order-1 lg:border-r lg:border-t-0">
          <div className="flex border-b border-slate-800 text-sm">{([["layers", "Layers"], ["checks", "Automation checks"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setPanel(k)} className={`flex-1 px-3 py-2.5 ${panel === k ? "border-b-2 border-blue-500 font-semibold text-blue-300" : "text-slate-400 hover:text-white"}`}>{l}</button>)}</div>
          {panel === "layers" ? (
            <div className="p-3">
              <div className="mb-2 flex gap-2"><button type="button" className={btn} onClick={() => setHiddenL(new Set())}>Show all</button><button type="button" className={btn} onClick={() => setHiddenL(new Set(layers.map((l) => l.name)))}>Hide all</button></div>
              <ul className="space-y-0.5">{layers.map((l) => { const bad = l.name !== "0" && !LAYER_RE.test(l.name); const off = hiddenL.has(l.name); return (
                <li key={l.name} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-800">
                  <button type="button" role="switch" aria-checked={!off} aria-label={`${off ? "Show" : "Hide"} layer ${l.name}`} onClick={() => setHiddenL((h) => { const n = new Set(h); if (n.has(l.name)) n.delete(l.name); else n.add(l.name); return n; })} className={`h-4 w-7 rounded-full border ${off ? "border-slate-600 bg-slate-800" : "border-blue-500 bg-blue-600"}`}><span className={`block h-3 w-3 rounded-full bg-white transition ${off ? "translate-x-0.5" : "translate-x-3.5"}`} /></button>
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: l.color }} /><span className={`flex-1 truncate font-mono ${off ? "text-slate-600" : "text-slate-200"}`}>{l.name}</span>{bad && <span title="Does not follow the naming standard" className="text-amber-400">⚠</span>}<span className="text-slate-500">{counts.get(l.name) ?? 0}</span>
                </li>); })}</ul>
              <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" checked={!hideDims} onChange={() => setHideDims((v) => !v)} />Show dimensions</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!hideAnno} onChange={() => setHideAnno((v) => !v)} />Show annotations (text, grid, title block)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={showGrid} onChange={() => setShowGrid((v) => !v)} />Show structural grid lines</label>
              </div>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              <button type="button" className={`${primary} w-full`} onClick={() => run(CHECKS.filter((c) => c.key !== "summary").map((c) => c.key), "Run all checks")}>Run all checks</button>
              {CHECKS.map((c) => (
                <section key={c.key} className="rounded border border-slate-800 bg-slate-950 p-3"><h3 className="text-xs font-semibold text-white">{c.name}</h3><p className="mt-1 text-[11px] leading-snug text-slate-400">{c.text}</p><button type="button" onClick={() => run([c.key], c.name)} className={`${btn} mt-2`}>Run</button></section>
              ))}
            </div>
          )}
        </aside>

        {/* Centre: drawing */}
        <div className="order-1 min-w-0 space-y-2 p-3 sm:p-4 lg:order-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex gap-0.5 rounded-md border border-slate-700 p-0.5"><button type="button" aria-pressed={tool === "select"} className={tb(tool === "select")} onClick={() => setTool("select")}>Select</button><button type="button" aria-pressed={tool === "pan"} className={tb(tool === "pan")} onClick={() => setTool("pan")}>Pan</button></span>
            <button type="button" className={btn} aria-label="Zoom in" onClick={() => zoomAt(0.8)}>＋</button><button type="button" className={btn} aria-label="Zoom out" onClick={() => zoomAt(1.25)}>－</button>
            <button type="button" className={btn} onClick={fit}>Fit drawing</button><button type="button" className={btn} onClick={() => { setVb(FIT); fit(); }}>Reset view</button>
            <div className="relative ml-auto w-full sm:w-56"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, type, layer, text…" aria-label="Search drawing objects" className={field} />
              {matches.length > 0 && <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-700 bg-slate-900 text-xs shadow-xl">{matches.slice(0, 12).map((m) => <li key={m.id}><button type="button" onClick={() => { setSel(m.id); zoomTo(m); setQ(""); }} className="flex w-full justify-between gap-2 px-2 py-1.5 text-left hover:bg-slate-800"><span className="font-mono">{m.id}</span><span className="truncate text-slate-400">{m.type} · {m.layer}</span></button></li>)}{matches.length > 12 && <li className="px-2 py-1 text-slate-500">+{matches.length - 12} more</li>}</ul>}
              {q.trim() && matches.length === 0 && <p className="absolute z-20 mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-500">No objects found.</p>}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#0a0f0c]">
            <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block h-[50vh] min-h-[320px] w-full touch-none select-none lg:h-[62vh]" style={{ cursor: tool === "pan" ? "grab" : "crosshair" }} role="img" aria-label="Sample ground floor plan drawing. Click an object to select it."
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={() => !moved.current && setSel(null)}>
              <defs><pattern id="cg" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#17221b" strokeWidth="0.02" /></pattern></defs>
              <rect x={-30} y={-30} width={90} height={90} fill="url(#cg)" />
              {ents.filter(visible).filter((e) => flagged.has(e.id)).map((e) => <g key={`h${e.id}`} pointerEvents="none" opacity={0.55}><Shape e={e} color={AMBER} sw={7} /></g>)}
              {ents.filter(visible).map((e) => (
                <g key={e.id} onClick={(ev) => { ev.stopPropagation(); pick(e.id); }} style={{ cursor: "pointer" }}>
                  <Shape e={e} color={e.id === sel ? BRAND : layerOf(e.layer).color} sw={e.id === sel ? 2.6 : 1.25} />
                </g>
              ))}
              <text x={-2.6} y={-2.9} fontSize={0.32} fill="#64748b">Sample drawing: Brookside Office Suite · {DRAWING.scale}</text>
              <g transform="translate(22 -0.6)" stroke="#94a3b8" fill="none" vectorEffect="non-scaling-stroke"><path d="M0 1 L0.4 -0.4 L0.8 1 L0.4 0.6 Z" strokeWidth="0.06" /><text x="0.4" y="-0.6" fontSize="0.35" fill="#94a3b8" textAnchor="middle" stroke="none">N</text></g>
            </svg>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-wrap justify-between gap-2 bg-slate-950/80 px-3 py-1 font-mono text-[11px] text-slate-400">
              <span>{cursor ? `X ${cursor[0].toFixed(3)}  Y ${cursor[1].toFixed(3)}` : "X —  Y —"}</span><span>Zoom {Math.round((FIT.w / vb.w) * 100)}%</span><span>{ents.length} objects · {sel ? `1 selected (${sel})` : "none selected"}</span>
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] leading-relaxed text-slate-400" aria-label="Command history">{log.slice(0, 4).map((l, i) => <p key={i} className={i === 0 ? "text-slate-200" : ""}>{l}</p>)}</div>
        </div>

        {/* Right: properties + results */}
        <aside aria-label="Properties and results" className="order-3 space-y-4 border-t border-slate-800 bg-slate-900/60 p-4 lg:border-l lg:border-t-0">
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Object properties</h2>
            {!selected ? <p className="mt-3 text-xs leading-relaxed text-slate-500">Click an object in the drawing, search for one, or pick a result to inspect it.</p> : (
              <div className="mt-3 space-y-3">
                <dl className="space-y-1 rounded border border-slate-800 bg-slate-950 p-3 text-xs">{props(selected).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-mono text-slate-200">{v}</dd></div>)}<div className="flex justify-between gap-3"><dt className="text-slate-500">Annotation</dt><dd className="text-right text-slate-200">{assoc(selected)}</dd></div></dl>
                <div><label className={lbl} htmlFor="p-layer">Layer</label><select id="p-layer" value={selected.layer} onChange={(e) => { const v = e.target.value; setEnts((a) => a.map((x) => (x.id === selected.id ? { ...x, layer: v } : x))); say(`Command: CHPROP ${selected.id} Layer ${v}`); }} className={field}>{layers.map((l) => <option key={l.name}>{l.name}</option>)}</select><p className="mt-1 text-[10px] text-slate-500">Standard layer for a {selected.type}: <span className="font-mono">{EXPECTED[selected.type]}</span></p></div>
                <button type="button" onClick={() => { setEnts((a) => a.filter((x) => x.id !== selected.id)); say(`Command: ERASE ${selected.id}`); setSel(null); }} className={btn}>Delete object</button>
                {(() => { const fs = (report?.findings ?? []).filter((f) => f.ids.includes(selected.id) && f.severity !== "info"); return fs.length === 0 ? <p className="rounded bg-blue-500/10 px-3 py-2 text-xs text-blue-300">✓ No findings for this object{report ? "" : " (run a check to validate)"}</p> : <ul className="space-y-1.5">{fs.map((f, i) => <li key={i} className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-200"><span className={`mr-1.5 rounded px-1 text-[10px] font-semibold uppercase ${sevCls[f.severity]}`}>{f.severity}</span>{f.message}</li>)}</ul>; })()}
              </div>
            )}
          </section>
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Results</h2>
            {!report ? <p className="mt-3 text-xs leading-relaxed text-slate-500">No check has been run. Open “Automation checks” on the left, for example <em>Run all checks</em>.</p> : (
              <div className="mt-3 space-y-3">
                <dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Check</dt><dd className="font-semibold text-white">{report.name}</dd></div><div><dt className="text-slate-500">Objects inspected</dt><dd className="font-semibold text-white">{report.inspected}</dd></div><div><dt className="text-slate-500">Issues</dt><dd className={`font-semibold ${issues.length ? "text-amber-300" : "text-blue-300"}`}>{issues.length}</dd></div><div><dt className="text-slate-500">Status</dt><dd className={`font-semibold ${issues.length ? "text-amber-300" : "text-blue-300"}`}>{issues.length ? "Needs attention" : "Passed"}</dd></div></dl>
                <div className="flex flex-wrap gap-2">{issues.some((f) => f.fix) && <button type="button" className={primary} onClick={fixAll}>Apply all fixes</button>}<button type="button" className={btn} onClick={() => download("drawing-findings-sample.csv", ["Severity,Objects,Finding,Suggested action", ...report.findings.map((f) => [f.severity, f.ids.join(" "), f.message, f.action].map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n"), "text/csv")}>Findings CSV</button></div>
                {issues.length === 0 && report.findings.every((f) => f.severity !== "info") && <p className="rounded bg-blue-500/10 px-3 py-2 text-xs text-blue-300">✓ No issues found.</p>}
                <ul className="max-h-[22rem] space-y-1.5 overflow-auto">{report.findings.map((f, i) => (
                  <li key={i} className={`rounded border px-3 py-2 text-xs ${f.ids.includes(sel ?? "") ? "border-blue-500 bg-blue-600/10" : "border-slate-800 bg-slate-950"}`}>
                    <p><span className={`mr-1.5 rounded px-1 text-[10px] font-semibold uppercase ${sevCls[f.severity]}`}>{f.severity}</span>{f.message}</p>
                    {f.action && <p className="mt-1 text-slate-400">{f.action}</p>}
                    <div className="mt-1.5 flex gap-2">{f.ids[0] && <button type="button" onClick={() => locate(f)} className="rounded border border-slate-600 px-2 py-0.5 text-[11px] hover:border-blue-500">Locate</button>}{f.fix && <button type="button" onClick={() => fix(f)} className="rounded border border-slate-600 px-2 py-0.5 text-[11px] hover:border-blue-500">Fix</button>}</div>
                  </li>))}</ul>
              </div>
            )}
          </section>
        </aside>
      </div>
    </DemoShell>
  );
}
