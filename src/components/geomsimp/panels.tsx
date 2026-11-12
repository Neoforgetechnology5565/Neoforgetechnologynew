"use client";
import { useMemo, useState } from "react";
import { buildExport, solidTris, type ExportSel } from "@/lib/geomsimp/engine";
import { modOptions } from "@/lib/geomsimp/model";
import { CATS, CAT_LABEL, type Cat, type Elem } from "@/lib/geomsimp/types";
import { CacheBars, HBars, PairedBars } from "./charts";
import type { Actions, State } from "./store";
import { CAT_COLOR, USE_COLOR } from "./viewport";

export const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-3";
const H3 = "mb-2 text-[13px] font-semibold uppercase tracking-wider text-slate-400";
export const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-[13px] font-medium text-slate-200 hover:border-cyan-400 hover:text-white disabled:opacity-40";
export const GO = "rounded-md bg-cyan-500 px-4 py-2 text-[14px] font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40";
const FIELD = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[14px] text-slate-100 outline-none focus:border-cyan-400";
type P = { s: State; a: Actions };

export const area = (n: number, u: "m2" | "ft2") => (u === "m2" ? `${n.toFixed(2)} m²` : `${(n * 10.7639).toFixed(1)} ft²`);
const ms = (n: number | null) => (n === null ? "—" : n < 0.1 ? `${(n * 1000).toFixed(0)} µs` : `${n.toFixed(n < 10 ? 2 : 1)} ms`);
const num = (n: number) => n.toLocaleString();
const Tile = ({ label, value, sub, tone = "text-white", id }: { label: string; value: string; sub?: string; tone?: string; id?: string }) => <div data-testid={id} className="rounded-md border border-slate-800 bg-slate-950 p-2.5"><p className="text-[13px] text-slate-400">{label}</p><p className={`font-mono text-lg font-semibold ${tone}`}>{value}</p>{sub && <p className="text-[13px] text-slate-500">{sub}</p>}</div>;
const Bar = ({ pct, stage }: { pct: number; stage: string }) => <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={stage} data-testid="progress"><div className="h-2 rounded bg-slate-800"><div className="h-2 rounded bg-cyan-400 transition-all" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[13px] text-cyan-300">{stage}… {pct}%</p></div>;
const Pill = ({ tone, children }: { tone: "green" | "orange" | "red" | "grey"; children: React.ReactNode }) => <span className={`rounded px-1.5 py-0.5 text-[13px] font-semibold ${{ green: "bg-green-500/15 text-green-400", orange: "bg-orange-500/15 text-orange-300", red: "bg-red-500/15 text-red-400", grey: "bg-slate-700/40 text-slate-400" }[tone]}`}>{children}</span>;
const Need = ({ what, onGo, label }: { what: string; onGo: () => void; label: string }) => <div className={CARD}><p className="text-[14px] text-slate-300">{what}</p><button type="button" className={`${GO} mt-3`} onClick={onGo}>{label}</button></div>;

/* ---------- overview ---------- */
const STEPS = ["Import a sample architectural building model", "Display the original, detailed geometry", "Extract the relevant architectural elements", "Classify the geometry into categories", "Simplify to zero-thickness surfaces and lines", "Compare original and simplified side by side", "Show thermal zones and shading geometry", "Modify one window or wall", "Detect the change and update the cache incrementally", "Deliver the lightweight analytical geometry"];
export function Overview({ s, a, onGuide, onStopGuide }: P & { onGuide: () => void; onStopGuide: () => void }) {
  const done = [s.imported, s.imported, !!s.extract, !!s.extract, !!s.agg, s.compare || (!!s.agg && s.mode !== "original"), s.zonesOn, !!s.lastMod || s.runs.length > 0, s.runs.length > 0, !!s.agg];
  const last = s.runs[s.runs.length - 1];
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h2 className="text-base font-semibold text-white">Architectural Geometry Intelligence</h2>
        <p className="mt-1 text-[14px] text-slate-300">A proof-of-concept of the geometry pre-processing step that sits in front of a building-physics engine: extract the relevant elements, reduce them to zero-thickness analytical surfaces, and reprocess only what an architect changes.</p>
        <p role="note" className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[13px] text-amber-200">The building is a sample generated in your browser. It is not read from Revit or SketchUp, and no plug-in is connected. Timings are measured live in this browser, not on a Revit or SketchUp plug-in.</p>
        <div className="mt-3 flex flex-wrap gap-2">{s.guide.running ? <button type="button" className={BTN} onClick={onStopGuide} data-testid="stop-guide">Stop guided demo</button> : <button type="button" className={GO} onClick={onGuide} data-testid="run-guide">Run guided demo</button>}<button type="button" className={BTN} onClick={() => a.set({ section: "extraction" })}>Go to extraction</button></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile id="kpi-orig" label="Original triangles" value={s.mt ? num(s.mt.origTris) : s.imported ? num(s.elems.reduce((n, e) => n + e.solids.reduce((m, x) => m + solidTris(x), 0), 0)) : "—"} sub={s.imported ? `${num(s.elems.reduce((n, e) => n + e.solids.length, 0))} solids` : "import the sample"} />
        <Tile id="kpi-simp" label="Analytical surfaces" value={s.mt ? `${s.mt.simpSurfaces} + ${s.mt.simpLines} lines` : "—"} sub={s.mt ? `${s.mt.simpTris} triangles` : "not simplified yet"} tone="text-cyan-300" />
        <Tile id="kpi-red" label="Triangle reduction" value={s.mt ? `${s.mt.reductionPct.toFixed(1)}%` : "—"} tone="text-green-400" />
        <Tile id="kpi-cache" label="Last cache hit ratio" value={last ? `${((last.hits / last.total) * 100).toFixed(1)}%` : "—"} sub={last ? `${last.recomputed.length} of ${last.total} reprocessed` : "after an update"} tone="text-green-400" />
      </div>
      <div className={CARD}>
        <h3 className={H3}>Demonstration workflow</h3>
        <ol className="space-y-1.5">{STEPS.map((t, i) => <li key={t} className="flex items-start gap-2 text-[14px]" data-testid={`step-${i + 1}`} data-done={done[i]}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${done[i] ? "bg-green-500 text-slate-950" : "bg-slate-700 text-slate-300"}`}>{done[i] ? "✓" : i + 1}</span><span className={done[i] ? "text-slate-200" : "text-slate-400"}>{t}</span></li>)}</ol>
        {!s.imported && <button type="button" className={`${GO} mt-3`} onClick={a.importSample} data-testid="import-sample">Import sample model</button>}
      </div>
    </div>
  );
}

/* ---------- inspector ---------- */
export function Inspector({ s }: { s: State }) {
  const el = s.elems.find((e) => e.id === s.selId), zone = s.agg?.zones.find((z) => z.id === s.selZone);
  const surfs = s.agg?.surfaces.filter((x) => x.elem === s.selId) ?? [], lines = s.agg?.lines.filter((x) => x.elem === s.selId) ?? [];
  if (!el && !zone) return <div className={CARD} data-testid="inspector"><h3 className={H3}>Inspector</h3><p className="text-[14px] text-slate-400">Click an element in the 3D view or the Model Explorer to see its properties.</p></div>;
  return (
    <div className={CARD} data-testid="inspector">
      <h3 className={H3}>Inspector</h3>
      {el && <>
        <p className="text-[15px] font-semibold text-white" data-testid="sel-name">{el.name}</p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
          <dt className="text-slate-500">ID</dt><dd className="font-mono text-cyan-300" data-testid="sel-id">{el.id}</dd>
          <dt className="text-slate-500">Class</dt><dd>{CAT_LABEL[el.cat]}</dd><dt className="text-slate-500">Source</dt><dd>{el.src.category} / {el.src.family} / {el.src.type}</dd>
          <dt className="text-slate-500">Level</dt><dd>{el.level < 0 ? "Site" : el.level === 3 ? "Roof" : `Level ${el.level + 1}`}</dd>
          <dt className="text-slate-500">Original</dt><dd>{el.solids.length} solids, {num(el.solids.reduce((n, x) => n + solidTris(x), 0))} triangles</dd>
        </dl>
        {surfs.map((x) => (
          <div key={x.id} className="mt-2 rounded border border-slate-700 bg-slate-950 p-2 text-[13px]" data-testid="sel-surface">
            <p className="font-mono text-green-400">{x.id} · {x.kind}</p>
            <p>Area {area(x.area, s.areaUnit)} · azimuth {x.azimuth === null ? "n/a" : `${x.azimuth}°`} · tilt {x.tilt}° · thickness 0 · {x.boundary}</p>
            {x.parent && <p>Host surface: <span className="font-mono">{x.parent}</span></p>}{x.children.length > 0 && <p>{x.children.length} openings: {x.children.slice(0, 6).join(", ")}{x.children.length > 6 ? "…" : ""}</p>}
            {x.zones.length > 0 && <p>Zones: {x.zones.join(", ")}</p>}
            {s.mode === "analysis" && <p className="font-mono text-slate-400">{x.verts.map((v) => `(${v.join(", ")})`).join(" ")}</p>}
          </div>))}
        {lines.map((l) => <p key={l.id} className="mt-1 font-mono text-[13px] text-amber-300">{l.id}: line, {l.length} m</p>)}
        {!surfs.length && s.agg && <p className="mt-2 text-[13px] text-slate-500">No analytical surface for this element.</p>}
      </>}
      {zone && <><p className="text-[15px] font-semibold text-white" data-testid="sel-name">{zone.name}</p><p className="font-mono text-[13px] text-cyan-300" data-testid="sel-id">{zone.id}</p><p className="text-[13px] text-slate-300">{zone.use} · {area(zone.area, s.areaUnit)} · {zone.bounds.length} boundary surfaces</p></>}
    </div>
  );
}

/* ---------- model explorer ---------- */
function Group({ title, count, children, open: o0 = false, testid }: { title: string; count?: number; children: React.ReactNode; open?: boolean; testid?: string }) {
  const [open, setOpen] = useState(o0);
  return <div><button type="button" onClick={() => setOpen(!open)} aria-expanded={open} data-testid={testid} className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[14px] text-slate-200 hover:bg-slate-800"><span className="w-3 text-slate-500">{open ? "▾" : "▸"}</span><span className="flex-1">{title}</span>{count !== undefined && <span className="text-[13px] text-slate-500">{count}</span>}</button>{open && <div className="ml-4 border-l border-slate-800 pl-2">{children}</div>}</div>;
}
function Row({ id, label, sel, hidden, onClick, onEye, color }: { id: string; label: string; sel: boolean; hidden?: boolean; onClick: () => void; onEye?: () => void; color?: string }) {
  return <div className={`flex items-center gap-1 rounded px-1 ${sel ? "bg-cyan-500/20" : "hover:bg-slate-800"}`}><button type="button" onClick={onClick} data-testid={`tree-${id}`} className={`flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left text-[13px] ${hidden ? "text-slate-600" : "text-slate-300"}`}><i className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color ?? "#64748b" }} /><span className="truncate">{label}</span></button>{onEye && <button type="button" onClick={onEye} aria-label={`${hidden ? "Show" : "Hide"} ${id}`} aria-pressed={!hidden} className="px-1 text-[13px] text-slate-400 hover:text-white">{hidden ? "◌" : "●"}</button>}</div>;
}
export function Explorer({ s, a }: P) {
  const [q, setQ] = useState("");
  const rowOf = (e: Elem) => <Row key={e.id} id={e.id} label={`${e.id} · ${e.name.split(" · ")[0]}`} sel={s.selId === e.id} hidden={s.hidden.includes(e.id)} color={CAT_COLOR[e.cat]} onClick={() => a.select(e.id)} onEye={() => a.toggleHidden(e.id)} />;
  const found = q.trim() ? s.elems.filter((e) => (e.id + " " + e.name).toLowerCase().includes(q.toLowerCase())).slice(0, 60) : [];
  const zoneRow = (z: State["model"]["zones"][number]) => <Row key={z.id} id={z.id} label={`${z.id} · ${z.name}`} sel={s.selZone === z.id} color={USE_COLOR[z.use]} onClick={() => a.selectZone(z.id)} />;
  const shade = (sub: string) => s.elems.filter((e) => e.cat === "shading" && e.sub === sub);
  return (
    <div className="space-y-2">
      <div className={CARD}>
        <h3 className={H3}>Model Explorer</h3>
        <input aria-label="Search elements" className={FIELD} placeholder="Search by id or name, e.g. WIN-L2-S03" value={q} onChange={(e) => setQ(e.target.value)} data-testid="tree-search" />
        <div className="mt-2 max-h-[48vh] overflow-auto pr-1" data-testid="tree">
          {q.trim() ? (found.length ? found.map(rowOf) : <p className="text-[13px] text-slate-500">No matching element.</p>) : (
            <Group title={s.model.name} open testid="tree-root">
              {[0, 1, 2].map((l) => {
                const here = s.elems.filter((e) => e.level === l && e.cat !== "shading" && e.cat !== "roof");
                return <Group key={l} title={`Level ${String(l + 1).padStart(2, "0")}`} count={here.length + 5} open={l === 0} testid={`tree-level-${l + 1}`}>
                  {(["wall", "window", "door", "partition", "floor"] as Cat[]).map((c) => <Group key={c} title={CAT_LABEL[c]} count={here.filter((e) => e.cat === c).length}>{here.filter((e) => e.cat === c).map(rowOf)}</Group>)}
                  <Group title="Thermal zones" count={s.model.zones.filter((z) => z.level === l).length}>{s.model.zones.filter((z) => z.level === l).map(zoneRow)}</Group>
                </Group>;
              })}
              <Group title="Roof" count={1}>{s.elems.filter((e) => e.cat === "roof").map(rowOf)}</Group>
              <Group title="External Shading" count={shade("tree").length + shade("neighbour").length + shade("overhang").length} open testid="tree-shading">
                <Group title="Trees" count={shade("tree").length}>{shade("tree").map(rowOf)}</Group>
                <Group title="Neighbouring Buildings" count={shade("neighbour").length}>{shade("neighbour").map(rowOf)}</Group>
                <Group title="Overhangs" count={shade("overhang").length}>{shade("overhang").map(rowOf)}</Group>
              </Group>
            </Group>)}
        </div>
      </div>
      <Inspector s={s} />
    </div>
  );
}

/* ---------- extraction ---------- */
export function Extraction({ s, a }: P) {
  const ex = s.extract, busy = s.busy?.what === "extract" ? s.busy : null;
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className={H3}>Geometry extraction</h3>
        <p className="text-[14px] text-slate-300">Reads every element of the imported model, classifies it by its source category and, for untyped generic objects, by geometry rules, and keeps what a building-physics model needs.</p>
        {!s.imported ? <button type="button" className={`${GO} mt-3`} onClick={a.importSample}>Import sample model first</button> : <button type="button" className={`${GO} mt-3`} onClick={a.runExtract} disabled={!!s.busy} data-testid="extract">EXTRACT GEOMETRY</button>}
        {busy && <div className="mt-3"><Bar pct={busy.pct} stage={busy.stage} /></div>}
      </div>
      <div className={CARD}>
        <table className="w-full text-[13px]" data-testid="extract-table">
          <thead><tr className="text-left text-slate-400"><th className="py-1">Show</th><th>Element</th><th className="text-right">Detected</th><th className="pl-3">Extracted</th></tr></thead>
          <tbody>{(ex?.rows ?? CATS.map((c) => ({ cat: c as Cat | "zone", label: CAT_LABEL[c], detected: 0, extracted: 0, rule: "" }))).map((r) => (
            <tr key={r.cat} className="border-t border-slate-800" data-testid={`row-${r.cat}`}>
              <td className="py-1">{r.cat !== "zone" ? <input type="checkbox" aria-label={`Show ${r.label}`} checked={s.cats[r.cat as Cat]} onChange={() => a.toggleCat(r.cat as Cat)} /> : <input type="checkbox" aria-label="Show thermal zones" checked={s.zonesOn} onChange={() => a.set({ zonesOn: !s.zonesOn })} />}</td>
              <td><i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: r.cat === "zone" ? "#38bdf8" : CAT_COLOR[r.cat as Cat] }} />{r.label}</td>
              <td className="text-right font-mono" data-testid={`detected-${r.cat}`}>{ex ? r.detected : "—"}</td>
              <td className="pl-3">{ex ? <Pill tone="green">Extracted</Pill> : busy ? <Pill tone="orange">Processing</Pill> : <Pill tone="grey">Pending</Pill>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      {ex && <div className={CARD} data-testid="extract-summary">
        <h3 className={H3}>Completion summary</h3>
        <p className="text-[14px] text-slate-200">{ex.classified.filter((c) => c.cat).length} of {s.elems.length} elements classified and {ex.zones} thermal zones identified in {ms(ex.ms)}.</p>
        <p className="text-[13px] text-slate-400">{num(ex.solids)} solids and {num(ex.tris)} triangles were examined. {ex.unclassified.length ? `Unclassified: ${ex.unclassified.join(", ")}.` : "No element was left unclassified."}</p>
        <h3 className={`${H3} mt-3`}>Classification rules used</h3>
        <ul className="space-y-1 text-[13px] text-slate-300">{ex.rows.filter((r) => r.rule).map((r) => <li key={r.cat}><b className="text-slate-100">{r.label}:</b> {r.rule}</li>)}</ul>
        <p className="mt-2 text-[13px] text-slate-500">Rules are deterministic. The production plug-in would read Revit categories and SketchUp groups instead of the generated attributes used here.</p>
      </div>}
    </div>
  );
}

/* ---------- simplification ---------- */
const OPS = ["Solid-to-surface conversion", "Face extraction", "Surface generation", "Coplanar face merging", "Boundary detection", "Surface orientation", "Removal of unnecessary geometry", "Zero-thickness representation", "Geometry validation"];
export function Simplification({ s, a }: P) {
  const busy = s.busy?.what === "simplify" ? s.busy : null, mt = s.mt;
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className={H3}>Geometry simplification engine</h3>
        <p className="text-[14px] text-slate-300">Turns layered solids into single mid-plane surfaces with zero thickness. Openings stay as sub-surfaces of their wall, so net areas can be read directly.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={GO} onClick={a.runSimplify} disabled={!s.imported || !!s.busy} data-testid="simplify">SIMPLIFY MODEL</button>
          <button type="button" className={BTN} disabled={!s.agg} aria-pressed={s.compare} onClick={() => a.set({ compare: !s.compare, mode: "simplified" })} data-testid="compare-btn">{s.compare ? "Single view" : "Side by side"}</button>
          <button type="button" className={BTN} disabled={!s.agg} aria-pressed={s.ghost} onClick={() => a.set({ ghost: !s.ghost, mode: "simplified", compare: false })}>Original wireframe overlay</button></div>
        {!s.imported && <p className="mt-2 text-[13px] text-slate-400">Import the sample model from the Overview first.</p>}
        {busy && <div className="mt-3"><Bar pct={busy.pct} stage={busy.stage} /></div>}
      </div>
      <div className={CARD}>
        <h3 className={H3}>Operations</h3>
        <ol className="space-y-1.5" data-testid="ops">{OPS.map((name, i) => { const st = s.stages.find((x) => x.name === name); return <li key={name} className="text-[13px]" data-done={!!st}><span className={st ? "text-green-400" : "text-slate-500"}>{st ? "✓" : `${i + 1}.`} </span><b className={st ? "text-slate-100" : "text-slate-400"}>{name}</b>{st && <span className="block pl-5 text-slate-400">{st.detail}</span>}</li>; })}</ol>
      </div>
      {mt && <div className={CARD} data-testid="simp-result">
        <h3 className={H3}>Result</h3>
        <div className="grid grid-cols-2 gap-2">
          <Tile id="orig-count" label="Original geometry" value={`${num(mt.origTris)} tri`} sub={`${num(mt.origSolids)} solids · ${num(mt.origFaces)} faces`} />
          <Tile id="simp-count" label="Simplified geometry" value={`${mt.simpSurfaces} surfaces`} sub={`${mt.simpLines} lines · ${mt.simpTris} triangles`} tone="text-cyan-300" />
          <Tile id="reduction" label="Reduction" value={`${mt.reductionPct.toFixed(2)}%`} sub="fewer triangles" tone="text-green-400" />
          <Tile id="simp-time" label="Processing time" value={ms(s.simpMs)} sub="median of 5 full runs, this browser" />
        </div>
        <h3 className={`${H3} mt-3`}>Validation <Pill tone={s.checks.every((c) => c.ok) ? "green" : "red"}>{s.checks.every((c) => c.ok) ? "Passed" : "Failed"}</Pill></h3>
        <ul className="space-y-1" data-testid="checks">{s.checks.map((c) => <li key={c.name} className="text-[13px]"><span className={c.ok ? "text-green-400" : "text-red-400"}>{c.ok ? "✓" : "✗"}</span> {c.name}<span className="block pl-5 text-slate-500">{c.detail}</span></li>)}</ul>
      </div>}
    </div>
  );
}

/* ---------- thermal zones ---------- */
export function Zones({ s, a }: P) {
  const agg = s.agg, z = agg?.zones.find((x) => x.id === s.selZone);
  if (!agg) return <Need what="Thermal zone geometry is prepared by the simplification step. Run it first." onGo={a.runSimplify} label="SIMPLIFY MODEL" />;
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className={H3}>Thermal zones</h3>
        <p className="text-[14px] text-slate-300">Each room becomes a zone with its floor, ceiling, wall and partition boundaries. This prepares geometry for an analysis engine; it is not a thermal simulation.</p>
        <label className="mt-2 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={s.zonesOn} onChange={() => a.set({ zonesOn: !s.zonesOn })} data-testid="zones-toggle" /> Show zone volumes in the 3D view</label>
        <div className="mt-2 max-h-[30vh] overflow-auto"><table className="w-full text-[13px]" data-testid="zone-table"><thead><tr className="text-left text-slate-400"><th>Zone</th><th>Use</th><th className="text-right">Area</th><th className="text-right">Closed</th></tr></thead>
          <tbody>{agg.zones.map((x) => <tr key={x.id} className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800 ${s.selZone === x.id ? "bg-cyan-500/20" : ""}`} onClick={() => a.selectZone(x.id)} data-testid={`zone-${x.id}`} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && a.selectZone(x.id)}><td className="py-0.5"><i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: USE_COLOR[x.use] }} />{x.id}</td><td>{x.use}</td><td className="text-right font-mono">{area(x.area, s.areaUnit)}</td><td className="text-right">{x.closed ? <Pill tone="green">yes</Pill> : <Pill tone="red">no</Pill>}</td></tr>)}</tbody></table></div>
      </div>
      {z ? <div className={CARD} data-testid="zone-detail">
        <h3 className={H3}>{z.id} · {z.name}</h3>
        <div className="grid grid-cols-2 gap-2"><Tile label="Floor area" value={area(z.area, s.areaUnit)} /><Tile label="Volume" value={`${z.volume.toFixed(1)} m³`} sub={`clear height ${z.height} m`} /><Tile label="Window area" value={area(z.windowArea, s.areaUnit)} /><Tile label="External wall (gross)" value={area(z.externalWallGross, s.areaUnit)} /></div>
        <p className="mt-2 text-[13px] text-slate-300">Floor: <span className="font-mono text-cyan-300">{z.floor}</span> · Ceiling: <span className="font-mono text-cyan-300">{z.ceiling}</span> · Classification: {z.use}</p>
        <table className="mt-2 w-full text-[13px]"><thead><tr className="text-left text-slate-400"><th>Boundary</th><th>Type</th><th>Edge</th><th className="text-right">Gross</th><th className="text-right">Net</th></tr></thead><tbody>{z.bounds.map((b) => <tr key={b.src + b.edge} className="border-t border-slate-800"><td className="py-0.5 font-mono">{b.src}</td><td>{b.kind === "partition" ? "partition" : "ext. wall"}</td><td>{b.edge}</td><td className="text-right font-mono">{b.gross.toFixed(1)}</td><td className="text-right font-mono">{b.net.toFixed(1)}</td></tr>)}</tbody></table>
        <h3 className={`${H3} mt-3`}>Window area by orientation (m²)</h3>
        <HBars bars={(["N", "E", "S", "W"] as const).map((k) => ({ label: { N: "North", E: "East", S: "South", W: "West" }[k], value: z.windowByAzimuth[k], color: "#22d3ee" }))} unit=" m²" />
        <p className="mt-2 text-[13px] text-slate-400">Enclosure check: covered edge length W {z.coverage.W} m · E {z.coverage.E} m · N {z.coverage.N} m · S {z.coverage.S} m {z.closed ? "(closed)" : "(open)"}.</p>
      </div> : <Inspector s={s} />}
    </div>
  );
}

/* ---------- shading ---------- */
export function Shading({ s, a }: P) {
  const sh = s.elems.filter((e) => e.cat === "shading"), kinds: { k: string; label: string }[] = [{ k: "overhang", label: "Overhangs" }, { k: "tree", label: "Trees" }, { k: "neighbour", label: "Neighbouring buildings" }];
  const row = (e: Elem) => { const t = e.solids.reduce((n, x) => n + solidTris(x), 0), sf = s.agg?.surfaces.filter((x) => x.elem === e.id).length ?? 0, ln = s.agg?.lines.filter((x) => x.elem === e.id).length ?? 0; return { e, t, sf, ln }; };
  const rows = sh.map(row), tot = rows.reduce((n, r) => ({ t: n.t + r.t, sf: n.sf + r.sf, ln: n.ln + r.ln }), { t: 0, sf: 0, ln: 0 });
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className={H3}>Shading geometry</h3>
        <p className="text-[14px] text-slate-300">Surrounding objects keep their position and the orientation that matters for shading, but lose their detail: trees become a facing canopy plane plus a trunk line, neighbours keep the facade toward the building and the roof, overhangs become a plane. No irradiance or daylight is calculated here.</p>
        <div className="mt-2 flex flex-wrap gap-2">{kinds.map((k) => { const ids = sh.filter((e) => e.sub === k.k).map((e) => e.id), hiddenAll = ids.every((i) => s.hidden.includes(i)); return <button key={k.k} type="button" className={BTN} aria-pressed={!hiddenAll} data-testid={`shade-${k.k}`} onClick={() => a.set({ hidden: hiddenAll ? s.hidden.filter((h) => !ids.includes(h)) : [...new Set([...s.hidden, ...ids])] })}>{hiddenAll ? "Show" : "Hide"} {k.label.toLowerCase()}</button>; })}</div>
      </div>
      <div className={CARD}>
        <table className="w-full text-[13px]" data-testid="shade-table"><thead><tr className="text-left text-slate-400"><th>Object</th><th className="text-right">Original tri</th><th className="text-right">Analytical</th></tr></thead>
          <tbody>{rows.map(({ e, t, sf, ln }) => <tr key={e.id} className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800 ${s.selId === e.id ? "bg-cyan-500/20" : ""}`} onClick={() => a.select(e.id)} data-testid={`shade-row-${e.id}`}><td className="py-0.5"><i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: CAT_COLOR.shading }} />{e.name}</td><td className="text-right font-mono">{num(t)}</td><td className="text-right font-mono">{s.agg ? `${sf} surf${ln ? ` + ${ln} line` : ""}` : "—"}</td></tr>)}
            <tr className="border-t border-slate-600 font-semibold"><td className="py-1">Total ({sh.length} objects)</td><td className="text-right font-mono">{num(tot.t)}</td><td className="text-right font-mono">{s.agg ? `${tot.sf} surf + ${tot.ln} lines` : "—"}</td></tr></tbody></table>
        {!s.agg && <button type="button" className={`${GO} mt-3`} onClick={a.runSimplify}>SIMPLIFY MODEL</button>}
      </div>
      <Inspector s={s} />
    </div>
  );
}

/* ---------- incremental ---------- */
export function Incremental({ s, a }: P) {
  const [pick, setPick] = useState("WIN-L2-S03"), [op, setOp] = useState("widen");
  const opts = useMemo(() => modOptions(s.model, pick), [s.model, pick]), run = s.runs[s.runs.length - 1], cnt = (c: string) => s.pending.filter((p) => p.reason === c).length;
  const groups = useMemo(() => [["window", "Windows"], ["door", "Doors"], ["wall", "External walls"], ["partition", "Internal partitions"], ["roof", "Roof"], ["shading", "Shading objects"]] as [Cat, string][], []);
  if (!s.agg) return <Need what="Incremental updates need a processed model with a cache. Run the simplification first." onGo={a.runSimplify} label="SIMPLIFY MODEL" />;
  const useOp = opts.some((o) => o.op === op) ? op : opts[0]?.op ?? "";
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className={H3}>Simulate an architect&apos;s edit</h3>
        <label className="text-[13px] text-slate-400" htmlFor="mod-el">Element</label>
        <select id="mod-el" className={FIELD} value={pick} onChange={(e) => { setPick(e.target.value); setOp(modOptions(s.model, e.target.value)[0]?.op ?? ""); }} data-testid="mod-element">{groups.map(([c, l]) => <optgroup key={c} label={l}>{s.elems.filter((e) => e.cat === c).map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}</optgroup>)}</select>
        <label className="mt-2 block text-[13px] text-slate-400" htmlFor="mod-op">Change</label>
        <select id="mod-op" className={FIELD} value={useOp} onChange={(e) => setOp(e.target.value)} data-testid="mod-op">{opts.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={GO} disabled={!useOp || !!s.busy || s.pending.length > 0} onClick={() => a.modify(pick, useOp)} data-testid="modify">MODIFY MODEL ELEMENT</button>
          <button type="button" className={BTN} disabled={!s.selId || !s.agg || modOptions(s.model, s.selId ?? "").length === 0} onClick={() => { if (s.selId) { setPick(s.selId); setOp(modOptions(s.model, s.selId)[0]?.op ?? ""); } }}>Use selected element</button>
          <button type="button" className={BTN} onClick={a.resetModel} disabled={!!s.busy} data-testid="reset-model">Reset model</button></div>
        {s.pending.length > 0 && <p className="mt-2 text-[13px] text-orange-300">Finish this edit by updating the analytical model below before making another one.</p>}
      </div>
      {s.pending.length > 0 && <div className={CARD} data-testid="pending">
        <h3 className={H3}>Change detected: {s.lastMod?.id}</h3>
        <p className="text-[14px] text-slate-300">{s.pending.length} of {s.units.length} cached results are outdated; the other {s.units.length - s.pending.length} are untouched.</p>
        <ul className="mt-1 space-y-0.5 text-[13px]">{s.pending.map((p) => <li key={p.id} data-testid="pending-item"><Pill tone="orange">{p.reason === "modified" ? "modified" : "depends on change"}</Pill> <span className="font-mono">{p.id}</span> <span className="text-slate-500">{p.cat}</span></li>)}</ul>
        <p className="mt-1 text-[13px] text-slate-500">{cnt("modified")} edited · {cnt("dependent")} affected through host, boundary or ceiling relationships.</p>
        {s.busy?.what === "incremental" && <div className="mt-2"><Bar pct={s.busy.pct} stage={s.busy.stage} /></div>}
        <button type="button" className={`${GO} mt-3`} onClick={a.updateIncremental} disabled={!!s.busy} data-testid="update-incremental">Update analytical model (incremental)</button>
      </div>}
      {run && s.pending.length === 0 && <div className={CARD} data-testid="incr-summary">
        <h3 className={H3}>Processing summary · {run.label}</h3>
        <div className="grid grid-cols-2 gap-2">
          <Tile id="inc-total" label="Total model elements" value={String(run.total)} />
          <Tile id="inc-cached" label="Cached elements" value={String(run.total)} sub="before the edit" />
          <Tile id="inc-mod" label="Modified elements" value={String(run.recomputed.filter((r) => r.reason === "modified").length)} tone="text-orange-300" />
          <Tile id="inc-re" label="Reprocessed elements" value={String(run.recomputed.length)} tone="text-orange-300" sub={run.recomputed.map((r) => r.id).join(", ")} />
          <Tile id="inc-unch" label="Unchanged elements" value={String(run.hits)} tone="text-green-400" />
          <Tile id="inc-ratio" label="Cache hit ratio" value={`${((run.hits / run.total) * 100).toFixed(1)}%`} tone="text-green-400" />
          <Tile id="inc-time" label="Incremental update" value={ms(run.incMs)} sub={`${num(run.faces)} faces processed`} />
          <Tile id="inc-saved" label="Time saved" value={ms(Math.max(0, run.fullMs - run.incMs))} sub={`vs ${ms(run.fullMs)} full rebuild (${num(run.fullFaces)} faces)`} tone="text-cyan-300" />
        </div>
        <p className="mt-2 text-[13px] text-slate-400">The updated analytical model equals what a full rebuild produces (checked in the automated tests); only the affected geometry was regenerated.</p>
      </div>}
      {s.runs.length > 1 && <div className={CARD}><h3 className={H3}>History</h3><CacheBars runs={s.runs.map((r) => ({ label: r.label, hits: r.hits, re: r.recomputed.length }))} /></div>}
    </div>
  );
}

/* ---------- performance ---------- */
export function Performance({ s }: P) {
  const mt = s.mt, last = s.runs[s.runs.length - 1];
  const per = useMemo(() => CATS.map((c) => ({ c, a: s.elems.filter((e) => e.cat === c).reduce((n, e) => n + e.solids.reduce((m, x) => m + solidTris(x), 0), 0), b: (s.agg?.surfaces ?? []).filter((x) => x.cat === c).reduce((n, x) => n + x.verts.length - 2, 0) })), [s.elems, s.agg]);
  const short: Record<Cat, string> = { wall: "Walls", window: "Windows", door: "Doors", floor: "Floors", roof: "Roof", partition: "Partn.", shading: "Shading" };
  if (!mt) return <Need what="Performance figures come from the processing runs. Run the simplification first." onGo={() => s.imported ? undefined : undefined} label="Use the SIMPLIFY MODEL button on the Geometry Simplification page" />;
  return (
    <div className="space-y-3">
      <p role="note" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[13px] text-amber-200" data-testid="bench-note">Simulated benchmark: every value is measured live in this browser on the sample model, so it changes with your device. It is not the performance of a Revit or SketchUp plug-in.</p>
      <div className="grid grid-cols-2 gap-2" data-testid="perf-tiles">
        <Tile id="p-orig" label="Original geometry" value={`${num(mt.origTris)} tri`} sub={`${num(mt.origSolids)} solids`} />
        <Tile id="p-simp" label="Simplified geometry" value={`${mt.simpSurfaces} + ${mt.simpLines}`} sub="surfaces + lines" tone="text-cyan-300" />
        <Tile id="p-red" label="Geometry reduction" value={`${mt.reductionPct.toFixed(2)}%`} tone="text-green-400" />
        <Tile id="p-cache" label="Cached geometry" value={last ? `${((last.hits / last.total) * 100).toFixed(1)}%` : "100%"} sub={last ? "after the last edit" : "all entries cached"} tone="text-green-400" />
        <Tile id="p-origms" label="Original model pass" value={ms(s.origMs)} sub="every triangle visited" />
        <Tile id="p-simpms" label="Simplification" value={ms(s.simpMs)} sub="full run, 5-run median" />
        <Tile id="p-incms" label="Incremental update" value={last ? ms(last.incMs) : "—"} sub={last ? `${last.recomputed.length} of ${last.total} elements` : "make an edit first"} />
        <Tile id="p-saved" label="Time saved" value={last ? ms(Math.max(0, last.fullMs - last.incMs)) : "—"} sub="incremental vs full" tone="text-cyan-300" />
      </div>
      <div className={CARD}><h3 className={H3}>Before and after: triangles by category</h3><PairedBars testid="chart-reduction" aLabel="Original" bLabel="Analytical" groups={per.map((p) => ({ label: short[p.c], a: p.a, b: p.b }))} /></div>
      <div className={CARD}><h3 className={H3}>Processing time</h3><HBars testid="chart-time" unit=" ms" bars={[{ label: "Original model pass", value: s.origMs ?? 0, color: "#64748b" }, { label: "Full simplification", value: s.simpMs ?? 0, color: "#22d3ee" }, ...(last ? [{ label: "Incremental update", value: last.incMs, color: "#22c55e" }] : [])]} /></div>
      <div className={CARD}><h3 className={H3}>Geometry reduction</h3><HBars testid="chart-geom" log bars={[{ label: "Original triangles", value: mt.origTris, color: "#64748b" }, { label: "Original solids", value: mt.origSolids, color: "#94a3b8" }, { label: "Analytical triangles", value: mt.simpTris, color: "#22d3ee" }, { label: "Analytical surfaces", value: mt.simpSurfaces, color: "#22c55e" }]} /></div>
      <div className={CARD}><h3 className={H3}>Cache performance</h3><CacheBars testid="chart-cache" runs={s.runs.map((r) => ({ label: r.label, hits: r.hits, re: r.recomputed.length }))} /></div>
    </div>
  );
}

/* ---------- export ---------- */
const FORMATS: [string, string, string][] = [["Custom JSON geometry schema", "Simplest to agree and version with the analysis-engine owner; used for the file below.", "Implemented in this demo"], ["gbXML", "Common energy-model exchange format: surface types (ExteriorWall, InteriorWall, Roof, Window, Door, Shade) map directly to the categories here.", "To investigate"], ["IFC-derived analytical geometry", "IFC4 has analytical surface and space-boundary entities (IfcRelSpaceBoundary); depends on what the source model exports.", "To investigate"]];
export function ExportPanel({ s, a }: P) {
  const [sel, setSel] = useState<ExportSel>({ surfaces: true, zones: true, classification: true, shading: true, ids: true, metadata: true });
  const json = useMemo(() => (s.agg && s.mt ? JSON.stringify(buildExport(s.model, s.agg, s.mt, sel), null, 2) : ""), [s.agg, s.mt, s.model, sel]);
  if (!s.agg) return <Need what="The analytical geometry exists after simplification." onGo={a.runSimplify} label="SIMPLIFY MODEL" />;
  const download = () => { const url = URL.createObjectURL(new Blob([json], { type: "application/json" })), l = document.createElement("a"); l.href = url; l.download = "analytical-geometry.json"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); a.toast("analytical-geometry.json downloaded."); };
  const labels: [keyof ExportSel, string][] = [["surfaces", "Analytical geometry"], ["zones", "Thermal zone information"], ["classification", "Surface classifications"], ["shading", "Shading geometry"], ["ids", "Element identifiers"], ["metadata", "Geometry metadata"]];
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className={H3}>Export</h3>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{labels.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={sel[k]} onChange={() => setSel({ ...sel, [k]: !sel[k] })} data-testid={`exp-${k}`} />{l}</label>)}</div>
        <div className="mt-3 flex gap-2"><button type="button" className={GO} onClick={download} data-testid="download-json">Download JSON</button><button type="button" className={BTN} onClick={() => navigator.clipboard?.writeText(json).then(() => a.toast("JSON copied."), () => a.toast("Copy is not available in this browser."))}>Copy</button></div>
        <p className="mt-2 text-[13px] text-slate-400" data-testid="json-size">{json.length.toLocaleString()} characters · {s.agg.surfaces.length} surfaces · {s.agg.zones.length} zones</p>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-950 p-2 font-mono text-[13px] text-slate-300" data-testid="json-preview">{json.slice(0, 3500)}{json.length > 3500 ? "\n…" : ""}</pre>
      </div>
      <div className={CARD}>
        <h3 className={H3}>Handing over to the analysis engine (illustrative)</h3>
        <pre className="overflow-auto rounded bg-slate-950 p-2 font-mono text-[13px] text-slate-300">{`// Hypothetical hand-over. The real call depends on the engine's API,
// which we have not seen.
const geometry = await fetch("analytical-geometry.json").then(r => r.json());
engine.loadGeometry(geometry.surfaces, geometry.thermalZones);
engine.setShading(geometry.shadingGeometry);
// next edit in Revit/SketchUp -> send only the changed surfaces:
engine.updateSurfaces(changedIds, newGeometry);`}</pre>
      </div>
      <div className={CARD}><h3 className={H3}>Production formats to investigate</h3><ul className="space-y-2 text-[13px]">{FORMATS.map(([n, d, st]) => <li key={n}><b className="text-slate-100">{n}</b> <Pill tone={st.startsWith("Impl") ? "green" : "grey"}>{st}</Pill><span className="block text-slate-400">{d}</span></li>)}</ul><p className="mt-2 text-[13px] text-slate-500">We have not assumed that any of these is supported by the existing engine.</p></div>
    </div>
  );
}

/* ---------- settings ---------- */
export function SettingsPanel({ s, a, onReset }: P & { onReset: () => void }) {
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className={H3}>Display</h3>
        <label className="block text-[14px]">Area unit
          <select className={`${FIELD} mt-1`} value={s.areaUnit} onChange={(e) => a.set({ areaUnit: e.target.value as "m2" | "ft2" })} data-testid="area-unit"><option value="m2">Square metres (m²)</option><option value="ft2">Square feet (ft²)</option></select></label>
        <label className="mt-3 block text-[14px]">Analytical surface opacity: {Math.round(s.opacity * 100)}%
          <input type="range" min={0.15} max={0.9} step={0.05} value={s.opacity} onChange={(e) => a.set({ opacity: Number(e.target.value) })} className="mt-1 w-full" data-testid="opacity" /></label>
        <label className="mt-3 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={s.labels} onChange={() => a.set({ labels: !s.labels })} data-testid="labels-toggle" /> Show identifiers on analytical surfaces</label>
        <label className="mt-2 flex items-center gap-2 text-[14px]"><input type="checkbox" checked={s.ghost} onChange={() => a.set({ ghost: !s.ghost })} /> Draw the original as a wireframe under the analytical model</label>
      </div>
      <div className={CARD}>
        <h3 className={H3}>Project</h3>
        <div className="flex flex-wrap gap-2"><button type="button" className={BTN} onClick={a.save} data-testid="save-btn">Save project</button><button type="button" className={BTN} onClick={a.load}>Load saved project</button><button type="button" className={BTN} onClick={onReset} data-testid="reset-demo">Reset the whole demo</button></div>
        <p className="mt-2 text-[13px] text-slate-400">Saving stores the model parameters in this browser only. There is no account, server or upload.</p>
      </div>
      <div className={CARD}><h3 className={H3}>Scope</h3><p className="text-[13px] text-slate-300">Simulated: the CAD import (a generated sample building), the benchmark context. Real in this demo: classification, face extraction, coplanar merging, orientation maths, zone enclosure checks, caching with dependency tracking, and the JSON export. Production work: Revit and SketchUp connectors, validation against your own models, and the interface to the analysis engine.</p></div>
    </div>
  );
}
