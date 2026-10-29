"use client";
import { useMemo, useState } from "react";
import type { Branding } from "@/lib/types";
import type { Attendance, Employee, PresenceEvent, RestaurantResult } from "@/lib/vi/api";
import { ViError } from "@/lib/vi/api";
import { hms, mmss, saveBlob, saveText, toCsv } from "@/lib/vi/format";
import { Btn, Card, Empty, Field, FeatureList, INPUT, Kpi, Notice, Num, SourcePanel, Stage, StatusPill, Table, ViShell, useSession, type Pt, type Session } from "./common";

const NAV = [{ id: "overview", label: "Overview" }, { id: "analysis", label: "Video Analysis" }, { id: "area", label: "Area Monitoring" }, { id: "attendance", label: "Attendance Comparison" }, { id: "reports", label: "Reports & Evidence" }, { id: "settings", label: "Settings" }];
const NOTICE = "Area-presence review for human supervisors. People are followed as temporary numbers (no face recognition, no identification). An event is a threshold flag for review, never a conclusion about what someone was doing, and nothing here is an employment decision. Attendance data is simulated and fictional.";
const FICTIONAL: Employee[] = [
  { id: "e1", name: "Alex Rivera (fictional)", role: "Server", shift_start: "12:00", shift_end: "12:30" },
  { id: "e2", name: "Sam Okafor (fictional)", role: "Cook", shift_start: "12:00", shift_end: "12:30" },
  { id: "e3", name: "Jordan Lee (fictional)", role: "Host", shift_start: "12:05", shift_end: "12:20" },
  { id: "e4", name: "Casey Novak (fictional)", role: "Dishwasher", shift_start: "18:00", shift_end: "22:00" },
];
const EXAMPLE_AREA: Pt[] = [[200, 180], [520, 180], [520, 520], [200, 520]];
const FEATURES = [
  { name: "Person detection and tracking", status: "working" as const, note: "YOLOX-S detector and ByteTrack on the server. Identities are temporary track numbers and can switch after occlusion." },
  { name: "Configurable monitored area (polygon)", status: "working" as const, note: "Click corners on a video frame; the area is applied to the stored tracks so it can be changed without re-analysing." },
  { name: "Entry, exit and duration events", status: "working" as const, note: "Computed from the point where a person's feet appear to touch the floor. Incomplete observations are labelled." },
  { name: "Potential Extended Area Presence", status: "working" as const, note: "A configurable threshold flag for human review. It does not say why someone was there." },
  { name: "Simulated attendance comparison", status: "working" as const, note: "Fictional schedule compared with observed area presence after a person links each track manually." },
  { name: "Evidence clips", status: "working" as const, note: "Real clips cut from the source video with the tracked boxes drawn on them, generated on request." },
  { name: "CSV and PDF export", status: "working" as const, note: "Events, discrepancies and settings." },
  { name: "Automatic employee identification", status: "soon" as const, note: "Deliberately not provided: no face or biometric recognition. Links between tracks and staff are made by a person." },
  { name: "Live CCTV streams", status: "external" as const, note: "Needs a camera or recorder integration; this demo processes uploaded files only." },
  { name: "Uniform or role detection", status: "soon" as const, note: "Not implemented." },
];

export default function RestaurantApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const s = useSession(serviceUrl, "restaurant");
  const [tab, setTab] = useState("overview");
  const [roi, setRoi] = useState<Pt[]>([]); const [closed, setClosed] = useState(false);
  const [minStay, setMinStay] = useState(10); const [merge, setMerge] = useState(3); const [minObs, setMinObs] = useState(3);
  const [res, setRes] = useState<RestaurantResult | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [emps, setEmps] = useState<Employee[]>(FICTIONAL); const [links, setLinks] = useState<Record<string, string>>({}); const [clock, setClock] = useState("12:00:00"); const [tol, setTol] = useState(10);
  const [clips, setClips] = useState<Clip[]>([]);
  const done = s.video?.status === "completed" && !!s.obs;
  const ready = closed && roi.length >= 3;
  const analyse = async (withAttendance = false) => {
    if (!s.api || !s.video) return; setBusy(true); setErr("");
    try {
      const body: Record<string, unknown> = { roi, min_stay_s: minStay, merge_gap_s: merge, min_observations: minObs };
      if (withAttendance) Object.assign(body, { employees: emps, links, clock_start: clock, tolerance_min: tol });
      setRes(await s.api.restaurant(s.video.video_id, body));
    } catch (e) { setErr(e instanceof ViError ? e.message : "The analysis failed."); } finally { setBusy(false); }
  };
  const ctx = { s, roi, setRoi, closed, setClosed, minStay, setMinStay, merge, setMerge, minObs, setMinObs, res, err, busy, analyse, done, ready, emps, setEmps, links, setLinks, clock, setClock, tol, setTol, clips, setClips, setTab };
  return (
    <ViShell branding={branding} title="Restaurant Area-Presence Review" project="Sample 22 · AI Restaurant Employee Monitoring & Break Detection" nav={NAV} active={tab} onNav={setTab} service={s.service} notice={NOTICE}>
      {tab === "overview" && <Overview {...ctx} />}
      {tab === "analysis" && <Analysis {...ctx} />}
      {tab === "area" && <Area {...ctx} />}
      {tab === "attendance" && <AttendanceTab {...ctx} />}
      {tab === "reports" && <Reports {...ctx} />}
      {tab === "settings" && <SettingsTab {...ctx} />}
    </ViShell>
  );
}
interface Clip { id: string; url: string; webm: string | null; label: string }
type Ctx = { s: Session; roi: Pt[]; setRoi(p: Pt[]): void; closed: boolean; setClosed(b: boolean): void; minStay: number; setMinStay(n: number): void; merge: number; setMerge(n: number): void; minObs: number; setMinObs(n: number): void; res: RestaurantResult | null; err: string; busy: boolean; analyse(att?: boolean): Promise<void>; done: boolean; ready: boolean; emps: Employee[]; setEmps(e: Employee[]): void; links: Record<string, string>; setLinks(l: Record<string, string>): void; clock: string; setClock(s: string): void; tol: number; setTol(n: number): void; clips: Clip[]; setClips(c: Clip[]): void; setTab(t: string): void };

function Overview({ s, res, done, setTab }: Ctx) {
  return (<>
    <Card title="What this demonstration does">
      <p>Upload a video (or open the sample), draw the area you want to watch, and get a reviewable list of when each tracked person entered and left it and for how long. A threshold you set can flag long presence for a human to look at. A simulated, fictional schedule can then be compared with that presence, but only for tracks that a person has linked to a name.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Btn kind="primary" onClick={() => setTab("analysis")} testid="go-analysis">Start with a video</Btn>{done && <Btn onClick={() => setTab("area")}>Go to area monitoring</Btn>}</div>
      {done && s.video?.summary && <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Analysed frames" value={s.video.summary.analysed_frames} /><Kpi label="Tracked people" value={s.video.summary.tracks} sub="temporary numbers" /><Kpi label="Events in area" value={res?.summary.events ?? "—"} /><Kpi label="Flagged for review" value={res?.summary.flagged ?? "—"} /></div>}
    </Card>
    <Card title="Feature status"><FeatureList items={FEATURES} /></Card>
    <Card title="What it cannot do">
      <ul className="list-disc space-y-1 pl-5 text-[#1C2922]">
        <li>It does not recognise faces or identify anyone. A track number can change when a person is hidden or crosses another person.</li>
        <li>It cannot tell what a person is doing, so it never labels anything a &quot;break&quot; and never concludes misconduct. Flags are prompts for a person to watch the footage.</li>
        <li>The bundled sample is pedestrians on a campus path, not a restaurant. It shows the workflow, not accuracy on restaurant CCTV, which has not been measured.</li>
        <li>The schedule and names in the attendance comparison are fictional.</li>
      </ul>
    </Card>
  </>);
}

function Analysis({ s }: Ctx) {
  const [fps, setFps] = useState(5); const [thr, setThr] = useState(0.35); const [start, setStart] = useState(0); const [end, setEnd] = useState<number>(NaN);
  const v = s.video; const running = v?.status === "queued" || v?.status === "running";
  const [show, setShow] = useState(true);
  return (<>
    <SourcePanel s={s}>
      {v && !running && <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Num label="Analysis frame rate" value={fps} min={1} max={15} onChange={setFps} hint="Frames analysed per second of video" testid="fps" /><Num label="Detection confidence" value={thr} min={0.1} max={0.9} step={0.05} onChange={setThr} />
        <Num label="Start (s)" value={start} min={0} onChange={setStart} /><Num label="End (s, optional)" value={end} min={0} onChange={setEnd} />
        <div className="sm:col-span-4"><Btn kind="primary" testid="run" onClick={() => s.run({ mode: "restaurant", sample_fps: fps, det_threshold: thr, start_s: Number.isFinite(start) ? start : 0, ...(Number.isFinite(end) && end > start ? { end_s: end } : {}) })}>{v.status === "completed" ? "Analyse again" : "Detect and track people"}</Btn></div></div>}
    </SourcePanel>
    {v && <Card title="Video" actions={<label className="flex items-center gap-1.5 text-[14px]"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />Show tracked people</label>}>
      <Stage s={s} overlay={{ persons: show }} /></Card>}
    {s.obs && <Card title={`Tracked people (${s.obs.tracks.length})`} testid="tracks"><p className="mb-2 text-[14px] text-[#66736B]">Numbers are temporary labels for this video only. One person can appear under several numbers after being hidden.</p>
      <Table head={["Track", "First seen", "Last seen", "Observed", "Mean confidence", ""]} rows={s.obs.tracks.map((t) => [`#${t.id}`, mmss(t.first_t), mmss(t.last_t), `${t.observed_s} s`, t.mean_score.toFixed(2), <Btn key={t.id} small onClick={() => s.seek(t.first_t)}>Jump to first frame</Btn>])} /></Card>}
  </>);
}

function Area(c: Ctx) {
  const { s, roi, setRoi, closed, setClosed, minStay, setMinStay, merge, setMerge, minObs, setMinObs, res, err, busy, analyse, done, ready, clips, setClips } = c;
  const [editing, setEditing] = useState(true); const [clipBusy, setClipBusy] = useState<string>(""); const [clipErr, setClipErr] = useState("");
  const sample = s.video?.source === "sample:pedestrians-opencv-vtest";
  const flagged = useMemo(() => res?.events.filter((e) => e.flag).map((e) => e.track_id) ?? [], [res]);
  const makeClip = async (e: PresenceEvent) => {
    if (!s.api || !s.video) return; setClipBusy(`${e.track_id}-${e.entry_t}`); setClipErr("");
    try { const r = await s.api.clip(s.video.video_id, { t0: e.entry_t, t1: Math.min(e.exit_t, e.entry_t + 20), track_ids: [e.track_id], roi, pad_s: 2 }); setClips([{ id: r.clip_id, url: s.api.url(r.url), webm: r.url_webm ? s.api.url(r.url_webm) : null, label: `Track #${e.track_id}, ${mmss(r.t0)}–${mmss(r.t1)}` }, ...clips.filter((x) => x.id !== r.clip_id)]); }
    catch (x) { setClipErr(x instanceof ViError ? x.message : "The clip could not be created."); } finally { setClipBusy(""); }
  };
  if (!s.video) return <SourcePanel s={s} />;
  if (!done) return <Notice tone="warn" testid="need-analysis">Run the video analysis first (Video Analysis tab). The area is applied to its results.</Notice>;
  return (<>
    <Card title="1 · Draw the monitored area" testid="area-card">
      <p className="mb-2 text-[14px] text-[#66736B]">Pause on a frame where the whole area is visible, then click its corners on the video (at least three). Presence is judged from where people&apos;s feet touch the floor.</p>
      <Stage s={s} overlay={{ persons: true, polygon: roi, closed, flagged }} edit={editing && !closed ? { onAdd: (p) => setRoi([...roi, p]), hint: `Click to add corner ${roi.length + 1}${roi.length >= 3 ? " — or press “Close area”" : ""}` } : undefined} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn onClick={() => { setRoi(roi.slice(0, -1)); setClosed(false); }} disabled={!roi.length} testid="undo-point">Undo last point</Btn>
        <Btn onClick={() => { setRoi([]); setClosed(false); }} disabled={!roi.length} testid="clear-area">Clear</Btn>
        <Btn kind="primary" onClick={() => { setClosed(true); setEditing(false); }} disabled={roi.length < 3 || closed} testid="close-area">Close area</Btn>
        {closed && <Btn onClick={() => { setClosed(false); setEditing(true); }} testid="edit-area">Edit corners</Btn>}
        {sample && <Btn onClick={() => { setRoi(EXAMPLE_AREA); setClosed(true); setEditing(false); }} testid="example-area">Use the example area for this clip</Btn>}
      </div>
    </Card>
    <Card title="2 · Settings and analysis">
      <div className="grid gap-3 sm:grid-cols-4">
        <Num label="Potential Extended Area Presence threshold (s)" value={minStay} min={1} max={36000} onChange={setMinStay} testid="threshold" hint="Flags events at least this long" />
        <Num label="Merge short absences up to (s)" value={merge} min={0} max={600} onChange={setMerge} hint="A brief step outside does not end an event" /><Num label="Minimum observations" value={minObs} min={1} max={100} onChange={setMinObs} hint="Shorter blips are ignored and counted" />
        <div className="flex items-end"><Btn kind="primary" disabled={!ready || busy} onClick={() => analyse()} testid="analyse-area">{busy ? "Working…" : "Find entry and exit events"}</Btn></div>
      </div>
      {err && <div className="mt-3"><Notice tone="error" testid="area-error">{err}</Notice></div>}
    </Card>
    {res && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="area-kpis"><Kpi label="Events" value={res.summary.events} testid="k-events" /><Kpi label="People in area" value={res.summary.tracks_in_area} sub="temporary numbers" /><Kpi label="Flagged for review" value={res.summary.flagged} testid="k-flagged" /><Kpi label="Incomplete" value={res.summary.incomplete} sub="entry or exit not seen" testid="k-incomplete" /><Kpi label="Time in area" value={`${res.summary.observed_area_seconds} s`} sub="sum of events" /></div>
      <Card title="Entry and exit events" testid="events-card">
        {res.ignored_short_events > 0 && <p className="mb-2 text-[14px] text-[#66736B]">{res.ignored_short_events} very short presence(s) with fewer than {minObs} observations were ignored.</p>}
        <Table testid="events" head={["Track", "Entry", "Exit", "Duration", "Observation", "Flag", ""]} empty="No tracked person was inside the area." rows={res.events.map((e) => [`#${e.track_id}`, <span key="a">{mmss(e.entry_t)}{!e.entry_observed && <em className="text-[#66736B]"> (not seen)</em>}</span>, <span key="b">{mmss(e.exit_t)}{!e.exit_observed && <em className="text-[#66736B]"> (not seen)</em>}</span>, `${e.duration_s.toFixed(1)} s${e.complete ? "" : " or more"}`,
          <span key="c" className={e.complete ? "" : "text-[#D97706]"}>{e.status}</span>, e.flag ? <span key="d" title={e.flag_note ?? ""} className="rounded-full border border-[#D97706]/40 bg-amber-50 px-2 py-0.5 text-[13px] font-semibold text-amber-800">{e.flag}</span> : "—",
          <span key="e" className="flex gap-1.5"><Btn small onClick={() => s.seek(e.entry_t)}>Jump</Btn><Btn small disabled={!!clipBusy} onClick={() => makeClip(e)} testid="make-clip">{clipBusy === `${e.track_id}-${e.entry_t}` ? "Cutting…" : "Evidence clip"}</Btn></span>])} />
        {clipErr && <div className="mt-2"><Notice tone="error">{clipErr}</Notice></div>}
        {res.events.some((e) => e.flag) && <p className="mt-2 text-[14px] text-[#66736B]">A flag means the observed time reached your threshold. It says nothing about the reason; a person should watch the footage.</p>}
      </Card>
      <Card title="People in the area over time"><Occupancy data={res.occupancy} onSeek={s.seek} /></Card>
      <Card title="Limits of these results"><ul className="list-disc space-y-1 pl-5">{res.limits.map((l) => <li key={l}>{l}</li>)}</ul></Card>
    </>}
    {clips.length > 0 && <ClipList clips={clips} />}
  </>);
}

function Occupancy({ data, onSeek }: { data: { t: number; max_people_in_area: number }[]; onSeek(t: number): void }) {
  const max = Math.max(1, ...data.map((d) => d.max_people_in_area));
  return <div className="flex h-28 items-end gap-0.5" role="img" aria-label="Most people in the area per time interval" data-testid="occupancy">{data.map((d) => <button key={d.t} type="button" onClick={() => onSeek(d.t)} title={`${mmss(d.t)}: ${d.max_people_in_area} in area`} className="flex-1 rounded-t bg-[#16834A]/80 hover:bg-[#11643A]" style={{ height: `${(d.max_people_in_area / max) * 100}%`, minHeight: d.max_people_in_area ? 2 : 0 }} />)}</div>;
}
function ClipList({ clips }: { clips: Clip[] }) {
  return <Card title="Evidence clips" testid="clips"><p className="mb-2 text-[14px] text-[#66736B]">Real clips cut from the source video, with tracked boxes drawn on them (the selected track in green). Generated on request and deleted with the video.</p>
    <div className="grid gap-3 md:grid-cols-2">{clips.map((c) => <figure key={c.id}><video controls preload="metadata" className="w-full rounded-lg border border-[#E2EAE5] bg-black" data-testid="clip-video">{c.webm && <source src={c.webm} type="video/webm" />}<source src={c.url} type="video/mp4" /></video><figcaption className="mt-1 text-[14px]">{c.label} · <a className="text-[#11643A] underline" href={c.url} target="_blank" rel="noreferrer">open</a></figcaption></figure>)}</div></Card>;
}

function AttendanceTab({ s, res, analyse, ready, emps, setEmps, links, setLinks, clock, setClock, tol, setTol, busy, done }: Ctx) {
  const att: Attendance | undefined = res?.attendance;
  const tracks = useMemo(() => [...new Set(res?.events.map((e) => e.track_id) ?? [])], [res]);
  if (!s.video || !done) return <Notice tone="warn">Analyse a video and find area events first.</Notice>;
  if (!res) return <Notice tone="warn" testid="need-events">Find entry and exit events in the Area Monitoring tab first. The comparison uses those events.</Notice>;
  const upd = (i: number, p: Partial<Employee>) => setEmps(emps.map((e, j) => (j === i ? { ...e, ...p } : e)));
  return (<>
    <Notice tone="warn" testid="sim-banner"><b>Simulated data.</b> The names and shift times below are fictional and editable. The system does not recognise people: you link each track number to a person yourself, and anything not linked is reported as Insufficient Data.</Notice>
    <Card title="1 · Fictional schedule">
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Video starts at (fictional clock time)"><input className={INPUT} value={clock} onChange={(e) => setClock(e.target.value)} data-testid="clock-start" /></Field><Num label="Tolerance around the shift (minutes)" value={tol} min={0} max={240} onChange={setTol} /></div>
      <div className="mt-3 overflow-x-auto"><table className="min-w-full text-[14px]" data-testid="schedule"><thead><tr>{["Name", "Role", "Shift start", "Shift end"].map((h) => <th key={h} className="border-b border-[#E2EAE5] bg-[#F7F9F8] px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
        <tbody>{emps.map((e, i) => <tr key={e.id}><td className="p-1"><input aria-label={`Name ${i + 1}`} className={INPUT} value={e.name} onChange={(x) => upd(i, { name: x.target.value })} /></td><td className="p-1"><input aria-label={`Role ${i + 1}`} className={INPUT} value={e.role} onChange={(x) => upd(i, { role: x.target.value })} /></td><td className="p-1"><input aria-label={`Shift start ${i + 1}`} className={INPUT} value={e.shift_start} onChange={(x) => upd(i, { shift_start: x.target.value })} /></td><td className="p-1"><input aria-label={`Shift end ${i + 1}`} className={INPUT} value={e.shift_end} onChange={(x) => upd(i, { shift_end: x.target.value })} /></td></tr>)}</tbody></table></div>
    </Card>
    <Card title="2 · Link tracks to people (manual)" actions={<StatusPill s="manual" />}>
      {!tracks.length ? <Empty>No track entered the monitored area, so there is nothing to link.</Empty> : (
        <Table testid="links" head={["Track (temporary)", "Events in area", "Linked to"]} rows={tracks.map((t) => [`#${t}`, res.events.filter((e) => e.track_id === t).length, <select key={t} aria-label={`Link track ${t}`} value={links[String(t)] ?? ""} onChange={(e) => { const n = { ...links }; if (e.target.value) n[String(t)] = e.target.value; else delete n[String(t)]; setLinks(n); }} className={INPUT}><option value="">Not linked</option>{emps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>])} />)}
      <div className="mt-3"><Btn kind="primary" onClick={() => analyse(true)} disabled={!ready || busy} testid="compare">Compare with the schedule</Btn></div>
    </Card>
    {att && <Card title="3 · Comparison" testid="attendance">
      <Table testid="attendance-table" head={["Person (fictional)", "Shift", "Linked tracks", "Seen in area during shift", "Result", "Why"]} rows={att.rows.map((r) => [`${r.name} (${r.role})`, r.shift, r.linked_tracks.length ? r.linked_tracks.map((t) => `#${t}`).join(", ") : "—", `${r.observed_in_area_within_shift_s} s`,
        <span key="s" data-status={r.status} className={`rounded-full border px-2 py-0.5 text-[13px] font-semibold ${r.status.startsWith("Consistent") ? "border-[#16834A]/40 bg-[#E9F7EF] text-[#11643A]" : r.status === "Insufficient Data" ? "border-slate-300 bg-slate-100 text-slate-700" : "border-[#D97706]/40 bg-amber-50 text-amber-800"}`}>{r.status}</span>, r.explanation])} />
      {att.unlinked_tracks.length > 0 && <p className="mt-2 text-[14px]">Tracks not linked to anyone: {att.unlinked_tracks.map((t) => `#${t}`).join(", ")}.</p>}
      <p className="mt-2 text-[14px] text-[#66736B]">{att.note}</p></Card>}
  </>);
}

function Reports({ s, res, clips }: Ctx) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (!res) return <Notice tone="warn" testid="need-results">Find area events first; reports are built from them.</Notice>;
  const rows = [["Track (temporary)", "Entry (video s)", "Exit (video s)", "Duration (s)", "Observation", "Flag"], ...res.events.map((e) => [e.track_id, e.entry_t, e.exit_t, e.duration_s, e.status, e.flag ?? ""])];
  const attRows = res.attendance ? [["Person (fictional)", "Shift", "Linked tracks", "Seen in area during shift (s)", "Result", "Why"], ...res.attendance.rows.map((r) => [r.name, r.shift, r.linked_tracks.join(" "), r.observed_in_area_within_shift_s, r.status, r.explanation])] : null;
  const pdf = async () => {
    if (!s.api) return; setBusy(true); setErr("");
    try {
      const sections: Record<string, unknown>[] = [{ heading: "Summary", lines: [`Events in the monitored area: ${res.summary.events}`, `Flagged as Potential Extended Area Presence (threshold ${res.threshold_s} s): ${res.summary.flagged}`, `Incomplete observations: ${res.summary.incomplete}`, `Short presences ignored: ${res.ignored_short_events}`] },
        { heading: "Entry and exit events", rows: rows.map((r) => r.map(String)) }];
      if (attRows) sections.push({ heading: "Comparison with a simulated schedule", text: res.attendance!.note, rows: attRows.map((r) => r.map(String)) });
      sections.push({ heading: "Limits", lines: res.limits });
      saveBlob("area-presence-report.pdf", await s.api.pdf({ title: "Area presence review", subtitle: `Source: ${s.video?.source ?? ""} · demonstration data`, sections, footer: "Flags are for human review. No face recognition or identification was performed. Schedule data is fictional." }));
    } catch (e) { setErr(e instanceof ViError ? e.message : "The PDF could not be created."); } finally { setBusy(false); }
  };
  return (<>
    <Card title="Exports" testid="exports">
      <div className="flex flex-wrap gap-2"><Btn onClick={() => saveText("area-events.csv", toCsv(rows))} testid="export-events">Download events (CSV)</Btn>{attRows && <Btn onClick={() => saveText("attendance-comparison.csv", toCsv(attRows))} testid="export-attendance">Download comparison (CSV)</Btn>}<Btn kind="primary" onClick={pdf} disabled={busy} testid="export-pdf">{busy ? "Creating…" : "Download report (PDF)"}</Btn></div>
      {err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}
      {!attRows && <p className="mt-2 text-[14px] text-[#66736B]">The attendance comparison is included once you have run it.</p>}
    </Card>
    <Card title="Event list preview"><Table head={rows[0].map(String)} rows={rows.slice(1).map((r) => r.map((c) => String(c)))} empty="No events." /></Card>
    {clips.length > 0 ? <ClipList clips={clips} /> : <Card title="Evidence clips"><Empty>No clip has been generated. Use “Evidence clip” on an event in Area Monitoring; clips are real cuts of the video, created only when you ask.</Empty></Card>}
  </>);
}

function SettingsTab({ s }: Ctx) {
  return (<>
    <Card title="Models and limits" testid="settings">
      {s.health ? <><Table head={["Part", "What it is", "Licence / note"]} rows={Object.entries(s.health.models).map(([k, m]) => [k, m.name, m.licence ?? m.note ?? ""])} />
        <p className="mt-3 text-[14px]">Limits: {s.health.limits.max_video_mb} MB, {s.health.limits.max_video_seconds} s per video, {s.health.limits.max_analysed_frames} analysed frames per job. Videos are deleted after about an hour.</p></> : <Empty>Connect the service to see its models and limits.</Empty>}
    </Card>
    <Card title="Privacy">
      <ul className="list-disc space-y-1 pl-5"><li>No face recognition, identification or biometric template is created. Track numbers exist only for the current video.</li><li>The fictional schedule and track links stay in this browser page; they are sent to the service only for the comparison you request and are not stored.</li><li>Before analysing real staff footage a business needs a lawful basis, notice to staff and local-law advice; this demonstration is not a compliance tool.</li></ul>
      <div className="mt-3"><Btn kind="danger" onClick={() => s.close()} disabled={!s.video} testid="delete-video">Delete the current video from the server now</Btn></div>
    </Card>
  </>);
}
