"use client";
import { useMemo, useState } from "react";
import type { Branding } from "@/lib/types";
import { ViError, type TableTennisResult } from "@/lib/vi/api";
import { annId, ttSummary, TT_KINDS, type TTAnnotation, type TTKind } from "@/lib/vi/annotations";
import { mmss, saveBlob, saveText, toCsv } from "@/lib/vi/format";
import { Btn, Card, Empty, FeatureList, Field, INPUT, Kpi, Notice, Num, SourcePanel, Stage, StatusPill, Table, ViShell, useSession, type Pt, type Session } from "./common";

const NAV = [{ id: "overview", label: "Overview" }, { id: "analysis", label: "Video Analysis" }, { id: "calibration", label: "Table Calibration" }, { id: "rallies", label: "Ball & Rallies" }, { id: "players", label: "Players" }, { id: "annotation", label: "Manual Annotation" }, { id: "reports", label: "Reports" }];
const NOTICE = "Table tennis analysis from video. Players and the ball are really detected and tracked, but ball tracking is experimental: frames where the ball was not found are shown as gaps, never filled in. Rally segments are ball-visible periods, not officiated rallies; scoring and rally marks are Manual Annotation. The service does not recognise faces or identify players.";
const CORNER_LABELS = ["1 left-near", "2 right-near", "3 right-far", "4 left-far"];
const FEATURES = [
  { name: "Player detection and tracking", status: "working" as const, note: "YOLOX-S + ByteTrack; temporary track numbers, no identification." },
  { name: "Ball tracking", status: "experimental" as const, note: "YOLOX ball class plus a colour/motion finder and a gated tracker. Only detected positions are reported; gaps stay gaps." },
  { name: "Table calibration (four corners)", status: "working" as const, note: "Homography from clicked corners to the 2.74 × 1.525 m table plane, with the fit error shown." },
  { name: "Ball-visible segments", status: "experimental" as const, note: "Splits ball detections at gaps. Not the same as a rally." },
  { name: "Bounce and net-side crossing candidates", status: "experimental" as const, note: "Geometric candidates from the ball path; spin, edges and net touches are not recognised." },
  { name: "Rally marks, scoring and statistics", status: "manual" as const, note: "You mark rally start/end and points while watching; statistics are counts of your annotations." },
  { name: "Table-plane ball map", status: "working" as const, note: "Top view of detected ball positions projected onto the table plane (a ball in flight is above it, so this is approximate)." },
  { name: "Stroke, serve and spin recognition", status: "soon" as const, note: "Not implemented." },
  { name: "Automatic scoring and fault detection", status: "soon" as const, note: "Not implemented; this needs reliable bounce and net detection." },
  { name: "Player movement distance in metres", status: "soon" as const, note: "Needs a floor calibration, which this demo does not ask for." },
  { name: "Live camera analysis", status: "hardware" as const, note: "Needs a camera set-up and a real-time deployment." },
];

export default function TableTennisApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const s = useSession(serviceUrl, "tabletennis");
  const [tab, setTab] = useState("overview");
  const [corners, setCorners] = useState<Pt[]>([]); const [gap, setGap] = useState(0.6); const [minLen, setMinLen] = useState(1.0);
  const [res, setRes] = useState<TableTennisResult | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [ann, setAnn] = useState<TTAnnotation[]>([]);
  const done = s.video?.status === "completed" && !!s.obs;
  const calibrate = async () => {
    if (!s.api || !s.video) return; setBusy(true); setErr("");
    try { setRes(await s.api.tableTennis(s.video.video_id, { corners, gap_s: gap, min_len_s: minLen })); } catch (e) { setRes(null); setErr(e instanceof ViError ? e.message : "The analysis failed."); } finally { setBusy(false); }
  };
  const ctx = { s, corners, setCorners, gap, setGap, minLen, setMinLen, res, err, busy, calibrate, done, ann, setAnn, setTab };
  return (
    <ViShell branding={branding} title="Table Tennis Video Intelligence" project="Sample 23 · AI Table Tennis Video Intelligence" nav={NAV} active={tab} onNav={setTab} service={s.service} notice={NOTICE}>
      {tab === "overview" && <Overview {...ctx} />}
      {tab === "analysis" && <Analysis {...ctx} />}
      {tab === "calibration" && <Calibration {...ctx} />}
      {tab === "rallies" && <Rallies {...ctx} />}
      {tab === "players" && <Players {...ctx} />}
      {tab === "annotation" && <Annotation {...ctx} />}
      {tab === "reports" && <Reports {...ctx} />}
    </ViShell>
  );
}
type Ctx = { s: Session; corners: Pt[]; setCorners(c: Pt[]): void; gap: number; setGap(n: number): void; minLen: number; setMinLen(n: number): void; res: TableTennisResult | null; err: string; busy: boolean; calibrate(): Promise<void>; done: boolean; ann: TTAnnotation[]; setAnn(a: TTAnnotation[]): void; setTab(t: string): void };

function Overview({ s, res, done, setTab }: Ctx) {
  return (<>
    <Card title="What this demonstration does"><p>Open a video, let the service find and track the players and the ball, click the four table corners to calibrate the table, and review ball-visible segments, bounce and net-side-crossing candidates and a top-view ball map. Mark rallies and points yourself on the Manual Annotation tab to get scoring statistics.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Btn kind="primary" onClick={() => setTab("analysis")} testid="go-analysis">Start with a video</Btn></div>
      {done && s.video?.summary && <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Analysed frames" value={s.video.summary.analysed_frames} /><Kpi label="Tracked people" value={s.video.summary.tracks} /><Kpi label="Ball detections" value={s.video.summary.ball_points} /><Kpi label="Ball visible" value={res ? `${res.ball.visibility_pct}%` : "—"} sub="of analysed frames" /></div>}
    </Card>
    <Card title="Feature status"><FeatureList items={FEATURES} /></Card>
    <Card title="Honest limits"><ul className="list-disc space-y-1 pl-5"><li>No sample video is bundled because no legal real match footage could be included: upload your own clip. The ball tracker and calibration were checked against a rendered test clip with known truth, but accuracy on real video with motion blur and clutter has not been measured.</li><li>A small, fast, blurred white ball is hard to see. Expect gaps; they are shown as gaps.</li><li>Calibration maps the table surface. A ball in flight is above it, so its table-plane position and speed are projections.</li></ul></Card>
  </>);
}

function Analysis({ s }: Ctx) {
  const [fps, setFps] = useState(30); const [thr, setThr] = useState(0.35); const [ball, setBall] = useState(true);
  const v = s.video; const running = v?.status === "queued" || v?.status === "running";
  return (<>
    <SourcePanel s={s}>
      {v && !running && <div className="mt-4 grid gap-3 sm:grid-cols-4"><Num label="Analysis frame rate" value={fps} min={5} max={30} onChange={setFps} hint="Ball tracking needs about 25–30 fps" testid="fps" /><Num label="Person confidence" value={thr} min={0.1} max={0.9} step={0.05} onChange={setThr} />
        <label className="flex items-end gap-2 pb-1.5"><input type="checkbox" checked={ball} onChange={(e) => setBall(e.target.checked)} />Track the ball (white, moving)</label>
        <div className="flex items-end"><Btn kind="primary" testid="run" onClick={() => s.run({ mode: "tabletennis", sample_fps: fps, det_threshold: thr, ball, ball_kind: "white" })}>{v.status === "completed" ? "Analyse again" : "Detect and track"}</Btn></div></div>}
      {v && !running && <p className="mt-2 text-[14px] text-[#66736B]">Analysing every frame takes a while on a CPU (a 15 s clip at 30 fps takes about a minute).</p>}
    </SourcePanel>
    {v && <Card title="Video"><Stage s={s} overlay={{ persons: true, ball: true, trailSeconds: 0.5 }} /></Card>}
  </>);
}

function Calibration({ s, corners, setCorners, res, err, busy, calibrate, done, gap, setGap, minLen, setMinLen }: Ctx) {
  if (!s.video) return <SourcePanel s={s} />;
  if (!done) return <Notice tone="warn" testid="need-analysis">Run the video analysis first (Video Analysis tab).</Notice>;
  const ready = corners.length === 4;
  return (<>
    <Card title="Click the four table corners">
      <p className="mb-2 text-[14px] text-[#66736B]">Click the corners of the table top in this order: <b>left-near, right-near, right-far, left-far</b> (the table is 2.74 m long). Pause on a frame with the table fully visible.</p>
      <Stage s={s} overlay={{ persons: true, polygon: corners, closed: ready, points: corners.map((p, i) => ({ p, label: CORNER_LABELS[i] })) }} edit={ready ? undefined : { onAdd: (p) => setCorners([...corners, p]), hint: `Click corner ${corners.length + 1} of 4 (${CORNER_LABELS[corners.length]})` }} />
      <div className="mt-3 flex flex-wrap gap-2"><Btn onClick={() => setCorners(corners.slice(0, -1))} disabled={!corners.length} testid="undo-corner">Undo last corner</Btn><Btn onClick={() => setCorners([])} disabled={!corners.length} testid="clear-corners">Clear</Btn></div>
    </Card>
    <Card title="Settings and analysis"><div className="grid gap-3 sm:grid-cols-4"><Num label="Largest gap inside a segment (s)" value={gap} min={0.05} max={5} step={0.05} onChange={setGap} /><Num label="Shortest segment (s)" value={minLen} min={0.1} max={60} step={0.1} onChange={setMinLen} />
      <div className="flex items-end sm:col-span-2"><Btn kind="primary" disabled={!ready || busy} onClick={calibrate} testid="calibrate">{busy ? "Working…" : "Calibrate and analyse"}</Btn></div></div>
      {err && <div className="mt-3"><Notice tone="error" testid="calib-error">{err}</Notice></div>}
      {res && <div className="mt-3 space-y-2" data-testid="calibration-result"><p>Calibration from {res.calibration.points} points: RMS error <b data-testid="rms">{(res.calibration.rms_error_m * 100).toFixed(2)} cm</b>, worst <b>{(res.calibration.max_error_m * 100).toFixed(2)} cm</b> (on the table plane).</p>{res.calibration.warning && <Notice tone="warn" testid="calib-warning">{res.calibration.warning}</Notice>}</div>}
    </Card>
  </>);
}

function Rallies({ s, res, setTab }: Ctx) {
  if (!res) return <Notice tone="warn" testid="need-calibration">Calibrate the table first (Table Calibration tab). <Btn small onClick={() => setTab("calibration")}>Go there</Btn></Notice>;
  const dur = s.video?.video.duration_seconds ?? 1;
  return (<>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Ball detections" value={res.ball.detected_points} testid="k-ball" /><Kpi label="Ball visible" value={`${res.ball.visibility_pct}%`} sub="of analysed frames" testid="k-visible" /><Kpi label="Ball-visible segments" value={res.segments.length} testid="k-segments" /><Kpi label="Bounce candidates" value={res.segments.reduce((a, g) => a + g.bounce_candidates.length, 0)} /></div>
    <Card title="Ball visibility over the video" testid="visibility">
      <div className="relative h-8 overflow-hidden rounded-lg bg-[#F7F9F8] border border-[#E2EAE5]" role="img" aria-label="Segments where the ball was detected">{res.segments.map((g) => <button key={g.index} type="button" onClick={() => s.seek(g.start_t)} title={`Segment ${g.index}: ${mmss(g.start_t)}–${mmss(g.end_t)}`} className="absolute top-0 h-full bg-[#16834A]/80 hover:bg-[#11643A]" style={{ left: `${(g.start_t / dur) * 100}%`, width: `${Math.max(0.5, ((g.end_t - g.start_t) / dur) * 100)}%` }} />)}</div>
      <p className="mt-1 text-[14px] text-[#66736B]">Green = ball detected continuously. Everything else is a gap: the ball was hidden, blurred, or not found. {res.ball.note}</p>
    </Card>
    <Card title="Ball-visible segments" actions={<StatusPill s="experimental" />} testid="segments-card">
      <Table testid="segments" empty="No ball-visible segment met the settings. Try a larger gap or a shorter minimum length." head={["#", "Start", "End", "Duration", "Ball points", "Net-side crossings", "Bounce candidates", "Peak speed (table-plane)", ""]}
        rows={res.segments.map((g) => [g.index, mmss(g.start_t), mmss(g.end_t), `${g.duration_s} s`, g.ball_points, g.net_side_crossings, g.bounce_candidates.length, g.max_table_plane_speed_ms === null ? "—" : `${g.max_table_plane_speed_ms} m/s`, <Btn key="j" small onClick={() => s.seek(g.start_t)}>Jump</Btn>])} />
      <p className="mt-2 text-[14px] text-[#66736B]">A segment is a stretch where the ball was found often enough, not an officiated rally. Crossings count sign changes of the ball&apos;s position either side of the net line; speeds come from table-plane projections and are approximate.</p>
    </Card>
    <Card title="Top view: where the ball was detected (table plane)"><TableMap res={res} /></Card>
  </>);
}

function TableMap({ res }: { res: TableTennisResult }) {
  const S = 300, L = 2.74, Wd = 1.525; const pts = res.table_plane_points; const t1 = Math.max(...pts.map((p) => p.t), 1);
  return <div className="overflow-x-auto"><svg viewBox={`-20 -20 ${L * S + 40} ${Wd * S + 40}`} className="max-h-72 w-full" role="img" aria-label="Top view of the table with detected ball positions" data-testid="table-map">
    <rect x={0} y={0} width={L * S} height={Wd * S} fill="#E9F7EF" stroke="#16834A" strokeWidth={3} /><line x1={(L / 2) * S} x2={(L / 2) * S} y1={0} y2={Wd * S} stroke="#11643A" strokeWidth={2} strokeDasharray="6 4" /><line x1={0} x2={L * S} y1={(Wd * S) / 2} y2={(Wd * S) / 2} stroke="#16834A" strokeOpacity={0.4} />
    {pts.filter((p) => p.x_m > -0.6 && p.x_m < L + 0.6 && p.y_m > -0.6 && p.y_m < Wd + 0.6).map((p, i) => <circle key={i} cx={p.x_m * S} cy={(Wd - p.y_m) * S} r={4} fill={`hsl(${30 - (p.t / t1) * 30} 90% 45%)`} fillOpacity={0.7} />)}
    <text x={4} y={Wd * S + 16} fontSize={13} fill="#66736B">left end</text><text x={L * S - 4} y={Wd * S + 16} fontSize={13} textAnchor="end" fill="#66736B">right end · net dashed · earlier = orange, later = red</text></svg>
    <p className="text-[14px] text-[#66736B]">Points are projections of the ball onto the table plane; a ball above the table appears displaced, and positions outside the table are normal for a ball in flight.</p></div>;
}

function Players({ s }: Ctx) {
  if (!s.obs) return <Notice tone="warn">Run the video analysis first.</Notice>;
  const tr = [...s.obs.tracks].sort((a, b) => b.observed_s - a.observed_s);
  return (<>
    <Card title="Tracked people" testid="players-card"><p className="mb-2 text-[14px] text-[#66736B]">Track numbers are temporary. The longest tracks are usually the players; short ones are fragments after occlusion or other people in view. Which side a person plays on is not determined.</p>
      <Table head={["Track", "First seen", "Last seen", "Observed", "Mean confidence", ""]} rows={tr.map((t) => [`#${t.id}`, mmss(t.first_t), mmss(t.last_t), `${t.observed_s} s`, t.mean_score.toFixed(2), <Btn key={t.id} small onClick={() => s.seek(t.first_t)}>Jump</Btn>])} /></Card>
    <Card title="Player movement and positions"><div className="flex flex-wrap items-center gap-2"><StatusPill s="soon" /><span>Distances in metres and court coverage need a calibrated floor plane. Only the table is calibrated here, so no player movement statistics are shown rather than inventing them.</span></div></Card>
  </>);
}

function Annotation({ s, ann, setAnn }: Ctx) {
  const [kind, setKind] = useState<TTKind>("Rally start"); const [note, setNote] = useState("");
  const sum = useMemo(() => ttSummary(ann), [ann]);
  if (!s.video) return <SourcePanel s={s} />;
  const add = (k: TTKind = kind) => setAnn([...ann, { id: annId(), t: Math.round(s.t * 100) / 100, kind: k, note: note.trim() || undefined }].sort((a, b) => a.t - b.t));
  return (<>
    <Notice tone="info" testid="manual-banner"><StatusPill s="manual" className="mr-2" />Everything on this tab is entered by you while watching. Nothing is detected automatically, and the statistics are counts of what you entered.</Notice>
    <Card title="Mark an event at the current video time"><Stage s={s} overlay={{ persons: false, ball: true }} />
      <div className="mt-3 flex flex-wrap items-end gap-2"><Field label="Event"><select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as TTKind)} data-testid="ann-kind">{TT_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Note (optional)"><input className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></Field><Btn kind="primary" onClick={() => add()} testid="ann-add">Add at {mmss(s.t)}</Btn>
        <span className="flex flex-wrap gap-1.5"><Btn small onClick={() => add("Rally start")}>Rally start</Btn><Btn small onClick={() => add("Rally end")}>Rally end</Btn><Btn small onClick={() => add("Point: side A")}>Point A</Btn><Btn small onClick={() => add("Point: side B")}>Point B</Btn></span></div>
    </Card>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="ann-summary"><Kpi label="Rallies marked" value={sum.count} testid="ann-rallies" /><Kpi label="Score A – B" value={`${sum.score.A} – ${sum.score.B}`} testid="ann-score" /><Kpi label="Mean rally" value={sum.mean_duration === null ? "—" : `${sum.mean_duration} s`} /><Kpi label="Longest rally" value={sum.longest === null ? "—" : `${sum.longest} s`} /><Kpi label="Unpaired marks" value={sum.incomplete.length} /></div>
    {sum.incomplete.length > 0 && <Notice tone="warn">Incomplete marks: {sum.incomplete.map((x) => `${mmss(x.t)} ${x.reason}`).join("; ")}.</Notice>}
    <Card title="Your annotations" actions={<><StatusPill s="manual" /><Btn small onClick={() => saveText("table-tennis-annotations.csv", toCsv([["Video time (s)", "Event", "Note", "Source"], ...ann.map((a) => [a.t, a.kind, a.note ?? "", "Manual Annotation"])]))} disabled={!ann.length} testid="ann-export">Export CSV</Btn></>}>
      <Table testid="ann-list" empty="No annotations yet." head={["Time", "Event", "Note", ""]} rows={ann.map((a) => [mmss(a.t), a.kind, a.note ?? "", <span key={a.id} className="flex gap-1.5"><Btn small onClick={() => s.seek(a.t)}>Jump</Btn><Btn small kind="danger" onClick={() => setAnn(ann.filter((x) => x.id !== a.id))} aria-label={`Delete ${a.kind} at ${mmss(a.t)}`}>Delete</Btn></span>])} /></Card>
  </>);
}

function Reports({ s, res, ann }: Ctx) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const sum = ttSummary(ann);
  if (!res && !ann.length) return <Notice tone="warn" testid="need-results">Calibrate the table or add annotations first; reports are built from them.</Notice>;
  const segRows = res ? [["Segment", "Start (s)", "End (s)", "Duration (s)", "Ball points", "Net-side crossings", "Bounce candidates", "Label"], ...res.segments.map((g) => [g.index, g.start_t, g.end_t, g.duration_s, g.ball_points, g.net_side_crossings, g.bounce_candidates.length, g.label])] : null;
  const pdf = async () => {
    if (!s.api) return; setBusy(true); setErr("");
    try {
      const sections: Record<string, unknown>[] = [];
      if (res) sections.push({ heading: "Ball tracking (experimental)", lines: [`Ball detections: ${res.ball.detected_points} in ${res.ball.analysed_frames} analysed frames (${res.ball.visibility_pct}% visible)`, `Table calibration RMS error: ${(res.calibration.rms_error_m * 100).toFixed(2)} cm`, res.ball.note] }, { heading: "Ball-visible segments (not officiated rallies)", rows: segRows!.map((r) => r.map(String)) });
      if (ann.length) sections.push({ heading: "Manual Annotation", lines: [`Rallies marked: ${sum.count}`, `Score A – B: ${sum.score.A} – ${sum.score.B}`, "Entered by a person; not detected."], rows: [["Time (s)", "Event", "Note"], ...ann.map((a) => [String(a.t), a.kind, a.note ?? ""])] });
      sections.push({ heading: "Limits", lines: ["Ball positions are only the detected ones; gaps are not filled.", "Table-plane positions and speeds of a ball in flight are projections and approximate.", "Segments are ball-visible periods, not rallies."] });
      saveBlob("table-tennis-report.pdf", await s.api.pdf({ title: "Table tennis video analysis", subtitle: `Source: ${s.video?.source ?? ""}`, sections, footer: "Demonstration software. Experimental results; verify against the video." }));
    } catch (e) { setErr(e instanceof ViError ? e.message : "The PDF could not be created."); } finally { setBusy(false); }
  };
  return (<Card title="Exports" testid="exports"><div className="flex flex-wrap gap-2">{segRows && <Btn onClick={() => saveText("ball-segments.csv", toCsv(segRows))} testid="export-segments">Ball-visible segments (CSV)</Btn>}{res && <Btn onClick={() => saveText("ball-table-plane.csv", toCsv([["t (s)", "table x (m)", "table y (m)", "source"], ...res.table_plane_points.map((p) => [p.t, p.x_m, p.y_m, p.src])]))}>Ball positions on the table plane (CSV)</Btn>}<Btn kind="primary" onClick={pdf} disabled={busy} testid="export-pdf">{busy ? "Creating…" : "Report (PDF)"}</Btn></div>{err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}{!res && <Empty>No tracking results yet: only your annotations are included.</Empty>}</Card>);
}
