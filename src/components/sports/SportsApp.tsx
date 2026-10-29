"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { SportsApiError, sportsApi } from "@/lib/sports/api";
import { browserSports } from "@/lib/sports/browser/engine";
import { CELL_M, MIN_POINTS, SIGMA_CELLS, heatmap, mappedPoints } from "@/lib/sports/heatmap";
import { TEAM_COLOR, TEAM_LABEL, type AnalysisParams, type Frame, type Health, type JobStatus, type Landmark, type Results, type SampleInfo, type Team } from "@/lib/sports/types";
import CalibrationModal from "./CalibrationModal";
import HeatCanvas from "./HeatCanvas";
import PitchDiagram from "./PitchDiagram";
import SportsPlayer, { type OverlayOpts, type PlayerHandle } from "./SportsPlayer";
import StatsTable from "./StatsTable";
import Timeline from "./Timeline";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40";
const STOP = "rounded-md border border-red-500/70 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const INPUT = "rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100";
const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mp4,.mov,.m4v,.webm,.mkv,.avi";
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
type ViewMode = "positions" | "trajectory" | "heatmap" | "zones";
type Period = { name: string; t0: number; t1: number };

const download = (name: string, body: BlobPart, type: string) => { const u = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
/** H.264 is missing from some browsers (e.g. open-source Chromium); the service then provides a VP9 WebM preview. */
const canH264 = () => { try { return !!document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'); } catch { return true; } };
const mmss = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export default function SportsApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? sportsApi(serviceUrl) : browserSports()), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">("unknown"); const [health, setHealth] = useState<Health | null>(null); const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [file, setFile] = useState<File | null>(null); const [sampleId, setSampleId] = useState<string | null>(null); const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [params, setParams] = useState<AnalysisParams>({ sample_fps: 5, start_s: 0, end_s: null, player_conf: 0.5, ball_conf: 0.3, analyse_ball: true, team_mode: "auto", pitch_length: 105, pitch_width: 68 });
  const [job, setJob] = useState<JobStatus | null>(null); const [results, setResults] = useState<Results | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<OverlayOpts>({ boxes: true, ids: true, confidence: false, ball: true, ballTrail: true, trajectory: true });
  const [selected, setSelected] = useState<number[]>([]); const [view, setView] = useState<ViewMode>("positions"); const [heatTeam, setHeatTeam] = useState<Team | "all">("all"); const [zone, setZone] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 0]); const [periods, setPeriods] = useState<Period[]>([]); const [periodName, setPeriodName] = useState("First half");
  const [time, setTime] = useState(0); const [frame, setFrame] = useState<Frame | null>(null); const [calOpen, setCalOpen] = useState(false); const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const player = useRef<PlayerHandle>(null); const poll = useRef<number | null>(null); const jobIdRef = useRef<string | null>(null);

  const running = !!job && (job.status === "queued" || job.status === "running");
  const frames = results?.frames ?? [];
  const L = results?.pitch.length_m ?? params.pitch_length, W = results?.pitch.width_m ?? params.pitch_width;
  const mapped = results?.pitch_mapping.status === "available" || results?.pitch_mapping.status === "poor";
  const sampleDt = results?.summary ? 1 / results.summary.sampling_fps : 1 / params.sample_fps;
  const duration = job?.video.duration_seconds ?? 0;
  const srcW = job?.video.width ?? 1920, srcH = job?.video.height ?? 1080;

  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); api.samples().then((s) => setSamples(s.samples)).catch(() => undefined); }, [api]);
  useEffect(() => () => { if (poll.current) window.clearInterval(poll.current); }, []);
  useEffect(() => { if (!localUrl) return; return () => URL.revokeObjectURL(localUrl); }, [localUrl]);

  const reset = useCallback(() => {
    if (poll.current) { window.clearInterval(poll.current); poll.current = null; }
    setJob(null); setResults(null); setError(""); setSelected([]); setZone(null); setView("positions"); setRange([0, 0]); setFrame(null); setTime(0);
    if (api && jobIdRef.current) void api.remove(jobIdRef.current).catch(() => undefined); jobIdRef.current = null;
  }, [api]);

  const pickFile = (f: File | undefined) => {
    if (!f || running) return; reset();
    if (!VIDEO_EXT.test(f.name) && !f.type.startsWith("video/")) { setError("Unsupported file type. Upload an MP4, MOV, WebM, MKV or AVI match video."); return; }
    if (health && f.size > health.limits.max_video_mb * 1_000_000) { setError(`The file is larger than the ${health.limits.max_video_mb} MB limit of the analysis service.`); return; }
    setFile(f); setSampleId(null); setLocalUrl(URL.createObjectURL(f));
  };
  const pickSample = (s: SampleInfo) => { if (running || !api) return; reset(); setFile(null); setSampleId(s.id); setLocalUrl(api.url(s.video_url)); };

  const finish = useCallback(async (id: string) => {
    if (!api) return;
    try { const r = await api.results(id); setResults(r); const fs = r.frames; setRange([fs.length ? fs[0].t : 0, fs.length ? fs[fs.length - 1].t : 0]); } catch (e) { setError(e instanceof Error ? e.message : "The results could not be loaded."); }
  }, [api]);
  const start = async () => {
    if (!api || (!file && !sampleId)) return; reset(); setBusy(true);
    try {
      const j = await api.analyze(file ?? { sampleId: sampleId! }, params); jobIdRef.current = j.job_id; setJob(j);
      poll.current = window.setInterval(async () => {
        try {
          const s = await api.job(j.job_id); setJob(s);
          if (s.status === "completed") { window.clearInterval(poll.current!); poll.current = null; await finish(j.job_id); }
          else if (s.status === "failed" || s.status === "cancelled") { window.clearInterval(poll.current!); poll.current = null; if (s.status === "failed") setError(s.error_detail || s.error || "Processing failed."); }
        } catch (e) { window.clearInterval(poll.current!); poll.current = null; setError(e instanceof Error ? e.message : "Lost contact with the service."); }
      }, 700);
    } catch (e) { setError(e instanceof SportsApiError || e instanceof Error ? e.message : "Could not start the analysis."); } finally { setBusy(false); }
  };
  const cancel = () => { if (api && job) void api.cancel(job.job_id).catch(() => undefined); };

  // ---- selection
  const toggleSel = useCallback((id: number | null, additive: boolean) => setSelected((s) => (id === null ? (additive ? s : []) : additive ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)) : s.length === 1 && s[0] === id ? [] : [id])), []);
  const onTime = useCallback((t: number, f: Frame | null) => { setTime(t); setFrame(f); }, []);

  // ---- derived data for the pitch panel
  const heatFor = (tracks: number[] | null) => { const pts = mappedPoints(frames, { tracks, team: heatTeam === "all" ? null : heatTeam, t0: range[0], t1: range[1] }, L, W); return { ...heatmap(pts, L, W, CELL_M, SIGMA_CELLS), n: pts.length }; };
  const heats = useMemo(() => (view === "heatmap" && mapped ? (selected.length === 2 ? selected.map((id) => ({ id, ...heatFor([id]) })) : [{ id: selected[0] ?? null, ...heatFor(selected.length ? selected : null) }]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, mapped, frames, selected, heatTeam, range, L, W]);
  const trajectories = useMemo(() => {
    if (view !== "trajectory" || !mapped) return [] as { id: number; d: string }[];
    return selected.map((id) => {
      let d = "", last = -1e9;
      for (const f of frames) { if (f.t < range[0] || f.t > range[1]) continue; const p = f.p.find((q) => q[0] === id); if (!p || p[7] === null || p[8] === null) continue; d += `${f.t - last > 1.5 * sampleDt ? "M" : "L"} ${p[7]} ${p[8]} `; last = f.t; }
      return { id, d: d.replace(/^L/, "M") };
    });
  }, [view, mapped, selected, frames, range, sampleDt]);
  const zoneTimes = useMemo(() => {
    const z = Array(9).fill(0) as number[]; if (!results) return z;
    for (const t of results.tracks) if ((!selected.length || selected.includes(t.track_id)) && t.zone_seconds) t.zone_seconds.forEach((v, i) => { z[i] += v; });
    return z;
  }, [results, selected]);

  const calibrate = async (points: { id: string; x: number; y: number }[], length: number, width: number) => {
    if (!api || !job) return; const r = await api.calibrate(job.job_id, { time, points, pitch_length: length, pitch_width: width });
    setResults((p) => (p ? { ...p, ...r } : p));
    if (r.pitch_mapping.status === "unavailable") throw new Error(r.pitch_mapping.reason || "The calibration could not be established.");
  };
  const clearCal = async () => { if (!api || !job) return; const r = await api.calibrate(job.job_id, { clear: true }); setResults((p) => (p ? { ...p, ...r } : p)); };
  const openCal = async () => { if (!api) return; try { const l = await api.pitch(L, W); setLandmarks(l.landmarks); setCalOpen(true); } catch (e) { setError(e instanceof Error ? e.message : "Could not load pitch landmarks."); } };

  // the browser preview is prepared by the server in the background; keep asking until the format this browser needs exists
  const wantFmt = canH264() ? "mp4" : "webm";
  const needPreview = !!job && job.status === "completed" && !job.preview_formats?.includes(wantFmt) && job.preview !== "unavailable";
  useEffect(() => {
    if (!api || !needPreview || !job) return; const id = job.job_id;
    const h = window.setInterval(() => { api.job(id).then((s) => setJob((j) => (j && j.job_id === id ? { ...j, preview: s.preview, preview_formats: s.preview_formats } : j))).catch(() => undefined); }, 1500);
    return () => window.clearInterval(h);
  }, [api, needPreview, job?.job_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportAll = () => results && download(`sports-analysis-${results.job_id.slice(0, 8)}.json`, JSON.stringify(results, null, 1), "application/json");
  const exportStats = () => results && download(`sports-statistics-${results.job_id.slice(0, 8)}.json`, JSON.stringify({ pitch_mapping: results.pitch_mapping, note: "Metres/speeds are estimates and exist only when pitch_mapping.status is available.", tracks: results.tracks }, null, 1), "application/json");
  const exportHeat = () => { const h = heats[0]; if (!h || !results) return; download("sports-heatmap.json", JSON.stringify({ method: results.pitch.heatmap, tracks: selected, team: heatTeam, time_range_s: range, observations: h.n, rows: h.rows, cols: h.cols, grid: Array.from(h.grid, (v) => Math.round(v * 1e4) / 1e4), pitch_m: [L, W] }), "application/json"); };

  const statusText = !job ? "Ready" : job.status === "completed" ? "Analysed" : job.status === "failed" ? "Failed" : job.status === "cancelled" ? "Cancelled" : job.stage;
  const ballLabel = (b: Frame["b"]) => (!b ? "not observed" : b[3] === "observed" ? `observed (${b[2]?.toFixed(2)})` : "estimated (interpolated)");
  const playUrl = localUrl; const fallback = api && job && job.preview_formats?.includes(wantFmt) ? api.videoUrl(job.job_id, wantFmt) : null;
  const canStart = service === "online" && !!(file || sampleId) && !running && !busy;

  return (
    <DemoShell branding={branding} app="Sports Video Intelligence" project={file?.name || (sampleId ? samples.find((s) => s.id === sampleId)?.title : "") || "No video loaded"} status={statusText} badge="Computer Vision · prototype"
      back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="Players and the ball are found by a pretrained detector (FootAndBall) and followed by a tracker; track IDs are temporary labels, not identities. Pitch positions, distances, speeds and heatmaps exist only after you calibrate the pitch, and are estimates. Ball positions that are interpolated are labelled estimated; gaps are left empty. Possession is a proximity candidate, never a validated event. Not a referee, scouting or betting tool.">
      <div className="mx-auto grid max-w-[112rem] grid-cols-[minmax(0,1fr)] gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ---------------- input ---------------- */}
        <section className={`${CARD} xl:col-span-2`} aria-label="Input">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={H3}>Match footage</h2>
            <label className={`${BTN} flex cursor-pointer items-center`}>Choose a video…<input type="file" hidden accept={ACCEPT} data-testid="video-input" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <span className="text-xs text-slate-400">MP4, MOV, WebM, MKV, AVI{health ? ` · up to ${health.limits.max_video_mb} MB and ${health.limits.max_video_seconds} s per job` : ""}</span>
            <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[11px] ${service === "online" ? "border-emerald-500/50 text-emerald-300" : "border-slate-600 text-slate-400"}`} data-testid="service-state">{service === "online" ? `analysis service online · ${health?.model.name.split(" (")[0]}` : service === "unknown" ? "checking service…" : "analysis service not connected"}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300" data-testid="samples">
            <span className="text-slate-400">Samples:</span>
            {samples.map((s) => <button key={s.id} type="button" className={`${BTN} ${sampleId === s.id ? "border-amber-500 text-white" : ""}`} onClick={() => pickSample(s)} data-testid={`sample-${s.id}`}>{s.title}</button>)}
            {!samples.length && <span className="text-slate-500" data-testid="no-samples">No sample match is bundled: football broadcast footage is rarely redistributable, and none with a verifiable open licence was available to this build. Upload your own clip, or add a licensed one with <code className="text-slate-300">services/sports-analyzer/scripts/add_sample.py</code>.</span>}
          </div>
          {sampleId && samples.filter((s) => s.id === sampleId).map((s) => <p key={s.id} className="mt-2 text-[11px] leading-snug text-slate-500" data-testid="sample-credit"><span className="text-slate-300">{s.description}</span> · Source: {s.source} · Licence: {s.licence} · {s.attribution}</p>)}
          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2 text-xs text-slate-300">
            <label>Sampling (frames/s)<input className={`${INPUT} ml-2 w-16`} type="number" min={1} max={12} step={1} value={params.sample_fps} disabled={running} onChange={(e) => setParams({ ...params, sample_fps: Number(e.target.value) })} data-testid="p-fps" /></label>
            <label>From (s)<input className={`${INPUT} ml-2 w-20`} type="number" min={0} value={params.start_s} disabled={running} onChange={(e) => setParams({ ...params, start_s: Number(e.target.value) })} data-testid="p-start" /></label>
            <label>To (s)<input className={`${INPUT} ml-2 w-20`} type="number" min={1} placeholder="end" value={params.end_s ?? ""} disabled={running} onChange={(e) => setParams({ ...params, end_s: e.target.value === "" ? null : Number(e.target.value) })} data-testid="p-end" /></label>
            <label>Player confidence<input className="ml-2 align-middle" type="range" min={0.2} max={0.9} step={0.05} value={params.player_conf} disabled={running} onChange={(e) => setParams({ ...params, player_conf: Number(e.target.value) })} /> <span className="tabular-nums">{params.player_conf.toFixed(2)}</span></label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={params.analyse_ball} disabled={running} onChange={(e) => setParams({ ...params, analyse_ball: e.target.checked })} />Track the ball</label>
            <label>Ball confidence<input className="ml-2 align-middle" type="range" min={0.1} max={0.9} step={0.05} value={params.ball_conf} disabled={running || !params.analyse_ball} onChange={(e) => setParams({ ...params, ball_conf: Number(e.target.value) })} /> <span className="tabular-nums">{params.ball_conf.toFixed(2)}</span></label>
            <label>Teams<select className={`${INPUT} ml-2`} value={params.team_mode} disabled={running} onChange={(e) => setParams({ ...params, team_mode: e.target.value as AnalysisParams["team_mode"] })}><option value="auto">Group by jersey colour</option><option value="off">Off</option></select></label>
            <label>Match label<input className={`${INPUT} ml-2 w-40`} maxLength={80} placeholder="optional" value={params.match_label ?? ""} disabled={running} onChange={(e) => setParams({ ...params, match_label: e.target.value })} /></label>
            <label>Match length (min)<input className={`${INPUT} ml-2 w-16`} type="number" min={1} placeholder="optional" disabled={running} onChange={(e) => setParams({ ...params, declared_duration_s: e.target.value === "" ? null : Number(e.target.value) * 60 })} /></label>
            <span className="ml-auto flex gap-2">
              <button type="button" className={GO} disabled={!canStart} onClick={() => void start()} data-testid="start">{busy ? "Starting…" : "Analyse video"}</button>
              <button type="button" className={STOP} disabled={!running} onClick={cancel} data-testid="cancel">Cancel</button>
            </span>
          </div>
          {service === "offline" && <p className="mt-3 rounded border border-slate-700 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300" data-testid="offline-note">Analysis needs the Python service (<code>services/sports-analyzer</code>): it runs the detector, tracker and statistics on the server. It is not connected to this site, so nothing can be analysed here, and no example results are shown in its place. See <code>docs/sports/DEPLOYMENT.md</code> to start it and set <code>SPORTS_API_URL</code>.</p>}
          {error && <p role="alert" className="mt-3 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="error">{error}</p>}
          {job && (running || job.status === "cancelled") && (
            <div className="mt-3" data-testid="progress">
              <div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.round(job.progress.fraction * 100)}%` }} /></div>
              <p className="mt-1 text-xs text-slate-400">{job.status === "cancelled" ? "Cancelled. " : `${job.stage}: `}{job.progress.samples_done} of {job.progress.samples_total} analysed frames · {job.progress.live_fps.toFixed(1)} frames/s · {job.progress.player_detections} detections · {job.progress.elapsed_seconds.toFixed(0)} s{job.latest ? ` · at ${job.latest.time_s.toFixed(1)} s: ${job.latest.players_in_frame} players tracked` : ""}</p>
            </div>
          )}
        </section>

        {/* ---------------- video + timeline + stats ---------------- */}
        <div className="min-w-0 space-y-3">
          <section className={CARD} aria-label="Video">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className={H3}>Video</h2>
              {([["boxes", "Boxes"], ["ids", "Track IDs"], ["confidence", "Confidence"], ["ball", "Ball"], ["ballTrail", "Ball trail"], ["trajectory", "Selected trajectory"]] as [keyof OverlayOpts, string][]).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} data-testid={`ov-${k}`} />{l}</label>
              ))}
            </div>
            <SportsPlayer ref={player} src={playUrl} fallbackSrc={fallback} frames={frames} sampleDt={sampleDt} srcW={srcW} srcH={srcH} opts={opts} selected={selected} onSelect={toggleSel} onTime={onTime} />
            {results && <p className="mt-2 text-xs text-slate-400" data-testid="now">At {mmss(time)}: {frame ? <>{frame.p.length} players tracked · ball {ballLabel(frame.b)}</> : "no analysed frame here (the video is sampled; step with ◀ ▶ to move between analysed frames)"}</p>}
            {results && <div className="mt-3"><Timeline frames={frames} ballIntervals={results.ball_intervals} events={results.events} duration={duration} time={time} range={range} maxPlayers={Math.max(8, results.summary?.players_per_sample.max ?? 8)} onSeek={(t) => player.current?.seek(t)} /></div>}
            {!results && <p className="mt-2 text-xs text-slate-500">Boxes, track IDs and the ball appear on the video after analysis. They are drawn from the detector’s output for the analysed frames only.</p>}
          </section>

          <section className={CARD} aria-label="Player statistics">
            <h2 className={`${H3} mb-2`}>Player statistics</h2>
            {results ? <StatsTable tracks={results.tracks} mapped={mapped} selected={selected} onToggle={toggleSel} zone={view === "zones" ? zone : null} trackHref={api && job ? api.csvUrl(job.job_id, "stats") : null} jsonHref={exportStats} />
              : <p className="text-sm text-slate-500" data-testid="stats-empty">Statistics are calculated from the tracked positions after an analysis. Nothing is shown before then.</p>}
          </section>
        </div>

        {/* ---------------- pitch + summary ---------------- */}
        <div className="min-w-0 space-y-3">
          <section className={CARD} aria-label="Pitch">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className={H3}>Pitch</h2>
              <div role="tablist" aria-label="Pitch view" className="flex flex-wrap gap-1">
                {([["positions", "Positions"], ["trajectory", "Trajectories"], ["heatmap", "Heatmap"], ["zones", "Zones"]] as [ViewMode, string][]).map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={view === k} className={`${BTN} ${view === k ? "border-amber-500 text-white" : ""}`} onClick={() => setView(k)} data-testid={`view-${k}`}>{l}</button>)}
              </div>
              <button type="button" className={`${BTN} ml-auto`} disabled={!results} onClick={() => void openCal()} data-testid="calibrate">{mapped ? "Recalibrate pitch" : "Calibrate pitch"}</button>
            </div>
            {results && <p className={`mb-2 text-xs ${mapped ? (results.pitch_mapping.status === "poor" ? "text-red-300" : "text-emerald-300") : "text-amber-300"}`} data-testid="mapping-status">
              {mapped ? `Pitch mapping ${results.pitch_mapping.status === "poor" ? "POOR" : "available"} · ${results.pitch_mapping.calibration?.points_used} landmarks · RMS ${results.pitch_mapping.calibration?.rms_error_m.toFixed(2)} m (on your landmarks) · camera ${results.summary?.motion.camera}` : `Pitch mapping unavailable: ${results.pitch_mapping.reason}`}</p>}
            {view === "heatmap" && (
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <label>Team<select className={`${INPUT} ml-1`} value={heatTeam} onChange={(e) => setHeatTeam(e.target.value as Team | "all")} data-testid="heat-team"><option value="all">All tracked players</option>{(["team_a", "team_b"] as Team[]).map((t) => <option key={t} value={t} disabled={results?.teams.status !== "clustered" && results?.teams.status !== "user_colours"}>{TEAM_LABEL[t]}</option>)}</select></label>
                <span className="text-slate-500">{selected.length ? `Selected: ${selected.map((s) => `#${s}`).join(" vs ")}` : "No player selected: all (filtered) tracks"}</span>
                <button type="button" className={BTN} onClick={exportHeat} disabled={!heats.length} data-testid="export-heat">Export heatmap JSON</button>
              </div>
            )}
            {!mapped && <PitchDiagram length={L} width={W} label="Empty pitch diagram: pitch mapping is unavailable" />}
            {mapped && view !== "heatmap" && (
              <PitchDiagram length={L} width={W} label="Pitch with mapped positions">
                {view === "zones" && Array.from({ length: 9 }, (_, i) => { const r = Math.floor(i / 3), c = i % 3; const mx = Math.max(...zoneTimes, 1e-9); return <g key={i} onClick={() => setZone(zone === i ? null : i)} className="cursor-pointer" data-testid={`zone-${i}`}><rect x={(c * L) / 3} y={(r * W) / 3} width={L / 3} height={W / 3} fill={zone === i ? "rgba(253,224,71,.35)" : `rgba(56,189,248,${0.08 + 0.4 * (zoneTimes[i] / mx)})`} stroke="rgba(255,255,255,.35)" strokeWidth={0.15} /><text x={(c * L) / 3 + L / 6} y={(r * W) / 3 + W / 6} textAnchor="middle" fontSize={3.2} fill="#f8fafc" style={{ fontFamily: "Georgia, serif" }}>{zoneTimes[i].toFixed(1)} s</text></g>; })}
                {view === "positions" && frame?.p.filter((p) => p[7] !== null && p[8] !== null).map((p) => <g key={p[0]} onClick={() => toggleSel(p[0], false)} className="cursor-pointer"><circle cx={p[7]!} cy={p[8]!} r={selected.includes(p[0]) ? 1.6 : 1.1} fill={TEAM_COLOR[p[6]]} stroke={selected.includes(p[0]) ? "#fde047" : "#020617"} strokeWidth={0.3} /><text x={p[7]! + 1.6} y={p[8]! - 1.2} fontSize={2.6} fill="#f8fafc" style={{ fontFamily: "Georgia, serif" }}>{p[0]}</text></g>)}
                {view === "positions" && frame?.b && frame.b[4] !== null && frame.b[5] !== null && <circle cx={frame.b[4]} cy={frame.b[5]} r={0.9} fill="none" stroke="#f43f5e" strokeWidth={0.35} strokeDasharray={frame.b[3] === "estimated" ? "0.8 0.6" : undefined}><title>Ball (position assumes it is on the ground)</title></circle>}
                {view === "trajectory" && trajectories.map((t, i) => <path key={t.id} d={t.d} fill="none" stroke={i === 0 ? "#fde047" : "#f472b6"} strokeWidth={0.35} data-testid={`traj-${t.id}`} />)}
              </PitchDiagram>
            )}
            {mapped && view === "heatmap" && (
              <div className={`grid gap-2 ${heats.length === 2 ? "sm:grid-cols-2" : ""}`}>
                {heats.map((h, i) => (
                  <div key={i} data-testid={`heat-${i}`}>
                    <PitchDiagram length={L} width={W} label={`Heatmap ${h.id !== null ? `of track ${h.id}` : "of all tracked players"}`} under={<HeatCanvas grid={h.grid} rows={h.rows} cols={h.cols} dim={h.n < MIN_POINTS} />} />
                    <p className={`mt-1 text-xs ${h.n < MIN_POINTS ? "text-amber-300" : "text-slate-400"}`} data-testid={`heat-note-${i}`}>{h.id !== null ? `Track #${h.id}` : "All tracks"} · {h.n} mapped observations in {range[0].toFixed(0)}–{range[1].toFixed(0)} s{h.n < MIN_POINTS ? ` · too few observations (under ${MIN_POINTS}) for a meaningful heatmap` : ""}</p>
                  </div>
                ))}
              </div>
            )}
            {mapped && view === "zones" && <p className="mt-2 text-xs text-slate-400">Time observed per zone (3×3 grid; columns left→right along the pitch) for {selected.length ? selected.map((s) => `#${s}`).join(", ") : "all tracks"}. Click a zone to add its column to the statistics table.</p>}
            {mapped && view === "heatmap" && <p className="mt-2 text-[11px] leading-snug text-slate-500">Where the player was <b className="text-slate-300">observed</b> (2 m cells, Gaussian-smoothed, scaled to its own maximum). Gaps in tracking leave gaps in the map. Only observations that fall on the calibrated pitch are used; unmapped ones are never guessed.</p>}
            {results && !mapped && <p className="mt-2 text-xs text-slate-400">The pitch diagram stays empty until you calibrate it: identifying at least 4 pitch landmarks on a frame lets the system map players onto the pitch. Without that, screen positions are not drawn as pitch positions.</p>}
            {results && (
              <div className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-300">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-slate-400">Time range</span>
                  <input type="range" aria-label="Range start" min={0} max={duration} step={0.5} value={range[0]} onChange={(e) => setRange([Math.min(Number(e.target.value), range[1]), range[1]])} data-testid="range-start" />
                  <input type="range" aria-label="Range end" min={0} max={duration} step={0.5} value={range[1]} onChange={(e) => setRange([range[0], Math.max(Number(e.target.value), range[0])])} data-testid="range-end" />
                  <span className="tabular-nums">{range[0].toFixed(0)}–{range[1].toFixed(0)} s</span>
                  <button type="button" className={BTN} onClick={() => setRange([time, Math.max(time, range[1])])}>Start = now</button><button type="button" className={BTN} onClick={() => setRange([Math.min(range[0], time), time])}>End = now</button>
                  <button type="button" className={BTN} onClick={() => setRange([frames[0]?.t ?? 0, frames[frames.length - 1]?.t ?? 0])}>Whole video</button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-slate-400">Match periods</span>
                  {periods.map((p) => <button key={p.name} type="button" className={BTN} onClick={() => setRange([p.t0, p.t1])} data-testid={`period-${p.name}`}>{p.name} ({p.t0.toFixed(0)}–{p.t1.toFixed(0)} s)</button>)}
                  <input className={`${INPUT} w-28`} value={periodName} onChange={(e) => setPeriodName(e.target.value)} aria-label="Period name" />
                  <button type="button" className={BTN} onClick={() => periodName.trim() && setPeriods((p) => [...p.filter((q) => q.name !== periodName.trim()), { name: periodName.trim(), t0: range[0], t1: range[1] }])} data-testid="save-period">Save range as period</button>
                </div>
              </div>
            )}
          </section>

          {results && (
            <section className={CARD} aria-label="Processing summary" data-testid="summary">
              <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className={H3}>Processing summary</h2>
                <span className="ml-auto flex flex-wrap gap-2"><button type="button" className={BTN} onClick={exportAll} data-testid="export-json">Full results JSON</button>
                  {api && job && (["tracks", "ball", "events"] as const).map((k) => <a key={k} className={BTN} href={api.csvUrl(job.job_id, k)} download={`sports-${k}.csv`} data-testid={`export-${k}`}>{k} CSV</a>)}</span></div>
              {results.summary && (() => { const s = results.summary; return (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 [&_dd]:text-right [&_dd]:tabular-nums [&_dd]:text-slate-100 [&_dt]:text-slate-400">
                  <div className="flex justify-between gap-2"><dt>Frames analysed</dt><dd data-testid="s-frames">{s.samples_analysed}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Sampling</dt><dd>{s.sampling_fps} /s</dd></div>
                  <div className="flex justify-between gap-2"><dt>Video analysed</dt><dd>{s.analysed_seconds.toFixed(0)} s</dd></div>
                  <div className="flex justify-between gap-2"><dt>Processing time</dt><dd>{s.processing_seconds.toFixed(1)} s</dd></div>
                  <div className="flex justify-between gap-2"><dt>Processing speed</dt><dd data-testid="s-fps">{s.processing_fps?.toFixed(2)} frames/s</dd></div>
                  <div className="flex justify-between gap-2"><dt>Versus real time</dt><dd>{s.realtime_factor?.toFixed(2)}×</dd></div>
                  <div className="flex justify-between gap-2"><dt>Player detections</dt><dd data-testid="s-det">{s.player_detections}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Tracks kept</dt><dd data-testid="s-tracks">{s.tracks_kept}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Active at end / ended</dt><dd>{s.tracks_active_at_end} / {s.tracks_ended}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Short tracks dropped</dt><dd>{s.tracks_dropped_short}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Players per frame</dt><dd>{s.players_per_sample.mean} (max {s.players_per_sample.max})</dd></div>
                  <div className="flex justify-between gap-2"><dt>Ball observed</dt><dd data-testid="s-ball">{s.ball.observed} ({(s.ball.observed_rate * 100).toFixed(0)}%)</dd></div>
                  <div className="flex justify-between gap-2"><dt>Ball estimated / missing</dt><dd>{s.ball.estimated} / {s.ball.missing}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Camera</dt><dd>{s.motion.camera}{s.motion.segments > 1 ? `, ${s.motion.segments} segments` : ""}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Teams</dt><dd title={results.teams.reason}>{results.teams.status}</dd></div>
                </dl>); })()}
              <ul className="mt-3 space-y-1" data-testid="warnings">
                {results.warnings.map((w, i) => <li key={i} className={`rounded border px-2 py-1 text-xs leading-snug ${w.level === "warning" ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}>{w.text}</li>)}
              </ul>
              <details className="mt-3 text-xs text-slate-300"><summary className="cursor-pointer text-slate-400">What is measured, estimated or unavailable</summary>
                <table className="mt-2 w-full text-left text-[11px]"><tbody>
                  <tr className="border-t border-slate-800"><th className="w-24 py-1 align-top text-emerald-300">Measured</th><td className="py-1">Player boxes and confidence, track IDs (temporary), ball detections (observed), frames analysed, processing speed.</td></tr>
                  <tr className="border-t border-slate-800"><th className="py-1 align-top text-amber-300">Estimated</th><td className="py-1">Pitch positions, distance, speed and zone time (need your calibration, assume feet on the ground); team grouping from jersey colour; interpolated ball positions; possession candidates.</td></tr>
                  <tr className="border-t border-slate-800"><th className="py-1 align-top text-slate-400">Unavailable</th><td className="py-1">Player names, jersey numbers or identities; passes, shots, goals, fouls, offsides; physical-fitness or official statistics.</td></tr>
                </tbody></table>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-400">{results.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </details>
            </section>
          )}

          {results && (
            <section className={CARD} aria-label="Events" data-testid="events">
              <h2 className={`${H3} mb-2`}>Event candidates</h2>
              {results.events.length ? <ul className="space-y-1 text-xs">{results.events.map((e, i) => <li key={i}><button type="button" className="w-full rounded border border-slate-700 px-2 py-1 text-left hover:border-amber-500" onClick={() => player.current?.seek(e.t0)} data-testid={`event-${i}`}>
                <b className="text-lime-300">Possession candidate ({e.confidence})</b> · #{e.track_id} {e.team ? `(${TEAM_LABEL[e.team].split(" (")[0]})` : ""} · {mmss(e.t0)}–{mmss(e.t1)} · {e.ball_observations} ball observations<br /><span className="text-slate-500">{e.basis}</span></button></li>)}</ul>
                : <p className="text-xs text-slate-500" data-testid="no-events">No event candidates. Only possession candidates are implemented (the ball must be observed close to exactly one tracked player); passes, shots and goals are not detected.</p>}
            </section>
          )}
        </div>
      </div>
      {results && job && <CalibrationModal open={calOpen} frameUrl={api!.frameUrl(job.job_id, time)} time={time} srcW={srcW} srcH={srcH} length={L} width={W} landmarks={landmarks} current={results.pitch_mapping} onApply={calibrate} onClear={clearCal} onClose={() => setCalOpen(false)} />}
    </DemoShell>
  );
}
