"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Logo from "@/components/Logo";
import type { Branding } from "@/lib/types";
import { viApi, ViError, type ViApi, type ViHealth, type ViSample, type VideoState, type Observations } from "@/lib/vi/api";
import { mmss, nearestFrame } from "@/lib/vi/format";

/* ───────── palette (light white + elegant green) ───────── */
export const GREEN = "#16834A", GREEN_DARK = "#11643A", GREEN_LIGHT = "#E9F7EF", GREEN_PALE = "#F3FBF6", BORDER = "#E2EAE5", TEXT = "#1C2922", SUB = "#66736B", WARN = "#D97706", ERR = "#DC2626";
export type Pt = [number, number];

/* ───────── honest feature status labels ───────── */
export type Status = "working" | "preview" | "soon" | "external" | "hardware" | "manual" | "experimental";
export const STATUS_TEXT: Record<Status, string> = { working: "Working", preview: "UI Preview — Not Functional", soon: "Coming Soon", external: "Requires External Integration", hardware: "Requires Compatible Hardware", manual: "Manual Annotation", experimental: "Experimental" };
const STATUS_CLS: Record<Status, string> = { working: "border-[#16834A]/40 bg-[#E9F7EF] text-[#11643A]", preview: "border-[#D97706]/40 bg-amber-50 text-amber-800", soon: "border-slate-300 bg-slate-100 text-slate-600", external: "border-violet-300 bg-violet-50 text-violet-800", hardware: "border-rose-300 bg-rose-50 text-rose-800", manual: "border-sky-300 bg-sky-50 text-sky-800", experimental: "border-[#D97706]/40 bg-amber-50 text-amber-800" };
export const StatusPill = ({ s, className = "" }: { s: Status; className?: string }) => <span data-status={s} className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[13px] font-semibold ${STATUS_CLS[s]} ${className}`}>{STATUS_TEXT[s]}</span>;
export function FeatureList({ items }: { items: { name: string; status: Status; note: string }[] }) {
  return <ul className="divide-y divide-[#E2EAE5] rounded-xl border border-[#E2EAE5] bg-white" data-testid="feature-list">{items.map((f) => <li key={f.name} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3"><span className="min-w-52 font-semibold text-[#1C2922]">{f.name}</span><StatusPill s={f.status} /><span className="basis-full text-[#66736B] sm:basis-auto sm:flex-1">{f.note}</span></li>)}</ul>;
}

/* ───────── building blocks ───────── */
export const Card = ({ title, actions, children, className = "", testid }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; testid?: string }) => (
  <section data-testid={testid} className={`rounded-xl border border-[#E2EAE5] bg-white shadow-sm ${className}`}>
    {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2EAE5] bg-[#F3FBF6] px-4 py-2.5 rounded-t-xl"><h2 className="text-[16px] font-semibold text-[#11643A]">{title}</h2><div className="flex flex-wrap items-center gap-2">{actions}</div></div>}
    <div className="p-4">{children}</div>
  </section>
);
export const Btn = ({ kind = "default", small, children, testid, ...p }: { kind?: "default" | "primary" | "danger"; small?: boolean; testid?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" data-testid={testid} {...p} className={`rounded-lg border font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${small ? "px-2.5 py-1 text-[14px]" : "px-3.5 py-1.5 text-[15px]"} ${kind === "primary" ? "border-[#16834A] bg-[#16834A] text-white hover:bg-[#11643A]" : kind === "danger" ? "border-[#DC2626]/40 bg-white text-[#DC2626] hover:bg-red-50" : "border-[#E2EAE5] bg-white text-[#1C2922] hover:border-[#16834A] hover:text-[#11643A]"} ${p.className ?? ""}`}>{children}</button>
);
export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => <label className="block"><span className="mb-1 block text-[14px] font-semibold text-[#1C2922]">{label}</span>{children}{hint && <span className="mt-0.5 block text-[13px] text-[#66736B]">{hint}</span>}</label>;
export const INPUT = "w-full rounded-lg border border-[#E2EAE5] bg-white px-2.5 py-1.5 text-[15px] text-[#1C2922] outline-none focus:border-[#16834A] focus:ring-1 focus:ring-[#16834A]";
export const Num = ({ label, value, onChange, min, max, step = 1, hint, testid }: { label: string; value: number; onChange(v: number): void; min?: number; max?: number; step?: number; hint?: string; testid?: string }) => (
  <Field label={label} hint={hint}><input data-testid={testid} type="number" className={INPUT} value={Number.isFinite(value) ? value : ""} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} /></Field>
);
export const Notice = ({ tone = "info", children, testid }: { tone?: "info" | "warn" | "error"; children: ReactNode; testid?: string }) => <div role={tone === "error" ? "alert" : "note"} data-testid={testid} className={`rounded-lg border px-3 py-2 text-[14px] leading-snug ${tone === "error" ? "border-[#DC2626]/40 bg-red-50 text-red-800" : tone === "warn" ? "border-[#D97706]/40 bg-amber-50 text-amber-900" : "border-[#16834A]/30 bg-[#F3FBF6] text-[#11643A]"}`}>{children}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-lg border border-dashed border-[#E2EAE5] bg-[#F7F9F8] px-4 py-6 text-center text-[#66736B]">{children}</p>;
export const Kpi = ({ label, value, sub, testid }: { label: string; value: ReactNode; sub?: ReactNode; testid?: string }) => <div data-testid={testid} className="rounded-xl border border-[#E2EAE5] bg-white p-3"><p className="text-[13px] font-semibold uppercase tracking-wide text-[#66736B]">{label}</p><p className="mt-0.5 text-[26px] font-semibold tabular-nums text-[#11643A]">{value}</p>{sub && <p className="text-[13px] text-[#66736B]">{sub}</p>}</div>;
export function Table({ head, rows, testid, empty = "Nothing to show." }: { head: string[]; rows: ReactNode[][]; testid?: string; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <div className="overflow-x-auto"><table data-testid={testid} className="min-w-full text-[14px]"><thead><tr>{head.map((h) => <th key={h} className="border-b border-[#E2EAE5] bg-[#F7F9F8] px-3 py-2 text-left font-semibold text-[#1C2922]">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="odd:bg-white even:bg-[#F7F9F8]/60">{r.map((c, j) => <td key={j} className="border-b border-[#E2EAE5] px-3 py-1.5 align-top">{c}</td>)}</tr>)}</tbody></table></div>;
}

/* ───────── shell ───────── */
export function ViShell({ branding, title, project, nav, active, onNav, service, children, notice, back }: { branding: Branding; title: string; project: string; nav: { id: string; label: string }[]; active: string; onNav(id: string): void; service: "unknown" | "online" | "offline"; children: ReactNode; notice: string; back?: string }) {
  return (
    <div className="app-readable min-h-screen bg-white text-[#1C2922]" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
      <header className="border-b border-[#E2EAE5] bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/portfolio/computer-vision" aria-label="Neo Forge Technology: back to the computer vision portfolio" className="shrink-0"><Logo media={branding.logoLight} trim={branding.autoTrim} height={30} dark={false} priority /></Link>
          <div className="border-l border-[#E2EAE5] pl-5"><h1 className="text-[22px] font-semibold leading-tight text-[#11643A]">{title}</h1><p className="text-[14px] text-[#66736B]">{project}</p></div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span data-testid="service-status" data-state={service} className={`rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${service === "online" ? "border-[#16834A]/40 bg-[#E9F7EF] text-[#11643A]" : service === "offline" ? "border-[#DC2626]/40 bg-red-50 text-[#DC2626]" : "border-[#E2EAE5] bg-[#F7F9F8] text-[#66736B]"}`}>{service === "online" ? "Video service online" : service === "offline" ? "Video service not connected" : "Checking service…"}</span>
            <Link href={back ?? "/portfolio/computer-vision"} className="rounded-lg border border-[#E2EAE5] px-3 py-1.5 text-[14px] font-semibold hover:border-[#16834A]">← All CV demos</Link>
            <Link href="/contact?division=computer-vision" className="rounded-lg bg-[#16834A] px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-[#11643A]">Request similar software</Link>
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-3 sm:px-5">
          {nav.map((n) => <button key={n.id} type="button" data-nav={n.id} aria-current={active === n.id ? "page" : undefined} onClick={() => onNav(n.id)} className={`whitespace-nowrap border-b-[3px] px-4 py-2.5 text-[16px] font-medium ${active === n.id ? "border-[#16834A] text-[#11643A]" : "border-transparent text-[#66736B] hover:text-[#1C2922]"}`}>{n.label}</button>)}
        </nav>
      </header>
      <main className="mx-auto max-w-[1500px] space-y-4 bg-[#F7F9F8]/0 p-3 sm:p-5" id="app-main">
        <Notice testid="notice">{notice}</Notice>
        {service === "offline" && <Notice tone="error" testid="offline">The video service is not connected, so nothing can be analysed. Start <code>services/video-intel</code> and set <code>VI_API_URL</code>. No results are shown without it.</Notice>}
        {children}
      </main>
      <footer className="border-t border-[#E2EAE5] bg-[#F7F9F8] px-4 py-3 text-[14px] text-[#66736B]">Demonstration software. Videos are processed on the demo server, kept temporarily and deleted automatically. No face recognition or identification is performed.</footer>
    </div>
  );
}

/* ───────── session: health, samples, one video, its analysis ───────── */
export interface Session {
  api: ViApi | null; service: "unknown" | "online" | "offline"; health: ViHealth | null; samples: ViSample[]; video: VideoState | null; obs: Observations | null; busy: boolean; error: string;
  t: number; setT(t: number): void; seek(t: number): void; videoRef: React.RefObject<HTMLVideoElement | null>;
  open(sample: string): Promise<void>; upload(f: File): Promise<void>; run(params: Record<string, unknown>): Promise<void>; cancel(): Promise<void>; close(): Promise<void>; setError(m: string): void;
}
export function useSession(serviceUrl: string | null, app: string): Session {
  const api = useMemo(() => (serviceUrl ? viApi(serviceUrl) : null), [serviceUrl]);
  const [service, setService] = useState<Session["service"]>(serviceUrl ? "unknown" : "offline");
  const [health, setHealth] = useState<ViHealth | null>(null); const [samples, setSamples] = useState<ViSample[]>([]);
  const [video, setVideo] = useState<VideoState | null>(null); const [obs, setObs] = useState<Observations | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [t, setT] = useState(0); const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); api.samples(app).then((s) => setSamples(s.samples)).catch(() => undefined); }, [api, app]);
  const fail = (e: unknown) => setError(e instanceof ViError ? e.message : "Something went wrong.");
  const id = video?.video_id, status = video?.status, playback = video?.playback;
  useEffect(() => {
    if (!api || !id) return;
    if (status !== "queued" && status !== "running" && playback !== "pending") return;
    const h = setInterval(() => { api.state(id).then(setVideo).catch((e) => { setError(e instanceof ViError && e.status === 404 ? "The video expired on the server. Open it again." : "Lost contact with the service."); clearInterval(h); }); }, 1000);
    return () => clearInterval(h);
  }, [api, id, status, playback]);
  useEffect(() => { if (api && id && status === "completed") api.observations(id).then(setObs).catch(fail); else setObs(null); }, [api, id, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const seek = useCallback((x: number) => { setT(x); const v = videoRef.current; if (v) v.currentTime = x; }, []);
  const begin = async (f: () => Promise<VideoState>) => { if (!api) return; setBusy(true); setError(""); try { if (video) await api.remove(video.video_id).catch(() => undefined); setObs(null); setT(0); setVideo(await f()); } catch (e) { fail(e); } finally { setBusy(false); } };
  return {
    api, service, health, samples, video, obs, busy, error, t, setT, seek, videoRef, setError,
    open: (s) => begin(() => api!.openSample(s)), upload: (f) => begin(() => api!.upload(f)),
    run: async (p) => { if (!api || !video) return; setError(""); try { setObs(null); setVideo(await api.start(video.video_id, p)); } catch (e) { fail(e); } },
    cancel: async () => { if (api && video) try { setVideo(await api.cancel(video.video_id)); } catch (e) { fail(e); } },
    close: async () => { if (api && video) { await api.remove(video.video_id).catch(() => undefined); setVideo(null); setObs(null); setT(0); } },
  };
}

/* ───────── video source and run controls ───────── */
export function SourcePanel({ s, children, title = "Video" }: { s: Session; children?: ReactNode; title?: string }) {
  const v = s.video;
  return (
    <Card title={title} testid="source-panel">
      {!v ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Sample videos</h3>
            {!s.samples.length ? <Empty>{s.service === "online" ? "No samples are installed on the service." : "Samples appear when the service is connected."}</Empty> : (
              <ul className="space-y-2" data-testid="samples">{s.samples.map((x) => (
                <li key={x.id} className="rounded-lg border border-[#E2EAE5] p-3">
                  <p className="font-semibold">{x.title}</p><p className="text-[14px] text-[#66736B]">{x.duration_s}s · {x.resolution}</p>
                  <details className="mt-1 text-[14px]"><summary className="cursor-pointer text-[#11643A]">Source, licence and what it does not show</summary>
                    <p className="mt-1"><b>Contains:</b> {x.contains}</p><p><b>Source:</b> {x.source}</p><p><b>Licence:</b> {x.licence}</p><p><b>Demonstrates:</b> {x.demonstrates.join("; ")}.</p><p><b>Does not demonstrate:</b> {x.does_not_demonstrate.join("; ")}.</p></details>
                  <Btn small kind="primary" className="mt-2" disabled={s.busy || s.service !== "online"} onClick={() => s.open(x.id)} testid={`open-${x.id}`}>Open this sample</Btn>
                </li>))}</ul>)}
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Your own video</h3>
            <p className="mb-2 text-[14px] text-[#66736B]">MP4, MOV, WebM, MKV or AVI up to {s.health?.limits.max_video_mb ?? 200} MB and {s.health?.limits.max_video_seconds ?? 300} s. Only upload footage you have the right to process; people in it are not identified, but they are still people.</p>
            <input type="file" accept="video/*,.mkv" data-testid="upload" disabled={s.busy || s.service !== "online"} onChange={(e) => { const f = e.target.files?.[0]; if (f) void s.upload(f); e.target.value = ""; }} className="block w-full text-[15px]" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span data-testid="video-name" className="font-semibold">{v.source.startsWith("sample:") ? s.samples.find((x) => `sample:${x.id}` === v.source)?.title ?? v.source : "Your upload"}</span>
          <span className="text-[14px] text-[#66736B]">{v.video.width}×{v.video.height} · {v.video.fps} fps · {v.video.duration_seconds}s{v.video.fps_assumed ? " (frame rate assumed)" : ""}</span>
          <Btn small onClick={() => s.close()} className="ml-auto" testid="close-video">Choose another video</Btn>
        </div>
      )}
      {children}
      {s.error && <div className="mt-3"><Notice tone="error" testid="error">{s.error}</Notice></div>}
      {v && (v.status === "queued" || v.status === "running") && (
        <div className="mt-3" data-testid="progress"><div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E9F7EF]"><div className="h-full bg-[#16834A] transition-all" style={{ width: `${Math.round(v.progress.fraction * 100)}%` }} /></div>
          <p className="mt-1 flex items-center gap-3 text-[14px] text-[#66736B]">{v.status === "queued" ? "Waiting in the queue…" : `Analysing frame ${v.progress.frames_done} of ${v.progress.frames_total} (${Math.round(v.progress.fraction * 100)}%)`}<Btn small onClick={() => s.cancel()} testid="cancel">Cancel</Btn></p></div>)}
      {v?.status === "failed" && <div className="mt-3"><Notice tone="error" testid="job-error">{v.error ?? "The analysis failed."}</Notice></div>}
      {v?.status === "cancelled" && <div className="mt-3"><Notice tone="warn">The analysis was cancelled.</Notice></div>}
    </Card>
  );
}

/* ───────── video stage with overlays and click editing ───────── */
export interface Overlay { persons?: boolean; ball?: boolean; trailSeconds?: number; polygon?: Pt[]; closed?: boolean; points?: { p: Pt; label: string }[]; highlight?: number[]; flagged?: number[]; ids?: number[] }
export interface Edit { onAdd(p: Pt): void; hint: string }
export function Stage({ s, overlay = {}, edit, testid = "stage" }: { s: Session; overlay?: Overlay; edit?: Edit; testid?: string }) {
  const v = s.video, obs = s.obs; const canvas = useRef<HTMLCanvasElement | null>(null); const wrap = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false); const [rate, setRate] = useState(1); const [size, setSize] = useState(0);
  const W = v?.video.width ?? 16, H = v?.video.height ?? 9, dur = v?.video.duration_seconds ?? 0;
  const useVideo = v?.playback === "ready";
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSize(el.clientWidth)); ro.observe(el); setSize(el.clientWidth); return () => ro.disconnect(); }, [v?.video_id]);
  useEffect(() => { const el = s.videoRef.current; if (el && useVideo && Math.abs(el.currentTime - s.t) > 0.3) el.currentTime = s.t; }, [useVideo, v?.video_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // follow the video clock while playing
    const el = s.videoRef.current; if (!el || !useVideo) return; let raf = 0;
    const tick = () => { s.setT(el.currentTime); raf = requestAnimationFrame(tick); };
    const on = () => { setPlaying(true); raf = requestAnimationFrame(tick); }; const off = () => { setPlaying(false); cancelAnimationFrame(raf); s.setT(el.currentTime); };
    el.addEventListener("play", on); el.addEventListener("pause", off); el.addEventListener("ended", off); el.addEventListener("seeked", off);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("play", on); el.removeEventListener("pause", off); el.removeEventListener("ended", off); el.removeEventListener("seeked", off); };
  }, [useVideo, v?.video_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const times = useMemo(() => obs?.frames.map((f) => f.t) ?? [], [obs]);
  const draw = useCallback(() => {
    const c = canvas.current; if (!c || !size) return; const dpr = window.devicePixelRatio || 1; const w = size, h = (size * H) / W;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const g = c.getContext("2d"); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const k = w / W; g.lineJoin = "round"; g.font = "bold 12px Georgia, serif";
    const poly = overlay.polygon;
    if (poly && poly.length) {
      g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k))); if (overlay.closed && poly.length > 2) g.closePath();
      if (overlay.closed && poly.length > 2) { g.fillStyle = "rgba(22,131,74,0.18)"; g.fill(); } g.strokeStyle = GREEN; g.lineWidth = 2; g.stroke();
      poly.forEach(([x, y]) => { g.beginPath(); g.arc(x * k, y * k, 4, 0, 7); g.fillStyle = "#fff"; g.fill(); g.strokeStyle = GREEN; g.stroke(); });
    }
    overlay.points?.forEach(({ p, label }) => { g.beginPath(); g.arc(p[0] * k, p[1] * k, 5, 0, 7); g.fillStyle = GREEN; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke(); g.fillStyle = "#fff"; g.strokeStyle = GREEN_DARK; g.lineWidth = 3; g.strokeText(label, p[0] * k + 8, p[1] * k - 6); g.fillText(label, p[0] * k + 8, p[1] * k - 6); });
    if (obs) {
      const i = nearestFrame(times, s.t, 1.5 / Math.max(obs.effective_fps, 1));
      if (overlay.persons && i >= 0) for (const [id, x0, y0, x1, y1] of obs.frames[i].persons) {
        if (overlay.ids && !overlay.ids.includes(id)) continue;
        const hot = overlay.highlight?.includes(id), flag = overlay.flagged?.includes(id);
        g.strokeStyle = flag ? WARN : hot ? GREEN : "rgba(17,100,58,0.75)"; g.lineWidth = hot || flag ? 3 : 1.5; g.strokeRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
        const label = `#${id}`; const tw = g.measureText(label).width + 8; g.fillStyle = flag ? WARN : GREEN_DARK; g.fillRect(x0 * k, Math.max(0, y0 * k - 16), tw, 16); g.fillStyle = "#fff"; g.fillText(label, x0 * k + 4, Math.max(12, y0 * k - 4));
      }
      if (overlay.ball) {
        const tr = overlay.trailSeconds ?? 0.6, gap = 2.5 / Math.max(obs.effective_fps, 1); const pts = obs.ball_points.filter((p) => p.t <= s.t + 1e-6 && p.t >= s.t - tr);
        g.strokeStyle = "rgba(217,119,6,0.9)"; g.lineWidth = 2; g.beginPath(); pts.forEach((p, j) => { if (j && p.t - pts[j - 1].t <= gap) g.lineTo(p.x * k, p.y * k); else g.moveTo(p.x * k, p.y * k); }); g.stroke();
        const cur = pts[pts.length - 1]; if (cur && s.t - cur.t <= gap) { g.beginPath(); g.arc(cur.x * k, cur.y * k, 7, 0, 7); g.strokeStyle = WARN; g.lineWidth = 2.5; g.stroke(); }
      }
    }
  }, [size, W, H, overlay, obs, times, s.t]);
  useEffect(() => { draw(); }, [draw]);
  if (!v) return <Empty>Open a sample or upload a video to begin.</Empty>;
  const click = (e: React.MouseEvent<HTMLCanvasElement>) => { if (!edit) return; const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H; edit.onAdd([Math.round(x * 10) / 10, Math.round(y * 10) / 10]); };
  const step = (d: number) => s.seek(Math.min(dur, Math.max(0, s.t + d)));
  return (
    <div data-testid={testid}>
      <div ref={wrap} className="relative w-full overflow-hidden rounded-xl border border-[#E2EAE5] bg-black" style={{ aspectRatio: `${W} / ${H}` }}>
        {useVideo ? <video key={v.video_id} ref={s.videoRef} muted playsInline preload="auto" className="absolute inset-0 h-full w-full" data-testid="video">{v.playback_formats.includes("webm") && <source src={s.api!.playbackUrl(v.video_id, "webm")} type="video/webm" />}{v.playback_formats.includes("mp4") && <source src={s.api!.playbackUrl(v.video_id, "mp4")} type="video/mp4" />}</video>
          : v.playback === "pending" ? <p className="absolute inset-0 flex items-center justify-center text-white/80">Preparing a playable copy…</p>
            : <img src={s.api!.frameUrl(v.video_id, s.t)} alt={`Frame at ${mmss(s.t)}`} className="absolute inset-0 h-full w-full object-contain" data-testid="frame-image" />}
        <canvas ref={canvas} onClick={click} data-testid="overlay" className={`absolute left-0 top-0 ${edit ? "cursor-crosshair" : "pointer-events-none"}`} style={{ width: "100%", height: size ? (size * H) / W : "100%" }} />
      </div>
      {edit && <p className="mt-1 text-[14px] font-semibold text-[#11643A]" data-testid="edit-hint">{edit.hint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="transport">
        {useVideo && <Btn small onClick={() => { const el = s.videoRef.current; if (!el) return; if (el.paused) void el.play(); else el.pause(); }} testid="play">{playing ? "Pause" : "Play"}</Btn>}
        <Btn small onClick={() => step(-1 / Math.max(v.video.fps, 1))} aria-label="Previous frame">◀ frame</Btn><Btn small onClick={() => step(1 / Math.max(v.video.fps, 1))} aria-label="Next frame">frame ▶</Btn>
        <input type="range" aria-label="Video position" min={0} max={Math.max(dur, 0.1)} step={0.01} value={Math.min(s.t, dur)} onChange={(e) => s.seek(Number(e.target.value))} className="min-w-40 flex-1 accent-[#16834A]" data-testid="scrub" />
        <span className="tabular-nums text-[14px]" data-testid="clock">{mmss(s.t)} / {mmss(dur)}</span>
        {useVideo && <select aria-label="Playback speed" value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); if (s.videoRef.current) s.videoRef.current.playbackRate = r; }} className="rounded-lg border border-[#E2EAE5] bg-white px-1.5 py-1 text-[14px]">{[0.25, 0.5, 1, 2].map((r) => <option key={r} value={r}>{r}×</option>)}</select>}
      </div>
    </div>
  );
}

/** Pause the video when a control needs a still frame (calibration, area drawing). */
export const pauseVideo = (s: Session) => s.videoRef.current?.pause();
export const bounds = (r: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, r));
