"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import { CAT_LABEL, CATS, type Cat } from "@/lib/geomsimp/types";
import type { Branding } from "@/lib/types";
import { BTN, Explorer, Extraction, ExportPanel, GO, Incremental, Inspector, Overview, Performance, SettingsPanel, Shading, Simplification, Zones } from "./panels";
import { initialState, makeActions, sleep, type Section, type State } from "./store";
import { CAT_COLOR, GeomViewport, USE_COLOR, type Mode } from "./viewport";

const NAV: { id: Section; label: string; glyph: string }[] = [
  { id: "overview", label: "Overview", glyph: "◎" }, { id: "explorer", label: "Model Explorer", glyph: "☰" }, { id: "extraction", label: "Geometry Extraction", glyph: "⇩" }, { id: "simplification", label: "Geometry Simplification", glyph: "◇" },
  { id: "zones", label: "Thermal Zones", glyph: "▦" }, { id: "shading", label: "Shading Geometry", glyph: "☀" }, { id: "incremental", label: "Incremental Updates", glyph: "↻" }, { id: "performance", label: "Performance Analytics", glyph: "▥" },
  { id: "export", label: "Export & Integration", glyph: "⇧" }, { id: "settings", label: "Settings", glyph: "⚙" },
];
const MODES: { id: Mode; label: string; needs?: "extract" | "agg" }[] = [{ id: "original", label: "1 Original" }, { id: "extracted", label: "2 Extracted" }, { id: "simplified", label: "3 Simplified", needs: "agg" }, { id: "analysis", label: "4 Analysis-ready", needs: "agg" }];
const CHIP = "rounded border px-2 py-1 text-[13px] font-medium transition-colors";

export default function GeomApp({ branding }: { branding: Branding }) {
  const [s, setS] = useState<State>(initialState), ref = useRef(s); ref.current = s;
  const set = useCallback((p: Partial<State>) => { ref.current = { ...ref.current, ...p }; setS(ref.current); }, []);
  const a = useMemo(() => makeActions(() => ref.current, set), [set]);
  const host = useRef<HTMLDivElement>(null), vp = useRef<GeomViewport | null>(null), stop = useRef(false);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null), [menu, setMenu] = useState(false);

  const pick = useCallback((id: string | null) => {
    if (!id) return a.select(null);
    const surf = ref.current.agg?.surfaces.find((x) => x.id === id); a.select(surf ? surf.elem : id);
  }, [a]);
  useEffect(() => {
    if (!host.current) return;
    const v = new GeomViewport(host.current, { onPick: pick, onHover: (id, x, y) => setTip(id ? { id, x, y } : null) }); vp.current = v;
    (window as unknown as { __geom?: unknown }).__geom = { screenOf: (id: string) => v.screenOf(id), state: () => ref.current };
    return () => { v.destroy(); vp.current = null; };
  }, [pick]);

  const zone = s.agg?.zones.find((z) => z.id === s.selZone);
  const selIds = useMemo(() => zone ? [...zone.bounds.map((b) => b.src), ...zone.bounds.flatMap((b) => b.openings.map((o) => o.id)), zone.floor, zone.ceiling] : s.selId ? [s.selId] : [], [zone, s.selId]);
  useEffect(() => {
    vp.current?.update({ elems: s.imported ? s.elems : [], agg: s.imported ? s.agg : null, mode: s.mode, compare: s.compare && !!s.agg, cats: s.cats, levels: s.levels, hidden: s.hidden, ghost: s.ghost, labels: s.labels, zonesOn: s.zonesOn && s.imported, zones: s.model.zones, extracted: !!s.extract, selIds, selZone: s.selZone, opacity: s.opacity });
  }, [s.imported, s.elems, s.agg, s.mode, s.compare, s.cats, s.levels, s.hidden, s.ghost, s.labels, s.zonesOn, s.model.zones, s.extract, selIds, s.selZone, s.opacity]);

  const status = s.busy ? "Processing…" : s.pending.length ? `${s.pending.length} cached results outdated` : s.agg ? "Analytical model ready" : s.extract ? "Geometry extracted" : s.imported ? "Ready for Analysis" : "Sample not imported";

  const reset = () => { stop.current = true; const f = initialState(); ref.current = f; setS(f); };
  const runGuide = async () => {
    stop.current = false; const go = async (n: number, fn: () => unknown, wait = 1500) => { if (stop.current) throw new Error("stopped"); set({ guide: { running: true, step: n } }); await fn(); await sleep(wait); };
    try {
      if (ref.current.agg) reset();
      await go(1, () => { set({ section: "overview", mode: "original" }); a.importSample(); });
      await go(2, () => { vp.current?.view("iso"); set({ mode: "original", compare: false }); }, 2200);
      await go(3, async () => { set({ section: "extraction" }); await a.runExtract(); });
      await go(4, () => set({ mode: "extracted" }), 2000);
      await go(5, async () => { set({ section: "simplification" }); await a.runSimplify(); }, 1800);
      await go(6, () => set({ compare: true, mode: "simplified" }), 2600);
      await go(7, () => { set({ compare: false, section: "zones" }); a.selectZone("Z-L2-A"); }, 2200);
      await go(7, () => { a.select("TREE-2"); set({ section: "shading", selZone: null }); }, 1800);
      await go(8, () => { set({ section: "incremental" }); a.modify("WIN-L2-S03", "widen"); }, 2200);
      await go(9, async () => { await a.updateIncremental(); }, 2200);
      await go(10, () => { set({ section: "export", mode: "analysis", labels: true, selId: null }); }, 1500);
      a.toast("Guided demo finished. Every step ran on the real sample geometry.");
    } catch { /* stopped */ } finally { set({ guide: { running: false, step: 0 } }); }
  };
  const stopGuide = () => { stop.current = true; };

  const panel = (() => {
    const p = { s, a };
    switch (s.section) {
      case "overview": return <Overview {...p} onGuide={runGuide} onStopGuide={stopGuide} />;
      case "explorer": return <Explorer {...p} />;
      case "extraction": return <Extraction {...p} />;
      case "simplification": return <Simplification {...p} />;
      case "zones": return <Zones {...p} />;
      case "shading": return <Shading {...p} />;
      case "incremental": return <Incremental {...p} />;
      case "performance": return <Performance {...p} />;
      case "export": return <ExportPanel {...p} />;
      default: return <SettingsPanel {...p} onReset={reset} />;
    }
  })();
  const hoverElem = tip ? (s.agg?.surfaces.find((x) => x.id === tip.id)?.elem ?? tip.id) : null, hoverName = hoverElem ? s.elems.find((e) => e.id === hoverElem)?.name ?? tip?.id : null;
  const needsImport = !s.imported, needsAgg = s.imported && (s.mode === "simplified" || s.mode === "analysis") && !s.agg;

  return (
    <DemoShell branding={branding} app="Architectural Geometry Intelligence – Real-Time Building Physics Preprocessing" project="Commercial Building – Sample Model" status={status}
      back={{ href: "/portfolio/cad-bim#full-stack-suite", label: "CAD/BIM portfolio", all: "← Demos 11–22" }} contact="/contact?division=cad-bim" badge="Proof of concept · simulated CAD import"
      footer="Technical proof-of-concept. The building is generated in the browser; it is not read from Revit or SketchUp and no plug-in is connected. Classification, simplification, zone checks, caching and export run on that sample geometry. Timings are measured in your browser, not on a production plug-in. No thermal, solar or daylight simulation is performed."
      actions={<><button type="button" className={BTN} onClick={a.save} data-testid="top-save">Save project</button><button type="button" className={BTN} onClick={() => set({ section: "settings" })} data-testid="top-settings">Settings</button>
        <span className="relative"><button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 text-[13px] font-semibold text-white" aria-label="User profile" aria-expanded={menu} onClick={() => setMenu(!menu)}>NF</button>{menu && <span className="absolute right-0 top-10 z-30 w-52 rounded-md border border-slate-700 bg-slate-900 p-3 text-[13px] text-slate-300 shadow-xl">Demo user<br /><span className="text-slate-500">No account, nothing is uploaded.</span></span>}</span></>}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-slate-800 bg-slate-900/60 px-4 py-1.5 text-[13px] uppercase tracking-wide text-slate-400" data-testid="topline">
        <span>Project: <b className="text-slate-200">Commercial Building – Sample Model</b></span><span>Source: <b className="text-slate-200">Revit / SketchUp Demo Import</b> <i className="not-italic text-amber-300">(simulated)</i></span><span>Status: <b className="text-cyan-300" data-testid="status">{status}</b></span>
      </div>
      <div className="grid gap-0 lg:h-[calc(100vh-176px)] lg:min-h-[680px] lg:grid-cols-[210px_minmax(0,1fr)_400px]" data-testid="geom-app">
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900 p-2 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {NAV.map((n) => <button key={n.id} type="button" onClick={() => set({ section: n.id })} aria-current={s.section === n.id ? "page" : undefined} data-testid={`nav-${n.id}`} className={`flex shrink-0 items-center gap-2 rounded px-2.5 py-2 text-left text-[14px] ${s.section === n.id ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:bg-slate-800"}`}><span aria-hidden className="w-4 text-center text-slate-400">{n.glyph}</span>{n.label}</button>)}
        </nav>
        <section aria-label="3D viewport" className="relative min-h-[60vh] bg-[#0b1220] lg:min-h-0" data-testid="viewport">
          <div ref={host} className="absolute inset-0" />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1" role="tablist" aria-label="Visualization mode">
            {MODES.map((m) => { const off = (m.needs === "agg" && !s.agg) || needsImport; return <button key={m.id} role="tab" type="button" aria-selected={s.mode === m.id} disabled={off} title={off ? "Import the sample and run SIMPLIFY MODEL first" : undefined} data-testid={`mode-${m.id}`} onClick={() => set({ mode: m.id })} className={`${CHIP} ${s.mode === m.id ? "border-cyan-400 bg-cyan-500/25 text-cyan-100" : "border-slate-600 bg-slate-900/80 text-slate-200 hover:border-cyan-500"} disabled:opacity-40`}>{m.label}</button>; })}
          </div>
          <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
            <button type="button" disabled={!s.agg} aria-pressed={s.compare} onClick={() => set({ compare: !s.compare, mode: "simplified" })} data-testid="compare-toggle" className={`${CHIP} ${s.compare ? "border-cyan-400 bg-cyan-500/25 text-cyan-100" : "border-slate-600 bg-slate-900/80 text-slate-200"} disabled:opacity-40`}>Side by side</button>
            {(["iso", "top", "front", "side"] as const).map((v) => <button key={v} type="button" onClick={() => vp.current?.view(v)} className={`${CHIP} border-slate-600 bg-slate-900/80 text-slate-200 hover:border-cyan-500`} aria-label={`${v} view`}>{v === "iso" ? "Iso" : v[0].toUpperCase() + v.slice(1)}</button>)}
            <button type="button" aria-label="Zoom in" onClick={() => vp.current?.zoom(0.8)} className={`${CHIP} border-slate-600 bg-slate-900/80 text-slate-200`}>＋</button><button type="button" aria-label="Zoom out" onClick={() => vp.current?.zoom(1.25)} className={`${CHIP} border-slate-600 bg-slate-900/80 text-slate-200`}>－</button>
          </div>
          {s.compare && s.agg && <><span className="pointer-events-none absolute bottom-14 left-3 rounded bg-slate-900/80 px-2 py-0.5 text-[13px] text-slate-200">Original · {s.mt?.origTris.toLocaleString()} triangles</span><span className="pointer-events-none absolute bottom-14 right-3 rounded bg-slate-900/80 px-2 py-0.5 text-[13px] text-cyan-200">Analytical · {s.mt?.simpSurfaces} surfaces, zero thickness</span></>}
          <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1" data-testid="viewport-toggles">
            {CATS.map((c: Cat) => <button key={c} type="button" aria-pressed={s.cats[c]} onClick={() => a.toggleCat(c)} data-testid={`cat-${c}`} className={`${CHIP} ${s.cats[c] ? "border-slate-500 bg-slate-900/85 text-slate-100" : "border-slate-700 bg-slate-950/70 text-slate-500 line-through"}`}><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: CAT_COLOR[c] }} />{CAT_LABEL[c]}</button>)}
            <span className="mx-1 h-4 w-px bg-slate-600" />
            {["L1", "L2", "L3", "Roof"].map((l, i) => <button key={l} type="button" aria-pressed={s.levels[i]} onClick={() => a.toggleLevel(i)} data-testid={`level-${i}`} className={`${CHIP} ${s.levels[i] ? "border-slate-500 bg-slate-900/85 text-slate-100" : "border-slate-700 bg-slate-950/70 text-slate-500 line-through"}`}>{l}</button>)}
            <button type="button" aria-pressed={s.zonesOn} onClick={() => set({ zonesOn: !s.zonesOn })} className={`${CHIP} ${s.zonesOn ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-slate-600 bg-slate-900/80 text-slate-200"}`}>Zones</button>
            <button type="button" aria-pressed={s.labels} onClick={() => set({ labels: !s.labels })} className={`${CHIP} ${s.labels ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-slate-600 bg-slate-900/80 text-slate-200"}`}>Labels</button>
          </div>
          {needsImport && <div className="absolute inset-0 flex items-center justify-center"><div className="max-w-sm rounded-lg border border-slate-700 bg-slate-900/95 p-5 text-center"><p className="text-[15px] text-slate-200">Step 1 · import the sample architectural model.</p><p className="mt-1 text-[13px] text-slate-400">A three-storey commercial building is generated in your browser.</p><button type="button" className={`${GO} mt-3`} onClick={a.importSample} data-testid="import-overlay">Import sample model</button></div></div>}
          {needsAgg && <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-lg border border-slate-700 bg-slate-900/95 p-5 text-center"><p className="text-[15px] text-slate-200">The analytical model does not exist yet.</p><button type="button" className={`${GO} mt-3`} onClick={a.runSimplify}>SIMPLIFY MODEL</button></div></div>}
          {s.busy && <div className="pointer-events-none absolute left-1/2 top-14 w-72 -translate-x-1/2 rounded border border-slate-700 bg-slate-900/95 p-2 text-[13px] text-cyan-200" data-testid="busy">{s.busy.stage}… {s.busy.pct}%</div>}
          {s.guide.running && <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-cyan-500/50 bg-slate-900/95 px-3 py-1 text-[13px] text-cyan-200" data-testid="guide-badge">Guided demo · step {s.guide.step} of 10</div>}
          {s.mode === "extracted" && s.imported && <div className="pointer-events-none absolute right-2 top-14 hidden rounded bg-slate-900/85 p-2 text-[13px] text-slate-300 sm:block">{s.extract ? "Extracted elements coloured by class" : "Not extracted yet: run EXTRACT GEOMETRY"}</div>}
          {s.zonesOn && <div className="pointer-events-none absolute right-2 top-24 hidden rounded bg-slate-900/85 p-2 text-[13px] text-slate-300 sm:block">{Object.entries(USE_COLOR).map(([u, c]) => <p key={u}><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{u}</p>)}</div>}
          {tip && hoverName && <div className="pointer-events-none fixed z-40 rounded bg-slate-950/95 px-2 py-1 text-[13px] text-slate-100 shadow" style={{ left: tip.x + 12, top: tip.y + 12 }} data-testid="tooltip">{hoverName}</div>}
          {s.toast && <div role="status" className="pointer-events-none absolute bottom-14 left-1/2 z-20 w-[min(92%,560px)] -translate-x-1/2 rounded-md border border-cyan-500/40 bg-slate-950/95 px-3 py-2 text-[13px] text-slate-100" data-testid="toast">{s.toast}</div>}
        </section>
        <aside aria-label="Panel" className="max-h-[80vh] overflow-y-auto border-t border-slate-800 bg-slate-950 p-3 lg:max-h-none lg:border-l lg:border-t-0" data-testid="panel">{panel}{!["explorer", "zones", "shading"].includes(s.section) && (s.selId || s.selZone) && <div className="mt-3"><Inspector s={s} /></div>}</aside>
      </div>
    </DemoShell>
  );
}
