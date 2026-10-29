"use client";
import { useEffect, useMemo, useState } from "react";
import type { Branding } from "@/lib/types";
import { ViError, type BasketballResult, type Landmark } from "@/lib/vi/api";
import { annId, bbSummary, BB_KINDS, type BBAnnotation, type BBKind } from "@/lib/vi/annotations";
import { mmss, saveBlob, saveText, toCsv } from "@/lib/vi/format";
import { Btn, Card, Empty, FeatureList, Field, INPUT, Kpi, Notice, Num, SourcePanel, Stage, StatusPill, Table, ViShell, useSession, type Pt, type Session } from "./common";

const NAV = [{ id: "overview", label: "Overview" }, { id: "analysis", label: "Video Analysis" }, { id: "court", label: "Court Mapping" }, { id: "players", label: "Players & Heatmap" }, { id: "possession", label: "Ball & Possession" }, { id: "annotation", label: "Manual Annotation" }, { id: "reports", label: "Reports" }];
const NOTICE = "Basketball video analysis. Players and the ball are really detected and tracked, and the court is mapped from reference points you click. Heat maps and distances come from real tracks. Possession events are a geometric rule, and shots, assists and scoring are Manual Annotation: nothing here is an official statistic. The service does not recognise faces or identify players.";
interface Ref { image: Pt; world: [number, number]; name: string }
const SAMPLE_REFS: Ref[] = [
  { image: [952, 410.2], world: [28, 0], name: "Corner: baseline right / sideline bottom" }, { image: [689.6, 176.6], world: [28, 15], name: "Corner: baseline right / sideline top" },
  { image: [70.9, 410.2], world: [14, 0], name: "Halfway line at bottom sideline" }, { image: [298.4, 176.6], world: [14, 15], name: "Halfway line at top sideline" },
  { image: [555.3, 285.6], world: [22.2, 5.05], name: "Right free-throw line, bottom end of lane" }, { image: [538.4, 219.6], world: [22.2, 9.95], name: "Right free-throw line, top end of lane" },
];
const FEATURES = [
  { name: "Player detection and tracking", status: "working" as const, note: "YOLOX-S + ByteTrack, temporary numbers; identities can switch when players overlap." },
  { name: "Ball detection and tracking", status: "experimental" as const, note: "Orange-ball colour finder plus the YOLOX ball class and a gated tracker. A held or hidden ball is a gap, never estimated." },
  { name: "Court mapping from reference points", status: "working" as const, note: "You match at least four clicked points to named court landmarks; the fit error is shown in metres." },
  { name: "Player heat map and distance", status: "working" as const, note: "Seconds per cell and metres travelled from the real tracks, observed time only." },
  { name: "Potential Possession Events", status: "experimental" as const, note: "Rule: the detected ball lies inside one person's box for a minimum time. Not rules-aware; passes and dribbles are not told apart." },
  { name: "Shots, assists, rebounds, scoring", status: "manual" as const, note: "You enter them while watching; statistics are counts of your entries." },
  { name: "Shot-arc detection", status: "soon" as const, note: "Not implemented." },
  { name: "Team assignment from jerseys", status: "soon" as const, note: "Not implemented; teams are chosen when annotating." },
  { name: "Automatic scoring and play recognition", status: "soon" as const, note: "Not implemented." },
  { name: "Live broadcast ingest", status: "external" as const, note: "Needs a stream integration and a real-time deployment." },
];

export default function BasketballApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const s = useSession(serviceUrl, "basketball");
  const [tab, setTab] = useState("overview");
  const [refs, setRefs] = useState<Ref[]>([]); const [lm, setLm] = useState<Landmark[]>([]); const [next, setNext] = useState("");
  const [cell, setCell] = useState(1); const [minPoss, setMinPoss] = useState(0.6); const [margin, setMargin] = useState(0.08); const [ids, setIds] = useState<number[] | null>(null);
  const [res, setRes] = useState<BasketballResult | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [ann, setAnn] = useState<BBAnnotation[]>([]);
  useEffect(() => { if (s.api) s.api.landmarks().then((r) => { setLm(r.landmarks); setNext(r.landmarks[0]?.name ?? ""); }).catch(() => undefined); }, [s.api]);
  const done = s.video?.status === "completed" && !!s.obs;
  const calibrate = async () => {
    if (!s.api || !s.video) return; setBusy(true); setErr("");
    try { setRes(await s.api.basketball(s.video.video_id, { references: refs.map((r) => ({ image: r.image, world: r.world })), cell_m: cell, min_possession_s: minPoss, margin_frac: margin, ...(ids ? { track_ids: ids } : {}) })); } catch (e) { setRes(null); setErr(e instanceof ViError ? e.message : "The analysis failed."); } finally { setBusy(false); }
  };
  const ctx = { s, refs, setRefs, lm, next, setNext, cell, setCell, minPoss, setMinPoss, margin, setMargin, ids, setIds, res, err, busy, calibrate, done, ann, setAnn, setTab };
  return (
    <ViShell branding={branding} title="Basketball Video Intelligence" project="Sample 24 · AI Basketball Video Intelligence" nav={NAV} active={tab} onNav={setTab} service={s.service} notice={NOTICE}>
      {tab === "overview" && <Overview {...ctx} />}
      {tab === "analysis" && <Analysis {...ctx} />}
      {tab === "court" && <Court {...ctx} />}
      {tab === "players" && <Players {...ctx} />}
      {tab === "possession" && <Possession {...ctx} />}
      {tab === "annotation" && <Annotation {...ctx} />}
      {tab === "reports" && <Reports {...ctx} />}
    </ViShell>
  );
}
type Ctx = { s: Session; refs: Ref[]; setRefs(r: Ref[]): void; lm: Landmark[]; next: string; setNext(n: string): void; cell: number; setCell(n: number): void; minPoss: number; setMinPoss(n: number): void; margin: number; setMargin(n: number): void; ids: number[] | null; setIds(i: number[] | null): void; res: BasketballResult | null; err: string; busy: boolean; calibrate(): Promise<void>; done: boolean; ann: BBAnnotation[]; setAnn(a: BBAnnotation[]): void; setTab(t: string): void };

function Overview({ s, res, done, setTab }: Ctx) {
  return (<>
    <Card title="What this demonstration does"><p>Open a video, let the service track players and the ball, click at least four known court landmarks to map the court, and review where players spent their time, how far they moved, and when the ball was inside a player&apos;s box long enough to be a potential possession. Shots and other events are marked by you.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Btn kind="primary" onClick={() => setTab("analysis")} testid="go-analysis">Start with a video</Btn></div>
      {done && s.video?.summary && <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Analysed frames" value={s.video.summary.analysed_frames} /><Kpi label="Tracked people" value={s.video.summary.tracks} /><Kpi label="Ball detections" value={s.video.summary.ball_points} /><Kpi label="Possession events" value={res?.possession.length ?? "—"} /></div>}
    </Card>
    <Card title="Feature status"><FeatureList items={FEATURES} /></Card>
    <Card title="Honest limits"><ul className="list-disc space-y-1 pl-5"><li>The bundled clip is a composite: a rendered court and ball with a known camera plus real-pixel people on known paths. It checks the tracker, mapping and possession rule against known truth. It is not game footage and says nothing about accuracy on real broadcast video.</li><li>Mapping covers the floor plane. A ball in the air or a player&apos;s upper body is not on it, so ball positions on the court are projections.</li><li>Players are followed as temporary numbers, so one player may be split over several numbers, and no team is assigned automatically.</li></ul></Card>
  </>);
}

function Analysis({ s }: Ctx) {
  const [fps, setFps] = useState(10); const [thr, setThr] = useState(0.35); const [ball, setBall] = useState(true);
  const v = s.video; const running = v?.status === "queued" || v?.status === "running";
  return (<>
    <SourcePanel s={s}>
      {v && !running && <div className="mt-4 grid gap-3 sm:grid-cols-4"><Num label="Analysis frame rate" value={fps} min={2} max={30} onChange={setFps} testid="fps" /><Num label="Person confidence" value={thr} min={0.1} max={0.9} step={0.05} onChange={setThr} />
        <label className="flex items-end gap-2 pb-1.5"><input type="checkbox" checked={ball} onChange={(e) => setBall(e.target.checked)} />Track the ball (orange)</label>
        <div className="flex items-end"><Btn kind="primary" testid="run" onClick={() => s.run({ mode: "basketball", sample_fps: fps, det_threshold: thr, ball, ball_kind: "orange" })}>{v.status === "completed" ? "Analyse again" : "Detect and track"}</Btn></div></div>}
    </SourcePanel>
    {v && <Card title="Video"><Stage s={s} overlay={{ persons: true, ball: true, trailSeconds: 0.8 }} /></Card>}
  </>);
}

function Court({ s, refs, setRefs, lm, next, setNext, cell, setCell, minPoss, setMinPoss, margin, setMargin, ids, setIds, res, err, busy, calibrate, done }: Ctx) {
  if (!s.video) return <SourcePanel s={s} />;
  if (!done) return <Notice tone="warn" testid="need-analysis">Run the video analysis first (Video Analysis tab).</Notice>;
  const sample = s.video.source === "sample:basketball-composite"; const ready = refs.length >= 4;
  const tr = s.obs!.tracks.filter((t) => t.observations >= 5);
  return (<>
    <Card title="1 · Match clicked points to court landmarks">
      <p className="mb-2 text-[14px] text-[#66736B]">Choose which landmark you are about to click, then click it on the video frame. Use at least four landmarks that are visible and spread out (not in a straight line). The court is 28 × 15 m.</p>
      <div className="mb-3 flex flex-wrap items-end gap-3"><Field label="Next point is"><select className={`${INPUT} min-w-80`} value={next} onChange={(e) => setNext(e.target.value)} data-testid="landmark">{lm.map((l) => <option key={l.name}>{l.name}</option>)}</select></Field></div>
      <Stage s={s} overlay={{ persons: false, points: refs.map((r, i) => ({ p: r.image, label: String(i + 1) })) }} edit={{ onAdd: (p) => { const l = lm.find((x) => x.name === next); if (l) setRefs([...refs, { image: p, world: [l.x_m, l.y_m], name: l.name }]); }, hint: `Click “${next}” on the video` }} />
      <div className="mt-3"><Table testid="refs" empty="No reference points yet." head={["#", "Landmark", "Court position (m)", "Image position (px)", ""]} rows={refs.map((r, i) => [i + 1, r.name, `${r.world[0]}, ${r.world[1]}`, `${Math.round(r.image[0])}, ${Math.round(r.image[1])}`, <Btn key={i} small kind="danger" onClick={() => setRefs(refs.filter((_, j) => j !== i))} aria-label={`Remove point ${i + 1}`}>Remove</Btn>])} /></div>
      <div className="mt-3 flex flex-wrap gap-2"><Btn onClick={() => setRefs([])} disabled={!refs.length} testid="clear-refs">Clear all</Btn>{sample && <Btn onClick={() => setRefs(SAMPLE_REFS)} testid="sample-refs">Use six landmarks for this sample clip</Btn>}</div>
    </Card>
    <Card title="2 · Settings and analysis">
      <div className="grid gap-3 sm:grid-cols-4"><Num label="Heat-map cell (m)" value={cell} min={0.5} max={4} step={0.5} onChange={setCell} /><Num label="Minimum possession time (s)" value={minPoss} min={0.1} max={30} step={0.1} onChange={setMinPoss} /><Num label="Box margin (fraction of height)" value={margin} min={0} max={0.5} step={0.02} onChange={setMargin} /></div>
      <details className="mt-3"><summary className="cursor-pointer font-semibold text-[#11643A]">Choose which tracks to include ({ids ? ids.length : "all"})</summary>
        <div className="mt-2 flex flex-wrap gap-3" data-testid="track-pick">{tr.map((t) => <label key={t.id} className="flex items-center gap-1.5"><input type="checkbox" checked={!ids || ids.includes(t.id)} onChange={(e) => { const all = tr.map((x) => x.id); const cur = ids ?? all; setIds(e.target.checked ? [...new Set([...cur, t.id])] : cur.filter((x) => x !== t.id)); }} />#{t.id} ({t.observed_s}s)</label>)}</div></details>
      <div className="mt-3"><Btn kind="primary" disabled={!ready || busy} onClick={calibrate} testid="calibrate">{busy ? "Working…" : "Map the court and analyse"}</Btn></div>
      {err && <div className="mt-3"><Notice tone="error" testid="calib-error">{err}</Notice></div>}
      {res && <div className="mt-3 space-y-2" data-testid="calibration-result"><p>Fit from {res.calibration.points} points: RMS error <b data-testid="rms">{res.calibration.rms_error_m.toFixed(2)} m</b>, worst <b>{res.calibration.max_error_m.toFixed(2)} m</b>.</p>{res.calibration.warning && <Notice tone="warn" testid="calib-warning">{res.calibration.warning}</Notice>}</div>}
    </Card>
  </>);
}

const COURT_ARCS = (() => { const a: string[] = []; for (const [ox, sx] of [[0, 1], [28, -1]] as const) { const x = (d: number) => ox + sx * d; a.push(`M${x(0)} 5.05H${x(5.8)}V9.95H${x(0)}`, `M${x(0)} 0.9H${x(2.99)}M${x(0)} 14.1H${x(2.99)}`); const r = 6.75, cx = x(1.575), dy = Math.sqrt(r * r - 6.6 * 6.6); a.push(`M${x(2.99)} 0.9A${r} ${r} 0 0 ${sx === 1 ? 1 : 0} ${x(2.99)} 14.1`); void cx; void dy; } return a.join(" "); })();
function Court2D({ children }: { children?: React.ReactNode }) {
  return <svg viewBox="-1 -1 30 17" className="w-full" role="img" aria-label="Basketball court, top view"><g transform="translate(0,15) scale(1,-1)"><rect x={0} y={0} width={28} height={15} fill="#F3FBF6" stroke="#16834A" strokeWidth={0.12} /><line x1={14} x2={14} y1={0} y2={15} stroke="#16834A" strokeWidth={0.1} /><circle cx={14} cy={7.5} r={1.8} fill="none" stroke="#16834A" strokeWidth={0.1} /><path d={COURT_ARCS} fill="none" stroke="#16834A" strokeWidth={0.1} />{children}</g></svg>;
}
function Players({ s, res, setTab }: Ctx) {
  const [showBall, setShowBall] = useState(false);
  if (!res) return <Notice tone="warn" testid="need-calibration">Map the court first (Court Mapping tab). <Btn small onClick={() => setTab("court")}>Go there</Btn></Notice>;
  const hm = res.heatmap, max = Math.max(0.001, ...hm.seconds.flat());
  return (<>
    <Card title="Heat map from real tracks" actions={<label className="flex items-center gap-1.5 text-[14px]"><input type="checkbox" checked={showBall} onChange={(e) => setShowBall(e.target.checked)} />Show ball projection</label>} testid="heat-card">
      <Court2D>{hm.seconds.flatMap((row, r) => row.map((v, c) => v > 0 ? <rect key={`${r}-${c}`} x={c * hm.cell_m} y={r * hm.cell_m} width={hm.cell_m} height={hm.cell_m} fill="#16834A" fillOpacity={0.12 + 0.75 * (v / max)}><title>{`${v.toFixed(1)} s`}</title></rect> : null))}
        {showBall && res.ball.on_court_plane.filter((p) => p.x_m > -1 && p.x_m < 29 && p.y_m > -1 && p.y_m < 16).map((p, i) => <circle key={i} cx={p.x_m} cy={p.y_m} r={0.18} fill="#D97706" fillOpacity={0.7} />)}</Court2D>
      <p className="mt-1 text-[14px] text-[#66736B]" data-testid="heat-note">{hm.note} Darkest cell: {max.toFixed(1)} s. {res.outside_court_observations > 0 ? `${res.outside_court_observations} observations fell outside the court and were not counted.` : ""}</p>
    </Card>
    <Card title="Players (temporary track numbers)" testid="players-card"><Table head={["Track", "Seconds on court", "Distance", "Excluded jumps", ""]} empty="No selected track was on the mapped court." rows={res.players.map((p) => [`#${p.id}`, `${p.seconds_on_court} s`, `${p.distance_m} m`, p.implausible_jumps_excluded, <Btn key={p.id} small onClick={() => { const t = s.obs?.tracks.find((x) => x.id === p.id); if (t) s.seek(t.first_t); }}>Jump</Btn>])} />
      <p className="mt-2 text-[14px] text-[#66736B]">Distance is the sum of steps between consecutive observations of one track; steps faster than 11 m/s (tracking jumps) are excluded and counted. A player split into several tracks appears as several rows.</p></Card>
  </>);
}

function Possession({ s, res, setTab }: Ctx) {
  if (!res) return <Notice tone="warn" testid="need-calibration">Map the court first (Court Mapping tab). <Btn small onClick={() => setTab("court")}>Go there</Btn></Notice>;
  return (<>
    <Card title="Potential Possession Events" actions={<StatusPill s="experimental" />} testid="possession-card">
      <Table testid="possession" empty="No ball detection stayed inside one person's box long enough." head={["Start", "End", "Duration", "Track", "Confidence", "Follows", ""]} rows={res.possession.map((p) => [mmss(p.start_t), mmss(p.end_t), `${p.duration_s} s`, `#${p.track_id}`, p.confidence, p.follows_track ? `#${p.follows_track}` : "—", <Btn key={p.start_t} small onClick={() => s.seek(p.start_t)}>Jump</Btn>])} />
      <p className="mt-2 text-[14px] text-[#66736B]">{res.possession_note} Confidence is low when fewer than three observations support the event.</p>
    </Card>
    <Card title="Shots, assists and scoring"><div className="flex flex-wrap items-center gap-2"><StatusPill s="soon" /><span>Automatic shot and score detection is not implemented. Mark them yourself on the Manual Annotation tab.</span></div></Card>
  </>);
}

function Annotation({ s, ann, setAnn }: Ctx) {
  const [kind, setKind] = useState<BBKind>("Shot made"); const [team, setTeam] = useState<"A" | "B">("A"); const [points, setPoints] = useState<1 | 2 | 3>(2); const [player, setPlayer] = useState("");
  const sum = useMemo(() => bbSummary(ann), [ann]);
  if (!s.video) return <SourcePanel s={s} />;
  const add = () => setAnn([...ann, { id: annId(), t: Math.round(s.t * 100) / 100, kind, team, ...(kind === "Shot made" ? { points } : {}), ...(player.trim() ? { player: player.trim() } : {}) }].sort((a, b) => a.t - b.t));
  return (<>
    <Notice tone="info" testid="manual-banner"><StatusPill s="manual" className="mr-2" />Everything on this tab is entered by you. Statistics are counts of your entries; nothing is detected or inferred.</Notice>
    <Card title="Add an event at the current video time"><Stage s={s} overlay={{ persons: true, ball: true }} />
      <div className="mt-3 flex flex-wrap items-end gap-2"><Field label="Event"><select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as BBKind)} data-testid="ann-kind">{BB_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Team"><select className={INPUT} value={team} onChange={(e) => setTeam(e.target.value as "A" | "B")} data-testid="ann-team"><option value="A">Team A</option><option value="B">Team B</option></select></Field>
        {kind === "Shot made" && <Field label="Points"><select className={INPUT} value={points} onChange={(e) => setPoints(Number(e.target.value) as 1 | 2 | 3)} data-testid="ann-points"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></Field>}
        <Field label="Player (free text, optional)"><input className={INPUT} value={player} onChange={(e) => setPlayer(e.target.value)} maxLength={40} /></Field><Btn kind="primary" onClick={add} testid="ann-add">Add at {mmss(s.t)}</Btn></div>
    </Card>
    <div className="grid gap-3 md:grid-cols-2" data-testid="ann-summary">{(["A", "B"] as const).map((k) => <Card key={k} title={`Team ${k} (from your annotations)`}><div className="grid grid-cols-3 gap-2"><Kpi label="Points" value={sum[k].points} testid={`pts-${k}`} /><Kpi label="Shots" value={`${sum[k].made}/${sum[k].attempts}`} sub={sum[k].fg_pct === null ? "no attempts" : `${sum[k].fg_pct}%`} /><Kpi label="Assists / reb." value={`${sum[k].assists} / ${sum[k].rebounds}`} sub={`${sum[k].turnovers} turnovers · ${sum[k].fouls} fouls`} /></div></Card>)}</div>
    <Card title="Your annotations" actions={<><StatusPill s="manual" /><Btn small onClick={() => saveText("basketball-annotations.csv", toCsv([["Video time (s)", "Event", "Team", "Points", "Player", "Source"], ...ann.map((a) => [a.t, a.kind, a.team, a.points ?? "", a.player ?? "", "Manual Annotation"])]))} disabled={!ann.length} testid="ann-export">Export CSV</Btn></>}>
      <Table testid="ann-list" empty="No annotations yet." head={["Time", "Event", "Team", "Points", "Player", ""]} rows={ann.map((a) => [mmss(a.t), a.kind, a.team || "—", a.points ?? "—", a.player ?? "—", <span key={a.id} className="flex gap-1.5"><Btn small onClick={() => s.seek(a.t)}>Jump</Btn><Btn small kind="danger" onClick={() => setAnn(ann.filter((x) => x.id !== a.id))} aria-label={`Delete ${a.kind} at ${mmss(a.t)}`}>Delete</Btn></span>])} /></Card>
  </>);
}

function Reports({ s, res, ann }: Ctx) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const sum = bbSummary(ann);
  if (!res && !ann.length) return <Notice tone="warn" testid="need-results">Map the court or add annotations first; reports are built from them.</Notice>;
  const players = res ? [["Track (temporary)", "Seconds on court", "Distance (m)", "Excluded jumps"], ...res.players.map((p) => [p.id, p.seconds_on_court, p.distance_m, p.implausible_jumps_excluded])] : null;
  const poss = res ? [["Start (s)", "End (s)", "Duration (s)", "Track", "Confidence", "Label"], ...res.possession.map((p) => [p.start_t, p.end_t, p.duration_s, p.track_id, p.confidence, p.label])] : null;
  const pdf = async () => {
    if (!s.api) return; setBusy(true); setErr("");
    try {
      const sections: Record<string, unknown>[] = [];
      if (res) sections.push({ heading: "Court mapping", lines: [`${res.calibration.points} reference points, RMS error ${res.calibration.rms_error_m.toFixed(2)} m`] }, { heading: "Players (temporary track numbers)", rows: players!.map((r) => r.map(String)) }, { heading: "Potential Possession Events (experimental rule)", text: res.possession_note, rows: poss!.map((r) => r.map(String)) });
      if (ann.length) sections.push({ heading: "Manual Annotation", lines: [`Team A: ${sum.A.points} points, ${sum.A.made}/${sum.A.attempts} shots`, `Team B: ${sum.B.points} points, ${sum.B.made}/${sum.B.attempts} shots`, "Entered by a person; not detected."], rows: [["Time (s)", "Event", "Team", "Points"], ...ann.map((a) => [String(a.t), a.kind, a.team, String(a.points ?? "")])] });
      sections.push({ heading: "Limits", lines: ["Player numbers are temporary and may split one player over several numbers.", "Court positions of the ball are projections onto the floor plane.", "Possession events are a geometric rule, not an official statistic."] });
      saveBlob("basketball-report.pdf", await s.api.pdf({ title: "Basketball video analysis", subtitle: `Source: ${s.video?.source ?? ""}`, sections, footer: "Demonstration software. Experimental results; verify against the video." }));
    } catch (e) { setErr(e instanceof ViError ? e.message : "The PDF could not be created."); } finally { setBusy(false); }
  };
  return (<Card title="Exports" testid="exports"><div className="flex flex-wrap gap-2">{players && <Btn onClick={() => saveText("players.csv", toCsv(players))} testid="export-players">Players (CSV)</Btn>}{poss && <Btn onClick={() => saveText("possession-events.csv", toCsv(poss))} testid="export-possession">Possession events (CSV)</Btn>}{res && <Btn onClick={() => saveText("heatmap.csv", toCsv([["row (y, m)", ...res.heatmap.seconds[0].map((_, c) => `x ${(c * res.heatmap.cell_m).toFixed(1)}`)], ...res.heatmap.seconds.map((r, i) => [(i * res.heatmap.cell_m).toFixed(1), ...r])]))}>Heat map grid (CSV)</Btn>}<Btn kind="primary" onClick={pdf} disabled={busy} testid="export-pdf">{busy ? "Creating…" : "Report (PDF)"}</Btn></div>{err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}{!res && <Empty>No tracking results yet: only your annotations are included.</Empty>}</Card>);
}
