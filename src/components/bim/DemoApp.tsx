"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisModel, Issue } from "@/lib/bim/demos/types";
import type { Plan3dModel } from "@/lib/bim/pipeline-types";
import { SUITE_DISCLAIMER, SUITE_MAP } from "@/lib/bim/suite";
import type { Branding } from "@/lib/types";
import DemoShell from "@/components/demos/DemoShell";
import { api, saved, type ArtifactRec, type Auth, type FileRec, type JobRec, type ProjectRec, type SampleRec } from "./api";
import AnalysisPanel from "./AnalysisPanel";
import CloudViewer from "./CloudViewer";
import { UI, type ResultTab, type UiCfg } from "./demo-ui";
import MeshViewer from "./MeshViewer";
import ModelWorkspace from "./ModelWorkspace";
import { CadForm, CloudForm, FloorplanForm, MepForm, QcForm, QtoForm, StructForm } from "./ParamsForms";
import PlanView2D from "./PlanView2D";
import Preview2D from "./Preview2D";
import { BTN, CARD, FIELD, GO, H3, Tabs, mb, msg } from "./ui";

type Model = Plan3dModel | AnalysisModel; type Step = "source" | "results" | "params" | "output";
const isPlan = (m: Model | null): m is Plan3dModel => !!m && m.kind === "plan3d";
const TAB_LABEL: Record<ResultTab, string> = { "3d": "3D model", plan2d: "2D plan", draw2d: "2D drawing", mesh3d: "3D view", cloud: "Point cloud", analysis: "Analysis" };

export default function DemoApp({ branding, slug }: { branding: Branding; slug: string }) {
  const d = SUITE_MAP[slug]; const cfg = UI[d.key] as UiCfg; const demo = d.key;
  const [auth, setAuth] = useState<Auth | null>(null); const [project, setProject] = useState<ProjectRec | null>(null); const [model, setModel] = useState<Model | null>(null); const [step, setStep] = useState<Step>("source"); const [tab, setTab] = useState<ResultTab>(cfg.tabs[0]); const [busy, setBusy] = useState(""); const [toast, setToast] = useState<{ m: string; bad: boolean } | null>(null);
  const [samples, setSamples] = useState<SampleRec[]>([]); const [history, setHistory] = useState<Awaited<ReturnType<typeof api.list>>["projects"]>([]); const authRef = useRef<Auth | null>(null); authRef.current = auth; const [job, setJob] = useState<JobRec | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null); const [focus2d, setFocus2d] = useState<{ x: number; y: number } | null>(null); const [selIssue, setSelIssue] = useState<string | null>(null);
  const notify = useCallback((m: string, bad = false) => { setToast({ m, bad }); window.setTimeout(() => setToast((t) => (t?.m === m ? null : t)), 6500); }, []);
  const loadHistory = useCallback(async () => { const items = saved.list(demo); if (!items.length) return setHistory([]); try { const r = await api.list(items.map((i) => ({ id: i.id, key: i.key })), demo); setHistory(r.projects); const alive = new Set(r.projects.map((p) => p.id)); items.filter((i) => !alive.has(i.id)).forEach((i) => saved.remove(i.id)); } catch { /* offline */ } }, [demo]);
  useEffect(() => { void loadHistory(); api.samples(demo).then((r) => setSamples(r.samples)).catch(() => undefined); }, [loadHistory, demo]);
  const reload = useCallback(async (a: Auth, withModel = true) => { const { project: p } = await api.get(a); if (authRef.current?.id !== a.id) return; setProject(p); saved.put({ id: a.id, key: a.key, name: p.name, demo, updatedAt: p.updatedAt }); if (withModel && p.modelMeta) { try { const m = (await api.model(a)) as unknown as Model; if (authRef.current?.id === a.id) setModel(m); } catch { /* none yet */ } } else if (!p.modelMeta) setModel(null); }, [demo]);
  const open = useCallback(async (id: string, key: string, to?: Step) => { const a = { id, key }; authRef.current = a; setAuth(a); setModel(null); setJob(null); try { await reload(a); const p = (await api.get(a)).project; setStep(to ?? (p.modelMeta ? "results" : "source")); } catch (e) { notify(msg(e), true); setAuth(null); authRef.current = null; saved.remove(id); } }, [reload, notify]);
  const create = async (name: string) => { const r = await api.create(demo, name); saved.put({ id: r.project.id, key: r.key, name, demo, updatedAt: Date.now() }); return { id: r.project.id, key: r.key }; };
  const regenerate = useCallback(async (patch?: Record<string, unknown>) => { const a = authRef.current; if (!a) return; setBusy("process"); try { const r = await api.process(a, patch); setJob(r.job); if (r.job.status === "failed") notify(r.job.error ?? "Processing failed", true); else { await reload(a); if ((r.job.summary?.needsInput as number) > 0) { notify("More information is needed before the result can be generated.", false); setStep("source"); } else if (patch) notify("Re-run complete."); } } catch (e) { notify(msg(e), true); } finally { setBusy(""); } }, [reload, notify]);
  const startSample = async (s: SampleRec) => { setBusy(`sample:${s.id}`); try { const a = await create(s.name); await api.sample(a, s.id); authRef.current = a; setAuth(a); setStep("source"); setTab(cfg.tabs[0]); await reload(a, false); const pr = await api.process(a); setJob(pr.job); await reload(a); if (pr.job.status === "completed" && !(pr.job.summary?.needsInput as number)) setStep("results"); else if (pr.job.status === "failed") notify(pr.job.error ?? "Processing failed", true); } catch (e) { notify(msg(e), true); } finally { setBusy(""); } };
  const startBlank = async () => { setBusy("blank"); try { const a = await create("My project"); await open(a.id, a.key, "source"); } catch (e) { notify(msg(e), true); } finally { setBusy(""); } };
  const closeProject = () => { setAuth(null); authRef.current = null; setProject(null); setModel(null); setJob(null); void loadHistory(); };
  const removeProject = async () => { const a = authRef.current; if (!a) return; try { await api.del(a); saved.remove(a.id); notify("Project, files, results and exports were deleted."); closeProject(); } catch (e) { notify(msg(e), true); } };
  useEffect(() => { if (model && !cfg.tabs.includes(tab)) setTab(cfg.tabs[0]); }, [model, cfg, tab]);

  const avail = useMemo(() => cfg.tabs.filter((t) => { if (!model) return false; if (t === "analysis") return !!model.ext; if (isPlan(model)) return (t === "3d" && model.meshes.length > 0) || (t === "plan2d" && !!model.building); return (t === "draw2d" && !!model.preview2d) || (t === "mesh3d" && model.meshes.length > 0) || (t === "cloud" && !!model.cloud); }), [model, cfg]);
  const gotoElement = (id: string) => { if (!model) return; if (isPlan(model) && model.meshes.length) { setTab("3d"); setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })); } else if (!isPlan(model) && model.meshes.length) { setTab("mesh3d"); setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })); } };
  const onIssue = (i: Issue) => { setSelIssue(i.id); if (i.element && model && ((isPlan(model) && model.meshes.some((m) => m.id === i.element)) || (!isPlan(model) && model.meshes.some((m) => m.id === i.element)))) return gotoElement(i.element); if (i.location && !isPlan(model!) && model!.preview2d) { setTab("draw2d"); setFocus2d({ x: i.location[0], y: i.location[1] }); } else if (i.location && isPlan(model!) && model!.building) { setTab("plan2d"); setFocus2d({ x: i.location[0], y: i.location[1] }); } };
  const status = project ? `${project.sampleOnly ? "sample" : "user upload"} · v${project.version}${busy === "process" ? " · processing…" : ""}` : "No project open";
  const STEPS: { id: Step; label: string; hint: string }[] = [{ id: "source", label: "Source", hint: "Upload & process" }, { id: "results", label: "Results", hint: avail.map((t) => TAB_LABEL[t]).join(" · ") || "Views & analysis" }, ...(cfg.params ? [{ id: "params" as Step, label: cfg.paramsLabel ?? "Parameters", hint: "Configure & re-run" }] : []), { id: "output", label: "Output", hint: "Export · save · history" }];
  return (
    <DemoShell branding={branding} app={d.title} project={project ? project.name : "No project open"} status={status} back={{ href: "/cad-bim-suite", label: "CAD/BIM suite", all: "← All 11 apps" }} contact="/contact?division=cad-bim" badge="Full-stack CAD/BIM demo" footer={`${SUITE_DISCLAIMER} ${cfg.footer}`} actions={project ? <button type="button" className={BTN} onClick={closeProject}>All projects</button> : undefined}>
      <div className="min-h-[70vh] p-3 sm:p-4">
        {toast && <div role="status" aria-live="polite" className={`fixed bottom-4 left-1/2 z-[80] w-[min(94vw,38rem)] -translate-x-1/2 rounded-lg px-4 py-3 text-sm shadow-lg ${toast.bad ? "bg-red-800 text-white" : "bg-slate-100 text-slate-900"}`}>{toast.m}</div>}
        {!project || !auth ? <Landing cfg={cfg} no={d.no} samples={samples} history={history} busy={busy} startSample={startSample} startBlank={startBlank} open={open} demo={demo} /> : (
          <div className="mx-auto max-w-[110rem]">
            <nav aria-label="Workflow" className="mb-3 overflow-x-auto"><ol className="flex min-w-max gap-1.5">{STEPS.map((s, i) => { const done = s.id === "source" ? project.files.length > 0 : s.id === "output" ? project.artifacts.length > 0 : !!model; return <li key={s.id}><button type="button" data-testid={`step-${s.id}`} onClick={() => setStep(s.id)} aria-current={step === s.id ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left ${step === s.id ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-900 text-slate-200 hover:border-blue-500"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === s.id ? "bg-white text-blue-700" : done ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200"}`}>{done && step !== s.id ? "✓" : i + 1}</span><span><span className="block text-sm font-semibold leading-tight">{s.label}</span><span className={`block text-xs ${step === s.id ? "text-blue-100" : "text-slate-400"}`}>{s.hint}</span></span></button></li>; })}</ol></nav>
            {step === "source" && <SourceStep cfg={cfg} auth={auth} project={project} model={model} job={job} busy={busy} reload={() => reload(auth, false)} regenerate={regenerate} notify={notify} />}
            {step === "results" && (model ? (
              <div className="space-y-3">
                <Tabs label="Result views" value={tab} onChange={setTab} items={avail.map((t) => ({ id: t, label: TAB_LABEL[t], badge: t === "analysis" ? model.ext?.issues.length : undefined }))} />
                {tab === "3d" && isPlan(model) && <ModelWorkspace model={model} auth={auth} onRegenerate={regenerate} busy={busy === "process"} onToast={notify} focus={focus} />}
                {tab === "plan2d" && isPlan(model) && <div className="h-[min(70vh,44rem)] min-h-[22rem]"><PlanView2D analysis={model.planAnalysis} building={model.building} hiddenLayers={new Set()} showInterpreted showRooms onSelect={gotoElement} selectedId={null} /></div>}
                {tab === "draw2d" && !isPlan(model) && model.preview2d && <Preview2D data={model.preview2d} focus={focus2d} />}
                {tab === "mesh3d" && !isPlan(model) && <MeshViewer meshes={model.meshes} elements={model.elements} focus={focus} />}
                {tab === "cloud" && !isPlan(model) && model.cloud && <CloudTab model={model} />}
                {tab === "analysis" && model.ext && <AnalysisPanel ext={model.ext} assumptions={isPlan(model) ? [...model.assumptions, ...(model.building?.assumptions ?? [])] : model.assumptions} warnings={model.warnings} limitations={model.limitations} onElement={avail.some((t) => t === "3d" || t === "mesh3d") ? gotoElement : undefined} onIssue={onIssue} selected={selIssue} />}
              </div>) : <div className={CARD}><p className="text-sm text-slate-300">No result yet. Add a file in Source and run it.</p><button type="button" className={`${GO} mt-3`} onClick={() => setStep("source")}>Go to Source</button></div>)}
            {step === "params" && (model ? <Params cfg={cfg} model={model} apply={regenerate} busy={busy === "process"} /> : <div className={CARD}><p className="text-sm text-slate-300">Run the project once to configure it.</p></div>)}
            {step === "output" && <OutputStep auth={auth} project={project} hasModel={!!model} reload={() => reload(auth, false)} regenerate={regenerate} notify={notify} remove={removeProject} close={closeProject} refreshModel={() => reload(auth)} />}
          </div>)}
      </div>
    </DemoShell>
  );
}
function CloudTab({ model }: { model: AnalysisModel }) { const [pl, setPl] = useState<number | null>(null); const p = pl !== null ? model.cloud!.planes[pl] : null; return <div className="space-y-3"><CloudViewer cloud={model.cloud!} selectedPlane={pl} onSelectPlane={setPl} />{p && <div className={CARD} data-testid="plane-detail"><h3 className={H3}>Plane P{p.id + 1}: {p.label}</h3><dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-slate-400">Normal</dt><dd>{p.normal.join(", ")}</dd></div><div><dt className="text-slate-400">Equation n·p + d = 0, d</dt><dd>{p.d}</dd></div><div><dt className="text-slate-400">Inliers</dt><dd>{p.count.toLocaleString("en-US")}</dd></div><div><dt className="text-slate-400">RMS residual</dt><dd>{(p.rms * 1000).toFixed(2)} mm</dd></div><div><dt className="text-slate-400">Occupied area</dt><dd>{p.area} m²</dd></div><div><dt className="text-slate-400">Extent</dt><dd>{p.extent.join(" × ")} m</dd></div><div><dt className="text-slate-400">Centroid</dt><dd>{p.centroid.join(", ")}</dd></div></dl></div>}</div>; }
function Params({ cfg, model, apply, busy }: { cfg: UiCfg; model: Model; apply: (p: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const k = cfg.params; return <div className="mx-auto max-w-5xl">{k === "qc" && <QcForm model={model} apply={apply} busy={busy} />}{k === "qto" && <QtoForm model={model} apply={apply} busy={busy} />}{k === "floorplan" && <FloorplanForm model={model} apply={apply} busy={busy} />}{k === "structural" && <StructForm model={model} apply={apply} busy={busy} />}{k === "cloud" && <CloudForm model={model} apply={apply} busy={busy} />}{k === "cad" && <CadForm model={model} apply={apply} busy={busy} />}{k === "mep" && <MepForm model={model} apply={apply} busy={busy} />}</div>;
}

/* ───────── landing ───────── */
function Landing({ cfg, no, samples, history, busy, startSample, startBlank, open, demo }: { cfg: UiCfg; no: string; samples: SampleRec[]; history: Awaited<ReturnType<typeof api.list>>["projects"]; busy: string; startSample: (s: SampleRec) => void; startBlank: () => void; open: (id: string, key: string) => void; demo: string }) {
  const keys = useMemo(() => Object.fromEntries(saved.list(demo).map((s) => [s.id, s.key])), [history, demo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-6xl space-y-5 py-4">
      <section className="grid items-center gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div><p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">CAD / BIM · demo {no} of 11</p><h2 className="mt-2 font-display text-3xl font-bold leading-tight text-white sm:text-4xl">{cfg.heroTitle}</h2><p className="mt-3 max-w-2xl text-base text-slate-300">{cfg.heroBody}</p>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={`${GO} !px-5 !py-2.5 !text-sm`} disabled={!!busy} onClick={startBlank} data-testid="start-blank">{busy === "blank" ? "Creating…" : "Upload my own file"}</button>{samples[0] && <button type="button" className="rounded-md border border-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600/30 disabled:opacity-50" disabled={!!busy} onClick={() => startSample(samples[0])} data-testid="start-sample">{busy === `sample:${samples[0].id}` ? "Working…" : cfg.cta}</button>}</div>
          <p className="mt-3 text-sm text-slate-400">Everything shown is computed from the file by the server. Sample files are synthetic with known content and are labelled as samples.</p></div>
        <div className={CARD}><h3 className={H3}>Supported input</h3><table className="mt-2 w-full text-sm"><tbody>{cfg.support.map(([f, s, n]) => <tr key={f} className="border-t border-slate-800 align-top"><th className="w-[30%] py-1.5 pr-2 text-left font-semibold text-slate-200">{f}</th><td className="py-1.5 pr-2 text-emerald-300">{s}</td><td className="py-1.5 text-slate-400">{n}</td></tr>)}</tbody></table></div>
      </section>
      <section className={CARD} aria-label="Sample projects"><h3 className={H3}>Sample projects</h3><div className="mt-2 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{samples.map((s) => <div key={s.id} className="flex flex-col rounded-lg border border-slate-800 p-3"><p className="font-semibold text-white">{s.name}</p><p className="mt-1 flex-1 text-sm text-slate-400">{s.description}</p><p className="mt-1 text-xs text-slate-500">{s.files.map((f) => f.name).join(" · ")}</p><button type="button" className={`${BTN} mt-2 self-start`} disabled={!!busy} onClick={() => startSample(s)} data-testid={`sample-${s.id}`}>{busy === `sample:${s.id}` ? "Working…" : "Open sample"}</button></div>)}</div></section>
      <section className={CARD} aria-label="Your projects"><h3 className={H3}>Your projects</h3>{history.length === 0 ? <p className="mt-1 text-sm text-slate-400">Projects you create in this browser are saved on the server and reappear here.</p> : <ul className="mt-2 divide-y divide-slate-800">{history.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1"><b className="text-white">{p.name}</b> <span className="text-slate-400">· v{p.version} · {p.fileCount} file(s) · {p.sampleOnly ? "sample" : "user upload"} · {new Date(p.updatedAt).toLocaleDateString("en-GB")}</span></span><button type="button" className={BTN} onClick={() => keys[p.id] && open(p.id, keys[p.id])}>Open</button></li>)}</ul>}</section>
    </div>
  );
}

/* ───────── source ───────── */
function SourceStep({ cfg, auth, project, model, job, busy, reload, regenerate, notify }: { cfg: UiCfg; auth: Auth; project: ProjectRec; model: Model | null; job: JobRec | null; busy: string; reload: () => Promise<void>; regenerate: (p?: Record<string, unknown>) => Promise<void>; notify: (m: string, bad?: boolean) => void }) {
  const [prog, setProg] = useState<Record<string, number>>({}); const [err, setErr] = useState<Record<string, string>>({}); const [over, setOver] = useState("");
  const send = async (role: string, file: File) => { setErr((e) => ({ ...e, [role]: "" })); setProg((p) => ({ ...p, [role]: 0 })); try { const r = await api.upload(auth, file, file.name, role, (f) => setProg((p) => ({ ...p, [role]: f }))); if (r.validation.warnings.length) notify(r.validation.warnings[0]); await reload(); } catch (e) { setErr((x) => ({ ...x, [role]: msg(e) })); } finally { setProg((p) => { const { [role]: _r, ...rest } = p; void _r; return rest; }); } };
  const needs = model?.needsInput ?? []; const have = (role: string) => project.files.find((f) => f.role === role);
  return (
    <div className="grid gap-3 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
      {cfg.slots.map((s) => { const f = have(s.role); return (
        <div key={s.role} className={`${CARD} flex flex-col`} onDragOver={(e) => { e.preventDefault(); setOver(s.role); }} onDragLeave={() => setOver("")} onDrop={(e) => { e.preventDefault(); setOver(""); const file = e.dataTransfer.files[0]; if (file) void send(s.role, file); }} style={over === s.role ? { borderColor: "#10b981" } : undefined}>
          <h3 className={H3}>{s.title}</h3><p className="mt-1 text-sm text-slate-400">{s.help}</p>
          {f ? <FileCard f={f} onDelete={async () => { try { await api.delFile(auth, f.id); await reload(); } catch (e) { notify(msg(e), true); } }} /> : <p className="mt-3 rounded border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">Drop a file here or choose one</p>}
          {prog[s.role] !== undefined && <div className="mt-2" role="progressbar" aria-valuenow={Math.round(prog[s.role] * 100)}><div className="h-1.5 rounded bg-slate-800"><div className="h-full rounded bg-emerald-500" style={{ width: `${prog[s.role] * 100}%` }} /></div><p className="mt-1 text-xs text-slate-400">{prog[s.role] < 1 ? `Uploading ${Math.round(prog[s.role] * 100)}%` : "Validating…"}</p></div>}
          {err[s.role] && <p role="alert" className="mt-2 rounded bg-red-900/40 p-2 text-sm text-red-200">{err[s.role]}</p>}
          <label className={`${BTN} mt-3 inline-block cursor-pointer self-start`}>Choose file…<input type="file" hidden accept={s.accept} data-testid={`bim-file-${s.role}`} onChange={(e) => { const x = e.target.files?.[0]; if (x) void send(s.role, x); e.target.value = ""; }} /></label>
        </div>); })}
      <div className={CARD}>
        <h3 className={H3}>{cfg.slots.length + 1} · Run</h3>
        <button type="button" className={`${GO} mt-2 w-full !py-2.5 !text-sm`} disabled={busy === "process" || !project.files.length} onClick={() => regenerate()} data-testid="bim-generate">{busy === "process" ? "Processing…" : project.modelMeta ? "Run again" : cfg.generate}</button>
        <p className="mt-2 text-sm text-slate-400">Runs on the server against the stored files. The stages below are the real stages with real timings.</p>
        {job && <ol className="mt-3 space-y-0.5 text-xs" aria-label="Processing stages">{job.stages.map((s, i) => <li key={i} className="flex justify-between gap-2"><span className="text-slate-200">{s.stage}{s.note ? <span className="text-slate-500"> — {s.note}</span> : null}</span><span className="tabular-nums text-slate-500">{s.ms} ms</span></li>)}<li className={job.status === "failed" ? "text-red-300" : "text-emerald-300"} data-testid="job-status">{job.status === "failed" ? `Failed: ${job.error}` : `Completed in ${(job.finishedAt ?? Date.now()) - job.startedAt} ms`}</li></ol>}
        {needs.length > 0 && <Needs model={model!} regenerate={regenerate} busy={busy === "process"} />}
        {project.files.length === 0 && <p className="mt-3 rounded bg-slate-800 p-2 text-sm text-slate-300">Upload a file, or go back to All projects and open a sample.</p>}
      </div>
    </div>
  );
}
function FileCard({ f, onDelete }: { f: FileRec; onDelete: () => void }) {
  return <div className="mt-3 rounded border border-slate-700 p-3 text-sm"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{f.name}</p><p className="text-slate-400">{f.format.toUpperCase()} · {mb(f.size)} · <span className={f.sample ? "text-fuchsia-300" : "text-emerald-300"}>{f.sample ? "sample file" : "your upload"}</span></p></div><button type="button" className={BTN} onClick={onDelete}>Remove</button></div>
    <p className="mt-1 text-slate-300">Support: <b>{f.validation.support}</b>{Object.entries(f.validation.info).filter(([k]) => k !== "bytes").map(([k, v]) => ` · ${k} ${v}`).join("")}</p>{f.validation.warnings.map((w) => <p key={w} className="mt-1 text-amber-300">⚠ {w}</p>)}</div>;
}
function Needs({ model, regenerate, busy }: { model: Model; regenerate: (p?: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [val, setVal] = useState<Record<string, string>>({});
  return <div className="mt-3 space-y-3 rounded border border-amber-500/50 bg-amber-500/10 p-3" role="group" aria-label="Information needed">{model.needsInput.map((n) => <div key={n.field}><p className="text-sm font-semibold text-amber-200">{n.question}</p>{n.options && <div className="mt-1 flex flex-wrap gap-1.5">{n.options.map((o) => <button key={o.value} type="button" className={BTN} onClick={() => setVal({ ...val, [n.field]: String(o.value) })}>{o.label}</button>)}</div>}<input aria-label={n.field} className={`${FIELD} mt-1.5`} inputMode="decimal" placeholder="value" value={val[n.field] ?? ""} onChange={(e) => setVal({ ...val, [n.field]: e.target.value })} /></div>)}<button type="button" className={GO} disabled={busy || model.needsInput.some((n) => !(Number(val[n.field]) > 0))} onClick={() => regenerate(Object.fromEntries(model.needsInput.map((n) => [n.field, Number(val[n.field])])))}>Apply and run</button></div>;
}

/* ───────── output ───────── */
function OutputStep({ auth, project, hasModel, reload, regenerate, notify, remove, close, refreshModel }: { auth: Auth; project: ProjectRec; hasModel: boolean; reload: () => Promise<void>; regenerate: (p?: Record<string, unknown>) => Promise<void>; notify: (m: string, bad?: boolean) => void; remove: () => void; close: () => void; refreshModel: () => Promise<void> }) {
  const [formats, setFormats] = useState<{ format: string; label: string; note: string }[]>([]); const [arts, setArts] = useState<ArtifactRec[]>(project.artifacts); const [busy, setBusy] = useState(""); const [hist, setHist] = useState<{ version: number; at: number }[]>([]); const [name, setName] = useState(project.name); const [confirm, setConfirm] = useState(false);
  useEffect(() => { api.exportFormats(auth).then((r) => { setFormats(r.formats); setArts(r.artifacts); }).catch(() => undefined); api.history(auth).then((r) => setHist(r.history)).catch(() => undefined); }, [auth, project.version]);
  const make = async (f: string) => { setBusy(f); try { const r = await api.makeExport(auth, f); setArts((a) => [r.artifact, ...a.filter((x) => x.id !== r.artifact.id)]); notify(`${r.artifact.name} is ready (${mb(r.artifact.size)}). ${r.note}`); await reload(); } catch (e) { notify(msg(e), true); } finally { setBusy(""); } };
  const rename = async () => { if (name.trim() && name !== project.name) { try { await api.patch(auth, { name: name.trim() }); await reload(); } catch (e) { notify(msg(e), true); } } };
  const restore = async (body: { version?: number; reset?: boolean }, ok: string, key: string) => { setBusy(key); try { const r = await api.restore(auth, body); if (r.job.status === "failed") notify(r.job.error ?? "Failed", true); else { notify(ok); await refreshModel(); } } catch (e) { notify(msg(e), true); } finally { setBusy(""); } };
  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <section className={CARD}><h3 className={H3}>Export</h3><p className="mt-1 text-sm text-slate-400">Only exports this result can really produce are listed. Each file is generated on the server from the stored result.</p>
        {!hasModel ? <p className="mt-3 text-sm text-slate-300">Run the project first.</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{formats.map((f) => <li key={f.format} className="flex flex-col rounded border border-slate-800 p-2.5"><p className="font-semibold text-white">{f.label}</p><p className="flex-1 text-xs text-slate-400">{f.note}</p><button type="button" className={`${BTN} mt-2 self-start`} disabled={!!busy} onClick={() => make(f.format)} data-testid={`bim-export-${f.format}`}>{busy === f.format ? "Generating…" : "Generate"}</button></li>)}</ul>}</section>
      <div className="space-y-3">
        <section className={CARD}><h3 className={H3}>Downloads</h3>{arts.length === 0 ? <p className="mt-2 text-sm text-slate-400">No files generated yet.</p> : <ul className="mt-2 space-y-1.5">{arts.map((a) => <li key={a.id} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate text-slate-100">{a.name} <span className="text-slate-500">· {mb(a.size)}{a.sample ? " · sample" : ""}</span></span><button type="button" className={BTN} onClick={() => api.download(auth, a).catch((e) => notify(msg(e), true))} data-testid={`bim-download-${a.kind}`}>Download</button></li>)}</ul>}</section>
        <section className={CARD}><h3 className={H3}>Project</h3><div className="mt-2"><input aria-label="Project name" className={FIELD} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={rename} /></div><p className="mt-2 text-sm text-slate-400">Saved on the server (v{project.version}); reopen it any time from this browser. Kept for {Math.round((project.expiresAt - project.createdAt) / 3600_000)} hours, then deleted automatically.</p>
          <h4 className="mt-3 text-sm font-semibold text-slate-300">Undo / history</h4><div className="mt-1 flex flex-wrap gap-1.5"><button type="button" className={BTN} disabled={!!busy} onClick={() => restore({ reset: true }, "Parameters were reset to defaults and the result regenerated.", "reset")}>Reset parameters</button>{hist.slice(-4).reverse().map((h) => <button key={h.version} type="button" className={BTN} disabled={!!busy} onClick={() => restore({ version: h.version }, `Settings of version ${h.version} restored.`, "h" + h.version)}>Restore v{h.version} settings</button>)}</div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={BTN} onClick={close}>Save & close</button>{!confirm ? <button type="button" className="rounded-md border border-red-500/60 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10" onClick={() => setConfirm(true)}>Delete project…</button> : <><button type="button" className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white" onClick={remove}>Yes, delete everything</button><button type="button" className={BTN} onClick={() => setConfirm(false)}>Cancel</button></>}</div></section>
        {hasModel && <section className={CARD}><button type="button" className={BTN} onClick={() => regenerate()} disabled={busy !== ""}>Re-run processing</button></section>}
      </div>
    </div>
  );
}
