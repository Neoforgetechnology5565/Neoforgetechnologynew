"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CaptureDTO } from "@/lib/foot/api-types";
import { activeAnalysis, pickActive } from "@/lib/foot/results";
import { RULESET, SAMPLE_PROFILES, BRAND_CHARTS, type Fit } from "@/lib/foot/sizing";
import { PAPER_MM, type PaperKind, type Side } from "@/lib/foot/types";
import { MESH_LIMITS } from "@/lib/foot/mesh";
import { api, ApiError, fmtLen, prepareImage } from "./api";
import CameraCapture from "./CameraCapture";
import FootViewer, { templateShape, type ViewerModel } from "./FootViewer";
import PhotoReview from "./PhotoReview";
import { BIG, CARD, Dropzone, GO, GRADE, H, PhoneLink, SUB, SetupDiagram, openPrintCheck } from "./Parts";
import type { Ctx } from "./ctx";
import { reportHtml } from "./report";

const WAIT_MODEL: ViewerModel = { kind: "pair", showcase: true, show: { length: false, width: false }, left: templateShape(258, 98, "left"), right: templateShape(262, 100, "right") };
const SIDE_LABEL: Record<Side, string> = { left: "Left foot", right: "Right foot" };
const chip = (cls: string, t: string) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{t}</span>;
const msg = (e: unknown) => (e instanceof ApiError ? e.message : (e as Error).message || "Something went wrong");

/* ───────── 1. method & setup ───────── */
export function SetupStep({ c }: { c: Ctx }) {
  const [name, setName] = useState(c.session.name);
  useEffect(() => setName(c.session.name), [c.session.name]);
  const patch = async (b: Record<string, unknown>) => { try { await api.patch(c.auth, b); await c.refresh(); } catch (e) { c.notify(msg(e), true); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <section className={CARD}>
          <h2 className={H}>1 · Session</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm text-stone-700 sm:col-span-3">Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.session.name && patch({ name: name.trim() })} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900" /></label>
            <label className="block text-sm text-stone-700 sm:col-span-2">Reference sheet<select value={c.session.paper} onChange={(e) => patch({ paper: e.target.value })} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900">{(Object.keys(PAPER_MM) as PaperKind[]).map((k) => <option key={k} value={k}>{PAPER_MM[k].label}</option>)}</select></label>
            <label className="block text-sm text-stone-700">Fit preference<select value={c.session.fit} onChange={(e) => patch({ fit: e.target.value })} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900"><option value="snug">Snug</option><option value="regular">Regular</option><option value="roomy">Roomy</option></select></label>
          </div>
          <p className={`${SUB} mt-3`}>The sheet of paper <b>is</b> the ruler. Its known size lets the software turn pixels into millimetres, so it must be a plain, flat, unprinted A4 or US Letter sheet. Nothing is measured without it.</p>
        </section>
        <section className={CARD}>
          <h2 className={H}>2 · Pick a capture method</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3"><p className="font-semibold text-stone-900">📱 Phone camera (recommended)</p><p className={SUB}>Scan the QR code with your phone. It opens a guided camera with live checks and sends photos straight here.</p></div>
            <div className="rounded-lg border border-stone-200 p-3"><p className="font-semibold text-stone-900">💻 This device’s camera</p><p className={SUB}>Same guided camera, in this browser (needs camera permission and https).</p></div>
            <div className="rounded-lg border border-stone-200 p-3"><p className="font-semibold text-stone-900">🖼 Upload existing photos</p><p className={SUB}>JPEG, PNG or WebP of a foot on a sheet, several per foot if you like.</p></div>
            <div className="rounded-lg border border-stone-200 p-3"><p className="font-semibold text-stone-900">🧊 Import an OBJ scan</p><p className={SUB}>Measure and view a foot mesh you already have (from the Results step). The platform does not create meshes.</p></div>
          </div>
          <div className="mt-4"><PhoneLink auth={c.auth} session={c.session} onChanged={c.refresh} /></div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={GO} onClick={() => c.go("capture")}>Continue to photos →</button><button type="button" className={BIG} onClick={() => openPrintCheck(c.session.paper)}>Printer scale-check sheet</button></div>
        </section>
      </div>
      <section className={`${CARD} h-fit`}>
        <h2 className={H}>How to take a good photo</h2>
        <div className="mt-3"><SetupDiagram /></div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
          <li>Lay a plain white sheet flat on a darker, non-reflective floor (not on a rug).</li>
          <li>Stand on the sheet with a <b>bare foot</b> or a dark sock — white socks disappear on white paper. Keep your weight on it, heel near a short edge, toes pointing along the long side.</li>
          <li>Hold the phone about 40–70 cm up, <b>pointing straight down</b>, with all four sheet corners in view. Don’t zoom.</li>
          <li>Use even light with no hard shadows or glare. Tap to focus and hold still.</li>
          <li>Do the same for the other foot. Take two or three photos of each if you can.</li>
        </ol>
      </section>
    </div>
  );
}

/* ───────── 2. capture / upload ───────── */
interface QItem { id: string; name: string; side: Side; source: "camera" | "upload"; blob: Blob; status: "queued" | "sending" | "done" | "error"; progress: number; error?: string; note?: string }
export function CaptureStep({ c }: { c: Ctx }) {
  const [queue, setQueue] = useState<QItem[]>([]); const [cam, setCam] = useState(false); const [busySample, setBusySample] = useState(false); const nativeCam = useRef<HTMLInputElement>(null);
  const { side, setSide } = c; const mine = c.captures.filter((x) => x.side === side); const active = pickActive(c.session, c.captures);
  const patchQ = (id: string, p: Partial<QItem>) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const send = async (it: QItem) => {
    patchQ(it.id, { status: "sending", progress: 0, error: undefined });
    try { const r = await api.upload(c.auth, it.blob, it.name, it.side, it.source, c.session.paper, (f) => patchQ(it.id, { progress: f })); c.replaceCapture(r.capture); c.setSel(r.capture.id); patchQ(it.id, { status: "done", progress: 1 }); void c.refresh(); }
    catch (e) { patchQ(it.id, { status: "error", error: msg(e) }); }
  };
  const enqueue = async (files: (File | Blob)[], source: "camera" | "upload", names?: string[]) => {
    for (let i = 0; i < files.length; i++) { const p = await prepareImage(files[i], names?.[i] ?? (files[i] as File).name ?? "photo.jpg"); const it: QItem = { id: Math.random().toString(36).slice(2), name: p.name, side, source, blob: p.blob, status: "queued", progress: 0, note: p.note }; setQueue((q) => [...q, it]); void send(it); }
  };
  const sample = async () => { setBusySample(true); try { const r = await api.sample(c.auth, side); c.replaceCapture(r.capture); c.setSel(r.capture.id); void c.refresh(); } catch (e) { c.notify(msg(e), true); } finally { setBusySample(false); } };
  const del = async (id: string) => { try { await api.captureDel(c.auth, id); await c.refresh(); if (c.sel === id) c.setSel(null); } catch (e) { c.notify(msg(e), true); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className={CARD}>
        <div role="tablist" aria-label="Which foot" className="flex gap-2">{(["left", "right"] as Side[]).map((s) => <button key={s} role="tab" aria-selected={side === s} type="button" onClick={() => setSide(s)} className={`flex-1 rounded-lg border px-3 py-2 text-left ${side === s ? "border-emerald-600 bg-emerald-50" : "border-stone-200 bg-white hover:border-stone-400"}`}><span className="block font-semibold text-stone-900">{SIDE_LABEL[s]}</span><span className="text-sm text-stone-600">{c.captures.filter((x) => x.side === s).length} photo(s){active[s] ? " · measured ✓" : ""}</span></button>)}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-3"><p className="font-semibold text-stone-900">Take a photo now</p><p className={SUB}>Guided camera with live checks for the sheet, angle, light and focus.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={GO} onClick={() => setCam(true)}>Open camera</button><button type="button" className={BIG} onClick={() => nativeCam.current?.click()}>Phone camera app</button></div>
            <input ref={nativeCam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files?.length) void enqueue(Array.from(e.target.files), "camera"); e.target.value = ""; }} /></div>
          <Dropzone onFiles={(f) => void enqueue(f, "upload")}><p className="font-semibold text-stone-900">Upload existing photos</p><p className={SUB}>Drop JPEG / PNG / WebP files here for the <b>{side}</b> foot.</p></Dropzone>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><button type="button" className={BIG} onClick={sample} disabled={busySample}>{busySample ? "Rendering…" : `Add a synthetic sample photo (${side})`}</button><span className="text-stone-600">Demo mode: a rendered scene with a known foot size, clearly labelled <i>sample</i>.</span></div>
        {queue.length > 0 && <ul className="mt-4 space-y-1.5" aria-label="Upload progress">{queue.slice(-6).map((q) => <li key={q.id} className="rounded-lg border border-stone-200 px-3 py-2 text-sm"><div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-stone-800">{q.name} <span className="text-stone-500">· {q.side}{q.note ? ` · ${q.note}` : ""}</span></span>{q.status === "sending" && <span className="tabular-nums text-stone-600">{q.progress < 1 ? `${Math.round(q.progress * 100)}%` : "analysing…"}</span>}{q.status === "done" && chip("bg-emerald-100 text-emerald-800", "analysed")}{q.status === "error" && <button type="button" className={BIG} onClick={() => void send(q)}>Retry</button>}</div>{q.status === "sending" && <div className="mt-1 h-1.5 rounded bg-stone-200"><div className="h-full rounded bg-emerald-600" style={{ width: `${Math.round(q.progress * 100)}%` }} /></div>}{q.error && <p role="alert" className="mt-1 text-red-700">{q.error}</p>}</li>)}</ul>}
        <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-stone-500">{SIDE_LABEL[side]} photos</h3>
        {mine.length === 0 ? <p className={`${SUB} mt-2`}>No photos yet. Take one, upload one, or add a sample photo.</p> : <ul className="mt-2 grid gap-3 sm:grid-cols-2">{mine.map((p) => <CaptureCard key={p.id} c={c} p={p} isActive={active[side]?.id === p.id} onDelete={() => void del(p.id)} />)}</ul>}
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={GO} disabled={!c.captures.length} onClick={() => c.go("review")}>Review photos →</button><button type="button" className={BIG} disabled={!active.left && !active.right} onClick={() => c.go("results")}>Skip to results</button></div>
      </section>
      <aside className={`${CARD} h-fit`}><h2 className={H}>Phone hand-off</h2><p className={`${SUB} mb-3`}>Photos taken on your phone appear here automatically.</p><PhoneLink auth={c.auth} session={c.session} onChanged={c.refresh} /></aside>
      {cam && <CameraCapture paper={c.session.paper} title={`${SIDE_LABEL[side]} — top view`} onClose={() => setCam(false)} onFallback={() => { setCam(false); nativeCam.current?.click(); }} onUse={(b) => { setCam(false); void enqueue([b], "camera", [`camera-${side}.jpg`]); }} />}
    </div>
  );
}
function CaptureCard({ c, p, isActive, onDelete }: { c: Ctx; p: CaptureDTO; isActive: boolean; onDelete: () => void }) {
  const a = activeAnalysis(p);
  return (
    <li className={`flex gap-3 rounded-xl border p-2 ${isActive ? "border-emerald-500 bg-emerald-50/50" : "border-stone-200"}`}>
      <img src={p.thumb} alt="" className="h-20 w-24 shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1 text-sm"><p className="truncate font-medium text-stone-900">{p.filename}</p><p className="flex flex-wrap items-center gap-1">{chip(GRADE[a.grade], a.ok ? a.grade : "not measured")}{p.source === "sample" && chip("bg-fuchsia-100 text-fuchsia-800", "sample")}{p.source === "camera" && chip("bg-sky-100 text-sky-800", "camera")}{isActive && chip("bg-emerald-600 text-white", "used")}</p>
        <p className="text-stone-600">{a.ok && a.measurement ? `${a.measurement.lengthMm} × ${a.measurement.widthMm} mm` : (a.reason ?? "").slice(0, 80) + ((a.reason ?? "").length > 80 ? "…" : "")}</p>
        <div className="mt-1 flex gap-2"><button type="button" className="text-emerald-800 underline" onClick={() => { c.setSel(p.id); c.go("review"); }}>Review</button><button type="button" className="text-red-700 underline" onClick={onDelete}>Delete</button></div></div>
    </li>
  );
}

/* ───────── 3. review ───────── */
export function ReviewStep({ c }: { c: Ctx }) {
  const cap = c.captures.find((x) => x.id === c.sel) ?? c.captures[0]; const [busy, setBusy] = useState(false);
  if (!cap) return <section className={CARD}><h2 className={H}>Nothing to review yet</h2><p className={SUB}>Add a photo first.</p><button type="button" className={`${GO} mt-3`} onClick={() => c.go("capture")}>Go to photos</button></section>;
  const a = activeAnalysis(cap); const act = pickActive(c.session, c.captures); const isActive = act[cap.side]?.id === cap.id;
  const act2 = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await c.refresh(); } catch (e) { c.notify(msg(e), true); } finally { setBusy(false); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr_21rem]">
      <section className={`${CARD} h-fit`} aria-label="Photos"><h2 className={H}>Photos</h2><ul className="mt-2 space-y-2">{c.captures.map((p) => <li key={p.id}><button type="button" onClick={() => c.setSel(p.id)} className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left ${p.id === cap.id ? "border-emerald-600 bg-emerald-50" : "border-stone-200 hover:border-stone-400"}`}><img src={p.thumb} alt="" className="h-12 w-14 rounded object-cover" /><span className="min-w-0 text-sm"><span className="block truncate font-medium text-stone-900">{p.side} · {p.filename}</span><span className="text-stone-600">{activeAnalysis(p).ok ? "measured" : "not measured"}</span></span></button></li>)}</ul></section>
      <section className={CARD}><PhotoReview auth={c.auth} capture={cap} paper={c.session.paper} onChange={(x) => { c.replaceCapture(x); void c.refresh(); }} bigBtn={BIG} /></section>
      <section className={`${CARD} h-fit space-y-3`}>
        <div><h2 className={H}>Quality & calibration</h2><p className="mt-1 flex flex-wrap items-center gap-1">{chip(GRADE[a.grade], a.ok ? `${a.grade} quality` : "not measured")}{cap.use === "manual" && chip("bg-sky-100 text-sky-800", "manual corners")}{cap.source === "sample" && chip("bg-fuchsia-100 text-fuchsia-800", "sample photo")}</p></div>
        {!a.ok && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-900"><b>No measurement.</b> {a.reason} <span className="block pt-1">The platform will not guess a size without a verified scale. Retake the photo, or mark the paper corners by hand.</span></p>}
        {a.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        {a.ok && a.measurement && a.calibration && <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-stone-500">Length</dt><dd className="text-right font-semibold">{fmtLen(a.measurement.lengthMm, c.unit)}</dd><dt className="text-stone-500">Width</dt><dd className="text-right font-semibold">{fmtLen(a.measurement.widthMm, c.unit)}</dd>
          <dt className="text-stone-500">Scale</dt><dd className="text-right">{a.calibration.pxPerMm} px/mm</dd><dt className="text-stone-500">Sheet</dt><dd className="text-right">{a.calibration.paper === "a4" ? "A4" : "US Letter"}{a.calibration.paperAutoChosen ? " (auto)" : ""}</dd>
          <dt className="text-stone-500">Camera tilt</dt><dd className="text-right">{a.calibration.tilt === 1 ? "level" : `×${a.calibration.tilt}`}</dd><dt className="text-stone-500">Est. camera height</dt><dd className="text-right">{a.calibration.estCameraDistanceMm} mm</dd>
          <dt className="text-stone-500">Uncorrected silhouette</dt><dd className="text-right">{a.measurement.rawLengthMm} mm</dd><dt className="text-stone-500">Parallax uncertainty</dt><dd className="text-right">±{a.measurement.parallaxBoundMm} mm</dd></dl>}
        {cap.manual && cap.auto.ok && cap.manual.ok && <p className="rounded bg-sky-50 p-2 text-sm text-sky-900">Original automatic result: {cap.auto.measurement!.lengthMm} × {cap.auto.measurement!.widthMm} mm. Your corrected result: {cap.manual.measurement!.lengthMm} × {cap.manual.measurement!.widthMm} mm. Both are kept.{cap.use === "manual" ? " The corrected one is used." : ""}</p>}
        {cap.manual?.ok && <div className="flex gap-2 text-sm"><button type="button" disabled={busy || cap.use === "auto"} className={BIG} onClick={() => act2(() => api.capturePatch(c.auth, cap.id, { use: "auto" }))}>Use original</button><button type="button" disabled={busy || cap.use === "manual"} className={BIG} onClick={() => act2(() => api.capturePatch(c.auth, cap.id, { use: "manual" }))}>Use corrected</button></div>}
        {cap.sampleTruth && a.ok && <p className="rounded bg-fuchsia-50 p-2 text-sm text-fuchsia-900"><b>Sample truth:</b> the scene was generated with a {cap.sampleTruth.lengthMm} × {cap.sampleTruth.widthMm} mm foot, so the error here is {(a.measurement!.lengthMm - cap.sampleTruth.lengthMm).toFixed(1)} mm (length) and {(a.measurement!.widthMm - cap.sampleTruth.widthMm).toFixed(1)} mm (width). This checks the geometry only, not real feet.</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3 text-sm">
          <label className="flex items-center gap-1.5">This is the<select aria-label="Assign foot" value={cap.side} disabled={busy} onChange={(e) => act2(() => api.capturePatch(c.auth, cap.id, { side: e.target.value as Side }))} className="rounded border border-stone-300 bg-white px-2 py-1"><option value="left">left</option><option value="right">right</option></select>foot</label>
          {a.ok && <button type="button" className={isActive ? BIG : GO} disabled={busy || isActive} onClick={() => act2(() => api.patch(c.auth, { activeCapture: { [cap.side]: cap.id } }))}>{isActive ? "✓ Used for this foot" : `Use for the ${cap.side} foot`}</button>}
        </div>
        <details className="text-sm"><summary className="cursor-pointer text-stone-700">Processing log (real timings)</summary><ol className="mt-1 space-y-0.5">{cap.job.events.map((e, i) => <li key={i} className="flex justify-between gap-2"><span>{e.stage}{e.note ? <span className="text-stone-500"> — {e.note}</span> : null}</span><span className="tabular-nums text-stone-500">{e.ms ?? 0} ms</span></li>)}</ol></details>
        <button type="button" className={GO} onClick={() => c.go("results")} disabled={!Object.values(act).some(Boolean)}>Continue to results →</button>
      </section>
    </div>
  );
}

/* ───────── 4. results ───────── */
export function ResultsStep({ c }: { c: Ctx }) {
  const r = c.results; const [busy, setBusy] = useState(false); const [vside, setVside] = useState<Side | "both">("both"); const [objBusy, setObjBusy] = useState(false); const [unitOf, setUnitOf] = useState<"mm" | "cm" | "m">("mm");
  const sides = (["left", "right"] as Side[]).filter((s) => r?.[s]); const view = (vside === "both" ? (sides.length > 1 ? "both" : sides[0]) : sides.includes(vside) ? vside : sides[0]) as Side | "both" | undefined;
  const oside: Side = view === "both" || !view ? (sides[0] ?? "right") : view;
  const run = async () => { setBusy(true); try { await api.process(c.auth); await c.refresh(); } catch (e) { c.notify(msg(e), true); } finally { setBusy(false); } };
  const file = async (f: File[]) => { const x = f[0]; if (!x) return; if (x.size > MESH_LIMITS.maxBytes) return c.notify(`OBJ files are limited to ${Math.round(MESH_LIMITS.maxBytes / 1048576)} MB.`, true); setObjBusy(true); try { const text = await x.text(); await api.mesh(c.auth, text, oside, unitOf, x.name); c.setObj(oside, { text, unit: unitOf, filename: x.name }); setVside(oside); await c.refresh(); } catch (e) { c.notify(msg(e), true); } finally { setObjBusy(false); } };
  const model: ViewerModel | null = useMemo(() => { if (view === "both") return { kind: "pair", left: r?.left, right: r?.right, sample: r?.anySample }; const o = view ? c.objs[view] : undefined; if (o && view) return { kind: "obj", side: view, ...o }; return view && r?.[view] ? { kind: "inferred", side: view, result: r[view]! } : null; }, [view, r, c.objs]);
  if (!r || (!r.left && !r.right)) return <section className={CARD}><h2 className={H}>No measured foot yet</h2><p className={SUB}>Results appear once at least one photo has been measured. Photos that failed their checks never produce numbers.</p><div className="mt-3 flex gap-2"><button type="button" className={GO} onClick={() => c.go("capture")}>Add photos</button><button type="button" className={BIG} onClick={() => c.go("review")}>Review photos</button></div></section>;
  const stale = c.session.status !== "processed"; const Row = ({ l, a, b }: { l: string; a?: number; b?: number }) => <tr className="border-t border-stone-200"><th className="py-1.5 pr-3 text-left font-normal text-stone-600">{l}</th><td className="py-1.5 text-right font-semibold tabular-nums">{a != null ? fmtLen(a, c.unit) : "—"}</td><td className="py-1.5 text-right font-semibold tabular-nums">{b != null ? fmtLen(b, c.unit) : "—"}</td></tr>;
  const L = r.left, R = r.right;
  return (
    <div className="space-y-4">
      {busy && <div role="status" className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 p-4"><div className="w-[min(92vw,26rem)] rounded-2xl bg-white p-4 text-center shadow-xl"><p className="font-display text-lg font-semibold text-stone-900">Looking for your best size…</p><FootViewer model={WAIT_MODEL} spin hideCaption className="mt-2 h-56" /><p className="mt-1 text-sm text-stone-600">Finalising your measurements. The model shown is an illustration, not your foot.</p></div></div>}
      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-3"><h2 className={H}>Measured feet</h2><div role="group" aria-label="Units" className="ml-auto flex overflow-hidden rounded-md border border-stone-300">{(["mm", "cm", "in"] as const).map((u) => <button key={u} type="button" aria-pressed={c.unit === u} onClick={() => c.setUnit(u)} className={`px-3 py-1 text-sm ${c.unit === u ? "bg-emerald-700 text-white" : "bg-white text-stone-700 hover:bg-stone-50"}`}>{u}</button>)}</div><button type="button" className={stale ? GO : BIG} disabled={busy} onClick={run}>{busy ? "Processing…" : stale ? "Process & finalise" : "Re-process"}</button></div>
        {r.anySample && <p className="mt-2 rounded bg-fuchsia-50 p-2 text-sm text-fuchsia-900"><b>Sample data in use.</b> At least one foot comes from a synthetic sample photo, not a person.</p>}
        <div className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr]">
          <table className="w-full text-sm"><thead><tr><th /><th className="pb-1 text-right text-stone-500">Left</th><th className="pb-1 text-right text-stone-500">Right</th></tr></thead><tbody>
            <Row l="Length" a={L?.lengthMm} b={R?.lengthMm} /><Row l="Width (widest)" a={L?.widthMm} b={R?.widthMm} /><Row l="Forefoot (ball) width" a={L?.ballWidthMm} b={R?.ballWidthMm} /><Row l="Heel width" a={L?.heelWidthMm} b={R?.heelWidthMm} />
            <tr className="border-t border-stone-200"><th className="py-1.5 text-left font-normal text-stone-600">Outline area</th><td className="text-right tabular-nums">{L ? `${L.areaCm2} cm²` : "—"}</td><td className="text-right tabular-nums">{R ? `${R.areaCm2} cm²` : "—"}</td></tr>
            <tr className="border-t border-stone-200"><th className="py-1.5 text-left font-normal text-stone-600">Photo quality</th><td className="text-right">{L && chip(GRADE[L.grade], L.grade)}</td><td className="text-right">{R && chip(GRADE[R.grade], R.grade)}</td></tr>
            <tr className="border-t border-stone-200"><th className="py-1.5 text-left font-normal text-stone-600">Correction uncertainty</th><td className="text-right tabular-nums">{L ? `±${L.parallaxBoundMm} mm` : "—"}</td><td className="text-right tabular-nums">{R ? `±${R.parallaxBoundMm} mm` : "—"}</td></tr></tbody></table>
          <div>{r.comparison ? <div className="rounded-lg bg-stone-50 p-3 text-sm"><p className="font-semibold text-stone-900">Left vs right</p><p>Length: <b>{r.comparison.lengthDiffMm > 0 ? "+" : ""}{r.comparison.lengthDiffMm} mm</b> · Width: <b>{r.comparison.widthDiffMm > 0 ? "+" : ""}{r.comparison.widthDiffMm} mm</b> <span className="text-stone-500">(left − right)</span></p><p className="mt-1 text-stone-700">{r.comparison.advice}</p></div> : <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">Only one foot has been measured. Add the other foot to compare them.</p>}
            <p className="mt-2 text-sm text-stone-600">Length and width come from a calibrated top view. Girth, instep and arch height are <b>not</b> measured — a single top photo cannot provide them.</p></div>
        </div>
        <details className="mt-3 text-sm"><summary className="cursor-pointer text-stone-700">How these numbers were produced</summary><ul className="mt-1 list-disc space-y-1 pl-5 text-stone-700">{r.method.map((m) => <li key={m}>{m}</li>)}</ul>{c.session.events.length > 0 && <ol className="mt-2 space-y-0.5" aria-label="Processing stages">{c.session.events.map((e, i) => <li key={i} className="flex justify-between"><span>{e.stage}{e.note ? <span className="text-stone-500"> — {e.note}</span> : null}</span><span className="tabular-nums text-stone-500">{e.ms ?? 0} ms</span></li>)}</ol>}</details>
      </section>
      <section className={CARD}>
        <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className={H}>3D view</h2>{sides.length > 0 && <div role="group" aria-label="Foot shown" className="flex gap-1">{(["both", "left", "right"] as const).map((s) => <button key={s} type="button" disabled={s === "both" ? sides.length < 2 : !r[s] && !c.objs[s]} aria-pressed={view === s} onClick={() => setVside(s)} className={`rounded-md border px-3 py-1 text-sm ${view === s ? "border-emerald-600 bg-emerald-50" : "border-stone-300 bg-white"} disabled:opacity-40`}>{s === "both" ? "Both feet" : s === "left" ? "Left" : "Right"}</button>)}</div>}
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm"><label className="flex items-center gap-1">OBJ units<select value={unitOf} onChange={(e) => setUnitOf(e.target.value as "mm")} className="rounded border border-stone-300 bg-white px-1.5 py-1"><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select></label><ObjPick onFiles={file} busy={objBusy} />{c.objs[oside] && <button type="button" className={BIG} onClick={() => { c.setObj(oside, undefined); void api.meshDel(c.auth).then(c.refresh); }}>Remove OBJ</button>}</div></div>
        <FootViewer model={model} />
        {c.session.meshes.map((m) => <p key={m.id} className="mt-2 rounded bg-sky-50 p-2 text-sm text-sky-900"><b>Imported {m.side} OBJ “{m.filename}”</b> ({m.unit}): {m.measurement.lengthMm} × {m.measurement.widthMm} mm, height box {m.measurement.heightMm} mm. {m.measurement.notes.join(" ")}{!c.objs[m.side] ? " The geometry is not kept on the server, so re-import the file to view it again." : ""}</p>)}
      </section>
      <div className="flex flex-wrap gap-2"><button type="button" className={GO} onClick={() => c.go("fit")}>Shoe sizes →</button><button type="button" className={BIG} onClick={() => c.go("review")}>← Review photos</button></div>
    </div>
  );
}
function ObjPick({ onFiles, busy }: { onFiles: (f: File[]) => void; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return <><input ref={ref} type="file" accept=".obj,text/plain" hidden onChange={(e) => { if (e.target.files?.length) onFiles(Array.from(e.target.files)); e.target.value = ""; }} /><button type="button" className={BIG} disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Measuring…" : "Import OBJ scan"}</button></>;
}

/* ───────── 5. fit ───────── */
/** "What defines your size": walks through length, width and (honestly) height with the measured pair in 3D. */
function SizeStory({ c }: { c: Ctx }) {
  const r = c.results!; const [n, setN] = useState(0); const L = r.left, R = r.right; const w = r.width; const lenGap = r.comparison?.lengthDiffMm ?? 0;
  const model: ViewerModel = useMemo(() => ({ kind: "pair", left: L, right: R, sample: r.anySample, show: { length: n === 0, width: n === 1 } }), [L, R, r.anySample, n]);
  const marks = { narrow: 0.1, standard: 0.37, wide: 0.64, "extra wide": 0.9 } as const; const pos = w ? Math.min(0.96, Math.max(0.04, (w.ratio - 0.33) / 0.12)) : 0.5; void marks;
  const titles = ["Length", "Width", "Height"]; const heads = [
    !L || !R ? `Measured length: ${fmtLen((L ?? R)!.lengthMm, c.unit)}.` : Math.abs(lenGap) < 1 ? "Both feet are similar in length." : `The ${lenGap > 0 ? "left" : "right"} foot is ${Math.abs(lenGap).toFixed(1)} mm longer.`,
    w ? (w.cls === "narrow" ? "Your feet are narrower than the typical ratio." : w.cls === "standard" ? "Your foot width is close to the typical ratio." : "Your feet are wider than the typical ratio.") : "",
    "Foot height is not measured from a top-down photo." ];
  return (
    <section className={CARD} aria-label="What defines your size">
      <div className="flex flex-wrap items-center gap-2"><h2 className={H}>What defines your size ({n + 1}/3)</h2><span className="rounded-full bg-stone-100 px-2 py-0.5 text-sm text-stone-700">{titles[n]}</span></div>
      <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-base font-medium text-stone-900" data-testid="story-head">{heads[n]}</p>
      <div className="mt-3 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        {n < 2 ? <FootViewer model={model} spin hideCaption className="h-72" /> : <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-700">No 3D height is shown because none was measured. A single photo from above cannot see how tall the foot is; that needs depth or side views.</div>}
        <div className="text-sm text-stone-700">
          {n === 0 && <><p className="font-semibold text-stone-900">Foot length</p><p>Left: <b>{L ? fmtLen(L.lengthMm, c.unit) : "—"}</b> · Right: <b>{R ? fmtLen(R.lengthMm, c.unit) : "—"}</b></p><p className="mt-1">Shoe size follows the <b>longer</b> foot plus a toe allowance.</p></>}
          {n === 1 && <><p className="font-semibold text-stone-900">Foot width</p><p>Left: <b>{L ? fmtLen(L.widthMm, c.unit) : "—"}</b> · Right: <b>{R ? fmtLen(R.widthMm, c.unit) : "—"}</b></p>
            <div className="mt-3" aria-label="Width scale"><div className="relative h-2 rounded bg-gradient-to-r from-sky-200 via-emerald-300 to-amber-300"><span className="absolute -top-1 h-4 w-1.5 rounded bg-stone-900" style={{ left: `${pos * 100}%` }} /></div><div className="mt-1 flex justify-between text-xs text-stone-600"><span>Narrow</span><span>Standard</span><span>Wide</span></div></div>
            <p className="mt-2 text-stone-600">{w?.note}</p></>}
          {n === 2 && <><p className="font-semibold text-stone-900">Foot height (instep)</p><p>Not available. We show nothing rather than guess. Shoe fit for high insteps should be checked by trying shoes on or by a depth-capable scanner.</p></>}
        </div>
      </div>
      <div className="mt-3 flex gap-2"><button type="button" className={BIG} disabled={n === 0} onClick={() => setN(n - 1)}>← Back</button><button type="button" className={GO} disabled={n === 2} onClick={() => setN(n + 1)}>Continue</button></div>
    </section>
  );
}

export function FitStep({ c }: { c: Ctx }) {
  const r = c.results; const [fit, setFit] = useState<Fit>(c.session.fit); const [custom, setCustom] = useState<number | null>(null); const [data, setData] = useState<Awaited<ReturnType<typeof api.reco>> | null>(null); const [err, setErr] = useState("");
  useEffect(() => { if (!r?.size) return; let dead = false; api.reco(c.auth, { fit, allowanceMm: custom ?? undefined }).then((d) => !dead && setData(d)).catch((e) => !dead && setErr(msg(e))); return () => { dead = true; }; }, [c.auth, fit, custom, r?.size, c.captures]);
  if (!r?.size || !r.fitFoot) return <section className={CARD}><h2 className={H}>Measure a foot first</h2><p className={SUB}>Shoe sizes are calculated from a measured foot length.</p><button type="button" className={`${GO} mt-3`} onClick={() => c.go("capture")}>Add photos</button></section>;
  const s = data?.size ?? r.size; const w = (data?.width ?? r.width) as typeof r.width;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="lg:col-span-2"><SizeStory c={c} /></div>
      <section className={CARD}>
        <h2 className={H}>Size estimate</h2>
        <p className={SUB}>Based on the {r.fitFoot.side === "either" ? "(equal) feet" : `${r.fitFoot.side} foot, the longer one`}: {fmtLen(r.fitFoot.lengthMm, c.unit)} long, {fmtLen(r.fitFoot.widthMm, c.unit)} wide.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{([["EU", s.eu], ["UK", s.uk], ["US men's", s.usMen], ["US women's", s.usWomen]] as const).map(([k, v]) => <div key={k} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center"><p className="text-sm text-stone-600">{k}</p><p className="font-display text-3xl font-bold text-emerald-900" data-testid={`size-${k}`}>{v}</p></div>)}</div>
        <p className="mt-2 text-sm text-stone-600">US men’s and US women’s are different scales (1½ sizes apart) — pick the one your shoe is labelled in. Estimates, not a guarantee of fit.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-stone-700">Fit preference<select value={fit} onChange={(e) => { setFit(e.target.value as Fit); setCustom(null); void api.patch(c.auth, { fit: e.target.value }); }} className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2"><option value="snug">Snug (+{RULESET.allowanceMm.snug} mm)</option><option value="regular">Regular (+{RULESET.allowanceMm.regular} mm)</option><option value="roomy">Roomy (+{RULESET.allowanceMm.roomy} mm)</option></select></label>
          <label className="block text-sm text-stone-700">Custom toe allowance: <b>{custom ?? s.allowanceMm} mm</b><input type="range" min={0} max={30} step={1} value={custom ?? s.allowanceMm} onChange={(e) => setCustom(Number(e.target.value))} className="mt-2 w-full accent-emerald-700" aria-label="Custom allowance in millimetres" /></label>
        </div>
        <details open className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-stone-800">How this was calculated</summary><ol className="mt-1 list-decimal space-y-1 pl-5 text-stone-700">{s.steps.map((x) => <li key={x}>{x}</li>)}</ol><p className="mt-2 text-stone-600">{RULESET.description}</p></details>
        {s.notes.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
      </section>
      <div className="space-y-4">
        <section className={CARD}><h2 className={H}>Width</h2>{w && <><p className="mt-1 text-2xl font-semibold capitalize text-stone-900">{w.cls}</p><p className={SUB}>Width ÷ length = {w.ratio}. {w.note}</p></>}</section>
        <section className={CARD}><h2 className={H}>Sample style profiles</h2><p className={`${SUB} mb-2`}>Generic, illustrative profiles — not products, and no stock is implied.</p><ul className="space-y-2">{(data?.recommendations ?? r.recommendations).map((x) => <li key={x.profile.id} className="rounded-lg border border-stone-200 p-2 text-sm"><p className="flex items-center gap-2 font-semibold text-stone-900">{x.profile.name}{chip("bg-fuchsia-100 text-fuchsia-800", "sample")}</p><p>EU {x.size.eu} · UK {x.size.uk} · US M {x.size.usMen} · US W {x.size.usWomen}</p><p className={x.widthFit === "good" ? "text-emerald-800" : "text-amber-900"}>{x.widthNote}</p><p className="text-stone-500">{x.profile.note}</p></li>)}</ul>
          <p className="mt-2 text-sm text-stone-600">{BRAND_CHARTS.length ? "Brand charts configured." : "No brand size charts are loaded. Official charts must be added as data with their source and date; none are invented here."}</p></section>
      </div>
      <div className="lg:col-span-2 flex gap-2"><button type="button" className={GO} onClick={() => c.go("report")}>Report →</button><button type="button" className={BIG} onClick={() => c.go("results")}>← Results</button></div>
    </div>
  );
}

/* ───────── 6. report ───────── */
export function ReportStep({ c }: { c: Ctx }) {
  const r = c.results; const frame = useRef<HTMLIFrameElement>(null); const [confirm, setConfirm] = useState(false);
  const html = useMemo(() => (r && (r.left || r.right) ? reportHtml(c.session, c.captures, r, c.unit, c.logoSrc) : ""), [r, c.session, c.captures, c.unit, c.logoSrc]);
  if (!html) return <section className={CARD}><h2 className={H}>No report yet</h2><p className={SUB}>Measure at least one foot to generate a report.</p><button type="button" className={`${GO} mt-3`} onClick={() => c.go("capture")}>Add photos</button></section>;
  const dl = async (f: "json" | "csv") => { try { await api.download(c.auth, f); } catch (e) { c.notify(msg(e), true); } };
  return (
    <div className="space-y-4">
      <section className={CARD}><div className="flex flex-wrap items-center gap-2"><h2 className={H}>Report</h2><div className="ml-auto flex flex-wrap gap-2"><button type="button" className={GO} onClick={() => frame.current?.contentWindow?.print()}>Print / save as PDF</button><button type="button" className={BIG} onClick={() => dl("json")}>Export JSON</button><button type="button" className={BIG} onClick={() => dl("csv")}>Export CSV</button></div></div>
        <iframe ref={frame} title="Report preview" srcDoc={html} className="mt-3 h-[34rem] w-full rounded-lg border border-stone-300 bg-white" /></section>
      <section className={CARD}><h2 className={H}>Your data</h2><p className={SUB}>Photos are downscaled before storage and kept only in this session, which is deleted automatically after {c.session.expiresAt ? Math.max(1, Math.round((c.session.expiresAt - c.session.createdAt) / 3600_000)) : 72} hours. Photos are never public. The session is reopened from this browser’s history.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={BIG} onClick={c.closeSession}>Save & close</button>{!confirm ? <button type="button" className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50" onClick={() => setConfirm(true)}>Delete this session and all photos…</button> : <><button type="button" className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600" onClick={() => void c.removeSession()}>Yes, delete everything now</button><button type="button" className={BIG} onClick={() => setConfirm(false)}>Cancel</button></>}</div></section>
    </div>
  );
}

export { SAMPLE_PROFILES };
