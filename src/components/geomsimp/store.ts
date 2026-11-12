import { aggregate, extract, classify, countSolids, countTris, metrics, originalPass, outdated, planUnits, runUnits, validate, type Aggregate, type Cache, type Check, type ExtractSummary, type Metrics, type Recompute, type RunStats, type Unit } from "@/lib/geomsimp/engine";
import { applyMod, buildElems, buildModel, modOptions } from "@/lib/geomsimp/model";
import type { Cat, Elem, Model } from "@/lib/geomsimp/types";
import type { Mode } from "./viewport";

export type Section = "overview" | "explorer" | "extraction" | "simplification" | "zones" | "shading" | "incremental" | "performance" | "export" | "settings";
export interface IncrRun { n: number; label: string; modId: string; recomputed: Recompute[]; hits: number; total: number; incMs: number; fullMs: number; faces: number; fullFaces: number }
export interface SimpStage { name: string; detail: string }
export interface Pending { id: string; reason: "new" | "modified" | "dependent"; cat: Cat | "zone" }

export interface State {
  base: Model; model: Model; elems: Elem[]; imported: boolean;
  extract: ExtractSummary | null; busy: { what: "extract" | "simplify" | "incremental"; stage: string; pct: number } | null;
  units: Unit[]; cache: Cache; agg: Aggregate | null; mt: Metrics | null; checks: Check[]; fullRun: RunStats | null; stages: SimpStage[];
  origMs: number | null; simpMs: number | null;
  pending: Pending[]; lastMod: { id: string; label: string } | null; runs: IncrRun[];
  mode: Mode; compare: boolean; cats: Record<Cat, boolean>; levels: boolean[]; hidden: string[]; ghost: boolean; labels: boolean; zonesOn: boolean; opacity: number; areaUnit: "m2" | "ft2";
  selId: string | null; selZone: string | null; section: Section; toast: string | null; guide: { running: boolean; step: number };
}

const allCats = (): Record<Cat, boolean> => ({ wall: true, window: true, door: true, floor: true, roof: true, partition: true, shading: true });
export function initialState(): State {
  const base = buildModel(), elems = buildElems(base);
  return { base, model: base, elems, imported: false, extract: null, busy: null, units: planUnits(base, elems), cache: new Map(), agg: null, mt: null, checks: [], fullRun: null, stages: [], origMs: null, simpMs: null, pending: [], lastMod: null, runs: [],
    mode: "original", compare: false, cats: allCats(), levels: [true, true, true, true], hidden: [], ghost: false, labels: false, zonesOn: false, opacity: 0.5, areaUnit: "m2", selId: null, selZone: null, section: "overview", toast: null, guide: { running: false, step: 0 } };
}

const tick = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const measure = (fn: () => number, n = 5) => median(Array.from({ length: n }, fn));
export const SAVE_KEY = "neoforge.geomsimp.v1";

export function makeActions(get: () => State, set: (p: Partial<State>) => void) {
  const toast = (m: string) => { set({ toast: m }); setTimeout(() => { if (get().toast === m) set({ toast: null }); }, 4500); };
  const a = {
    set,
    toast,
    importSample() {
      const s = get(); if (s.imported) return;
      set({ imported: true, mode: "original", origMs: measure(() => originalPass(s.elems).ms) });
      toast(`Sample model loaded: ${s.elems.length} elements, ${countSolids(s.elems).toLocaleString()} solids, ${countTris(s.elems).toLocaleString()} triangles. This is a generated sample, not a Revit or SketchUp file.`);
    },
    async runExtract() {
      const s = get(); if (!s.imported || s.busy) return;
      set({ busy: { what: "extract", stage: "Reading the model database", pct: 5 }, extract: null, mode: "extracted" });
      await tick(); const total = s.elems.length;
      for (let i = 0; i < total; i += 12) { s.elems.slice(i, i + 12).forEach(classify); set({ busy: { what: "extract", stage: "Classifying elements by category and geometry rules", pct: 10 + Math.round((i / total) * 75) } }); await tick(); }
      set({ busy: { what: "extract", stage: "Selecting analysis-relevant elements", pct: 92 } }); await tick();
      const ex = extract(s.model, s.elems);
      set({ extract: ex, busy: null }); toast(`Extraction finished in ${ex.ms.toFixed(1)} ms: ${ex.classified.filter((c) => c.cat).length} of ${s.elems.length} elements classified, ${ex.zones} thermal zones identified.`);
    },
    async runSimplify() {
      const s = get(); if (!s.imported || s.busy) return;
      set({ busy: { what: "simplify", stage: "Converting solids to surfaces", pct: 3 } }); await tick();
      const units = planUnits(s.model, s.elems), cache: Cache = new Map(), stats: RunStats = { mode: "full", total: units.length, hits: 0, recomputed: [], dropped: [], ms: 0, faces: 0 };
      const stages = ["Converting solids to surfaces", "Extracting faces", "Merging coplanar faces", "Detecting boundaries and orientations", "Removing unnecessary geometry", "Writing zero-thickness surfaces", "Preparing thermal zones"];
      for (let i = 0; i < units.length; i += 15) {
        const r = runUnits(units.slice(i, i + 15), cache, "full", false); stats.recomputed.push(...r.recomputed); stats.ms += r.ms; stats.faces += r.faces;
        set({ busy: { what: "simplify", stage: stages[Math.min(stages.length - 1, Math.floor((i / units.length) * stages.length))], pct: 5 + Math.round((i / units.length) * 88) } }); await tick();
      }
      const agg = aggregate(units, cache), mt = metrics(s.elems, agg), checks = validate(s.model, agg), ok = checks.filter((c) => c.ok).length;
      const simpMs = measure(() => runUnits(units, new Map(), "full").ms);
      const w = agg.work, kids = agg.surfaces.reduce((n, x) => n + x.children.length, 0);
      const st: SimpStage[] = [
        { name: "Solid-to-surface conversion", detail: `${w.solids.toLocaleString()} solids converted to ${w.faces.toLocaleString()} faces` },
        { name: "Face extraction", detail: `${agg.surfaces.length} analytical planes and ${agg.lines.length} lines selected from ${w.faces.toLocaleString()} faces` },
        { name: "Surface generation", detail: `${agg.surfaces.length} planar surfaces and ${agg.lines.length} lines generated (${agg.surfaces.filter((x) => x.cat === "wall").length} walls, ${agg.surfaces.filter((x) => x.cat === "window").length} windows, ${agg.surfaces.filter((x) => x.cat === "door").length} doors, ${agg.surfaces.filter((x) => x.cat === "partition").length} partitions, ${agg.surfaces.filter((x) => x.cat === "floor").length} floors, ${agg.surfaces.filter((x) => x.cat === "roof").length} roof, ${agg.surfaces.filter((x) => x.cat === "shading").length} shading)` },
        { name: "Coplanar face merging", detail: `${w.merged} coplanar pieces and openings merged into gross wall, partition and slab surfaces` },
        { name: "Boundary detection", detail: `${kids} openings registered as sub-surfaces of their host walls; ${agg.zones.reduce((n, z) => n + z.bounds.length, 0)} zone boundaries found` },
        { name: "Surface orientation", detail: `azimuth and tilt computed for ${agg.surfaces.length} surfaces` },
        { name: "Removal of unnecessary geometry", detail: `${w.removed.toLocaleString()} solids dropped (frames, mullions, handles, layers, plant, window bands)` },
        { name: "Zero-thickness representation", detail: `${agg.surfaces.filter((x) => x.thickness === 0).length} of ${agg.surfaces.length} surfaces have zero thickness` },
        { name: "Geometry validation", detail: `${ok} of ${checks.length} checks passed` },
      ];
      set({ units, cache, agg, mt, checks, fullRun: stats, stages: st, simpMs, busy: null, mode: "simplified", pending: [], runs: [], lastMod: null });
      toast(`Simplified: ${mt.origTris.toLocaleString()} triangles → ${mt.simpSurfaces} surfaces + ${mt.simpLines} lines (${mt.reductionPct.toFixed(1)}% fewer triangles). ${ok}/${checks.length} validation checks passed.`);
    },
    modify(id: string, op: string) {
      const s = get(); if (!s.agg) return toast("Run SIMPLIFY MODEL first so there is a cache to update.");
      const label = modOptions(s.model, id).find((o) => o.op === op)?.label ?? op, model = applyMod(s.model, id, op), elems = buildElems(model), units = planUnits(model, elems);
      set({ model, elems, units, pending: outdated(units, s.cache), lastMod: { id, label }, selId: id, mode: s.mode === "original" ? "simplified" : s.mode });
      toast(`${id}: ${label}. ${outdated(units, s.cache).length} cached results are now outdated; nothing else needs to change.`);
    },
    async updateIncremental() {
      const s = get(); if (!s.agg || !s.pending.length || s.busy || !s.lastMod) return;
      set({ busy: { what: "incremental", stage: "Marking affected cache entries as outdated", pct: 15 } }); await tick();
      const incMs = measure(() => runUnits(s.units, new Map(s.cache), "incremental").ms), probe = runUnits(s.units, new Map(s.cache), "incremental");
      set({ busy: { what: "incremental", stage: `Reprocessing ${probe.recomputed.length} affected elements only`, pct: 55 } }); await tick();
      const st = runUnits(s.units, s.cache, "incremental"), fullMs = measure(() => runUnits(s.units, new Map(), "full").ms), fullFaces = runUnits(s.units, new Map(), "full").faces;
      const agg = aggregate(s.units, s.cache), mt = metrics(s.elems, agg), checks = validate(s.model, agg);
      const run: IncrRun = { n: s.runs.length + 1, label: `${s.lastMod.id}: ${s.lastMod.label}`, modId: s.lastMod.id, recomputed: st.recomputed, hits: st.hits, total: st.total, incMs, fullMs, faces: st.faces, fullFaces };
      set({ agg, mt, checks, pending: [], runs: [...s.runs, run], busy: null });
      toast(`Incremental update: ${st.recomputed.length} of ${st.total} elements reprocessed, ${st.hits} reused from cache (${((st.hits / st.total) * 100).toFixed(1)}% hit ratio).`);
    },
    resetModel() {
      const s = get(), elems = buildElems(s.base), units = planUnits(s.base, elems), cache: Cache = new Map(); runUnits(units, cache, "full");
      const agg = aggregate(units, cache);
      set({ model: s.base, elems, units, cache, agg, mt: metrics(elems, agg), checks: validate(s.base, agg), pending: [], lastMod: null, runs: [], selId: null, selZone: null }); toast("Model reset to the original sample; cache rebuilt.");
    },
    select(id: string | null) { set({ selId: id, selZone: null }); },
    selectZone(id: string | null) { set({ selZone: id, selId: null, zonesOn: id ? true : get().zonesOn }); },
    toggleCat(c: Cat) { set({ cats: { ...get().cats, [c]: !get().cats[c] } }); },
    toggleLevel(i: number) { const l = [...get().levels]; l[i] = !l[i]; set({ levels: l }); },
    toggleHidden(id: string) { const h = get().hidden; set({ hidden: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] }); },
    save() { try { const s = get(); localStorage.setItem(SAVE_KEY, JSON.stringify({ model: s.model, savedAt: new Date().toISOString() })); toast("Project saved in this browser (model parameters only)."); } catch { toast("Could not save: browser storage is unavailable."); } },
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY); if (!raw) return toast("No saved project in this browser.");
        const model = JSON.parse(raw).model as Model, elems = buildElems(model), units = planUnits(model, elems), cache: Cache = new Map(); runUnits(units, cache, "full");
        const agg = aggregate(units, cache); set({ model, elems, units, cache, agg, mt: metrics(elems, agg), checks: validate(model, agg), imported: true, pending: [], runs: [], mode: "simplified" }); toast("Saved project loaded and re-processed.");
      } catch { toast("The saved project could not be read."); }
    },
  };
  return a;
}
export type Actions = ReturnType<typeof makeActions>;
