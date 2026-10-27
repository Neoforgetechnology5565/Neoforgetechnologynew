"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureDTO, SessionDTO } from "@/lib/foot/api-types";
import { activeAnalysis } from "@/lib/foot/results";
import type { Side } from "@/lib/foot/types";
import { api, ApiError, prepareImage, type Auth } from "./api";
import CameraCapture from "./CameraCapture";
import { FOOT_SLUG, GRADE } from "./Parts";

const KEY = "neoforge-foot-phone";
interface Item { id: string; side: Side; name: string; blob: Blob; status: "sending" | "done" | "error"; progress: number; error?: string; capture?: CaptureDTO }
type BIP = Event & { prompt: () => Promise<void> };

/** Phone-side scanner (installable PWA). Holds a capture-only token; it can add photos to one session and nothing else. */
export default function ScanApp() {
  const [auth, setAuth] = useState<Auth | null>(null); const [session, setSession] = useState<SessionDTO | null>(null); const [problem, setProblem] = useState(""); const [side, setSide] = useState<Side>("right"); const [cam, setCam] = useState(false); const [items, setItems] = useState<Item[]>([]); const [online, setOnline] = useState(true); const [install, setInstall] = useState<BIP | null>(null); const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = window.location.hash.replace(/^#/, ""); const p = new URLSearchParams(h); let a: Auth | null = null;
    if (p.get("s") && p.get("t")) { a = { id: p.get("s")!, phone: p.get("t")! }; try { sessionStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode: keep in memory */ } window.history.replaceState(null, "", window.location.pathname); }
    else { try { a = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { a = null; } }
    if (!a) { setProblem("Open this page by scanning the QR code shown on the computer."); return; }
    setAuth(a); api.get(a).then((r) => setSession(r.session)).catch((e: ApiError) => setProblem(e.status === 403 || e.status === 404 ? "This link has expired or the session was deleted. On the computer, create a new QR code." : e.message));
  }, []);
  useEffect(() => { const on = () => setOnline(navigator.onLine), bip = (e: Event) => { e.preventDefault(); setInstall(e as BIP); }; setOnline(navigator.onLine); window.addEventListener("online", on); window.addEventListener("offline", on); window.addEventListener("beforeinstallprompt", bip); if ("serviceWorker" in navigator) navigator.serviceWorker.register("/api/foot/sw", { scope: `/ai-demos/${FOOT_SLUG}/` }).catch(() => undefined); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); window.removeEventListener("beforeinstallprompt", bip); }; }, []);

  const patch = (id: string, p: Partial<Item>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const send = useCallback(async (it: Item) => {
    if (!auth) return; patch(it.id, { status: "sending", progress: 0, error: undefined });
    try { const r = await api.upload(auth, it.blob, it.name, it.side, "camera", session?.paper ?? "auto", (f) => patch(it.id, { progress: f })); patch(it.id, { status: "done", capture: r.capture }); } catch (e) { patch(it.id, { status: "error", error: (e as Error).message }); }
  }, [auth, session?.paper]);
  const add = async (blobs: (Blob | File)[], nm = "photo.jpg") => { for (const b of blobs) { const p = await prepareImage(b, (b as File).name || nm); const it: Item = { id: Math.random().toString(36).slice(2), side, name: p.name, blob: p.blob, status: "sending", progress: 0 }; setItems((l) => [it, ...l]); void send(it); } };

  if (problem) return <Shell><p role="alert" className="rounded-xl bg-red-950 p-4 text-base text-red-100">{problem}</p></Shell>;
  return (
    <Shell>
      <header><p className="text-sm uppercase tracking-widest text-emerald-400">Neo Forge · Foot scanner</p><h1 className="mt-1 font-display text-2xl font-bold">{session?.name ?? "Connecting…"}</h1>{session && <p className="text-sm text-stone-400">Photos you take are sent to the computer that showed the QR code. {session.captureCount} so far.</p>}</header>
      {!online && <p role="status" className="mt-3 rounded-lg bg-amber-900 p-3 text-sm text-amber-100">You are offline. The scanner is ready, but photos can only be sent once you are back online.</p>}
      <div role="group" aria-label="Which foot" className="mt-4 grid grid-cols-2 gap-2">{(["left", "right"] as Side[]).map((s) => <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} className={`rounded-xl border-2 px-3 py-4 text-lg font-semibold ${side === s ? "border-emerald-400 bg-emerald-900/60" : "border-stone-700 bg-stone-900"}`}>{s === "left" ? "Left foot" : "Right foot"}</button>)}</div>
      <button type="button" disabled={!session} onClick={() => setCam(true)} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-5 text-xl font-bold text-white active:bg-emerald-500 disabled:opacity-50">Open camera — {side} foot</button>
      <button type="button" disabled={!session} onClick={() => pick.current?.click()} className="mt-3 w-full rounded-xl border border-stone-600 px-4 py-3 text-base text-stone-100">Use phone camera app / choose a photo</button>
      <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.length) void add(Array.from(e.target.files)); e.target.value = ""; }} />
      <details className="mt-4 rounded-xl bg-stone-900 p-3 text-sm text-stone-300"><summary className="cursor-pointer font-semibold text-stone-100">Quick guide</summary><ol className="mt-2 list-decimal space-y-1 pl-5"><li>White A4/Letter sheet flat on a darker floor.</li><li>Bare foot (or dark sock) on the sheet, heel near a short edge.</li><li>Hold the phone straight above, all 4 corners visible, no zoom.</li><li>Wait for the green outline, then capture.</li></ol></details>
      <ul className="mt-4 space-y-3" aria-label="Photos sent">{items.map((i) => { const a = i.capture ? activeAnalysis(i.capture) : null; return (
        <li key={i.id} className="rounded-xl border border-stone-700 bg-stone-900 p-3 text-sm"><div className="flex items-center gap-2"><b className="capitalize">{i.side}</b><span className="min-w-0 flex-1 truncate text-stone-400">{i.name}</span>{i.status === "sending" && <span className="tabular-nums text-stone-300">{i.progress < 1 ? `${Math.round(i.progress * 100)}%` : "analysing…"}</span>}{i.status === "done" && <span className="text-emerald-400">sent ✓</span>}</div>
          {i.status === "sending" && <div className="mt-2 h-1.5 rounded bg-stone-700"><div className="h-full rounded bg-emerald-500" style={{ width: `${i.progress * 100}%` }} /></div>}
          {i.status === "error" && <div className="mt-2"><p role="alert" className="text-red-300">{i.error}</p><button type="button" onClick={() => void send(i)} className="mt-2 rounded-lg border border-stone-500 px-4 py-2 text-base">Retry upload</button></div>}
          {a && (a.ok && a.measurement ? <p className="mt-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${GRADE[a.grade]}`}>{a.grade}</span> <b>{a.measurement.lengthMm} × {a.measurement.widthMm} mm</b> <span className="text-stone-400">(review on the computer)</span>{a.warnings[0] && <span className="mt-1 block text-amber-300">{a.warnings[0]}</span>}</p> : <p className="mt-2 text-amber-300">Not measured: {a.reason} Please retake.</p>)}</li>); })}</ul>
      {install && <button type="button" onClick={() => void install.prompt()} className="mt-4 w-full rounded-xl border border-stone-600 px-4 py-3 text-base">Install this scanner on the home screen</button>}
      <p className="mt-6 text-xs text-stone-500">Link is capture-only and expires about 30 minutes after it was created. Photos are stored privately and deleted with the session.</p>
      {cam && <CameraCapture paper={session?.paper ?? "a4"} title={`${side === "left" ? "Left" : "Right"} foot — top view`} onClose={() => setCam(false)} onFallback={() => { setCam(false); pick.current?.click(); }} onUse={(b) => { setCam(false); void add([b], `camera-${side}.jpg`); }} />}
    </Shell>
  );
}
function Shell({ children }: { children: React.ReactNode }) { return <main className="app-readable min-h-screen bg-stone-950 px-4 py-5 text-stone-100"><div className="mx-auto max-w-md">{children}</div></main>; }
