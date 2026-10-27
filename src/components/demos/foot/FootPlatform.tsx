"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logoUrl } from "@/lib/cloudinary";
import { CV_DISCLAIMER } from "@/lib/cv-demos";
import type { CaptureDTO, SessionDTO } from "@/lib/foot/api-types";
import { pickActive, type Results } from "@/lib/foot/results";
import type { Side } from "@/lib/foot/types";
import type { Branding } from "@/lib/types";
import DemoShell from "../DemoShell";
import { api, saved, type Auth } from "./api";
import { BIG, CARD, GO, H, SUB, openPrintCheck } from "./Parts";
import { STEPS, type Ctx, type ObjFile, type Step } from "./ctx";
import type { Unit } from "./report";
import { CaptureStep, FitStep, ReportStep, ResultsStep, ReviewStep, SetupStep } from "./Steps";

export default function FootPlatform({ branding }: { branding: Branding }) {
  const [auth, setAuth] = useState<Auth | null>(null); const [session, setSession] = useState<SessionDTO | null>(null); const [captures, setCaptures] = useState<CaptureDTO[]>([]); const [results, setResults] = useState<Results | null>(null);
  const [step, setStep] = useState<Step>("setup"); const [side, setSide] = useState<Side>("right"); const [sel, setSel] = useState<string | null>(null); const [unit, setUnit] = useState<Unit>("mm"); const [objs, setObjs] = useState<Partial<Record<Side, ObjFile>>>({});
  const [toast, setToast] = useState<{ m: string; bad: boolean } | null>(null); const [history, setHistory] = useState<SessionDTO[]>([]); const [busy, setBusy] = useState(""); const [health, setHealth] = useState<"ok" | "down" | "checking">("checking"); const authRef = useRef<Auth | null>(null);
  authRef.current = auth;
  const notify = useCallback((m: string, bad = false) => { setToast({ m, bad }); window.setTimeout(() => setToast((t) => (t?.m === m ? null : t)), 6000); }, []);

  const loadAll = useCallback(async (a: Auth) => {
    const [s, c, r] = await Promise.all([api.get(a), api.captures(a), api.results(a)]);
    if (authRef.current?.id !== a.id) return; setSession(s.session); setCaptures(c.captures); setResults(r.results);
    saved.put({ id: a.id, key: a.key!, name: s.session.name, updatedAt: s.session.updatedAt });
  }, []);
  const refresh = useCallback(async () => { const a = authRef.current; if (a) try { await loadAll(a); } catch (e) { notify((e as Error).message, true); } }, [loadAll, notify]);
  const loadHistory = useCallback(async () => {
    const items = saved.list(); if (!items.length) return setHistory([]);
    try { const r = await api.list(items.map((i) => ({ id: i.id, key: i.key }))); setHistory(r.sessions); const alive = new Set(r.sessions.map((x) => x.id)); items.filter((i) => !alive.has(i.id)).forEach((i) => saved.remove(i.id)); } catch { /* offline: keep the list empty */ }
  }, []);
  useEffect(() => { void loadHistory(); api.health().then((h) => setHealth(h.ok ? "ok" : "down")).catch(() => setHealth("down")); }, [loadHistory]);

  const open = useCallback(async (id: string, key: string, to?: Step) => {
    const a = { id, key }; authRef.current = a; setAuth(a); setObjs({}); setSel(null);
    try { await loadAll(a); const c = await api.captures(a); const r = await api.get(a); setStep(to ?? (c.captures.length === 0 ? "setup" : r.session.status === "processed" ? "results" : "capture")); }
    catch (e) { notify((e as Error).message, true); setAuth(null); authRef.current = null; saved.remove(id); }
  }, [loadAll, notify]);
  const start = async (kind: "measure" | "upload" | "demo") => {
    setBusy(kind); try {
      const r = await api.create({ name: kind === "demo" ? "Sample data demo" : "Foot measurement", paper: "a4", fit: "regular" }); saved.put({ id: r.session.id, key: r.key, name: r.session.name, updatedAt: Date.now() }); const a = { id: r.session.id, key: r.key };
      if (kind === "demo") { await api.sample(a, "left"); await api.sample(a, "right"); await api.process(a); await open(a.id, a.key, "results"); } else await open(a.id, a.key, kind === "upload" ? "capture" : "setup");
    } catch (e) { notify((e as Error).message, true); } finally { setBusy(""); }
  };
  const closeSession = useCallback(() => { setAuth(null); authRef.current = null; setSession(null); setCaptures([]); setResults(null); void loadHistory(); }, [loadHistory]);
  const removeSession = useCallback(async () => { const a = authRef.current; if (!a) return; try { await api.del(a); saved.remove(a.id); notify("Session and all its photos were deleted."); closeSession(); } catch (e) { notify((e as Error).message, true); } }, [closeSession, notify]);
  const replaceCapture = useCallback((c: CaptureDTO) => setCaptures((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c])), []);

  // photos arriving from a phone: poll lightly while the person is on the setup / capture steps
  useEffect(() => {
    if (!auth || (step !== "setup" && step !== "capture")) return; const id = window.setInterval(async () => { try { const c = await api.captures(auth); if (c.captures.length !== captures.length) await loadAll(auth); } catch { /* transient */ } }, 4000); return () => window.clearInterval(id);
  }, [auth, step, captures.length, loadAll]);

  const ctx: Ctx | null = useMemo(() => auth && session ? { auth, session, captures, results, unit, setUnit, step, go: setStep, side, setSide, sel, setSel, refresh, replaceCapture, notify, objs, setObj: (s, f) => setObjs((o) => ({ ...o, [s]: f })), logoSrc: branding.logoLight ? logoUrl(branding.logoLight, { h: 38, trim: branding.autoTrim }) : undefined, closeSession, removeSession } : null, [auth, session, captures, results, unit, step, side, sel, refresh, replaceCapture, notify, objs, branding, closeSession, removeSession]);

  const act = session ? pickActive(session, captures) : { left: undefined, right: undefined }; const done: Record<Step, boolean> = { setup: !!session, capture: captures.length > 0, review: !!(act.left || act.right), results: session?.status === "processed", fit: !!results?.size, report: false };
  const status = ctx ? `${captures.length} photo(s) · ${session!.status === "processed" ? "processed" : "in progress"}` : "Ready";
  return (
    <DemoShell branding={branding} app="AI Shoe & Foot Measurement and Fitting" project={ctx ? session!.name : "No session open"} status={status}
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All demos" }} contact="/contact?division=computer-vision" badge="Computer vision demo"
      footer={`${CV_DISCLAIMER} Foot measurement uses a sheet of paper as scale; results are estimates, not medical or orthotic measurements. No faces or identities are analysed.`}
      actions={ctx ? <button type="button" className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white" onClick={closeSession}>All sessions</button> : undefined}>
      <div className="min-h-[70vh] bg-stone-100 text-stone-900">
        {toast && <div role="status" aria-live="polite" className={`fixed bottom-4 left-1/2 z-[80] w-[min(92vw,34rem)] -translate-x-1/2 rounded-lg px-4 py-3 text-sm shadow-lg ${toast.bad ? "bg-red-800 text-white" : "bg-stone-900 text-white"}`}>{toast.m}</div>}
        {!ctx ? <Landing start={start} busy={busy} history={history} open={open} health={health} /> : (
          <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
            <nav aria-label="Measurement stages" className="mb-4 overflow-x-auto"><ol className="flex min-w-max gap-1.5">{STEPS.map((s, i) => <li key={s.id}><button type="button" onClick={() => setStep(s.id)} aria-current={step === s.id ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left ${step === s.id ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white text-stone-800 hover:border-emerald-600"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === s.id ? "bg-white text-emerald-800" : done[s.id] ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-700"}`}>{done[s.id] && step !== s.id ? "✓" : i + 1}</span><span><span className="block text-sm font-semibold leading-tight">{s.label}</span><span className={`block text-xs ${step === s.id ? "text-emerald-100" : "text-stone-500"}`}>{s.hint}</span></span></button></li>)}</ol></nav>
            {step === "setup" && <SetupStep c={ctx} />}{step === "capture" && <CaptureStep c={ctx} />}{step === "review" && <ReviewStep c={ctx} />}{step === "results" && <ResultsStep c={ctx} />}{step === "fit" && <FitStep c={ctx} />}{step === "report" && <ReportStep c={ctx} />}
          </div>)}
      </div>
    </DemoShell>
  );
}

function Landing({ start, busy, history, open, health }: { start: (k: "measure" | "upload" | "demo") => void; busy: string; history: SessionDTO[]; open: (id: string, key: string) => void; health: string }) {
  const keys = useMemo(() => Object.fromEntries(saved.list().map((s) => [s.id, s.key])), [history]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">Foot scanning · fit · retail</p>
          <h2 className="mt-2 font-display text-4xl font-bold leading-tight text-stone-900 sm:text-5xl">Measure both feet with a phone and one sheet of paper.</h2>
          <p className="mt-4 max-w-xl text-lg text-stone-700">Stand on an A4 or US Letter sheet, take a photo from above, and get calibrated foot length and width, left-vs-right differences and a shoe-size estimate — or upload photos you already have.</p>
          <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={!!busy || health === "down"} onClick={() => start("measure")} className={`${GO} !px-6 !py-3 !text-base`}>{busy === "measure" ? "Starting…" : "Start Foot Measurement"}</button><button type="button" disabled={!!busy || health === "down"} onClick={() => start("upload")} className={`${BIG} !px-6 !py-3 !text-base`}>{busy === "upload" ? "Starting…" : "Upload Existing Scan"}</button><button type="button" disabled={!!busy || health === "down"} onClick={() => start("demo")} className={`${BIG} !px-6 !py-3 !text-base`}>{busy === "demo" ? "Preparing sample…" : "Try with sample data"}</button></div>
          {health === "down" && <p role="alert" className="mt-3 rounded bg-red-50 p-2 text-sm text-red-900">The measurement service is not reachable right now. Try again shortly.</p>}
          <p className="mt-3 text-sm text-stone-600">Sample data = a rendered scene with a known foot size, so you can try every screen without a camera. It is labelled everywhere it appears.</p>
        </div>
        <HeroArt />
      </section>
      <section className="mt-10 grid gap-4 md:grid-cols-4" aria-label="How it works">
        {[["1", "Set the scale", "A plain A4 or Letter sheet on the floor is the ruler."], ["2", "Photograph from above", "On your phone via QR code, in this browser, or upload files. Live checks guide you."], ["3", "Check & correct", "See exactly what was detected. Fix the sheet corners by hand if needed."], ["4", "Get sizes", "Length, width, left vs right, EU / UK / US sizes, a printable report."]].map(([n, t, d]) => <div key={n} className={CARD}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">{n}</span><h3 className="mt-2 font-semibold text-stone-900">{t}</h3><p className={SUB}>{d}</p></div>)}
      </section>
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className={CARD}><h3 className={H}>What it measures — and what it doesn’t</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700"><li><b>Measured:</b> foot length, widest width, forefoot (ball) width, heel width, outline area, left-vs-right difference.</li><li><b>Not measured:</b> girth, instep height, arch height or volume — a single top photo cannot give them, so they are never shown.</li><li>Typical limits: needs a flat sheet, bare or dark-sock foot, even light. Not validated against clinical scanners.</li><li>Shoe sizes follow general conversion rules; no brand’s official chart is bundled.</li></ul></div>
        <div className={CARD}><h3 className={H}>Privacy</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700"><li>Live camera guidance runs on your device; nothing is sent until you confirm a photo.</li><li>Photos are downscaled, stored privately under an unguessable session key, never public, and deleted automatically after a retention period or whenever you delete the session.</li><li>The QR code carries a link that expires in 30 minutes and can only add photos.</li><li>Nothing identifies a person: no face or identity analysis of any kind.</li></ul><button type="button" className={`${BIG} mt-3`} onClick={() => openPrintCheck("a4")}>Open printer scale-check sheet</button></div>
      </section>
      <section className={`${CARD} mt-6`} aria-label="Recent sessions"><h3 className={H}>Your recent sessions</h3>{history.length === 0 ? <p className={SUB}>Sessions you create in this browser appear here so you can reopen them.</p> : <ul className="mt-2 divide-y divide-stone-200">{history.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1"><b className="text-stone-900">{s.name}</b> <span className="text-stone-600">· {s.captureCount} photo(s) · {s.status} · {new Date(s.updatedAt).toLocaleDateString("en-GB")}</span></span><button type="button" className={BIG} onClick={() => keys[s.id] && open(s.id, keys[s.id])}>Open</button></li>)}</ul>}</section>
    </div>
  );
}
function HeroArt() {
  return (
    <svg viewBox="0 0 420 340" className="w-full" role="img" aria-label="Illustration: a foot outline on a sheet of paper with length and width measurement lines">
      <rect width="420" height="340" rx="18" fill="#44403c" /><g transform="rotate(-4 210 180)"><rect x="40" y="52" width="340" height="240" fill="#fafaf9" stroke="#d6d3d1" strokeWidth="2" />
        <path d="M82 214 C70 184 78 146 114 138 C170 126 250 126 304 134 C336 142 344 186 322 206 C300 228 190 236 120 232 C98 232 86 226 82 214Z" fill="#e8c9a8" stroke="#a16207" strokeWidth="2" />
        <line x1="82" y1="258" x2="338" y2="258" stroke="#047857" strokeWidth="3" /><line x1="82" y1="250" x2="82" y2="266" stroke="#047857" strokeWidth="3" /><line x1="338" y1="250" x2="338" y2="266" stroke="#047857" strokeWidth="3" /><text x="210" y="280" textAnchor="middle" fontSize="16" fill="#065f46" fontFamily="Georgia" fontWeight="700">length</text>
        <line x1="270" y1="118" x2="270" y2="238" stroke="#b45309" strokeWidth="3" strokeDasharray="6 4" /><text x="286" y="112" fontSize="16" fill="#92400e" fontFamily="Georgia" fontWeight="700">width</text>
        {[[40, 52], [380, 52], [380, 292], [40, 292]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="7" fill="#10b981" stroke="#fff" strokeWidth="2" />)}</g>
      <text x="210" y="326" textAnchor="middle" fontSize="13" fill="#d6d3d1" fontFamily="Georgia">The sheet’s four corners set the scale</text>
    </svg>
  );
}
