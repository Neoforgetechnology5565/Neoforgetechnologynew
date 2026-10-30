"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { RoofApiError, roofApi, type Health } from "@/lib/roof/api";
import { browserRoof } from "@/lib/roof/browser/engine";
import { estimate } from "@/lib/roof/estimate";
import { ScaleError, measurePolygon, pitchFrom, resolveScale, type Scale } from "@/lib/roof/measure";
import type { ImageEntry, ImageResult, JobResults, Measurements, Region, SampleInfo, ScaleSpec, XY } from "@/lib/roof/types";
import { UNITS, UNIT_LABEL, areaFromM2, fmtArea, fmtLen, toMetres, type Unit } from "@/lib/roof/units";
import RoofViewer, { type Layers, type Tool, type UserShape, type ViewerHandle } from "./RoofViewer";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const INPUT = "w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100";
const ACCEPT = "image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff";
type Status = "idle" | "uploading" | "queued" | "running" | "completed" | "stopped" | "failed";
type Workflow = "georeferenced" | "calibrated" | "noscale";
interface Pick { key: string; name: string; file?: File; sample?: SampleInfo; preview: string }
const download = (name: string, body: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); };
const num = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };

export default function RoofApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? roofApi(serviceUrl) : browserRoof()), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">("unknown"); const [health, setHealth] = useState<Health | null>(null); const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]); const [active, setActive] = useState(0);
  const [workflow, setWorkflow] = useState<Workflow>("georeferenced"); const [unit, setUnit] = useState<Unit>("m");
  const [gsd, setGsd] = useState(""); const [pitchMode, setPitchMode] = useState<"rise" | "deg">("rise"); const [pitchVal, setPitchVal] = useState(""); const [roofType, setRoofType] = useState("unknown"); const [view, setView] = useState("nadir");
  const [threshold, setThreshold] = useState(0.5); const [minArea, setMinArea] = useState(150);
  const [status, setStatus] = useState<Status>("idle"); const [error, setError] = useState(""); const [stage, setStage] = useState(""); const [pct, setPct] = useState(0);
  const [entries, setEntries] = useState<ImageEntry[]>([]); const [urls, setUrls] = useState<Record<string, Record<string, string>>>({}); const [source, setSource] = useState<"server" | "stored" | null>(null); const [jobId, setJobId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({ mask: true, probability: false, outlines: true, edges: false, labels: true }); const [original, setOriginal] = useState(false);
  const [tool, setTool] = useState<Tool>("select"); const [selected, setSelected] = useState<number | null>(null); const [selUser, setSelUser] = useState<number | null>(null);
  const [refPts, setRefPts] = useState<[XY, XY] | null>(null); const [refLen, setRefLen] = useState(""); const [quad, setQuad] = useState<XY[] | null>(null); const [quadW, setQuadW] = useState(""); const [quadH, setQuadH] = useState("");
  const [user, setUser] = useState<Record<number, UserShape[]>>({});
  const [mat, setMat] = useState({ name: "", waste: "10", coverage: "", price: "", basis: "auto" as "auto" | "plan" | "surface" | "manual", manual: "" });
  const viewer = useRef<ViewerHandle>(null); const abort = useRef(false); const running = status === "uploading" || status === "queued" || status === "running";
  const entry = entries.find((e) => e.index === active && e.ok)?.result as ImageResult | undefined;

  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); }, [api]);
  useEffect(() => { fetch("/roof/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples.map((s: SampleInfo) => ({ ...s, url: `/roof/samples/${s.file}` })))).catch(() => undefined); }, []);
  useEffect(() => () => { picks.forEach((p) => p.file && URL.revokeObjectURL(p.preview)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => { setEntries([]); setUrls({}); setError(""); setStatus("idle"); setStage(""); setPct(0); setSource(null); setJobId(null); setSelected(null); setSelUser(null); setRefPts(null); setQuad(null); setUser({}); setTool("select"); }, []);
  const addSample = (s: SampleInfo) => { if (running) return; reset(); setPicks([{ key: `s:${s.id}`, name: s.title, sample: s, preview: `/roof/samples/${s.preview}` }]); setActive(0); if (s.georeferenced) setWorkflow("georeferenced"); };
  const addFiles = (list: FileList | null) => {
    if (!list || running) return; const lim = (health?.limits.max_file_mb ?? 40) * 1e6, max = health?.limits.max_images ?? 8; const next: Pick[] = [...picks.filter((p) => p.file)]; reset();
    for (const f of Array.from(list)) { if (!/\.(jpe?g|png|webp|tiff?)$/i.test(f.name) && !f.type.startsWith("image/")) { setError("Unsupported file type. Upload JPEG, PNG, WebP or GeoTIFF images."); continue; } if (f.size > lim) { setError(`${f.name} is larger than the ${lim / 1e6} MB limit.`); continue; } if (next.length >= max) { setError(`At most ${max} images per session.`); break; } next.push({ key: `f:${f.name}:${f.size}:${f.lastModified}`, name: f.name, file: f, preview: /\.tiff?$/i.test(f.name) ? "" : URL.createObjectURL(f) }); }
    setPicks(next); setActive(0);
  };
  const removePick = (k: string) => { if (running) return; const p = picks.find((x) => x.key === k); if (p?.file && p.preview) URL.revokeObjectURL(p.preview); reset(); setPicks(picks.filter((x) => x.key !== k)); setActive(0); };

  // scale and pitch (client engine, identical to the service's) ------------------------------------------------------------------
  const georef = entry?.image.georeference ?? (picks[active]?.sample?.georeferenced ? entry?.image.georeference ?? null : null);
  const scaleSpec: ScaleSpec = useMemo(() => {
    const L = num(quadW), Hh = num(quadH);
    if (quad && quad.length === 4 && L && Hh) return { type: "plane_quad", quad, width_m: toMetres(L, unit), height_m: toMetres(Hh, unit) };
    const rl = num(refLen); if (refPts && rl) return { type: "reference", p1: refPts[0], p2: refPts[1], length_m: toMetres(rl, unit) };
    const g = num(gsd); if (g) return { type: "gsd", gsd_m: g };
    return { type: "none" };
  }, [quad, quadW, quadH, refPts, refLen, gsd, unit]);
  const [scale, scaleErr] = useMemo((): [Scale | null, string] => { try { return [resolveScale(scaleSpec, entry?.image.georeference ?? null), ""]; } catch (e) { return [null, e instanceof ScaleError ? e.message : "Invalid scale."]; } }, [scaleSpec, entry]);
  const [pitch, pitchErr] = useMemo(() => { const v = num(pitchVal); if (v === null) return [null, ""] as const; try { return [pitchFrom(pitchMode === "rise" ? { rise_per_12: v } : { degrees: v }), ""] as const; } catch (e) { return [null, e instanceof ScaleError ? e.message : "Invalid pitch."] as const; } }, [pitchVal, pitchMode]);
  const planeOnly = scale?.kind === "plane_quad";
  const measured = useMemo(() => { const m = new Map<number, Measurements>(); if (!entry) return m; for (const r of entry.regions) m.set(r.id, measurePolygon(r.polygon, view === "oblique" && scale && scale.kind !== "plane_quad" ? null : scale, pitch)); return m; }, [entry, scale, pitch, view]);
  const userM = useMemo(() => (user[active] ?? []).map((u) => ({ u, m: measurePolygon(u.points, view === "oblique" && scale && scale.kind !== "plane_quad" ? null : scale, pitch) })), [user, active, scale, pitch, view]);
  const obliqueBlocked = view === "oblique" && scale && scale.kind !== "plane_quad";

  // run -----------------------------------------------------------------------------------------------------------------------------
  const params = () => ({ threshold, min_area_px: minArea, view, approx_roof_type: roofType === "unknown" ? null : roofType, scale: scaleSpec.type === "none" ? null : scaleSpec, pitch: pitch ? { degrees: pitch.degrees } : null });
  const loadStored = async (s: SampleInfo) => {
    setSource("stored"); setStatus("running"); setStage("loading stored result"); const r = await fetch(`/roof/samples/${s.results}`); if (!r.ok) throw new Error("The stored result could not be loaded.");
    const data = (await r.json()) as ImageResult; const a = s.artifacts ?? {}; setEntries([{ index: 0, ok: true, result: data }]); setUrls({ "0": Object.fromEntries(Object.entries(a).map(([k, v]) => [k, `/roof/samples/${v}`])) }); setPct(100); setStatus("completed"); setStage("completed");
  };
  const runServer = async () => {
    if (!api) throw new Error("The analysis service is not connected on this site."); setSource("server"); setStatus("uploading"); setStage("uploading");
    const j = await api.analyze(picks.filter((p) => p.file).map((p) => p.file!), picks.filter((p) => p.sample).map((p) => p.sample!.id), params()); setJobId(j.job_id); setStatus("queued"); abort.current = false;
    for (;;) {
      const st = await api.job(j.job_id); setStage(st.stage); setPct(Math.round(100 * st.progress.fraction)); if (st.status === "queued" || st.status === "running") setStatus(st.status);
      if (st.status === "failed") throw new Error(st.error ?? "Processing failed.");
      if (st.status === "completed" || st.status === "cancelled") { const res: JobResults = await api.results(j.job_id); setEntries(res.images); setUrls(Object.fromEntries(Object.entries(res.artifact_urls).map(([i, a]) => [i, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, api.url(v)]))]))); setStatus(st.status === "completed" ? "completed" : "stopped"); setPct(100); return; }
      await new Promise((r) => setTimeout(r, 700));
    }
  };
  const start = async () => {
    if (!picks.length || running) return; const keep = { refPts, quad }; reset(); setRefPts(keep.refPts); setQuad(keep.quad);
    try {
      const s0 = picks[0].sample; const onlyStored = picks.length === 1 && s0 && s0.results && service === "offline";
      if (onlyStored) await loadStored(s0!); else if (service !== "online") throw new Error("The analysis engine could not be started in this browser."); else await runServer();
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Processing failed."); }
  };
  const cancel = async () => { if (api && jobId) { try { await api.cancel(jobId); } catch (e) { setError(e instanceof Error ? e.message : "Could not cancel."); } } };
  const stored = picks.length === 1 && !!picks[0].sample?.results && service !== "online";

  // tools -----------------------------------------------------------------------------------------------------------------------------
  const onPoints = (pts: XY[]) => {
    if (tool === "reference") { setRefPts([pts[0], pts[1]]); setQuad(null); setTool("select"); }
    else if (tool === "quad") { setQuad(pts); setRefPts(null); setTool("select"); }
    else if (tool === "trace") { const id = Date.now(); setUser((u) => ({ ...u, [active]: [...(u[active] ?? []), { id, name: `Outline ${(u[active]?.length ?? 0) + 1}`, points: pts }] })); setSelUser(id); setSelected(null); setTool("select"); }
  };
  const label = (r: Region) => { const m = measured.get(r.id); return m?.metric.available ? fmtArea(m.metric.area_m2!, unit) : `${Math.round(m?.pixels.area_px ?? 0).toLocaleString("en-US")} px²`; };
  const userLabel = (u: UserShape) => { const m = userM.find((x) => x.u.id === u.id)?.m; return m?.metric.available ? fmtArea(m.metric.area_m2!, unit) : `${Math.round(m?.pixels.area_px ?? 0).toLocaleString("en-US")} px²`; };

  // estimate ---------------------------------------------------------------------------------------------------------------------------
  const totals = useMemo(() => { const a = [...measured.values()]; const plan = a.every((m) => m.metric.available) && a.length ? a.reduce((s, m) => s + m.metric.area_m2!, 0) : null; const surf = a.every((m) => m.surface.available) && a.length ? a.reduce((s, m) => s + m.surface.area_m2!, 0) : null; return { plan, surf, px: a.reduce((s, m) => s + m.pixels.area_px, 0) }; }, [measured]);
  const basisArea = mat.basis === "manual" ? (num(mat.manual) !== null ? num(mat.manual)! * (unit === "m" || unit === "cm" ? 1 : 1) : null) : mat.basis === "plan" ? totals.plan : mat.basis === "surface" ? totals.surf : totals.surf ?? totals.plan;
  const basisLabel = mat.basis === "manual" ? "area you typed" : mat.basis === "plan" ? "plan-view area" : mat.basis === "surface" ? "sloped surface area" : totals.surf !== null ? "sloped surface area" : "plan-view area (a horizontal projection; the sloped surface is larger)";
  const manualM2 = mat.basis === "manual" && num(mat.manual) !== null ? num(mat.manual)! / areaFromM2(1, unit) : null;
  const est = useMemo(() => estimate({ areaM2: mat.basis === "manual" ? manualM2 ?? 0 : basisArea ?? 0, wastePct: num(mat.waste) ?? 0, coverageM2PerPackage: num(mat.coverage) ? num(mat.coverage)! / areaFromM2(1, unit) : null, unitPrice: num(mat.price) }), [mat, basisArea, manualM2, unit]);

  // exports ----------------------------------------------------------------------------------------------------------------------------
  const base = (picks[active]?.name ?? "roof").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 40);
  const exportJson = () => { if (!entry) return; download(`${base}-roof-analysis.json`, JSON.stringify({ note: "Model output plus measurements recalculated from the inputs below. Real-world values exist only where a scale was supplied or read from GeoTIFF metadata.", source: source === "stored" ? "stored result of a real service run" : "service run", result: entry, user_inputs: { scale: scaleSpec, scale_description: scale, pitch, unit_for_display: unit, view, roof_type: roofType }, recalculated: [...measured.entries()].map(([id, m]) => ({ region_id: id, ...m })), user_drawn: userM.map(({ u, m }) => ({ name: u.name, polygon: u.points, ...m })), material_estimate: est ? { basis: basisLabel, ...est, waste_percent: num(mat.waste) } : null }, null, 2), "application/json"); };
  const exportCsv = () => { if (!entry) return; const rows = ["source,id,confidence_mean,area_px,perimeter_px,area_m2,perimeter_m,surface_area_m2,scale_kind,pitch_degrees"]; const row = (src: string, id: string | number, conf: string, m: Measurements) => [src, id, conf, m.pixels.area_px.toFixed(1), m.pixels.perimeter_px.toFixed(1), m.metric.available ? m.metric.area_m2!.toFixed(3) : "", m.metric.available ? m.metric.perimeter_m!.toFixed(3) : "", m.surface.available ? m.surface.area_m2!.toFixed(3) : "", m.metric.available ? m.metric.scale_kind : "", m.pitch.status === "supplied" ? m.pitch.degrees!.toFixed(2) : ""].join(","); for (const r of entry.regions) rows.push(row("model", r.id, String(r.confidence.mean_probability), measured.get(r.id)!)); for (const { u, m } of userM) rows.push(row("user-drawn", `"${u.name}"`, "", m)); download(`${base}-roof-analysis.csv`, rows.join("\n") + "\n", "text/csv"); };

  const sel = entry?.regions.find((r) => r.id === selected) ?? null; const selM = sel ? measured.get(sel.id) : null; const selU = userM.find((x) => x.u.id === selUser) ?? null;
  const statusText = { idle: "Ready", uploading: "Uploading…", queued: "Queued…", running: `Analysing ${pct}%`, completed: "Completed", stopped: "Stopped", failed: "Failed" }[status];
  const imageUrl = urls[String(active)]?.original ?? picks[active]?.preview ?? ""; const art = urls[String(active)] ?? {};

  return (
    <DemoShell branding={branding} app="AI Roof Measurement & Estimation" project={picks[active]?.name ?? "No image selected"} status={statusText} badge="Computer Vision · prototype" back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="Roof regions come from a small U-Net trained for top-down imagery; outlines and rectangle fits are derived from the mask; interior edges are unclassified candidates. A single image does not contain true dimensions: metres appear only when a scale is read from GeoTIFF metadata or supplied by you, and they describe a plan view unless a plane calibration is used. Pitch and sloped surface area are never measured from the image. Quantities are planning estimates that need professional verification. Not a survey, not survey-grade, not an engineering certification.">
      <div className="mx-auto grid max-w-[112rem] gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0 space-y-3">
          <section className={CARD} aria-label="Images and settings">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="min-w-[16rem] flex-1"><h3 className={H3}>1 · Images</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {samples.map((s) => <button key={s.id} type="button" disabled={running} onClick={() => addSample(s)} data-testid={`sample-${s.id}`} className={`rounded-lg border px-3 py-2 text-left text-xs ${picks[0]?.sample?.id === s.id ? "border-amber-500 bg-amber-600/10 text-white" : "border-slate-700 text-slate-200 hover:border-amber-500"}`}><b className="block text-sm">{s.title}</b><span className="text-slate-400">{s.width}×{s.height}{s.georeferenced ? " · GeoTIFF" : ""} · sample</span></button>)}
                  <label className={`${BTN} flex cursor-pointer items-center`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>Upload roof images…<input type="file" hidden multiple accept={ACCEPT} data-testid="file-input" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} disabled={running} /></label>
                </div>
                {picks.length > 0 && <ul className="mt-2 flex flex-wrap gap-2" aria-label="Selected images" data-testid="picks">{picks.map((p, i) => <li key={p.key} className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${i === active ? "border-amber-500" : "border-slate-700"}`}>{p.preview ? <img src={p.preview} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-[10px]">TIFF</span>}<button type="button" className="max-w-[10rem] truncate text-slate-200" onClick={() => setActive(i)}>{p.name}</button><button type="button" aria-label={`Remove ${p.name}`} className="text-slate-400 hover:text-red-300" onClick={() => removePick(p.key)} disabled={running}>✕</button></li>)}</ul>}
                {picks[0]?.sample && picks.length === 1 && <div className="mt-2 text-[11px] leading-snug text-slate-500" data-testid="sample-credit"><p className="text-slate-300">{picks[0].sample.description}</p><p className="mt-1"><b className="text-slate-300">What it shows:</b> {picks[0].sample.scenario}</p><p className="mt-1">{picks[0].sample.attribution} Licence: {picks[0].sample.license}. <a className="text-amber-400 hover:underline" href={picks[0].sample.source} target="_blank" rel="noreferrer">Source</a></p></div>}
              </div>
              <fieldset className="min-w-[17rem]"><legend className={H3}>2 · Workflow</legend>
                {([["georeferenced", "Georeferenced aerial image", "Scale from GeoTIFF tags or a ground sample distance"], ["calibrated", "Calibrated single image", "Scale from a known length or a rectangle of known size"], ["noscale", "No reliable scale", "Roof detection and pixel geometry only"]] as [Workflow, string, string][]).map(([k, l, d]) => <label key={k} className="mt-1.5 flex items-start gap-2 text-xs text-slate-200"><input type="radio" name="wf" className="mt-0.5" checked={workflow === k} onChange={() => setWorkflow(k)} data-testid={`wf-${k}`} /><span><b>{l}</b><span className="block text-slate-400">{d}</span></span></label>)}
                <label className="mt-1.5 flex items-start gap-2 text-xs text-slate-500"><input type="radio" disabled className="mt-0.5" /><span><b>Multiple overlapping images (photogrammetry)</b><span className="block">Not part of this tool. Images are analysed one by one.</span></span></label>
              </fieldset>
              <div className="min-w-[17rem]"><h3 className={H3}>3 · Reference information</h3>
                <p className="mt-1 text-[11px] text-slate-500">Everything here is your input, used as typed and not verified.</p>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">Units<select className="rounded border border-slate-700 bg-slate-950 px-1 py-1" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Measurement unit" data-testid="unit">{UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]} ({u})</option>)}</select></label>
                {workflow !== "noscale" && <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">Ground sample distance<input className={INPUT} inputMode="decimal" placeholder="m per pixel" value={gsd} onChange={(e) => setGsd(e.target.value)} aria-label="Ground sample distance in metres per pixel" data-testid="gsd" /></label>}
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">Pitch<select className="rounded border border-slate-700 bg-slate-950 px-1 py-1" value={pitchMode} onChange={(e) => setPitchMode(e.target.value as "rise" | "deg")} aria-label="Pitch convention"><option value="rise">rise per 12</option><option value="deg">degrees</option></select><input className={INPUT} inputMode="decimal" placeholder="if known" value={pitchVal} onChange={(e) => setPitchVal(e.target.value)} aria-label="Roof pitch" data-testid="pitch" /></div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">View<select className="rounded border border-slate-700 bg-slate-950 px-1 py-1" value={view} onChange={(e) => setView(e.target.value)} aria-label="Viewing geometry" data-testid="view"><option value="nadir">straight down (aerial)</option><option value="oblique">oblique / ground photo</option><option value="unknown">unknown</option></select>
                  <select className="rounded border border-slate-700 bg-slate-950 px-1 py-1" value={roofType} onChange={(e) => setRoofType(e.target.value)} aria-label="Approximate roof type"><option value="unknown">roof type: unknown</option><option value="gable">gable</option><option value="hip">hip</option><option value="flat">flat</option><option value="mixed">mixed</option></select></div>
                {pitchErr && <p className="mt-1 text-xs text-red-300">{pitchErr}</p>}
                <details className="mt-2 text-xs text-slate-300"><summary className="cursor-pointer text-slate-400">Detection settings</summary><label className="mt-1 block">Threshold <b className="tabular-nums text-white">{threshold.toFixed(2)}</b><input type="range" className="block w-full" min={0.3} max={0.8} step={0.05} value={threshold} disabled={running || stored} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Detection threshold" /></label><label className="mt-1 block">Minimum region <b className="tabular-nums text-white">{minArea}</b> px²<input type="range" className="block w-full" min={50} max={2000} step={50} value={minArea} disabled={running || stored} onChange={(e) => setMinArea(Number(e.target.value))} aria-label="Minimum region area" /></label>{stored && <p className="text-slate-500">Fixed for the stored result.</p>}</details>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={GO} disabled={!picks.length || running} onClick={start} data-testid="start">{stored ? "Load stored result" : "Start analysis"}</button>
              <button type="button" className={BTN} disabled={!running || !jobId} onClick={cancel} data-testid="stop">Cancel</button>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "failed" ? "bg-red-900/60 text-red-200" : status === "completed" ? "bg-emerald-900/60 text-emerald-200" : running ? "bg-amber-900/60 text-amber-200" : "bg-slate-800 text-slate-300"}`} role="status" data-testid="status">{statusText}</span>
              {(running || status === "completed") && <div className="min-w-[10rem] flex-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-2 rounded bg-slate-800"><div className="h-full rounded bg-amber-500 transition-all" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[11px] text-slate-400" data-testid="progress-text">{stage}</p></div>}
              <span className="text-[11px] text-slate-500" data-testid="service-state">Service: {service === "online" ? `online · ${health?.model}` : service === "unknown" ? "checking…" : serviceUrl ? "not reachable" : "engine unavailable"}</span>
            </div>
            {error && <p role="alert" data-testid="error" className="mt-3 rounded-md border border-red-500/50 bg-red-900/30 px-3 py-2 text-sm text-red-100">{error}</p>}
          </section>

          <section className={CARD} aria-label="Analysis viewer">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h3 className={H3}>Analysis viewer</h3>
              <div role="group" aria-label="Tools" className="flex flex-wrap gap-1">{([["select", "Inspect"], ["trace", "Trace outline"], ["reference", "Set reference length"], ["quad", "Calibrate plane"]] as [Tool, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={tool === k} disabled={!imageUrl || (k !== "select" && !!original)} onClick={() => setTool(tool === k ? "select" : k)} data-testid={`tool-${k}`} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${tool === k ? "bg-amber-600 text-white" : "border border-slate-700 text-slate-300 hover:border-amber-500 disabled:opacity-40"}`}>{l}</button>)}</div>
              <div className="ml-auto flex flex-wrap gap-3 text-xs text-slate-300">
                <label className="flex items-center gap-1"><input type="checkbox" checked={original} onChange={(e) => setOriginal(e.target.checked)} data-testid="toggle-original" />Original only</label>
                {([["mask", "Segmentation", !!art.mask], ["probability", "Model confidence map", !!art.probability], ["outlines", "Outlines", !!entry], ["edges", "Edge candidates", !!entry], ["labels", "Area labels", !!entry]] as [keyof Layers, string, boolean][]).map(([k, l, on]) => <label key={k} className={`flex items-center gap-1 ${on ? "" : "opacity-40"}`}><input type="checkbox" checked={layers[k]} disabled={!on} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} data-testid={`layer-${k}`} />{l}</label>)}
              </div>
            </div>
            {imageUrl ? <RoofViewer ref={viewer} imageUrl={imageUrl} maskUrl={art.mask} probUrl={art.probability} regions={entry?.regions ?? []} layers={layers} selected={selected} onSelect={(id) => { setSelected(id); if (id !== null) setSelUser(null); }} tool={tool} onPoints={onPoints} reference={refPts} quad={quad} userShapes={user[active] ?? []} selectedUser={selUser} label={label} userLabel={userLabel} showOriginalOnly={original} />
              : <div className="flex h-[40vh] items-center justify-center rounded-lg border border-dashed border-slate-700 text-center text-sm text-slate-400"><p>Choose a sample or upload roof images to begin.<br /><span className="text-xs text-slate-500">Nothing is drawn until the model has produced it.</span></p></div>}
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400" aria-label="Legend" data-testid="legend"><li><span className="mr-1 inline-block h-2.5 w-4 rounded-sm bg-orange-500/60" />Segmentation (model)</li><li><span className="mr-1 inline-block h-2.5 w-4 border-2 border-amber-200" />Outline polygon (derived)</li><li><span className="mr-1 inline-block h-0 w-4 border-t-2 border-dashed border-sky-400 align-middle" />Interior edge candidate (inferred, unclassified)</li><li><span className="mr-1 inline-block h-2.5 w-4 border-2 border-emerald-400" />Outline you traced</li><li><span className="mr-1 inline-block h-0 w-4 border-t-2 border-cyan-400 align-middle" />Reference length</li><li><span className="mr-1 inline-block h-0 w-4 border-t-2 border-dashed border-pink-400 align-middle" />Calibration rectangle</li></ul>
            {(tool === "reference" || refPts) && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">Reference length{refPts ? <><input className={INPUT} inputMode="decimal" value={refLen} onChange={(e) => setRefLen(e.target.value)} placeholder={`length in ${unit}`} aria-label="Reference length" data-testid="ref-length" /> {unit}<button type="button" className={BTN} onClick={() => { setRefPts(null); setRefLen(""); }}>Clear</button></> : <span className="text-slate-400">Click two points first.</span>}</div>}
            {quad && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">Rectangle size (top edge × side edge)<input className={INPUT} inputMode="decimal" value={quadW} onChange={(e) => setQuadW(e.target.value)} placeholder={`width (${unit})`} aria-label="Rectangle width" data-testid="quad-w" />×<input className={INPUT} inputMode="decimal" value={quadH} onChange={(e) => setQuadH(e.target.value)} placeholder={`height (${unit})`} aria-label="Rectangle height" data-testid="quad-h" /><button type="button" className={BTN} onClick={() => { setQuad(null); setQuadW(""); setQuadH(""); }}>Clear</button></div>}
            {scaleErr && <p className="mt-2 text-xs text-red-300" data-testid="scale-error">{scaleErr}</p>}
            {obliqueBlocked && <p className="mt-2 text-xs text-amber-300">You marked the view as oblique: plan-view scales are not valid for it, so real-world values are withheld. Use “Calibrate plane” instead.</p>}
          </section>
        </div>

        <div className="space-y-3">
          <section className={CARD} aria-label="Measurements" data-testid="measure-panel">
            <h3 className={H3}>Measurements</h3>
            {!entry ? <p className="mt-2 text-sm text-slate-400">Results appear after analysis. Every value shown is computed from the model output and the reference information you supplied.</p> : <>
              <p className="mt-2 text-xs text-slate-300" data-testid="scale-line"><b>Scale:</b> {scale ? `${scale.kind === "geo" ? "GeoTIFF metadata" : scale.kind === "gsd" ? "ground sample distance (yours)" : scale.kind === "reference" ? "one reference length (yours)" : "calibrated plane (yours)"}. ${scale.meaning}.`.replace("..", ".") : "none. Dimensions are pixel measurements; real-world values are unavailable."}</p>
              {scale?.note && <p className="mt-1 text-[11px] text-slate-500">{scale.note}</p>}
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400" data-testid="totals"><dt>Roof regions found</dt><dd className="text-right text-slate-100" data-testid="m-regions">{entry.regions.length}</dd>
                <dt>Roof share of image</dt><dd className="text-right text-slate-100">{(100 * entry.summary.roof_fraction_of_image).toFixed(1)} %</dd>
                <dt>Total area (pixels)</dt><dd className="text-right text-slate-100" data-testid="m-total-px">{Math.round(totals.px).toLocaleString("en-US")} px²</dd>
                <dt>{planeOnly ? "Total area in plane" : "Total projected area"}</dt><dd className="text-right text-slate-100" data-testid="m-total-plan">{totals.plan !== null ? fmtArea(totals.plan, unit) : "unavailable"}</dd>
                <dt>Sloped surface area</dt><dd className="text-right text-slate-100" data-testid="m-total-surface">{totals.surf !== null ? fmtArea(totals.surf, unit) : "unavailable"}</dd>
                <dt>Pitch</dt><dd className="text-right text-slate-100" data-testid="m-pitch">{pitch ? `${pitch.rise_per_12!.toFixed(2)}:12 (${pitch.degrees!.toFixed(1)}°) · yours` : "not measurable"}</dd></dl>
              {totals.surf === null && totals.plan !== null && !planeOnly && <p className="mt-1 text-[11px] text-slate-500">Sloped surface area needs the pitch. An image alone cannot give it: enter it if you know it.</p>}
              {!scale && <p className="mt-2 rounded border border-amber-500/30 bg-amber-900/10 p-2 text-[11px] leading-snug text-amber-100" data-testid="needed">{entry.needed_for_real_world_dimensions[0] ?? "A scale is needed for real-world dimensions."}</p>}
              <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Regions</h4>
              <table className="mt-1 w-full text-xs" data-testid="region-table"><thead className="text-left text-slate-400"><tr><th className="py-1 font-medium">#</th><th className="font-medium">Area</th><th className="font-medium">Conf.</th><th className="text-right font-medium">Source</th></tr></thead>
                <tbody>{entry.regions.slice(0, 60).map((r) => { const m = measured.get(r.id)!; return <tr key={r.id} onClick={() => { setSelected(r.id); setSelUser(null); }} className={`cursor-pointer border-t border-slate-800 ${r.id === selected ? "bg-amber-600/10" : ""}`} data-testid="region-row"><th className="py-1 text-left font-medium text-slate-200">{r.id}</th><td className="tabular-nums text-slate-100">{m.metric.available ? fmtArea(m.metric.area_m2!, unit) : `${Math.round(m.pixels.area_px).toLocaleString("en-US")} px²`}</td><td className="tabular-nums text-slate-300">{r.confidence.mean_probability.toFixed(2)}</td><td className="text-right text-slate-500">model</td></tr>; })}
                  {userM.map(({ u, m }) => <tr key={u.id} onClick={() => { setSelUser(u.id); setSelected(null); }} className={`cursor-pointer border-t border-slate-800 ${u.id === selUser ? "bg-emerald-600/10" : ""}`} data-testid="user-row"><th className="py-1 text-left font-medium text-emerald-200">{u.name}</th><td className="tabular-nums text-slate-100">{m.metric.available ? fmtArea(m.metric.area_m2!, unit) : `${Math.round(m.pixels.area_px).toLocaleString("en-US")} px²`}</td><td className="text-slate-500">—</td><td className="text-right text-emerald-300">you</td></tr>)}</tbody></table>
              {entry.regions.length > 60 && <p className="mt-1 text-[11px] text-slate-500">Showing 60 of {entry.regions.length} regions; exports contain all.</p>}
              {(sel && selM) || selU ? <RegionDetail unit={unit} title={sel ? `Region ${sel.id} (model)` : selU!.u.name + " (traced by you)"} m={(selM ?? selU!.m)} region={sel} onDelete={selU ? () => { setUser((u) => ({ ...u, [active]: (u[active] ?? []).filter((x) => x.id !== selU.u.id) })); setSelUser(null); } : undefined} /> : <p className="mt-2 text-[11px] text-slate-500">Click a region in the image or the table for its dimensions, confidence and features.</p>}
            </>}
          </section>

          <section className={CARD} aria-label="Material estimate" data-testid="estimate">
            <h3 className={H3}>Planning estimate</h3>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">Quantity = area × (1 + waste). You enter every assumption; no prices, rates or coverage values are filled in for you. A planning estimate, to be verified by a professional.</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-300">
              <label>Material<input className={`${INPUT} w-full`} value={mat.name} onChange={(e) => setMat({ ...mat, name: e.target.value })} placeholder="e.g. asphalt shingles" aria-label="Roofing material" /></label>
              <label>Waste allowance (%)<input className={`${INPUT} w-full`} inputMode="decimal" value={mat.waste} onChange={(e) => setMat({ ...mat, waste: e.target.value })} aria-label="Waste allowance percent" data-testid="waste" /></label>
              <label>Coverage per package ({unit === "m" || unit === "cm" ? "m²" : "ft²"})<input className={`${INPUT} w-full`} inputMode="decimal" value={mat.coverage} onChange={(e) => setMat({ ...mat, coverage: e.target.value })} aria-label="Coverage per package" data-testid="coverage" /></label>
              <label>Price per package (yours)<input className={`${INPUT} w-full`} inputMode="decimal" value={mat.price} onChange={(e) => setMat({ ...mat, price: e.target.value })} aria-label="Unit price" data-testid="price" /></label>
              <label className="col-span-2">Area basis<select className="ml-2 rounded border border-slate-700 bg-slate-950 px-1 py-1" value={mat.basis} onChange={(e) => setMat({ ...mat, basis: e.target.value as typeof mat.basis })} aria-label="Area basis"><option value="auto">best measured (surface if known, else plan-view)</option><option value="plan">plan-view area</option><option value="surface">sloped surface area</option><option value="manual">area I type</option></select>{mat.basis === "manual" && <input className={`${INPUT} ml-2`} inputMode="decimal" value={mat.manual} onChange={(e) => setMat({ ...mat, manual: e.target.value })} aria-label="Manual area" data-testid="manual-area" />}</label>
            </div>
            {est ? <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400" data-testid="estimate-out"><dt>Area basis</dt><dd className="text-right text-slate-100">{basisLabel}</dd><dt>Required with waste</dt><dd className="text-right text-slate-100" data-testid="est-required">{fmtArea(est.requiredM2, unit)}</dd><dt>Packages (rounded up)</dt><dd className="text-right text-slate-100" data-testid="est-packages">{est.packages ?? "enter coverage"}</dd><dt>Cost (your price)</dt><dd className="text-right text-slate-100" data-testid="est-cost">{est.cost !== null ? est.cost.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "enter a price"}</dd></dl>
              : <p className="mt-2 text-xs text-slate-400" data-testid="estimate-none">{mat.basis === "manual" ? "Enter an area." : "No measured area yet: a scale is needed (or type an area)."}</p>}
          </section>

          <section className={CARD} aria-label="Results and exports" data-testid="results">
            <h3 className={H3}>Results</h3>
            {!entry ? <p className="mt-2 text-sm text-slate-400">Warnings, feature status and downloads appear here.</p> : <>
              {source === "stored" && <p className="mt-2 rounded border border-amber-500/40 bg-amber-900/20 p-2 text-[11px] leading-snug text-amber-100" data-testid="stored-note">Stored result: the output of a real run of the service on this sample, saved with the site. It was not computed in your browser just now. Measurements below are recalculated live from it.</p>}
              <ul className="mt-2 space-y-1 text-xs text-amber-200" data-testid="warnings">{entry.warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>
              <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Features</h4>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400" data-testid="features-status"><li><b className="text-slate-200">Model:</b> {entry.features_status.model_detected.join("; ")}</li><li><b className="text-slate-200">Derived:</b> {entry.features_status.derived.join("; ")}</li><li><b className="text-slate-200">Inferred:</b> {entry.features_status.inferred.join("; ")}</li><li><b className="text-slate-200">Could not be determined:</b> {Object.keys(entry.features_status.unavailable).join(", ")}</li></ul>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400"><dt>Model</dt><dd className="text-right text-slate-100">{entry.model.name}</dd><dt>Model time</dt><dd className="text-right text-slate-100">{entry.timing.model_seconds.toFixed(2)} s</dd><dt>Image</dt><dd className="text-right text-slate-100">{entry.image.width}×{entry.image.height}</dd></dl>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={`${BTN} !bg-amber-600 !text-white`} onClick={exportJson} data-testid="download-json">JSON</button><button type="button" className={BTN} onClick={exportCsv} data-testid="download-csv">CSV</button>
                {serviceUrl && api && jobId ? <a className={BTN} href={api.url(`/api/roof/jobs/${jobId}/report.pdf`)} data-testid="download-pdf">PDF report</a> : <span className="text-[11px] text-slate-500" data-testid="pdf-note">PDF report needs the processing service; the in-browser engine offers the images and numbers only.</span>}</div>
              {serviceUrl && api && jobId && <p className="mt-1 text-[11px] text-slate-500">The PDF reflects the scale and pitch submitted with the analysis.</p>}
            </>}
          </section>
        </div>
      </div>
    </DemoShell>
  );
}

function RegionDetail({ title, m, region, unit, onDelete }: { title: string; m: Measurements; region: Region | null; unit: Unit; onDelete?: () => void }) {
  const mt = m.metric; const edges = region?.features;
  return (
    <div className="mt-3 rounded border border-slate-800 bg-slate-950 p-2 text-xs" data-testid="region-detail">
      <p className="font-semibold text-slate-100">{title}</p>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-400">
        <dt>Area</dt><dd className="text-right text-slate-100" data-testid="d-area">{mt.available ? fmtArea(mt.area_m2!, unit) : `${Math.round(m.pixels.area_px).toLocaleString("en-US")} px²`}</dd>
        {mt.available && region && region.area_px_range_for_threshold_pm_0_1 && <><dt>Area if threshold ±0.1</dt><dd className="text-right text-slate-100" data-testid="d-range">{fmtArea((mt.area_m2! * region.area_px_range_for_threshold_pm_0_1[0]) / Math.max(region.mask_area_px, 1), unit)} – {fmtArea((mt.area_m2! * region.area_px_range_for_threshold_pm_0_1[1]) / Math.max(region.mask_area_px, 1), unit)}</dd></>}
        <dt>Perimeter</dt><dd className="text-right text-slate-100">{mt.available ? fmtLen(mt.perimeter_m!, unit) : `${Math.round(m.pixels.perimeter_px)} px`}</dd>
        <dt>Bounding rectangle</dt><dd className="text-right text-slate-100">{mt.available ? `${fmtLen(mt.bounding_rectangle_m!.length, unit)} × ${fmtLen(mt.bounding_rectangle_m!.width, unit)}` : region ? `${region.rectangle_fit.size_px[0].toFixed(0)} × ${region.rectangle_fit.size_px[1].toFixed(0)} px` : "—"}</dd>
        {region && <><dt>Model confidence</dt><dd className="text-right text-slate-100">{region.confidence.mean_probability.toFixed(2)} (mean) · {region.confidence.p10_probability.toFixed(2)} (10th pct.)</dd><dt>Solidity</dt><dd className="text-right text-slate-100">{region.solidity.toFixed(2)}</dd></>}
        <dt>Surface area</dt><dd className="text-right text-slate-100">{m.surface.available ? fmtArea(m.surface.area_m2!, unit) : "unavailable"}</dd>
      </dl>
      {m.surface.available ? <p className="mt-1 text-[11px] text-slate-500">{m.surface.basis}</p> : <p className="mt-1 text-[11px] text-slate-500">{m.surface.reason}</p>}
      {mt.available && <p className="mt-1 text-[11px] text-slate-500">{mt.meaning}</p>}
      {region?.touches_image_border && <p className="mt-1 text-[11px] text-amber-200">This region touches the image border, so part of the roof is outside the image and its area is a lower bound.</p>}
      {edges && <><p className="mt-2 font-semibold text-slate-200">Features</p><p className="text-slate-400">Outline edges (derived): {edges.outline_edges.length}{mt.available && m.metric.edge_lengths_m ? ` · longest ${fmtLen(Math.max(...m.metric.edge_lengths_m), unit)}` : ""}</p><p className="text-slate-400" data-testid="d-candidates">Interior edge candidates (inferred, unclassified): {edges.interior_edge_candidates.length}</p></>}
      {onDelete && <button type="button" className={`${BTN} mt-2`} onClick={onDelete}>Delete outline</button>}
    </div>
  );
}
