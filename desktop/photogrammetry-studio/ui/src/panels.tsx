import { useRef, useState } from "react";
import { api, download, ProjectView, Stage } from "./api";
import { BTN, Badge, Check, GO, Num, Panel, Range, Sel, Step, fmt, int } from "./ui";

export interface Settings { clean: Record<string, any>; reconstruct: Record<string, any>; refine: Record<string, any>; color: Record<string, any> }
type Set = (fn: (s: Settings) => Settings) => void;
const upd = (set: Set, group: keyof Settings, key: string, patch: any) => set((s) => ({ ...s, [group]: { ...s[group], [key]: { ...(s[group][key] ?? {}), ...patch } } }));
const toggle = (set: Set, group: keyof Settings, key: string, on: boolean, def: any) => set((s) => ({ ...s, [group]: { ...s[group], [key]: on ? (s[group][key] ?? def) : null } }));

export const CLEAN_DEFAULTS: Record<string, any> = { invalid: {}, duplicates: { tolerance: 0 }, statistical: { neighbors: 20, std_ratio: 2 }, radius: { radius: 0, min_points: 6, spacing_factor: 4 }, isolated: { radius_factor: 4, min_cluster: 20 }, density: { neighbors: 12, min_density_ratio: 0.2 }, floating: { radius_factor: 6, min_fraction: 0.02 }, denoise: { neighbors: 16, strength: 0.6, feature_threshold: 0 }, downsample: { method: "voxel", voxel: 0, ratio: 0.5, target: 0, preserve_features: true }, crop: { bounds_min: [null, null, null], bounds_max: [null, null, null], invert: false } };
export const REFINE_DEFAULTS: Record<string, any> = { degenerate: {}, small_components: { min_fraction: 0.05 }, non_manifold: {}, normals: {}, fill_holes: { max_hole_edges: 30 }, smooth: { method: "taubin", iterations: 10, lam: 0.5, mu: -0.53, strength: 1, preserve_features: 0.8, feature_angle: 40, curvature_aware: false, max_move: 0.5, keep_boundary: true }, remesh: { target_edge_percent: 1, iterations: 6, adaptive: true, feature_angle: 30 }, refine_edges: { edge_percent: 1, iterations: 1 }, decimate: { ratio: 0.5, target_faces: 0, preserve_boundary: true, preserve_normals: true, planar: false }, optimize: {} };

// --------------------------------------------------------------------------------------------------------------- import
export function ImportPanel({ project, busy, onFiles, onSample, inspect }: { project: ProjectView | null; busy: boolean; onFiles: (f: File[]) => void; onSample: (k: string) => void; inspect: any }) {
  const input = useRef<HTMLInputElement>(null); const [over, setOver] = useState(false);
  const o = project?.stages.original; const imp = project?.info;
  return (<>
    <Panel title="Import">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) onFiles(f); }}
        className={`rounded border-2 border-dashed p-4 text-center text-xs ${over ? "border-accent bg-accent/10" : "border-ink-600"}`} data-testid="dropzone">
        <p className="text-slate-300">Drag and drop files here</p><p className="mt-1 text-slate-500">PLY, OBJ, STL, PCD, XYZ, GLB/GLTF, LAS/LAZ, USDZ. For Object Capture OBJ select the .obj with its .mtl and texture.</p>
        <button className={`${BTN} mt-2`} disabled={busy} onClick={() => input.current?.click()} data-testid="browse">Browse files…</button>
        <input ref={input} data-testid="file-input" type="file" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onFiles(f); }} />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Sample project</p>
      <div className="mt-1 flex gap-2"><button className={BTN} disabled={busy} onClick={() => onSample("bunny")} data-testid="sample-bunny">Stanford Bunny scan</button><button className={BTN} disabled={busy} onClick={() => onSample("mug")} data-testid="sample-mug">Mug scan</button></div>
      <p className="mt-1 text-[11px] text-slate-500">Real 3D asset turned into a noisy, photogrammetry-like point cloud (noise, duplicates, outliers, a floater, uneven density, an occlusion hole). Not an iPhone scan.</p>
    </Panel>
    {o && inspect && (
      <Panel title="Inspection" right={<Badge kind={inspect.invalid_removed ? "warn" : "ok"}>{inspect.invalid_removed ? `${inspect.invalid_removed} invalid removed` : "no invalid points"}</Badge>}>
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs" data-testid="inspection">
          <dt className="text-slate-400">File</dt><dd className="truncate" title={imp?.file}>{imp?.file ?? imp?.source ?? "-"}</dd>
          <dt className="text-slate-400">Type</dt><dd>{o.kind === "cloud" ? "Point cloud" : "Mesh"}</dd>
          <dt className="text-slate-400">{o.kind === "cloud" ? "Points" : "Vertices / faces"}</dt><dd data-testid="count">{o.kind === "cloud" ? int(o.points ?? 0) : `${int(o.vertices ?? 0)} / ${int(o.faces ?? 0)}`}</dd>
          <dt className="text-slate-400">Bounding box</dt><dd data-testid="bbox">{o.size.map((v) => fmt(v, 4)).join(" × ")}</dd>
          <dt className="text-slate-400">Centre (x y z)</dt><dd>{(inspect.center ?? o.bbox_min.map((v, i) => (v + o.bbox_max[i]) / 2)).map((v: number) => fmt(v, 4)).join(", ")}</dd>
          <dt className="text-slate-400">Min corner</dt><dd>{o.bbox_min.map((v) => fmt(v, 4)).join(", ")}</dd><dt className="text-slate-400">Max corner</dt><dd>{o.bbox_max.map((v) => fmt(v, 4)).join(", ")}</dd>
          <dt className="text-slate-400">RGB colours</dt><dd>{o.has_colors ? "yes" : "no"}</dd>
          {o.kind === "cloud" && <><dt className="text-slate-400">Normals</dt><dd>{o.has_normals ? "yes" : "no (estimated when needed)"}</dd></>}
          {inspect.spacing !== undefined && <><dt className="text-slate-400">Typical spacing</dt><dd>{fmt(inspect.spacing, 6)}</dd></>}
          {inspect.duplicates != null && <><dt className="text-slate-400">Duplicate points</dt><dd data-testid="dups">{int(inspect.duplicates)}</dd></>}
          {o.kind === "mesh" && <><dt className="text-slate-400">Texture map</dt><dd>{o.has_texture ? "yes" : "no"}</dd></>}
        </dl>
        {(imp?.notes ?? []).map((n: string, i: number) => <p key={i} className="mt-2 text-[11px] text-amber-300/90">{n}</p>)}
        {imp?.sample_note && <p className="mt-2 text-[11px] text-slate-400">{imp.sample_note}</p>}
      </Panel>)}
  </>);
}

// --------------------------------------------------------------------------------------------------------------- cleanup
export function CleanPanel({ s, set, run, disabled, bbox }: { s: Settings; set: Set; run: () => void; disabled: boolean; bbox?: { min: number[]; max: number[] } }) {
  const c: Record<string, any> = Object.fromEntries(Object.entries(s.clean).map(([k, v]) => [k, v && typeof v === "object" && !Array.isArray(v) && CLEAN_DEFAULTS[k] ? { ...CLEAN_DEFAULTS[k], ...v } : v])); const on = (k: string) => c[k] != null && c[k] !== false; const T = (k: string, v: boolean) => toggle(set, "clean", k, v, CLEAN_DEFAULTS[k]); const U = (k: string, p: any) => upd(set, "clean", k, p);
  return (<Panel title="Point cloud cleanup" right={<button className={GO} disabled={disabled} onClick={run} data-testid="run-clean">Run cleanup</button>}>
    <p className="text-[11px] text-slate-500">Every step deletes or averages real points; none adds points. Steps run in the order shown.</p>
    <Step id="c-crop" label="Crop to box" on={on("crop")} onToggle={(v) => T("crop", v)} note="Keep points inside the box (or outside with Invert).">
      {["x", "y", "z"].map((ax, i) => <div key={ax} className="mt-1 flex items-center gap-1 text-xs"><span className="w-4 text-slate-400">{ax}</span>
        <input type="number" step="any" placeholder={bbox ? fmt(bbox.min[i], 3) : "min"} className="w-[84px]" data-testid={`crop-min-${ax}`} value={c.crop?.bounds_min?.[i] ?? ""} onChange={(e) => { const v = [...(c.crop.bounds_min ?? [null, null, null])]; v[i] = e.target.value === "" ? null : parseFloat(e.target.value); U("crop", { bounds_min: v }); }} />
        <input type="number" step="any" placeholder={bbox ? fmt(bbox.max[i], 3) : "max"} className="w-[84px]" data-testid={`crop-max-${ax}`} value={c.crop?.bounds_max?.[i] ?? ""} onChange={(e) => { const v = [...(c.crop.bounds_max ?? [null, null, null])]; v[i] = e.target.value === "" ? null : parseFloat(e.target.value); U("crop", { bounds_max: v }); }} /></div>)}
      <Check label="Invert (remove inside)" checked={!!c.crop?.invert} onChange={(v) => U("crop", { invert: v })} />
    </Step>
    <Step id="c-invalid" label="Remove invalid points" on={on("invalid")} onToggle={(v) => T("invalid", v)} note="NaN / infinite coordinates." />
    <Step id="c-dup" label="Remove duplicate points" on={on("duplicates")} onToggle={(v) => T("duplicates", v)} note="Merges points closer than the tolerance (0 = automatic)."><Num label="Tolerance" value={c.duplicates?.tolerance ?? 0} step={0.0001} min={0} onChange={(v) => U("duplicates", { tolerance: v })} /></Step>
    <Step id="c-stat" label="Statistical outlier removal" on={on("statistical")} onToggle={(v) => T("statistical", v)} note="Removes points far from their neighbours.">
      <Num id="stat-neighbors" label="Neighbours" value={c.statistical?.neighbors ?? 20} min={3} max={200} onChange={(v) => U("statistical", { neighbors: Math.round(v) })} /><Range id="stat-std" label="Std. ratio (lower = stricter)" value={c.statistical?.std_ratio ?? 2} min={0.5} max={5} step={0.1} onChange={(v) => U("statistical", { std_ratio: v })} /></Step>
    <Step id="c-radius" label="Radius outlier removal" on={on("radius")} onToggle={(v) => T("radius", v)} note="Removes points with too few neighbours inside a radius.">
      <Num label="Radius (0 = auto)" value={c.radius?.radius ?? 0} step={0.001} min={0} onChange={(v) => U("radius", { radius: v })} /><Num label="Spacing factor (auto)" value={c.radius?.spacing_factor ?? 4} step={0.5} min={1} onChange={(v) => U("radius", { spacing_factor: v })} /><Num label="Min. neighbours" value={c.radius?.min_points ?? 6} min={1} onChange={(v) => U("radius", { min_points: Math.round(v) })} /></Step>
    <Step id="c-iso" label="Isolated point detection" on={on("isolated")} onToggle={(v) => T("isolated", v)} note="Removes tiny disconnected clusters.">
      <Num label="Connect radius (× spacing)" value={c.isolated?.radius_factor ?? 4} step={0.5} min={1} onChange={(v) => U("isolated", { radius_factor: v })} /><Num label="Min. cluster size" value={c.isolated?.min_cluster ?? 20} min={1} onChange={(v) => U("isolated", { min_cluster: Math.round(v) })} /></Step>
    <Step id="c-dens" label="Density filtering" on={on("density")} onToggle={(v) => T("density", v)} note="Removes points in very sparse regions."><Range label="Min. density vs median" value={c.density?.min_density_ratio ?? 0.2} min={0.02} max={1} step={0.02} onChange={(v) => U("density", { min_density_ratio: v })} /></Step>
    <Step id="c-float" label="Floating artifact removal" on={on("floating")} onToggle={(v) => T("floating", v)} note="Removes separate blobs far smaller than the main object.">
      <Num label="Connect radius (× spacing)" value={c.floating?.radius_factor ?? 6} step={0.5} min={1} onChange={(v) => U("floating", { radius_factor: v })} /><Range label="Min. size vs largest" value={c.floating?.min_fraction ?? 0.02} min={0.001} max={0.5} step={0.001} onChange={(v) => U("floating", { min_fraction: v })} /></Step>
    <Step id="c-denoise" label="Noise filtering (feature-preserving)" on={on("denoise")} onToggle={(v) => T("denoise", v)} note="Pulls flat-area points onto their local plane; edges and corners are left alone.">
      <Range id="dn-strength" label="Strength" value={c.denoise?.strength ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => U("denoise", { strength: v })} /><Num label="Neighbours" value={c.denoise?.neighbors ?? 16} min={6} max={64} onChange={(v) => U("denoise", { neighbors: Math.round(v) })} /></Step>
    <Step id="c-down" label="Downsampling" on={on("downsample")} onToggle={(v) => T("downsample", v)} note="Reduces point count; features keep a finer grid when preserved.">
      <Sel id="ds-method" label="Method" value={c.downsample?.method ?? "voxel"} onChange={(v) => U("downsample", { method: v })} options={[["voxel", "Voxel grid"], ["random", "Random"], ["uniform", "Uniform (every n-th)"]]} />
      {(c.downsample?.method ?? "voxel") === "voxel" && <><Num label="Voxel size (0 = auto)" value={c.downsample?.voxel ?? 0} step={0.0005} min={0} onChange={(v) => U("downsample", { voxel: v })} /><Check label="Preserve features" checked={c.downsample?.preserve_features !== false} onChange={(v) => U("downsample", { preserve_features: v })} /></>}
      <Num id="ds-target" label="Target points (0 = off)" value={c.downsample?.target ?? 0} min={0} step={1000} onChange={(v) => U("downsample", { target: Math.round(v) })} />
      {c.downsample?.method === "random" && <Range label="Keep ratio" value={c.downsample?.ratio ?? 0.5} min={0.05} max={1} step={0.05} onChange={(v) => U("downsample", { ratio: v })} />}</Step>
  </Panel>);
}

// ----------------------------------------------------------------------------------------------------- reconstruction
export function ReconPanel({ s, set, run, disabled, caps, rec, onRecommend, hasMesh }: { s: Settings; set: Set; run: () => void; disabled: boolean; caps: any; rec: any; onRecommend: () => void; hasMesh: boolean }) {
  const r = s.reconstruct; const U = (p: any) => set((x) => ({ ...x, reconstruct: { ...x.reconstruct, ...p } })); const m = r.method; const meth = caps?.reconstruction ?? {};
  const poisson = m === "poisson" || m === "screened_poisson" || m === "auto";
  return (<Panel title="Surface reconstruction" right={<button className={GO} disabled={disabled} onClick={run} data-testid="run-recon">Reconstruct</button>}>
    {hasMesh && <p className="mb-1 text-[11px] text-slate-400">An imported mesh is already a surface; reconstruction needs a point cloud (a mesh's vertices are used if you run it anyway).</p>}
    <button className={BTN} onClick={onRecommend} disabled={disabled} data-testid="recommend">Analyse scan and recommend a method</button>
    {rec && <div className="mt-2 rounded border border-accent/40 bg-accent/10 p-2 text-xs" data-testid="recommendation"><p className="font-semibold text-white">Recommended: {rec.label}</p>{rec.reasons.map((t: string, i: number) => <p key={i} className="mt-0.5 text-slate-300">{t}</p>)}
      <p className="mt-1 text-[11px] text-slate-400">Measured: {int(rec.metrics.points)} points · spacing {fmt(rec.metrics.spacing_ratio * 100, 3)}% of size · noise {fmt(rec.metrics.noise_to_spacing, 2)}× spacing · uniformity {fmt(rec.metrics.uniformity_cv, 2)}</p>
      <button className={`${BTN} mt-1`} onClick={() => U({ method: rec.method })} data-testid="use-recommended">Use recommended</button></div>}
    <Sel id="method" label="Algorithm" value={m} onChange={(v) => U({ method: v })} options={[["auto", "Automatic (recommend)"], ...Object.entries(meth).map(([k, v]: [string, any]) => [k, v.label + (v.available ? "" : " — unavailable")] as [string, string])]} />
    {m !== "auto" && meth[m] && <p className="mt-1 text-[11px] text-slate-400">{meth[m].note}</p>}
    {Object.entries(meth).filter(([, v]: any) => !v.available).map(([k, v]: any) => <p key={k} className="mt-1 text-[11px] text-red-300">Unavailable: {v.label}</p>)}
    <p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Normals</p>
    <Num label="Normal neighbours" value={r.normal_neighbors} min={5} max={100} onChange={(v) => U({ normal_neighbors: Math.round(v) })} /><Sel label="Orientation" value={r.orient} onChange={(v) => U({ orient: v })} options={[["tangent", "Consistent tangent plane"], ["centroid", "Away from centre"]]} />
    {poisson && <><p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Poisson</p><Range id="depth" label="Octree depth (detail)" value={r.depth} min={5} max={12} step={1} onChange={(v) => U({ depth: v })} />
      {m !== "poisson" && <><Num label="Point weight (screening)" value={r.point_weight} step={0.5} min={0} onChange={(v) => U({ point_weight: v })} /><Num label="Samples per node" value={r.samples_per_node} step={0.1} min={0.5} onChange={(v) => U({ samples_per_node: v })} /></>}
      {(m === "poisson" || m === "auto") && <Range label="Low-density trim (quantile)" value={r.density_trim} min={0} max={0.3} step={0.01} onChange={(v) => U({ density_trim: v })} />}</>}
    {m === "ball_pivoting" && <><p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Ball pivoting radii (× spacing)</p>{[0, 1, 2].map((i) => <Num key={i} label={`Radius ${i + 1}`} value={r.radius_factors[i]} step={0.25} min={0.5} onChange={(v) => { const f = [...r.radius_factors]; f[i] = v; U({ radius_factors: f }); }} />)}</>}
    {m === "alpha_shape" && <><p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Alpha</p><Num label="Alpha (× spacing)" value={r.alpha_factor} step={0.25} min={0.5} onChange={(v) => U({ alpha_factor: v })} /></>}
    <p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Control invented surface</p>
    <Range id="trim" label="Trim distance (× spacing, 0 = off)" value={r.trim_factor} min={0} max={10} step={0.5} onChange={(v) => U({ trim_factor: v })} />
    <p className="text-[11px] text-slate-500">Triangles farther than this from any measured point are removed, so holes in the data stay holes instead of being guessed.</p>
  </Panel>);
}

// ------------------------------------------------------------------------------------------------------- refinement
export function RefinePanel({ s, set, run, disabled, preview }: { s: Settings; set: Set; run: () => void; disabled: boolean; preview: () => void }) {
  const f = s.refine; const on = (k: string) => f[k] != null && f[k] !== false; const T = (k: string, v: boolean) => toggle(set, "refine", k, v, REFINE_DEFAULTS[k]); const U = (k: string, p: any) => upd(set, "refine", k, p); const sm = { ...REFINE_DEFAULTS.smooth, ...(f.smooth ?? {}) }; const dc = { ...REFINE_DEFAULTS.decimate, ...(f.decimate ?? {}) }; const rm = { ...REFINE_DEFAULTS.remesh, ...(f.remesh ?? {}) }; const re = { ...REFINE_DEFAULTS.refine_edges, ...(f.refine_edges ?? {}) }; const fh = { ...REFINE_DEFAULTS.fill_holes, ...(f.fill_holes ?? {}) }; const sc = { ...REFINE_DEFAULTS.small_components, ...(f.small_components ?? {}) };
  return (<Panel title="Mesh refinement" right={<button className={GO} disabled={disabled} onClick={run} data-testid="run-refine">Refine mesh</button>}>
    <p className="text-[11px] text-slate-500">Always starts from the reconstructed (or imported) mesh. Smoothing is limited to a fraction of an edge length per vertex so the object keeps its size.</p>
    <Step id="r-smooth" label="Smoothing" on={on("smooth")} onToggle={(v) => T("smooth", v)}>
      <Sel id="sm-method" label="Method" value={sm.method} onChange={(v) => U("smooth", { method: v })} options={[["taubin", "Taubin (no shrinkage)"], ["laplacian", "Laplacian (shrinks)"], ["bilateral", "Bilateral (edge-aware)"], ["regularize", "Regularize (even triangles)"]]} />
      <Range id="sm-iter" label="Iterations" value={sm.iterations} min={1} max={60} step={1} onChange={(v) => U("smooth", { iterations: v })} />
      <Range id="sm-strength" label="Intensity" value={sm.strength ?? 1} min={0.05} max={1} step={0.05} onChange={(v) => U("smooth", { strength: v })} />
      <Range id="sm-feat" label="Feature preservation" value={sm.preserve_features} min={0} max={1} step={0.05} onChange={(v) => U("smooth", { preserve_features: v })} />
      <Range label="Sharp-edge angle" value={sm.feature_angle} min={10} max={90} step={1} suffix="°" onChange={(v) => U("smooth", { feature_angle: v })} />
      <Check id="sm-curv" label="Curvature-aware (smooth flat areas more)" checked={!!sm.curvature_aware} onChange={(v) => U("smooth", { curvature_aware: v })} />
      <Range id="sm-move" label="Max movement (× edge length, 0 = off)" value={sm.max_move} min={0} max={2} step={0.05} onChange={(v) => U("smooth", { max_move: v })} />
      {sm.method === "laplacian" && <p className="mt-1 text-[11px] text-amber-300">Plain Laplacian smoothing shrinks the object slightly; the validation tab reports the size change.</p>}
    </Step>
    <Step id="r-holes" label="Hole detection and repair" on={on("fill_holes")} onToggle={(v) => T("fill_holes", v)} note="Closes only holes up to the size below; larger openings stay open."><Num id="hole-size" label="Max hole size (edges)" value={fh.max_hole_edges} min={3} onChange={(v) => U("fill_holes", { max_hole_edges: Math.round(v) })} /></Step>
    <Step id="r-nm" label="Non-manifold repair" on={on("non_manifold")} onToggle={(v) => T("non_manifold", v)} />
    <Step id="r-norm" label="Normal correction" on={on("normals")} onToggle={(v) => T("normals", v)} note="Consistent winding, closed pieces outward." />
    <Step id="r-deg" label="Remove degenerate triangles" on={on("degenerate")} onToggle={(v) => T("degenerate", v)} />
    <Step id="r-small" label="Remove small artifacts (components)" on={on("small_components")} onToggle={(v) => T("small_components", v)}><Range label="Keep pieces ≥ (fraction of largest)" value={sc.min_fraction} min={0.001} max={0.5} step={0.001} onChange={(v) => U("small_components", { min_fraction: v })} /></Step>
    <Step id="r-remesh" label="Adaptive remeshing" on={on("remesh")} onToggle={(v) => T("remesh", v)} note="Even triangles; smaller in curved areas. Re-projects onto the surface."><Num label="Edge length (% of size)" value={rm.target_edge_percent} step={0.1} min={0.05} onChange={(v) => U("remesh", { target_edge_percent: v })} /><Check label="Adaptive" checked={rm.adaptive !== false} onChange={(v) => U("remesh", { adaptive: v })} /></Step>
    <Step id="r-edges" label="Local refinement (split long edges)" on={on("refine_edges")} onToggle={(v) => T("refine_edges", v)}><Num label="Split edges longer than (% of size)" value={re.edge_percent} step={0.1} min={0.05} onChange={(v) => U("refine_edges", { edge_percent: v })} /></Step>
    <Step id="r-dec" label="Decimation / simplification" on={on("decimate")} onToggle={(v) => T("decimate", v)} note="Quadric edge collapse.">
      <Range id="dec-ratio" label="Keep faces" value={dc.ratio} min={0.02} max={1} step={0.01} onChange={(v) => U("decimate", { ratio: v })} /><Num id="dec-target" label="Or target faces (0 = ratio)" value={dc.target_faces} min={0} step={1000} onChange={(v) => U("decimate", { target_faces: Math.round(v) })} />
      <Check label="Preserve boundary" checked={dc.preserve_boundary !== false} onChange={(v) => U("decimate", { preserve_boundary: v })} /><Check label="Preserve normals" checked={dc.preserve_normals !== false} onChange={(v) => U("decimate", { preserve_normals: v })} /><Check label="Planar-aware (hard surfaces)" checked={!!dc.planar} onChange={(v) => U("decimate", { planar: v })} /></Step>
    <Step id="r-opt" label="Mesh optimisation" on={on("optimize")} onToggle={(v) => T("optimize", v)} note="Merge duplicate vertices and faces, drop unused vertices." />
    <div className="mt-3 flex gap-2"><button className={BTN} disabled={disabled} onClick={preview} data-testid="subdiv">Subdivision surface preview</button></div>
    <p className="mt-1 text-[11px] text-slate-500">Loop subdivision is shown as a separate “preview” stage; it does not change the refined mesh.</p>
  </Panel>);
}

// ---------------------------------------------------------------------------------------------------------- texture
export function TexturePanel({ s, set, run, disabled, project }: { s: Settings; set: Set; run: () => void; disabled: boolean; project: ProjectView | null }) {
  const c = s.color; const U = (p: any) => set((x) => ({ ...x, color: { ...x.color, ...p } })); const st = project?.stages.refined ?? project?.stages.reconstructed ?? (project?.stages.original?.kind === "mesh" ? project.stages.original : undefined);
  return (<Panel title="Texture and colour" right={<button className={GO} disabled={disabled} onClick={run} data-testid="run-color">Apply</button>}>
    <p className="text-[11px] text-slate-500">Geometric smoothing never changes colours. Colour clean-up below is a separate step that only touches colours.</p>
    <p className="mt-2 text-xs text-slate-300" data-testid="tex-status">Current mesh: {st ? <>{st.has_colors ? "has vertex colours" : "no colours"}{st.has_texture ? ", has a texture map with UVs" : ""}</> : "none yet"}</p>
    <Check id="col-transfer" label="Transfer colours from the point cloud to the mesh" checked={!!c.transfer} onChange={(v) => U({ transfer: v })} hint="Only fills colours that are missing" />
    <Check id="col-bake" label="Bake texture map into vertex colours" checked={!!c.bake_texture} onChange={(v) => U({ bake_texture: v })} disabled={!st?.has_texture} />
    <Check id="col-clean" label="Smooth vertex colours (colour clean-up)" checked={c.clean != null && c.clean !== false} onChange={(v) => U({ clean: v ? { iterations: 3, strength: 0.5 } : null })} />
    {c.clean && <><Num label="Iterations" value={c.clean.iterations} min={1} max={30} onChange={(v) => U({ clean: { ...c.clean, iterations: Math.round(v) } })} /><Range label="Strength" value={c.clean.strength} min={0.1} max={1} step={0.05} onChange={(v) => U({ clean: { ...c.clean, strength: v } })} /></>}
    <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] text-slate-400"><li>Vertex colours survive reconstruction, smoothing and decimation (nearest-point transfer).</li><li>A texture map and UVs are kept only while the topology is unchanged (smoothing, hole-free repairs). Reconstruction, decimation and remeshing bake the colours to vertices.</li></ul>
    <div className="mt-2 space-y-1 text-[11px] text-red-300"><p>Unavailable: re-baking a new texture atlas / UV unwrapping of the refined mesh.</p></div>
  </Panel>);
}

// -------------------------------------------------------------------------------------------------------- validation
export function ValidatePanel({ stage, setStage, stages, report, busy, run }: { stage: Stage; setStage: (s: Stage) => void; stages: string[]; report: any; busy: boolean; run: () => void }) {
  const r = report;
  return (<Panel title="Mesh validation" right={<button className={GO} onClick={run} disabled={busy || !stages.length} data-testid="run-validate">Analyse</button>}>
    <Sel id="val-stage" label="Stage" value={stage} onChange={(v) => setStage(v as Stage)} options={stages.map((s) => [s, s] as [string, string])} />
    {r && r.type === "mesh" && <div data-testid="quality" className="mt-2 text-xs">
      <ul className="space-y-1">{(r.verdict ?? []).map((v: any, i: number) => <li key={i} className="flex gap-2"><Badge kind={v.level}>{v.level === "ok" ? "OK" : v.level === "warn" ? "WARN" : "FIX"}</Badge><span className="text-slate-300">{v.text}</span></li>)}</ul>
      <dl className="mt-3 grid grid-cols-[150px_1fr] gap-y-1">
        <dt className="text-slate-400">Polygons</dt><dd data-testid="q-faces">{int(r.faces)}</dd><dt className="text-slate-400">Vertices</dt><dd data-testid="q-verts">{int(r.vertices)}</dd><dt className="text-slate-400">Watertight</dt><dd data-testid="q-water">{r.watertight ? "yes" : "no"}</dd>
        <dt className="text-slate-400">Non-manifold edges</dt><dd data-testid="q-nm">{int(r.non_manifold_edges)}</dd><dt className="text-slate-400">Holes (boundary loops)</dt><dd data-testid="q-holes">{int(r.holes)}{r.hole_sizes?.length ? ` (largest ${r.hole_sizes[0]} edges)` : ""}</dd>
        <dt className="text-slate-400">Normal consistency</dt><dd>{fmt(r.normal_consistency * 100, 2)}% {r.outward_normals === false ? "(inward!)" : ""}</dd><dt className="text-slate-400">Degenerate triangles</dt><dd>{int(r.degenerate_triangles)} (+{int(r.sliver_triangles)} slivers)</dd>
        <dt className="text-slate-400">Connected components</dt><dd>{int(r.components)}</dd><dt className="text-slate-400">Bounding box</dt><dd>{r.size.map((v: number) => fmt(v, 4)).join(" × ")}</dd><dt className="text-slate-400">Surface area</dt><dd>{fmt(r.surface_area, 5)}</dd>
        {r.volume != null && <><dt className="text-slate-400">Volume</dt><dd>{fmt(r.volume, 7)}</dd></>}
        {r.deviation_from_points && <><dt className="text-slate-400">Distance to points (mean / 95% / max)</dt><dd data-testid="q-dev">{fmt(r.deviation_from_points.mean, 5)} / {fmt(r.deviation_from_points.p95, 5)} / {fmt(r.deviation_from_points.max, 5)}</dd></>}
        {r.against_reference && <><dt className="text-slate-400">Distance to the true sample surface</dt><dd data-testid="q-ref">{fmt(r.against_reference.mean, 5)} mean · {fmt(r.against_reference.max, 5)} max</dd><dt className="text-slate-400">Size error vs truth (x y z)</dt><dd>{r.against_reference.size_error_percent.map((v: number) => fmt(v, 2) + "%").join(", ")}</dd></>}
      </dl>
      {r.against_reference && <p className="mt-2 text-[11px] text-slate-500">The truth comparison exists only for sample projects: the original mesh before the scan defects were added.</p>}</div>}
    {r && r.type === "cloud" && <p className="mt-2 text-xs text-slate-300" data-testid="quality">Point cloud: {int(r.count)} points, spacing {fmt(r.spacing, 6)}. Validation reports are for meshes; reconstruct first.</p>}
    {!r && <p className="mt-2 text-[11px] text-slate-500">Press Analyse to measure the selected stage. Nothing is estimated: every value is computed from the mesh.</p>}
  </Panel>);
}

// ------------------------------------------------------------------------------------------------------------ export
export function ExportPanel({ project, caps, onError, onLog }: { project: ProjectView | null; caps: any; onError: (m: string) => void; onLog: (m: string) => void }) {
  const stages = (["refined", "reconstructed", "cleaned", "original"] as Stage[]).filter((k) => project?.stages[k]); const [o, setO] = useState({ stage: "" as string, format: "glb", scale: 1, orientation: "as-is", keep_texture: true, simplify_percent: 0, target_faces: 0, recentre: false }); const [busy, setBusy] = useState(false); const [notes, setNotes] = useState<string[]>([]);
  const stage = (o.stage && stages.includes(o.stage as Stage) ? o.stage : stages[0]) as Stage | undefined; const sum = stage ? project?.stages[stage] : undefined; const cloud = sum?.kind === "cloud";
  const go = async () => { if (!project || !stage) return; setBusy(true); try { const r = await api.exportStage(project.id, { ...o, stage }); download(r.name, r.blob); setNotes(r.notes); onLog(`Exported ${r.name} (${(r.blob.size / 1e6).toFixed(2)} MB, ${int(r.faces)} faces). ${r.notes.join("; ")}`); } catch (e: any) { onError(e.message); } finally { setBusy(false); } };
  return (<Panel title="Export" right={<button className={GO} disabled={busy || !stage} onClick={go} data-testid="do-export">{busy ? "Exporting…" : "Export"}</button>}>
    <Sel id="ex-stage" label="Stage" value={stage ?? ""} onChange={(v) => setO({ ...o, stage: v })} options={stages.map((s) => [s, s] as [string, string])} />
    <Sel id="ex-format" label="Format" value={o.format} onChange={(v) => setO({ ...o, format: v })} options={Object.keys(caps?.export ?? { glb: 1 }).filter((f) => !cloud || f === "ply" || f === "obj").map((f) => [f, f.toUpperCase()] as [string, string])} />
    {caps?.export?.[o.format] && <p className="mt-1 text-[11px] text-slate-400">Colours: {caps.export[o.format].colors}</p>}
    <Num id="ex-scale" label="Scale (× model units)" value={o.scale} min={0.000001} step={0.1} onChange={(v) => setO({ ...o, scale: v })} hint="1000 turns metres into millimetres" />
    <Sel id="ex-orient" label="Orientation" value={o.orientation} onChange={(v) => setO({ ...o, orientation: v })} options={(caps?.orientations ?? ["as-is"]).map((x: string) => [x, x.replace(/-/g, " ")] as [string, string])} />
    <Check label="Move model centre to the origin" checked={o.recentre} onChange={(v) => setO({ ...o, recentre: v })} />
    <Check id="ex-tex" label="Preserve texture / colours" checked={o.keep_texture} onChange={(v) => setO({ ...o, keep_texture: v })} disabled={cloud} />
    {!cloud && <><Range id="ex-simp" label="Simplification at export" value={o.simplify_percent} min={0} max={95} step={5} suffix="%" onChange={(v) => setO({ ...o, simplify_percent: v })} /><Num id="ex-faces" label="Or polygon budget (0 = as is)" value={o.target_faces} min={0} step={1000} onChange={(v) => setO({ ...o, target_faces: Math.round(v) })} />
      <p className="mt-1 text-[11px] text-slate-500">Simplification is applied to the exported copy; the project mesh is unchanged. Current: {int(sum?.faces ?? 0)} faces.</p></>}
    {notes.length > 0 && <p className="mt-2 text-[11px] text-emerald-300" data-testid="export-notes">{notes.join(" · ")}</p>}
  </Panel>);
}
