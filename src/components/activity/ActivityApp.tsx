"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { ActivityApiError, activityApi } from "@/lib/activity/api";
import { browserActivity } from "@/lib/activity/browser";
import { DEFAULT_AGGR, DEFAULT_FALL, SENSITIVE_AGGR, SENSITIVE_FALL, STATUS_LABEL, STATUS_STYLE, type AggressionRules, type Alert, type AlertStatus, type FallRules, type FrameObs, type Health, type SampleInfo, type Summary, type VideoStatus } from "@/lib/activity/types";
import ClipPlayer, { type PlayerHandle } from "./ClipPlayer";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const INPUT = "w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100";
const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const NOTICE = "Alerts are candidates from simple rules over person detections and pose estimates. They are fallible: they miss real events and flag harmless ones. A person must review every alert. This is not an emergency, safety or security system and must not be relied on to detect falls or violence. It does not identify people.";
type Preset = "default" | "sensitive" | "custom";
const FALL_LABELS: Record<keyof FallRules, string> = { min_upright_s: "Upright before drop (s)", window_s: "Upright → lying within (s)", upright_tilt_deg: "Upright if torso tilt ≤ (°)", lying_tilt_deg: "Lying if torso tilt ≥ (°)", lying_aspect: "Lying if box width/height ≥", min_drop_torso: "Hip descent ≥ (torso lengths)", drop_height_ratio: "or box height ratio ≤", min_lying_s: "Stay low ≥ (s)", min_visibility: "Min pose visibility" };
const AGGR_LABELS: Record<keyof AggressionRules, string> = { max_distance: "Close if distance ≤ (box heights)", min_arm_speed: "Fast arm ≥ (torso lengths/s)", min_duration_s: "Duration ≥ (s)", min_fraction: "Share of fast samples ≥", min_visibility: "Min pose visibility" };

export default function ActivityApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? activityApi(serviceUrl) : browserActivity()), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">("unknown"); const [health, setHealth] = useState<Health | null>(null); const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [vs, setVs] = useState<VideoStatus | null>(null); const [summary, setSummary] = useState<Summary | null>(null); const [alerts, setAlerts] = useState<Alert[]>([]); const [frames, setFrames] = useState<FrameObs[]>([]); const [fps, setFps] = useState(5);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [name, setName] = useState("");
  const [preset, setPreset] = useState<Preset>("default"); const [fall, setFall] = useState<FallRules>(DEFAULT_FALL); const [aggr, setAggr] = useState<AggressionRules>(DEFAULT_AGGR);
  const [sampleFps, setSampleFps] = useState(serviceUrl ? 5 : 3); const [startS, setStartS] = useState(0); const [endS, setEndS] = useState(""); const [detThr, setDetThr] = useState(0.35); const [usePose, setUsePose] = useState(true); const [advanced, setAdvanced] = useState(false);
  const [overlay, setOverlay] = useState({ boxes: true, ids: true, pose: true }); const [sel, setSel] = useState<string | null>(null); const [note, setNote] = useState(""); const [msg, setMsg] = useState("");
  const [fStatus, setFStatus] = useState<"all" | AlertStatus>("all"); const [fKind, setFKind] = useState<"all" | "fall" | "aggression">("all");
  const player = useRef<PlayerHandle>(null);
  const selected = alerts.find((a) => a.id === sel) ?? null;
  const vid = vs?.video_id;

  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); api.samples().then((s) => setSamples(s.samples)).catch(() => undefined); }, [api]);
  useEffect(() => { if (service !== "offline") return; fetch("/activity/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples)).catch(() => undefined); }, [service]);

  const choosePreset = (p: Preset) => { setPreset(p); if (p === "default") { setFall(DEFAULT_FALL); setAggr(DEFAULT_AGGR); } if (p === "sensitive") { setFall(SENSITIVE_FALL); setAggr(SENSITIVE_AGGR); } };
  const rules = { fall, aggression: aggr };

  const load = useCallback(async (id: string) => {
    if (!api) return;
    const [s, a, f] = await Promise.all([api.summary(id), api.alerts(id), api.frames(id)]);
    setSummary(s); setAlerts(a.alerts); setFrames(f.frames); setFps(f.analysed_fps || 5); setSel(a.alerts[0]?.id ?? null); setNote(a.alerts[0]?.note ?? "");
  }, [api]);

  // poll while a job runs; the preview poll is the same loop (preview state arrives in the status)
  useEffect(() => {
    if (!api || !vid || !vs || !["queued", "running"].includes(vs.status) && vs.preview_done) return;
    const t = setInterval(async () => {
      try { const st = await api.status(vid); setVs(st); if (st.status === "completed") await load(vid); } catch (e) { setError(e instanceof Error ? e.message : "Lost contact with the service."); }
    }, 1000);
    return () => clearInterval(t);
  }, [api, vid, vs, load]);

  const start = async (src: File | SampleInfo, label: string) => {
    if (!api) return; setError(""); setMsg(""); setBusy(true); setSummary(null); setAlerts([]); setFrames([]); setSel(null);
    try {
      if (vid) await api.remove(vid).catch(() => undefined);
      setVs(await api.upload(src instanceof File ? src : { sampleId: src.id })); setName(label);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); setVs(null); } finally { setBusy(false); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!VIDEO_RE.test(f.name) && !f.type.startsWith("video/")) { setError("Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI video."); return; }
    const lim = (health?.limits.max_video_mb ?? 300) * 1_000_000; if (f.size > lim) { setError(`The file is larger than the ${lim / 1_000_000} MB limit.`); return; }
    void start(f, f.name);
  };
  const process = async () => { if (!api || !vid) return; setError(""); setBusy(true); try { setVs(await api.process(vid, { sample_fps: sampleFps, det_threshold: detThr, pose: usePose, start_s: startS, end_s: endS === "" ? null : Number(endS), ...rules })); setSummary(null); setAlerts([]); setFrames([]); } catch (e) { setError(e instanceof Error ? e.message : "Could not start."); } finally { setBusy(false); } };
  const cancel = async () => { if (api && vid) await api.cancel(vid).catch(() => undefined); };
  const reanalyse = async (discard = false) => {
    if (!api || !vid) return; setError("");
    try { const r = await api.reanalyse(vid, rules, discard); setAlerts(r.alerts); setSel(r.alerts[0]?.id ?? null); setNote(""); setMsg(`Rules re-applied to the stored detections: ${r.alerts.length} candidate(s). The video was not reprocessed.`); setSummary(await api.summary(vid)); }
    catch (e) { if (e instanceof ActivityApiError && e.status === 409 && window.confirm(`${e.message}\n\nReplace the existing alerts and reviews?`)) await reanalyse(true); else setError(e instanceof Error ? e.message : "Could not re-analyse."); }
  };
  const review = async (status: AlertStatus) => {
    if (!api || !selected) return; setMsg("");
    try { const a = await api.review(selected.id, status, note); setAlerts((all) => all.map((x) => (x.id === a.id ? a : x))); setMsg(`Recorded: ${STATUS_LABEL[status]}.`); if (vid) api.summary(vid).then(setSummary).catch(() => undefined); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not record the review."); }
  };
  const pick = (a: Alert) => { setSel(a.id); setNote(a.note); setMsg(""); player.current?.playRange(a.t_start - 2, a.t_end + 2); };
  const shown = alerts.filter((a) => (fStatus === "all" || a.status === fStatus) && (fKind === "all" || a.kind === fKind));
  const running = vs && ["queued", "running"].includes(vs.status);
  const done = vs?.status === "completed";
  const counts = summary?.counts;

  return (
    <DemoShell branding={branding} app="AI Human Activity, Fall & Aggression Review" project={name || "No video selected"} status={service === "online" ? "Service online" : service === "offline" ? "Service not connected" : "Checking service…"} badge="Computer Vision · prototype"
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="Candidate events from simple rules over person detection and pose; fallible, for human review only. Not an emergency, safety or security system. No face recognition or identification. The sample clip comes from the OpenCV repository (Apache-2.0) and contains no falls or fights.">
      <div className="mx-auto max-w-[1500px] space-y-4 p-3 sm:p-4">
        <div role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13px] leading-snug text-amber-100" data-testid="notice"><strong>Human review required.</strong> {NOTICE}</div>
        {service === "offline" && <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300" role="alert">The activity review service is not connected, so nothing can be analysed. Start <code>services/activity-monitor</code> and set <code>ACTIVITY_API_URL</code>. No results are shown without it.</div>}
        {error && <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_380px]">
          {/* left: source + settings */}
          <div className="space-y-4">
            <section className={CARD} aria-label="Video source">
              <h2 className={H3}>1 · Video</h2>
              <label className="mt-3 block cursor-pointer rounded-md border border-dashed border-slate-600 p-3 text-center text-sm text-slate-300 hover:border-blue-500">
                Upload a video (MP4, MOV, WebM, MKV, AVI{health ? `, up to ${health.limits.max_video_mb} MB and ${health.limits.max_video_seconds} s` : ""})
                <input type="file" accept="video/*,.mkv,.avi" className="sr-only" data-testid="file-input" disabled={service !== "online" || busy || !!running} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <div className="mt-3 space-y-2">
                {samples.map((s) => (
                  <div key={s.id} className="rounded-md border border-slate-800 p-2 text-xs text-slate-300">
                    <p className="font-semibold text-slate-100">{s.title}</p>
                    <p className="mt-1">{s.contains}</p>
                    <details className="mt-1 text-slate-400"><summary className="cursor-pointer">Source and licence</summary><p className="mt-1">{s.source}</p><p className="mt-1">{s.licence}</p><p className="mt-1">Does not demonstrate: {s.does_not_demonstrate.join(", ")}.</p></details>
                    <button className={`${BTN} mt-2`} disabled={service !== "online" || busy || !!running} onClick={() => start(s, s.title)} data-testid="open-sample">Open this sample</button>
                  </div>
                ))}
              </div>
            </section>

            <section className={CARD} aria-label="Analysis settings">
              <h2 className={H3}>2 · Settings</h2>
              <div className="mt-3 space-y-3 text-xs text-slate-300">
                <label className="flex items-center justify-between gap-2">Analysed frames per second<input type="number" min={1} max={12} step={1} value={sampleFps} onChange={(e) => setSampleFps(Number(e.target.value))} className={INPUT} /></label>
                <label className="flex items-center justify-between gap-2">Start at (seconds)<input type="number" min={0} step={1} value={startS} onChange={(e) => setStartS(Number(e.target.value))} className={INPUT} data-testid="start-s" /></label>
                <label className="flex items-center justify-between gap-2">End at (seconds, optional)<input type="number" min={1} step={1} value={endS} placeholder="to the end" onChange={(e) => setEndS(e.target.value)} className={INPUT} data-testid="end-s" /></label>
                <label className="flex items-center justify-between gap-2">Person detection threshold<input type="number" min={0.15} max={0.95} step={0.05} value={detThr} onChange={(e) => setDetThr(Number(e.target.value))} className={INPUT} /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={usePose} onChange={(e) => setUsePose(e.target.checked)} />Estimate pose (needed for both rules)</label>
                <fieldset><legend className="mb-1 text-slate-400">Rule sensitivity</legend>
                  <div className="flex flex-wrap gap-2">{(["default", "sensitive"] as const).map((p) => <button key={p} className={`${BTN} ${preset === p ? "border-blue-500 text-white" : ""}`} onClick={() => choosePreset(p)} data-testid={`preset-${p}`}>{p === "default" ? "Default" : "High sensitivity"}</button>)}{preset === "custom" && <span className="self-center text-slate-400">Custom</span>}</div>
                  <p className="mt-1 text-slate-500">High sensitivity lowers the thresholds: more candidates, many of them false alarms. Useful for seeing how review works on footage with no real events.</p>
                </fieldset>
                <button className="text-blue-400 hover:underline" onClick={() => setAdvanced((a) => !a)}>{advanced ? "Hide thresholds" : "Show thresholds"}</button>
                {advanced && (
                  <div className="space-y-1" data-testid="thresholds">
                    <p className="font-semibold text-slate-200">Fall rule</p>
                    {(Object.keys(FALL_LABELS) as (keyof FallRules)[]).map((k) => <label key={k} className="flex items-center justify-between gap-2">{FALL_LABELS[k]}<input type="number" step="any" value={fall[k]} onChange={(e) => { setPreset("custom"); setFall({ ...fall, [k]: Number(e.target.value) }); }} className={INPUT} /></label>)}
                    <p className="pt-2 font-semibold text-slate-200">Rapid close-contact rule</p>
                    {(Object.keys(AGGR_LABELS) as (keyof AggressionRules)[]).map((k) => <label key={k} className="flex items-center justify-between gap-2">{AGGR_LABELS[k]}<input type="number" step="any" value={aggr[k]} onChange={(e) => { setPreset("custom"); setAggr({ ...aggr, [k]: Number(e.target.value) }); }} className={INPUT} /></label>)}
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={GO} disabled={!vid || busy || !!running || service !== "online"} onClick={process} data-testid="process">{done ? "Process again" : "Process video"}</button>
                {done && <button className={BTN} onClick={() => reanalyse()} data-testid="reanalyse" title="Re-apply the thresholds to the stored detections without reprocessing the video">Apply thresholds only</button>}
                {running && <button className={BTN} onClick={cancel}>Cancel</button>}
              </div>
              {vs && running && <div className="mt-3" data-testid="progress"><div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${Math.round(vs.progress.fraction * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-400">{vs.status === "queued" ? "Queued…" : `${vs.progress.frames_done} of ${vs.progress.frames_total} frames · ${vs.progress.elapsed_seconds.toFixed(0)} s`}</p></div>}
              {vs?.status === "failed" && <p className="mt-3 text-xs text-red-300" role="alert">{vs.error}{vs.error_detail ? ` ${vs.error_detail}` : ""}</p>}
              {vs?.status === "cancelled" && <p className="mt-3 text-xs text-slate-400">Cancelled. No results were kept.</p>}
            </section>
          </div>

          {/* centre: player */}
          <div className="min-w-0 space-y-4">
            {vs ? (
              <ClipPlayer ref={player} src={vs.preview_formats.includes("mp4") ? api!.videoUrl(vs.video_id, "mp4") : vs.preview_formats.includes("webm") ? api!.videoUrl(vs.video_id, "webm") : null}
                fallbackSrc={vs.preview_formats.includes("webm") && vs.preview_formats.includes("mp4") ? api!.videoUrl(vs.video_id, "webm") : null} frames={frames} sampleDt={1 / fps} srcW={vs.video.width} srcH={vs.video.height}
                duration={vs.video.duration_seconds} preparing={!vs.preview_done} overlay={overlay} flagged={selected?.tracks ?? []} alerts={alerts} selectedId={sel} onPickAlert={(id) => { const a = alerts.find((x) => x.id === id); if (a) pick(a); }} />
            ) : <div className={`${CARD} grid aspect-video place-items-center text-center text-sm text-slate-400`}>Choose a video to begin. Nothing is analysed until you press “Process video”.</div>}
            {vs && !vs.preview_done && <p className="text-xs text-slate-400">Preparing a browser preview…</p>}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              {(["boxes", "ids", "pose"] as const).map((k) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={overlay[k]} onChange={(e) => setOverlay({ ...overlay, [k]: e.target.checked })} data-testid={`ov-${k}`} />{k === "ids" ? "Track ids" : k === "boxes" ? "Boxes" : "Pose"}</label>)}
              {done && vid && api && <>{api.annotatedUrl(vid) && <a className={BTN} href={api.annotatedUrl(vid)} data-testid="dl-annotated">Annotated video (MP4)</a>}<a className={BTN} href={api.exportUrl(vid, "alerts.csv")} download={`alerts-${vid.slice(0, 8)}.csv`} data-testid="dl-csv">Alerts CSV</a><a className={BTN} href={api.exportUrl(vid, "alerts.json")} download={`alerts-${vid.slice(0, 8)}.json`} data-testid="dl-json">Alerts JSON</a></>}
            </div>

            {summary && counts && (
              <section className={CARD} aria-label="Processing summary" data-testid="summary">
                <h2 className={H3}>Processing summary</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  {[["Analysed frames", counts.analysed_frames], ["Analysed rate", `${summary.analysed_fps} fps`], ["Person observations", counts.person_observations], ["Tracks (temporary ids)", counts.tracks], ["Tracks with pose", counts.tracks_with_pose], ["Pose estimates run", counts.pose_runs], ["Candidate alerts", counts.alerts], ["Processing time", `${summary.timing_seconds.total} s`]].map(([k, v]) => <div key={String(k)}><dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt><dd className="font-semibold text-white">{v}</dd></div>)}
                </dl>
                <p className="mt-2 text-xs text-slate-400">Detection {summary.timing_seconds.detect} s, pose {summary.timing_seconds.pose} s for a {summary.video.duration_seconds} s video. Models: {Object.values(summary.models).map((m) => m.name).join(" · ")}.</p>
                {summary.warnings.map((w) => <p key={w} className="mt-1 text-xs text-amber-300">{w}</p>)}
                {counts.alerts === 0 && <p className="mt-2 text-sm text-slate-200" data-testid="no-alerts">No candidate events were produced with these thresholds. That does not mean nothing happened: the rules have limits (see below).</p>}
                <details className="mt-3 text-xs text-slate-300"><summary className="cursor-pointer text-slate-200">Tracks ({summary.tracks.length})</summary>
                  <div className="mt-2 max-h-48 overflow-auto"><table className="w-full text-left"><thead className="text-slate-400"><tr><th className="pr-3">Track</th><th className="pr-3">First</th><th className="pr-3">Last</th><th className="pr-3">Observations</th><th>With pose</th></tr></thead><tbody>{summary.tracks.map((t) => <tr key={t.id}><td>#{t.id}</td><td>{fmt(t.first_s)}</td><td>{fmt(t.last_s)}</td><td>{t.observations}</td><td>{t.with_pose}</td></tr>)}</tbody></table></div>
                </details>
                <details className="mt-3 text-xs text-slate-300"><summary className="cursor-pointer text-slate-200">Limitations</summary><ul className="mt-2 list-disc space-y-1 pl-5">{summary.limitations.map((l) => <li key={l}>{l}</li>)}</ul></details>
              </section>
            )}
          </div>

          {/* right: alert queue and review */}
          <div className="space-y-4 lg:col-span-2 xl:col-span-1">
            <section className={CARD} aria-label="Alert queue" data-testid="queue">
              <h2 className={H3}>Alert queue</h2>
              {!done && <p className="mt-3 text-sm text-slate-400">Alerts appear here after processing. Nothing is shown before then.</p>}
              {done && (
                <>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <select aria-label="Filter by status" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"><option value="all">All statuses</option>{(Object.keys(STATUS_LABEL) as AlertStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
                    <select aria-label="Filter by type" value={fKind} onChange={(e) => setFKind(e.target.value as typeof fKind)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"><option value="all">All types</option><option value="fall">Possible falls</option><option value="aggression">Rapid close contact</option></select>
                    {counts && <span className="self-center text-slate-400">{counts.alerts_by_status.pending} pending of {counts.alerts}</span>}
                  </div>
                  <ul className="mt-3 max-h-[320px] space-y-2 overflow-auto">
                    {shown.map((a) => (
                      <li key={a.id}><button onClick={() => pick(a)} data-testid="alert-item" className={`w-full rounded-md border p-2 text-left text-xs ${a.id === sel ? "border-blue-500 bg-slate-800" : "border-slate-800 hover:border-slate-600"}`}>
                        <span className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-100">{a.title}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span></span>
                        <span className="mt-1 block text-slate-400">{fmt(a.t_start)}–{fmt(a.t_end)} · track {a.tracks.map((t) => `#${t}`).join(", ")} · {a.criteria_met}/{a.criteria_total} criteria met</span>
                      </button></li>
                    ))}
                    {shown.length === 0 && <li className="text-sm text-slate-400">{alerts.length ? "No alerts match the filters." : "No candidate alerts."}</li>}
                  </ul>
                </>
              )}
            </section>

            {selected && (
              <section className={CARD} aria-label="Alert details" data-testid="alert-detail">
                <h2 className={H3}>Alert {selected.id.split("-")[1]} · review</h2>
                <p className="mt-2 text-sm font-semibold text-white">{selected.title}</p>
                <p className="text-xs text-slate-400">{fmt(selected.t_start)} to {fmt(selected.t_end)}, strongest at {fmt(selected.t_peak)}. Tracks {selected.tracks.map((t) => `#${t}`).join(", ")} (temporary labels). Criteria are measured values compared with the thresholds, not a probability.</p>
                <div className="mt-2 flex flex-wrap gap-2"><button className={BTN} onClick={() => pick(selected)} data-testid="play-clip">Play clip</button>{vid && api && api.annotatedUrl(vid, selected.id) && <a className={BTN} href={api.annotatedUrl(vid, selected.id)}>Annotated clip (MP4)</a>}</div>
                <table className="mt-3 w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="py-1 pr-2">Evidence</th><th className="pr-2">Measured</th><th>Rule</th></tr></thead>
                  <tbody>{selected.evidence.map((e) => <tr key={e.name} className="border-t border-slate-800 align-top"><td className="py-1 pr-2 text-slate-200">{e.name}{e.note && <span className="block text-[11px] text-slate-500">{e.note}</span>}</td><td className="pr-2 text-white">{e.value === null ? "n/a" : String(e.value)}</td><td className={e.threshold === null ? "text-slate-500" : e.met ? "text-green-400" : "text-amber-400"}>{e.threshold === null ? "info" : `${e.threshold} ${e.met ? "✓" : "✗"}`}</td></tr>)}</tbody></table>
                {selected.notes.map((n) => <p key={n} className="mt-2 text-xs text-slate-400">{n}</p>)}
                <label className="mt-3 block text-xs text-slate-300">Reviewer note<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100" data-testid="note" /></label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={`${BTN} border-red-500/60`} onClick={() => review("confirmed")} data-testid="confirm">Confirm event</button>
                  <button className={BTN} onClick={() => review("dismissed")} data-testid="dismiss">Dismiss</button>
                  <button className={`${BTN} border-violet-500/60`} onClick={() => review("uncertain")} data-testid="uncertain">Mark uncertain</button>
                  {selected.status !== "pending" && <button className={BTN} onClick={() => review("pending")} data-testid="reset">Back to pending</button>}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">“Confirm event” records your judgement only. Nothing is sent anywhere and no one is notified.</p>
                {msg && <p className="mt-2 text-xs text-slate-300" role="status" data-testid="review-msg">{msg}</p>}
              </section>
            )}
            {msg && !selected && <p className="text-xs text-slate-300" role="status">{msg}</p>}
          </div>
        </div>
      </div>
    </DemoShell>
  );
}
