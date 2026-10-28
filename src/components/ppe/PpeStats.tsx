"use client";
import { STATE_LABEL, STATUS_COLOR, STATUS_LABEL, isWorker, type FrameRec, type Summary, type WorkerDet } from "@/lib/ppe/types";

const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
const H3 = "text-[13px] font-semibold uppercase tracking-wider text-slate-400";
const Stat = ({ k, v, id, sub, tone }: { k: string; v: string | number; id: string; sub?: string; tone?: string }) => <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"><p className={`text-2xl font-bold leading-tight tabular-nums ${tone ?? "text-white"}`} data-testid={id}>{v}</p><p className="text-xs text-slate-400">{k}</p>{sub && <p className="text-[11px] text-slate-500">{sub}</p>}</div>;
const itemTone = (s: string) => (s === "detected" ? "text-emerald-300" : s === "not_detected" ? "text-red-300" : "text-amber-300");

/** Numbers for the frame at the playhead, read from the stored per-frame results, never computed separately. Current-frame and cumulative values are kept apart. */
export default function PpeStats({ rec, summary, live, hasZone, required }: { rec: FrameRec | null; summary: Summary | null; live: boolean; hasZone: boolean; required: string[] }) {
  const idle = !rec;
  const workers = rec ? (rec.detections.filter(isWorker) as WorkerDet[]).sort((a, b) => (a.track_id ?? 1e9) - (b.track_id ?? 1e9)) : [];
  return (
    <aside className={CARD} aria-label="Workforce and PPE statistics" data-testid="stats">
      <h3 className={H3}>Statistics {live && <span className="ml-1 normal-case text-emerald-300">· updating live</span>}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-400"><dt>Frame number</dt><dd className="text-right tabular-nums text-slate-100" data-testid="stat-frame">{rec ? rec.frame_number : "—"}</dd><dt>Timestamp</dt><dd className="text-right tabular-nums text-slate-100" data-testid="stat-time">{rec ? `${rec.timestamp_seconds.toFixed(2)} s` : "—"}</dd></dl>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">In this frame</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Stat k="Workers visible" v={idle ? "—" : rec.workers_visible} id="stat-visible" sub="people detected now" />
        <Stat k="Potential PPE violations" v={idle ? "—" : rec.potential_ppe_violations} id="stat-violations" sub="a required item not detected" tone={rec && rec.potential_ppe_violations ? "text-red-300" : undefined} />
        <Stat k="Hard hats detected" v={idle ? "—" : rec.hard_hats_detected} id="stat-hats" sub="hard hat boxes now" />
        <Stat k="Safety vests detected" v={idle ? "—" : rec.safety_vests_detected} id="stat-vests" sub="vest boxes now" />
        <Stat k="Uncertain classifications" v={idle ? "—" : rec.uncertain_classifications} id="stat-uncertain" sub="not enough evidence" tone={rec && rec.uncertain_classifications ? "text-amber-300" : undefined} />
        <Stat k="Compliant workers" v={idle ? "—" : rec.compliant_workers} id="stat-compliant" sub={`${required.map((r) => r.replace("_", " ")).join(" + ") || "no item"} detected`} />
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cumulative up to this frame</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Stat k="Unique worker tracks" v={idle ? "—" : rec.unique_worker_tracks} id="stat-unique" sub="tracking IDs, not a headcount" />
        <Stat k="Detection instances" v={idle ? "—" : rec.detection_instances_processed.toLocaleString("en-US")} id="stat-instances" sub="workers + PPE boxes, all frames" />
        <Stat k="Tracks ever flagged" v={idle ? "—" : rec.unique_tracks_with_potential_violation} id="stat-flagged" sub="potential violation at some point" />
        {hasZone && <Stat k="Workers in zone" v={idle || !rec.zone ? "—" : rec.zone.workers_inside} id="stat-zone" sub={rec?.zone ? `peak so far ${rec.zone.peak_workers_inside}` : "feet inside the rectangle"} />}
      </div>
      <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workers in this frame</h4>
      {workers.length === 0 ? <p className="mt-1 text-xs text-slate-500" data-testid="no-workers">{idle ? "Nothing to show until a frame has been processed." : "No workers detected in this frame."}</p> : (
        <table className="mt-1 w-full text-xs" data-testid="worker-table"><thead className="text-left text-slate-400"><tr><th className="py-1 font-medium">Track</th><th className="font-medium">Hard hat</th><th className="font-medium">Vest</th><th className="text-right font-medium">Assessment</th></tr></thead>
          <tbody>{workers.map((w, i) => <tr key={`${w.track_id}-${i}`} className="border-t border-slate-800 align-top" data-testid="worker-row">
            <th className="py-1.5 text-left font-medium text-slate-200">{w.track_id !== null ? `#${w.track_id}` : "new"}</th>
            <td className={itemTone(w.ppe_assessment.items.hard_hat.state)}>{STATE_LABEL[w.ppe_assessment.items.hard_hat.state]}</td>
            <td className={itemTone(w.ppe_assessment.items.safety_vest.state)}>{STATE_LABEL[w.ppe_assessment.items.safety_vest.state]}</td>
            <td className="text-right"><span className="font-semibold" style={{ color: STATUS_COLOR[w.ppe_assessment.status] }}>{STATUS_LABEL[w.ppe_assessment.status]}</span>{w.ppe_assessment.reasons.length > 0 && <span className="block text-[11px] text-slate-500">{w.ppe_assessment.reasons.join("; ")}</span>}</td></tr>)}</tbody></table>)}
      {summary && <p className="mt-2 text-[11px] text-slate-500">Whole clip: {summary.unique_worker_tracks} unique worker tracks, {summary.unique_tracks_with_potential_violation} of them flagged at some point, {summary.detection_instances_processed.toLocaleString("en-US")} detection instances, at most {summary.peak_workers_visible} workers visible at once.</p>}
      <p className="mt-3 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-400" data-testid="count-note">This is an <b className="text-slate-200">automated visual assessment</b>, not a safety determination, and it does not guarantee safety. “Not detected” means the model did not see the item in the evidence available; it is not proof that the item is absent, so it is reported only as a <b className="text-slate-200">potential</b> violation, and “uncertain” is used whenever the view is poor. Track IDs are temporary labels for a continuous track, not identities: no face recognition is used and nobody is matched across videos. One person can receive more than one track, and the unique-track count is not a headcount.</p>
    </aside>
  );
}
