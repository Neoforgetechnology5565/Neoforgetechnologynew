"use client";
import { CLASS_COLOR, CLASS_LABEL, VCLASSES, type FrameRec, type Summary } from "@/lib/vehicle/types";

const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const Stat = ({ k, v, id, sub }: { k: string; v: string | number; id: string; sub?: string }) => <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"><p className="text-2xl font-bold leading-tight text-white tabular-nums" data-testid={id}>{v}</p><p className="text-xs text-slate-400">{k}</p>{sub && <p className="text-[11px] text-slate-500">{sub}</p>}</div>;

/** Counts for the frame at the playhead. Values are read from the stored per-frame results, never computed separately. */
export default function StatsPanel({ rec, summary, live, hasLine }: { rec: FrameRec | null; summary: Summary | null; live: boolean; hasLine: boolean }) {
  const idle = !rec;
  return (
    <aside className={CARD} aria-label="Vehicle statistics" data-testid="stats">
      <h3 className={H3}>Statistics {live && <span className="ml-1 normal-case text-emerald-300">· updating live</span>}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-400"><dt>Frame number</dt><dd className="text-right tabular-nums text-slate-100" data-testid="stat-frame">{rec ? rec.frame_number : "—"}</dd><dt>Timestamp</dt><dd className="text-right tabular-nums text-slate-100" data-testid="stat-time">{rec ? `${rec.timestamp_seconds.toFixed(2)} s` : "—"}</dd></dl>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat k="Vehicles currently visible" v={idle ? "—" : rec.vehicles_visible} id="stat-visible" sub="detections in this frame" />
        <Stat k="Unique vehicle tracks" v={idle ? "—" : rec.unique_tracks_observed} id="stat-unique" sub="distinct tracking IDs so far" />
        <Stat k="Total detection instances" v={idle ? "—" : rec.detection_instances_processed.toLocaleString("en-US")} id="stat-instances" sub="summed over processed frames" />
        {hasLine && <Stat k="Line crossings" v={idle || !rec.line_crossings ? "—" : rec.line_crossings.total} id="stat-line" sub={rec?.line_crossings ? `→ ${rec.line_crossings.a_to_b} · ← ${rec.line_crossings.b_to_a}` : "separate from unique tracks"} />}
      </div>
      <table className="mt-3 w-full text-xs"><thead className="text-left text-slate-400"><tr><th className="py-1 font-medium">Class</th><th className="text-right font-medium">Visible now</th><th className="text-right font-medium">Unique tracks</th></tr></thead>
        <tbody>{VCLASSES.map((c) => <tr key={c} className="border-t border-slate-800"><th className="py-1.5 text-left font-medium text-slate-200"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: CLASS_COLOR[c] }} />{CLASS_LABEL[c]}</th><td className="text-right tabular-nums text-slate-100" data-testid={`visible-${c}`}>{rec ? rec.class_counts[c] : "—"}</td><td className="text-right tabular-nums text-slate-100" data-testid={`unique-${c}`}>{rec ? rec.unique_by_class[c] : "—"}</td></tr>)}</tbody></table>
      {summary && <p className="mt-2 text-[11px] text-slate-500">Whole clip: {summary.unique_tracks_observed} unique tracks, {summary.detection_instances_processed.toLocaleString("en-US")} detection instances, at most {summary.peak_vehicles_visible} vehicles visible at once.</p>}
      <p className="mt-3 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-400" data-testid="count-note">A vehicle that stays in view appears in many frames, so it adds many <b className="text-slate-200">detection instances</b> but only one <b className="text-slate-200">unique track</b>. Track IDs are temporary labels for a continuous track, not identities. Occlusion, camera movement or a vehicle leaving and re-entering can split one vehicle into two tracks, or merge two into one, so the unique-track count is an estimate, not the exact number of physical vehicles.</p>
    </aside>
  );
}
