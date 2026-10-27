"use client";
import { useMemo, useState } from "react";
import { SUPPORTED_CLASSES, type Settings, type TrackSummary, type Frame, type Zone, type Line, type Stats, LIMITS } from "@/lib/cctv/types";
import { BTN, CARD, FIELD, H3, LBL } from "../ui";
import type { Caps, Results } from "./api";
import { colorOf } from "./overlay";

type Ev = Results["events"][number];
const SEV_CLS: Record<string, string> = { info: "bg-slate-700 text-slate-200", notice: "bg-cyan-500/15 text-cyan-300", review: "bg-amber-500/15 text-amber-300" };
const TYPE_LABEL: Record<string, string> = { object_first_seen: "Object appeared", zone_enter: "Zone entry", zone_exit: "Zone exit", zone_dwell: "Zone dwell", line_cross: "Line crossing" };
export const mmss = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const Chip = ({ on, onClick, children, color }: { on: boolean; onClick(): void; children: React.ReactNode; color?: string }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${on ? "border-transparent text-slate-950" : "border-slate-700 text-slate-400 hover:border-slate-500"}`} style={on ? { background: color ?? "#60a5fa" } : undefined}>{children}</button>
);
export { Chip };

export function DetectionsPanel({ frame, tracks, stats, selected, onSelect, onSeek }: { frame: Frame | null; tracks: TrackSummary[]; stats: Stats | null; selected: number | null; onSelect(id: number | null): void; onSeek(t: number): void }) {
  return (
    <div className="space-y-4">
      <div className={CARD}>
        <h3 className={H3}>This frame · {frame ? mmss(frame.t) : "no analysed frame"}</h3>
        <p className="mt-1 text-[11px] text-slate-500">Frame-level detections: the same person in two frames counts twice here.</p>
        {frame && frame.dets.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-800">
            {frame.dets.map((d, i) => (
              <li key={i}><button type="button" onClick={() => onSelect(d.tid ?? null)} className={`flex w-full items-center gap-2 py-1.5 text-left text-xs ${d.tid === selected ? "text-white" : "text-slate-300"}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(d.cls) }} /><span className="w-20 font-medium">{d.cls}</span><span className="w-10 text-slate-500">{d.tid != null ? `#${d.tid}` : ""}</span>
                <span className="ml-auto tabular-nums text-slate-400">{Math.round(d.conf * 100)}%</span></button></li>
            ))}
          </ul>
        ) : <p className="mt-3 text-xs text-slate-500">{frame ? "Nothing detected in this frame at the current settings." : "Play or seek to an analysed frame."}</p>}
      </div>
      <div className={CARD}>
        <h3 className={H3}>Unique tracked objects · {tracks.length}</h3>
        <p className="mt-1 text-[11px] text-slate-500">Tracker output: one row per object followed across frames. Click a row to jump to where it first appears.</p>
        {stats && <p className="mt-2 text-[11px] text-slate-400">{stats.detectionsTotal} frame-level detections → {stats.uniqueTotal} unique objects</p>}
        <ul className="mt-2 max-h-64 divide-y divide-slate-800 overflow-auto">
          {tracks.map((t) => (
            <li key={t.id}><button type="button" onClick={() => { onSelect(t.id); onSeek(t.firstT); }} className={`flex w-full items-center gap-2 py-1.5 text-left text-xs ${t.id === selected ? "text-white" : "text-slate-300"}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(t.cls) }} /><span className="w-24">{t.cls} #{t.id}</span><span className="text-slate-500">{mmss(t.firstT)}–{mmss(t.lastT)}</span><span className="ml-auto tabular-nums text-slate-400">max {Math.round(t.maxConf * 100)}%</span></button></li>
          ))}
          {tracks.length === 0 && <li className="py-2 text-xs text-slate-500">No tracks yet.</li>}
        </ul>
      </div>
    </div>
  );
}

export function EventsPanel({ events, selectedId, onSelect, onSeek, onReview, hasJob }: { events: Ev[]; selectedId: string | null; onSelect(id: string | null): void; onSeek(t: number): void; onReview(e: Ev, review: string, note?: string): void; hasJob: boolean }) {
  const [type, setType] = useState(""), [sev, setSev] = useState(""), [cls, setCls] = useState(""), [rev, setRev] = useState("");
  const list = useMemo(() => events.filter((e) => (!type || e.type === type) && (!sev || e.severity === sev) && (!cls || e.cls === cls) && (!rev || e.review === rev)), [events, type, sev, cls, rev]);
  const sel = events.find((e) => e.id === selectedId) ?? null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {([["Type", type, setType, Object.keys(TYPE_LABEL)], ["Severity", sev, setSev, ["info", "notice", "review"]], ["Class", cls, setCls, SUPPORTED_CLASSES], ["Review", rev, setRev, ["unreviewed", "confirmed", "dismissed"]]] as const).map(([lab, val, set, opts]) => (
          <label key={lab}><span className={LBL}>{lab}</span><select className={FIELD} value={val} onChange={(e) => set(e.target.value)}><option value="">All</option>{opts.map((o) => <option key={o} value={o}>{TYPE_LABEL[o] ?? o}</option>)}</select></label>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{list.length} of {events.length} events. Severity “review” means a rule asks for a human decision; nothing here is a verdict.</p>
      <ul className="max-h-72 divide-y divide-slate-800 overflow-auto rounded-lg border border-slate-800">
        {list.map((e) => (
          <li key={e.id}><button type="button" onClick={() => { onSelect(e.id); onSeek(e.t); }} className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs ${e.id === selectedId ? "bg-slate-800" : "hover:bg-slate-900"}`}>
            <span className="w-10 shrink-0 tabular-nums text-slate-500">{mmss(e.t)}</span>
            <span className="min-w-0 flex-1 text-slate-200">{e.message}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${SEV_CLS[e.severity]}`}>{e.review !== "unreviewed" ? e.review : e.severity}</span></button></li>
        ))}
        {list.length === 0 && <li className="px-3 py-4 text-xs text-slate-500">{events.length ? "No events match these filters." : "No events yet. Run an analysis, then add zones or lines to generate zone and crossing events."}</li>}
      </ul>
      {sel && (
        <div className={CARD} data-testid="event-detail">
          <h3 className={H3}>Event details</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-slate-500">Type</dt><dd>{TYPE_LABEL[sel.type]}</dd><dt className="text-slate-500">Time</dt><dd>{mmss(sel.t)} (frame {sel.frame})</dd>
            <dt className="text-slate-500">Object</dt><dd>{sel.cls} #{sel.trackId}, {Math.round(sel.conf * 100)}% confidence</dd>
            {sel.zone && <><dt className="text-slate-500">Zone</dt><dd>{sel.zone}</dd></>}{sel.line && <><dt className="text-slate-500">Line</dt><dd>{sel.line} · {sel.direction === "a_to_b" ? "A → B" : "B → A"}</dd></>}
            {sel.dwellSeconds != null && <><dt className="text-slate-500">Dwell</dt><dd>{sel.dwellSeconds.toFixed(1)} s</dd></>}
            <dt className="text-slate-500">Event ID</dt><dd className="break-all text-slate-400">{sel.id}</dd>
          </dl>
          <p className="mt-3 text-[11px] text-slate-400">Human review: this is the only way an event becomes “confirmed”. The system never decides an incident on its own.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["confirmed", "dismissed", "unreviewed"] as const).map((r) => <button key={r} type="button" disabled={!hasJob} onClick={() => onReview(sel, r)} className={`${BTN} ${sel.review === r ? "!border-blue-500 !text-white" : ""}`}>{r === "unreviewed" ? "Reset" : r === "confirmed" ? "Confirm" : "Dismiss"}</button>)}
          </div>
          <label className="mt-3 block"><span className={LBL}>Reviewer note</span><textarea key={sel.id} defaultValue={sel.note ?? ""} maxLength={300} rows={2} className={FIELD} onBlur={(e) => e.target.value !== (sel.note ?? "") && onReview(sel, sel.review, e.target.value)} /></label>
        </div>
      )}
    </div>
  );
}

export function AnalyticsPanel({ stats, events }: { stats: Stats | null; events: Ev[] }) {
  if (!stats) return <p className="text-xs text-slate-500">Analytics appear after an analysis has run. All numbers come from the stored detections, nothing is pre-filled.</p>;
  const classes = [...new Set([...Object.keys(stats.detectionsByClass), ...Object.keys(stats.uniqueByClass)])];
  const maxD = Math.max(1, ...Object.values(stats.detectionsByClass));
  const peak = Math.max(1, ...stats.series.map((s) => s.person + s.vehicle + s.other));
  const W = 320, Hh = 90, bw = W / Math.max(1, stats.series.length);
  const zoneCounts: Record<string, number> = {}, lineCounts: Record<string, { a_to_b: number; b_to_a: number }> = {};
  for (const e of events) { if (e.type === "zone_enter" && e.zone) zoneCounts[e.zone] = (zoneCounts[e.zone] ?? 0) + 1; if (e.type === "line_cross" && e.line && e.direction) (lineCounts[e.line] ??= { a_to_b: 0, b_to_a: 0 })[e.direction]++; }
  const tile = (l: string, v: string | number, sub: string) => <div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{l}</p><p className="font-display text-2xl font-semibold text-white">{v}</p><p className="text-[10px] text-slate-500">{sub}</p></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">{tile("Frames analysed", stats.framesProcessed, `${stats.durationSec.toFixed(1)} s of video`)}{tile("Detections", stats.detectionsTotal, "frame-level, counts repeats")}{tile("Unique objects", stats.uniqueTotal, "tracked, counted once")}{tile("Events", stats.eventsTotal, "rule-based")}</div>
      <div className={CARD}><h3 className={H3}>By class</h3>
        <ul className="mt-2 space-y-2">{classes.map((c) => <li key={c} className="text-xs"><div className="flex justify-between text-slate-300"><span>{c}</span><span className="tabular-nums text-slate-400">{stats.detectionsByClass[c] ?? 0} detections · {stats.uniqueByClass[c] ?? 0} unique</span></div><div className="mt-1 h-1.5 rounded bg-slate-800"><div className="h-full rounded" style={{ width: `${((stats.detectionsByClass[c] ?? 0) / maxD) * 100}%`, background: colorOf(c) }} /></div></li>)}{classes.length === 0 && <li className="text-xs text-slate-500">Nothing detected at the current settings.</li>}</ul></div>
      <div className={CARD}><h3 className={H3}>Objects in view per second (peak)</h3>
        <svg viewBox={`0 0 ${W} ${Hh}`} className="mt-2 w-full" role="img" aria-label="Peak people and vehicles visible per second">{stats.series.map((s, i) => { const h1 = (s.person / peak) * (Hh - 10), h2 = (s.vehicle / peak) * (Hh - 10), h3 = (s.other / peak) * (Hh - 10); return <g key={i}><rect x={i * bw + 0.5} y={Hh - h1} width={Math.max(1, bw - 1)} height={h1} fill="#fbbf24" /><rect x={i * bw + 0.5} y={Hh - h1 - h2} width={Math.max(1, bw - 1)} height={h2} fill="#60a5fa" /><rect x={i * bw + 0.5} y={Hh - h1 - h2 - h3} width={Math.max(1, bw - 1)} height={h3} fill="#2dd4bf" /></g>; })}</svg>
        <p className="mt-1 text-[10px] text-slate-500"><span className="text-amber-300">■</span> people <span className="ml-2 text-blue-400">■</span> vehicles <span className="ml-2 text-teal-300">■</span> bicycles · peak {peak}</p></div>
      <div className={CARD}><h3 className={H3}>Rules</h3><ul className="mt-2 space-y-1 text-xs text-slate-300">
        {Object.entries(stats.eventsByType).map(([t, n]) => <li key={t} className="flex justify-between"><span>{TYPE_LABEL[t]}</span><span className="tabular-nums text-slate-400">{n}</span></li>)}
        {Object.entries(zoneCounts).map(([z, n]) => <li key={z} className="flex justify-between"><span>Entries into {z}</span><span className="tabular-nums text-slate-400">{n}</span></li>)}
        {Object.entries(lineCounts).map(([l, c]) => <li key={l} className="flex justify-between"><span>{l}</span><span className="tabular-nums text-slate-400">A→B {c.a_to_b} · B→A {c.b_to_a}</span></li>)}
        {stats.eventsTotal === 0 && <li className="text-slate-500">No events. Draw a zone or a line to generate some.</li>}</ul></div>
    </div>
  );
}

export function SettingsPanel({ s, caps, mode, update, reset, setTool, busy }: { s: Settings; caps: Caps | null; mode: string; update(p: Partial<Settings>): void; reset(): void; setTool(t: "zone" | "line"): void; busy: boolean }) {
  const setZone = (id: string, p: Partial<Zone>) => update({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...p } : z)) });
  const setLine = (id: string, p: Partial<Line>) => update({ lines: s.lines.map((z) => (z.id === id ? { ...z, ...p } : z)) });
  const clsPicker = (sel: string[], on: (c: string[]) => void) => <div className="mt-1 flex flex-wrap gap-1">{SUPPORTED_CLASSES.map((c) => <Chip key={c} on={!sel.length || sel.includes(c)} color={colorOf(c)} onClick={() => { const cur = sel.length ? sel : [...SUPPORTED_CLASSES]; const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]; on(next.length === SUPPORTED_CLASSES.length || next.length === 0 ? [] : next); }}>{c}</Chip>)}</div>;
  return (
    <div className="space-y-4">
      {busy && <p className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-300">Re-running tracking and events on the stored detections…</p>}
      <div className={CARD}>
        <h3 className={H3}>Detection filters</h3>
        <label className="mt-3 block"><span className={LBL}>Minimum confidence · {Math.round(s.minConf * 100)}%</span><input type="range" min={5} max={95} value={Math.round(s.minConf * 100)} onChange={(e) => update({ minConf: +e.target.value / 100 })} className="w-full" aria-label="Minimum confidence" /></label>
        {mode === "reference" && <p className="text-[10px] text-slate-500">Reference annotations all have confidence 100%, so this slider only changes AI inference results.</p>}
        <span className={`${LBL} mt-3`}>Classes</span>{clsPicker(s.classes.length === SUPPORTED_CLASSES.length ? [] : s.classes, (c) => update({ classes: c.length ? c : [...SUPPORTED_CLASSES] }))}
      </div>
      <div className={CARD}>
        <h3 className={H3}>Tracking</h3>
        <label className="mt-3 block"><span className={LBL}>Keep lost tracks for · {s.trackMaxAgeSec.toFixed(1)} s</span><input type="range" min={2} max={60} value={Math.round(s.trackMaxAgeSec * 10)} onChange={(e) => update({ trackMaxAgeSec: +e.target.value / 10 })} className="w-full" /></label>
        <label className="mt-2 block"><span className={LBL}>Minimum sightings to count as an object · {s.minTrackHits}</span><input type="range" min={1} max={8} value={s.minTrackHits} onChange={(e) => update({ minTrackHits: +e.target.value })} className="w-full" /></label>
        <label className="mt-2 block"><span className={LBL}>Sampling rate for the next run · {s.sampleFps} fps</span><input type="range" min={1} max={LIMITS.maxFps} value={s.sampleFps} onChange={(e) => update({ sampleFps: +e.target.value })} className="w-full" /></label>
        <p className="mt-1 text-[10px] text-slate-500">Sampling rate needs a new inference run; the other values re-analyse instantly.</p>
      </div>
      <div className={CARD}>
        <div className="flex items-center justify-between"><h3 className={H3}>Zones ({s.zones.length}/{LIMITS.maxZones})</h3><button type="button" className={BTN} disabled={s.zones.length >= LIMITS.maxZones} onClick={() => setTool("zone")}>+ Draw zone</button></div>
        <ul className="mt-2 space-y-3">{s.zones.map((z) => (
          <li key={z.id} className="rounded border border-slate-800 p-2">
            <div className="flex gap-2"><input aria-label="Zone name" className={FIELD} value={z.name} maxLength={40} onChange={(e) => setZone(z.id, { name: e.target.value })} /><button type="button" className={BTN} onClick={() => update({ zones: s.zones.filter((x) => x.id !== z.id) })} aria-label={`Delete ${z.name}`}>✕</button></div>
            <label className="mt-2 block"><span className={LBL}>Dwell alert after (s, 0 = off)</span><input type="number" min={0} max={600} className={FIELD} value={z.dwellSeconds} onChange={(e) => setZone(z.id, { dwellSeconds: Math.max(0, Math.min(600, +e.target.value || 0)) })} /></label>
            <span className={`${LBL} mt-2`}>Applies to</span>{clsPicker(z.classes, (c) => setZone(z.id, { classes: c }))}
          </li>))}{s.zones.length === 0 && <li className="text-xs text-slate-500">No zones. Draw a polygon on the video; click points, then double-click or press Finish.</li>}</ul>
      </div>
      <div className={CARD}>
        <div className="flex items-center justify-between"><h3 className={H3}>Virtual lines ({s.lines.length}/{LIMITS.maxLines})</h3><button type="button" className={BTN} disabled={s.lines.length >= LIMITS.maxLines} onClick={() => setTool("line")}>+ Draw line</button></div>
        <ul className="mt-2 space-y-3">{s.lines.map((l) => (
          <li key={l.id} className="rounded border border-slate-800 p-2">
            <div className="flex gap-2"><input aria-label="Line name" className={FIELD} value={l.name} maxLength={40} onChange={(e) => setLine(l.id, { name: e.target.value })} /><button type="button" className={BTN} onClick={() => setLine(l.id, { a: l.b, b: l.a })} title="Swap A and B">⇄</button><button type="button" className={BTN} onClick={() => update({ lines: s.lines.filter((x) => x.id !== l.id) })} aria-label={`Delete ${l.name}`}>✕</button></div>
            <span className={`${LBL} mt-2`}>Applies to</span>{clsPicker(l.classes, (c) => setLine(l.id, { classes: c }))}
          </li>))}{s.lines.length === 0 && <li className="text-xs text-slate-500">No lines. Click two points on the video.</li>}</ul>
      </div>
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4" data-testid="weapon-notice">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-red-300">Weapon detection · not available</h3>
        <p className="mt-1 text-xs text-slate-300">{caps?.weaponDetection.reason ?? "No validated weapon-detection model is bundled."} Nothing in this demo is, or will be reported as, a weapon detection.</p>
      </div>
      <button type="button" className={`${BTN} w-full`} onClick={reset}>Reset settings to defaults</button>
    </div>
  );
}
