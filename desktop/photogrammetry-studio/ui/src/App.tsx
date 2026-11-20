import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, download, JobView, Preview, ProjectView, Stage } from "./api";
import Viewport, { CompareState, ViewOpts } from "./Viewport";
import { CleanPanel, ExportPanel, ImportPanel, ReconPanel, RefinePanel, Settings, TexturePanel, ValidatePanel } from "./panels";
import { BTN, Badge, GO, Panel, fmt, int } from "./ui";

type Section = "import" | "clean" | "recon" | "refine" | "texture" | "validate" | "export";
const SECTIONS: { id: Section; label: string; stage?: Stage }[] = [{ id: "import", label: "Import Project", stage: "original" }, { id: "clean", label: "Point Cloud Cleanup", stage: "cleaned" }, { id: "recon", label: "Surface Reconstruction", stage: "reconstructed" }, { id: "refine", label: "Mesh Refinement", stage: "refined" }, { id: "texture", label: "Texture Processing" }, { id: "validate", label: "Mesh Validation" }, { id: "export", label: "Export" }];
const STAGE_LABEL: Record<string, string> = { original: "Original", cleaned: "Cleaned cloud", reconstructed: "Reconstructed mesh", refined: "Refined mesh", preview: "Subdivision preview" };
const OP_STAGE: Record<string, Stage> = { clean: "cleaned", reconstruct: "reconstructed", refine: "refined", pipeline: "refined", subdivision_preview: "preview" };
interface Line { t: string; level: string; message: string }
const now = () => new Date().toLocaleTimeString();

export default function App() {
  const [caps, setCaps] = useState<any>(null); const [project, setProject] = useState<ProjectView | null>(null); const [settings, setSettings] = useState<Settings | null>(null); const [presets, setPresets] = useState<Record<string, { label: string; description: string }>>({});
  const [preset, setPreset] = useState("balanced"); const [section, setSection] = useState<Section>("import"); const [active, setActive] = useState<Stage>("original"); const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState(""); const [lines, setLines] = useState<Line[]>([]); const [tab, setTab] = useState<"progress" | "history" | "console">("progress"); const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, Preview>>({}); const [loading, setLoading] = useState(false); const [resetKey, setResetKey] = useState(0);
  const [opts, setOpts] = useState<ViewOpts>({ shade: "solid", colors: true, pointSize: 2, bbox: false, grid: true, zUp: false, flat: false }); const [compare, setCompare] = useState<CompareState>({ mode: "single", a: "original", b: "refined", pos: 0.5 });
  const [rec, setRec] = useState<any>(null); const [inspect, setInspect] = useState<any>(null); const [valStage, setValStage] = useState<Stage>("refined"); const [report, setReport] = useState<any>(null); const seenLogs = useRef(0); const openRef = useRef<HTMLInputElement>(null);

  const log = useCallback((message: string, level = "info") => setLines((l) => [...l.slice(-500), { t: now(), level, message }]), []);
  const fail = useCallback((m: string) => { setError(m); log(m, "error"); }, [log]);

  // ---- start-up: capabilities, defaults, presets, an empty project
  useEffect(() => { (async () => { try {
    const [c, d, p] = await Promise.all([api.capabilities(), api.defaults(), api.presets()]); setCaps(c); setPresets(p); const pr = await api.preset("balanced"); setSettings({ clean: pr.clean, reconstruct: pr.reconstruct, refine: pr.refine, color: pr.color ?? d.color }); setProject(await api.newProject());
    log(`Engine ready (v${c.version}). ${c.gpu.note}`);
  } catch (e: any) { fail("Cannot reach the processing engine: " + e.message + ". Start it with `python -m pgengine`."); } })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback((p: ProjectView) => { setProject(p); }, []);
  const stagesAvail = useMemo(() => (["original", "cleaned", "reconstructed", "refined", "preview"] as Stage[]).filter((s) => project?.stages[s]), [project]);
  useEffect(() => { if (project && !project.stages[active] && stagesAvail.length) setActive(stagesAvail[stagesAvail.length - (stagesAvail.includes("preview") && stagesAvail.length > 1 ? 2 : 1)]); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- previews of the stages being displayed (cached per stage file)
  const need = useMemo(() => { const n = compare.mode === "single" ? [active] : [compare.a, compare.b]; return n.filter((s) => project?.stages[s as Stage]) as Stage[]; }, [active, compare, project]);
  useEffect(() => { if (!project) return; let dead = false; (async () => { for (const s of need) { const key = `${project.id}:${s}:${project.stages[s]!.file}`; if (previews[key]) continue; setLoading(true); try { const p = await api.preview(project.id, s); if (!dead) setPreviews((m) => ({ ...Object.fromEntries(Object.entries(m).slice(-8)), [key]: p })); } catch (e: any) { fail(`Preview of ${s} failed: ${e.message}`); } } if (!dead) setLoading(false); })(); return () => { dead = true; }; }, [project, need]); // eslint-disable-line react-hooks/exhaustive-deps
  const stageData = useMemo(() => { const o: Record<string, Preview | null> = {}; if (!project) return o; (["original", "cleaned", "reconstructed", "refined", "preview"] as Stage[]).forEach((s) => { const f = project.stages[s]?.file; o[s] = f ? previews[`${project.id}:${s}:${f}`] ?? null : null; }); return o; }, [project, previews]);

  // ---- inspection of the imported data
  useEffect(() => { setInspect(null); if (project?.stages.original) api.inspect(project.id, "original").then(setInspect).catch(() => {}); }, [project?.stages.original?.file]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- job polling
  useEffect(() => { if (!job || !["queued", "running"].includes(job.state)) return; const t = setInterval(async () => { try {
    const j = await api.job(job.id); setJob(j); const fresh = j.logs.slice(seenLogs.current); seenLogs.current = j.logs.length; fresh.forEach((l) => log(l.message, l.level));
    if (j.state === "done") { const p = await api.project(j.project); apply(p); const st = OP_STAGE[j.op]; if (st) { setActive(st); } setReport(null); setRec(null); if (j.op === "pipeline") setValStage("refined"); }
    if (j.state === "error") fail(j.error ?? "The operation failed.");
    if (j.state === "cancelled") log("Operation cancelled.", "warn");
  } catch (e: any) { fail(e.message); } }, 500); return () => clearInterval(t); }, [job?.id, job?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = !!job && ["queued", "running"].includes(job.state); const disabled = running || busy || !project;
  const start = async (op: string, params: unknown) => { if (!project) return; setError(""); setTab("progress"); try { seenLogs.current = 0; const j = await api.run(project.id, op, params); setJob(j); log(`Started ${op}`); } catch (e: any) { fail(e.message); } };
  const mut = async (fn: () => Promise<ProjectView>, msg?: string) => { setBusy(true); setError(""); try { const p = await fn(); apply(p); if (msg) log(msg); return p; } catch (e: any) { fail(e.message); } finally { setBusy(false); } };

  const onFiles = (files: File[]) => project && mut(() => api.importFiles(project.id, files), `Imported ${files.map((f) => f.name).join(", ")}`).then((p) => { if (p) { setActive("original"); setSection("import"); setResetKey((k) => k + 1); } });
  const onSample = (kind: string) => project && mut(() => api.sample(project.id, kind), `Sample project (${kind}) created`).then((p) => { if (p) { setActive("original"); setResetKey((k) => k + 1); } });
  const newProj = async () => { if (running) return fail("Cancel or wait for the running operation first."); if (project && Object.keys(project.stages).length && !window.confirm("Start a new project? Unsaved work in the current project will be discarded.")) return; if (project) await api.deleteProject(project.id).catch(() => {}); setPreviews({}); setReport(null); setRec(null); setLines([]); mut(() => api.newProject()); setActive("original"); setCompare((c) => ({ ...c, mode: "single" })); };
  const undo = () => project && !running && mut(() => api.undo(project.id), "Undo"); const redo = () => project && !running && mut(() => api.redo(project.id), "Redo");
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); } if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });
  const save = async () => { if (!project) return; try { const r = await api.save(project.id); download(r.name, r.blob); log(`Saved ${r.name}`); } catch (e: any) { fail(e.message); } };
  const openFile = async (f: File) => { if (running) return fail("Wait for the running operation first."); setPreviews({}); mut(() => api.open(f), `Opened ${f.name}`); setActive("original"); };
  const choosePreset = async (n: string) => { setPreset(n); try { const pr = await api.preset(n); setSettings((s) => ({ ...(s as Settings), clean: pr.clean, reconstruct: pr.reconstruct, refine: pr.refine, color: pr.color ?? s!.color })); log(`Preset loaded: ${presets[n]?.label}. Settings can still be edited.`); } catch (e: any) { fail(e.message); } };
  const processAll = () => { if (!project?.stages.original) return fail("Import a file or open the sample project first."); setSection("import"); start("pipeline", settings); };
  const cancel = async () => { if (job) { const j = await api.cancel(job.id); setJob(j); log("Operation cancelled.", "warn"); } };
  const runValidate = async () => { if (!project) return; setBusy(true); try { setReport(await api.report(project.id, valStage)); } catch (e: any) { fail(e.message); } finally { setBusy(false); } };
  const recommend = async () => { if (!project) return; setBusy(true); try { setRec(await api.recommend(project.id)); } catch (e: any) { fail(e.message); } finally { setBusy(false); } };
  const startClean = () => { const c: Record<string, any> = {}; Object.entries(settings!.clean).forEach(([k, v]) => { if (v != null && v !== false) c[k] = v; }); if (c.crop) { const cr = c.crop; if (cr.bounds_min.every((v: any) => v == null) && cr.bounds_max.every((v: any) => v == null)) delete c.crop; } if (!Object.keys(c).length) return fail("Switch on at least one cleaning step."); start("clean", c); };
  const startRefine = () => { const c: Record<string, any> = {}; Object.entries(settings!.refine).forEach(([k, v]) => { if (v != null && v !== false) c[k] = v; }); if (!Object.keys(c).length) return fail("Switch on at least one refinement step."); start("refine", c); };

  const cur = project?.stages[active]; const o = project?.stages.original;
  const prevStage: Stage | null = ({ cleaned: "original", reconstructed: "cleaned", refined: project?.stages.reconstructed ? "reconstructed" : "original", preview: "refined" } as Record<string, Stage>)[active] ?? null;
  const showStage = compare.mode === "single" ? active : null;
  if (!caps && !error) return <div className="flex h-full items-center justify-center text-slate-400">Starting the processing engine…</div>;
  return (
    <div className="grid h-full" style={{ gridTemplateRows: "44px minmax(0,1fr) 172px" }}>
      {/* TOP TOOLBAR */}
      <header className="flex items-center gap-2 border-b border-ink-700 bg-ink-900 px-3" role="toolbar" aria-label="Main toolbar">
        <span className="mr-2 font-semibold text-white">PhotoMesh <span className="text-accent">Studio</span></span>
        <button className={BTN} onClick={newProj} data-testid="tb-new">New Project</button>
        <button className={BTN} onClick={() => openRef.current?.click()} data-testid="tb-open">Open</button><input ref={openRef} type="file" accept=".pgproj" hidden data-testid="open-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openFile(f); }} />
        <button className={BTN} onClick={save} disabled={!o} data-testid="tb-save">Save</button>
        <span className="mx-1 h-5 w-px bg-ink-600" />
        <button className={BTN} onClick={undo} disabled={!project?.can_undo || running} data-testid="tb-undo" title="Ctrl+Z">Undo</button><button className={BTN} onClick={redo} disabled={!project?.can_redo || running} data-testid="tb-redo" title="Ctrl+Y">Redo</button>
        <button className={BTN} onClick={() => setResetKey((k) => k + 1)} data-testid="tb-reset">Reset View</button>
        <span className="mx-1 h-5 w-px bg-ink-600" />
        <select value={preset} onChange={(e) => choosePreset(e.target.value)} data-testid="preset" title={presets[preset]?.description} aria-label="Processing preset">{Object.entries(presets).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <button className={GO} onClick={processAll} disabled={disabled || !o} data-testid="tb-process">Process</button>
        <button className={BTN} onClick={() => setSection("export")} disabled={!project || !Object.keys(project.stages).length} data-testid="tb-export">Export</button>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">{caps && <Badge kind={caps.gpu.cuda ? "ok" : "off"}>{caps.gpu.cuda ? "GPU" : "CPU"}</Badge>}<span data-testid="project-name" className="max-w-[220px] truncate text-slate-300">{project?.name}</span></span>
      </header>

      <main className="grid min-h-0" style={{ gridTemplateColumns: "208px minmax(0,1fr) 352px" }}>
        {/* LEFT SIDEBAR */}
        <nav className="overflow-auto border-r border-ink-700 bg-ink-900 py-2" aria-label="Workflow">
          {SECTIONS.map((s, i) => { const done = s.stage ? !!project?.stages[s.stage] : false; return (
            <button key={s.id} onClick={() => { setSection(s.id); if (s.stage && project?.stages[s.stage]) setActive(s.stage); }} data-testid={`nav-${s.id}`} aria-current={section === s.id}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] ${section === s.id ? "bg-accent/15 text-white shadow-[inset_3px_0_0_#4f8cff]" : "text-slate-300 hover:bg-ink-800"}`}>
              <span className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : "bg-ink-600"}`} /><span>{i + 1}. {s.label}</span></button>); })}
          <div className="mt-4 border-t border-ink-700 px-3 pt-3 text-[11px] text-slate-500"><p className="mb-1 font-semibold uppercase tracking-wider">Stages</p>
            {(["original", "cleaned", "reconstructed", "refined", "preview"] as Stage[]).map((s) => <button key={s} disabled={!project?.stages[s]} onClick={() => { setActive(s); setCompare((c) => ({ ...c, mode: "single" })); }} data-testid={`stage-${s}`}
              className={`mb-0.5 block w-full rounded px-2 py-1 text-left text-xs disabled:opacity-35 ${showStage === s ? "bg-ink-700 text-white" : "text-slate-300 hover:bg-ink-800"}`}>{STAGE_LABEL[s]}</button>)}</div>
        </nav>

        {/* CENTER */}
        <section className="relative flex min-h-0 flex-col" aria-label="3D viewport">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-900 px-2 py-1 text-xs">
            <label className="flex items-center gap-1 text-slate-400">View<select value={opts.shade} onChange={(e) => setOpts({ ...opts, shade: e.target.value as ViewOpts["shade"] })} data-testid="shade"><option value="solid">Solid</option><option value="wire">Wireframe</option><option value="solidwire">Solid + wire</option><option value="points">Points</option></select></label>
            <label className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={opts.colors} onChange={(e) => setOpts({ ...opts, colors: e.target.checked })} data-testid="t-colors" />Colours</label>
            <label className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={opts.flat} onChange={(e) => setOpts({ ...opts, flat: e.target.checked })} data-testid="t-flat" />Flat shading</label>
            <label className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={opts.bbox} onChange={(e) => setOpts({ ...opts, bbox: e.target.checked })} data-testid="t-bbox" />Box</label>
            <label className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={opts.grid} onChange={(e) => setOpts({ ...opts, grid: e.target.checked })} data-testid="t-grid" />Grid</label>
            <label className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={opts.zUp} onChange={(e) => setOpts({ ...opts, zUp: e.target.checked })} data-testid="t-zup" />Z-up</label>
            <label className="flex items-center gap-1 text-slate-300">Point size<input type="range" min={1} max={8} value={opts.pointSize} onChange={(e) => setOpts({ ...opts, pointSize: Number(e.target.value) })} className="w-20" data-testid="ptsize" /></label>
            <span className="ml-auto flex items-center gap-1"><span className="text-slate-400">Compare</span>
              <select value={compare.mode} onChange={(e) => setCompare({ ...compare, mode: e.target.value as CompareState["mode"] })} data-testid="cmp-mode"><option value="single">Off</option><option value="slider">Slider</option><option value="split">Side by side</option></select>
              {compare.mode !== "single" && <>
                <select value={compare.a} onChange={(e) => setCompare({ ...compare, a: e.target.value })} data-testid="cmp-a">{stagesAvail.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select><span className="text-slate-500">vs</span>
                <select value={compare.b} onChange={(e) => setCompare({ ...compare, b: e.target.value })} data-testid="cmp-b">{stagesAvail.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></>}</span>
          </div>
          {error && <div role="alert" className="flex items-start gap-2 border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-200" data-testid="error"><span className="flex-1">{error}</span><button onClick={() => setError("")} aria-label="Dismiss">✕</button></div>}
          <div className="min-h-0 flex-1"><Viewport stages={stageData} opts={opts} compare={compare} setCompare={setCompare} active={active} resetKey={resetKey} loading={loading} /></div>
          <div className="flex items-center gap-4 border-t border-ink-700 bg-ink-900 px-3 py-1 text-[11px] text-slate-400" data-testid="status-bar">
            <span>{STAGE_LABEL[active]}: {cur ? (cur.kind === "cloud" ? `${int(cur.points ?? 0)} points` : `${int(cur.vertices ?? 0)} vertices · ${int(cur.faces ?? 0)} faces`) : "-"}</span>{cur && <span>Size {cur.size.map((v) => fmt(v, 4)).join(" × ")}</span>}
            {stageData[active]?.decimated && <span className="text-amber-300">Display decimated ({int(stageData[active]!.count)} of {int(stageData[active]!.total ?? stageData[active]!.total_faces ?? 0)}); processing uses the full data</span>}</div>
        </section>

        {/* RIGHT SIDEBAR */}
        <aside className="overflow-auto border-l border-ink-700 bg-ink-900" aria-label="Parameters">
          {settings && section === "import" && <ImportPanel project={project} busy={disabled} onFiles={onFiles} onSample={onSample} inspect={inspect} />}
          {settings && section === "clean" && <CleanPanel s={settings} set={(fn) => setSettings((s) => fn(s!))} run={startClean} disabled={disabled || !o} bbox={o ? { min: o.bbox_min, max: o.bbox_max } : undefined} />}
          {settings && section === "recon" && <ReconPanel s={settings} set={(fn) => setSettings((s) => fn(s!))} run={() => start("reconstruct", settings.reconstruct)} disabled={disabled || !o} caps={caps} rec={rec} onRecommend={recommend} hasMesh={o?.kind === "mesh"} />}
          {settings && section === "refine" && <RefinePanel s={settings} set={(fn) => setSettings((s) => fn(s!))} run={startRefine} disabled={disabled || !(project?.stages.reconstructed || o?.kind === "mesh")} preview={() => start("subdivision_preview", { iterations: 1 })} />}
          {settings && section === "texture" && <TexturePanel s={settings} set={(fn) => setSettings((s) => fn(s!))} run={() => start("color", settings.color)} disabled={disabled || !(project?.stages.reconstructed || project?.stages.refined || o?.kind === "mesh")} project={project} />}
          {section === "validate" && <ValidatePanel stage={valStage} setStage={(s) => { setValStage(s); setReport(null); }} stages={stagesAvail.filter((s) => s !== "preview")} report={report} busy={busy} run={runValidate} />}
          {section === "export" && <ExportPanel project={project} caps={caps} onError={fail} onLog={(m) => log(m)} />}
          <Panel title="Quality metrics">
            {cur ? <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs" data-testid="metrics"><dt className="text-slate-400">Stage</dt><dd>{STAGE_LABEL[active]}</dd>
              {cur.kind === "cloud" ? <><dt className="text-slate-400">Points</dt><dd>{int(cur.points ?? 0)}</dd></> : <><dt className="text-slate-400">Vertices</dt><dd>{int(cur.vertices ?? 0)}</dd><dt className="text-slate-400">Polygons</dt><dd>{int(cur.faces ?? 0)}</dd></>}
              <dt className="text-slate-400">Size</dt><dd>{cur.size.map((v) => fmt(v, 4)).join(" × ")}</dd><dt className="text-slate-400">Colours</dt><dd>{cur.has_colors ? "yes" : "no"}</dd>
              {prevStage && project?.stages[prevStage] && <><dt className="text-slate-400">Size vs {STAGE_LABEL[prevStage].toLowerCase()}</dt><dd data-testid="m-sizechg">{cur.size.map((v, i) => `${fmt(((v - project.stages[prevStage]!.size[i]) / project.stages[prevStage]!.size[i]) * 100, 2)}%`).join(", ")}</dd></>}</dl> : <p className="text-xs text-slate-500">Nothing loaded yet.</p>}
            <p className="mt-2 text-[11px] text-slate-500">Open “Mesh Validation” for the full report.</p>
          </Panel>
        </aside>
      </main>

      {/* BOTTOM */}
      <footer className="flex min-h-0 flex-col border-t border-ink-700 bg-ink-900" aria-label="Task panel">
        <div className="flex items-center gap-1 border-b border-ink-700 px-2 text-xs">{(["progress", "history", "console"] as const).map((t) => <button key={t} onClick={() => setTab(t)} data-testid={`tab-${t}`} className={`px-3 py-1.5 ${tab === t ? "border-b-2 border-accent text-white" : "text-slate-400 hover:text-slate-200"}`}>{{ progress: "Progress", history: "Operation history", console: "Console" }[t]}</button>)}
          <span className="ml-auto pr-2 text-slate-400" data-testid="task-status">{running ? `Running: ${job?.op}` : job ? `${job.op}: ${job.state}` : "Idle"}</span></div>
        <div className="min-h-0 flex-1 overflow-auto p-2 text-xs">
          {tab === "progress" && <div><div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded bg-ink-700"><div className="h-full bg-accent transition-all" style={{ width: `${(job ? job.fraction : 0) * 100}%` }} data-testid="progress-bar" /></div><span className="w-12 text-right tabular-nums" data-testid="progress-pct">{Math.round((job ? job.fraction : 0) * 100)}%</span>
            <button className={BTN} onClick={cancel} disabled={!running} data-testid="cancel">Cancel</button></div>
            <p className="mt-2 text-slate-300" data-testid="progress-stage">{job ? `${job.stage || (job.state === "running" ? "Working…" : job.state)}${job.state === "done" ? ` — finished in ${job.elapsed} s` : ""}${job.state === "error" ? ` — ${job.error}` : ""}` : "No task running."}</p></div>}
          {tab === "history" && <ol className="space-y-0.5" data-testid="history">{(project?.history ?? []).map((h) => <li key={h.id} className={`flex gap-2 ${h.current ? "text-white" : h.future ? "text-slate-600 line-through" : "text-slate-400"}`}><span className="w-4">{h.current ? "▶" : ""}</span><span className="flex-1">{h.label}</span><span className="tabular-nums">{h.seconds ? `${h.seconds}s` : ""}</span></li>)}</ol>}
          {tab === "console" && <div className="font-mono text-[11px]" data-testid="console">{lines.map((l, i) => <div key={i} className={l.level === "error" ? "text-red-300" : l.level === "warn" ? "text-amber-300" : "text-slate-300"}><span className="text-slate-600">{l.t}</span> {l.message}</div>)}</div>}
        </div>
      </footer>
    </div>
  );
}
