"use client";
import { useMemo, useState } from "react";
import { TEAM_COLOR, TEAM_LABEL, type Team, type TrackStat } from "@/lib/sports/types";

type Key = "track_id" | "team" | "observed_seconds" | "observations" | "image_distance_px" | "distance_m" | "avg_speed_ms" | "max_speed_ms" | "zone";
const val = (t: TrackStat, k: Key, zone: number | null): number | string | null => {
  switch (k) {
    case "track_id": return t.track_id; case "team": return t.team; case "observed_seconds": return t.observed_seconds; case "observations": return t.observations; case "image_distance_px": return t.image_distance_px;
    case "distance_m": return t.pitch?.distance_m ?? null; case "avg_speed_ms": return t.pitch?.avg_speed_ms ?? null; case "max_speed_ms": return t.pitch?.max_speed_ms ?? null;
    case "zone": return zone !== null && t.zone_seconds ? t.zone_seconds[zone] : null;
  }
};
const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "n/a" : v.toFixed(d));

interface Props { tracks: TrackStat[]; mapped: boolean; selected: number[]; onToggle: (id: number, additive: boolean) => void; zone: number | null; trackHref: string | null; jsonHref: () => void }
export default function StatsTable({ tracks, mapped, selected, onToggle, zone, trackHref, jsonHref }: Props) {
  const [q, setQ] = useState(""); const [team, setTeam] = useState<Team | "all">("all"); const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: "observed_seconds", dir: -1 });
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = tracks.filter((t) => (team === "all" || t.team === team) && (!needle || String(t.track_id).includes(needle) || TEAM_LABEL[t.team].toLowerCase().includes(needle)));
    return [...f].sort((a, b) => { const x = val(a, sort.k, zone), y = val(b, sort.k, zone); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [tracks, q, team, sort, zone]);
  const head = (k: Key, label: string, title?: string) => (
    <th scope="col" className="px-2 py-1.5 text-left font-semibold" aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" title={title} className="hover:text-white" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))} data-testid={`sort-${k}`}>{label}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
    </th>
  );
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" placeholder="Search id or team…" aria-label="Search players" value={q} onChange={(e) => setQ(e.target.value)} data-testid="stats-search" />
        <select className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" aria-label="Filter by team" value={team} onChange={(e) => setTeam(e.target.value as Team | "all")} data-testid="stats-team">
          <option value="all">All teams</option>{(Object.keys(TEAM_LABEL) as Team[]).map((t) => <option key={t} value={t}>{TEAM_LABEL[t]}</option>)}
        </select>
        <span className="text-slate-500">{rows.length} of {tracks.length} tracks · click a row to select, Shift-click to compare two</span>
        <span className="ml-auto flex gap-2">
          {trackHref && <a className="rounded border border-slate-600 px-2 py-1 text-slate-200 hover:border-amber-500" href={trackHref} data-testid="export-stats-csv">Statistics CSV</a>}
          <button type="button" className="rounded border border-slate-600 px-2 py-1 text-slate-200 hover:border-amber-500" onClick={jsonHref} data-testid="export-stats-json">Statistics JSON</button>
        </span>
      </div>
      <div className="max-h-96 overflow-auto rounded-md border border-slate-800">
        <table className="w-full min-w-[46rem] border-collapse text-xs text-slate-200" data-testid="stats-table">
          <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wide text-slate-400"><tr>
            {head("track_id", "Track ID", "Temporary tracking id, not an identity")}{head("team", "Team", "Jersey-colour grouping")}{head("observed_seconds", "Observed (s)")}{head("observations", "Positions")}
            {head("image_distance_px", "Image dist. (px)", "Path length in the camera-stabilised image, pixels")}{head("distance_m", "Pitch dist. (m)", "Estimated; needs a pitch calibration")}
            {head("avg_speed_ms", "Avg speed (m/s)")}{head("max_speed_ms", "Max speed (m/s)")}{zone !== null && head("zone", `Time in zone ${zone + 1} (s)`)}<th scope="col" className="px-2 py-1.5 text-left font-semibold">State</th>
          </tr></thead>
          <tbody>
            {rows.map((t) => {
              const sel = selected.includes(t.track_id);
              return (
                <tr key={t.track_id} className={`cursor-pointer border-t border-slate-800 ${sel ? "bg-amber-500/15" : "hover:bg-slate-800/60"}`} aria-selected={sel} data-testid={`row-${t.track_id}`} onClick={(e) => onToggle(t.track_id, e.shiftKey || e.ctrlKey || e.metaKey)}>
                  <td className="px-2 py-1.5 tabular-nums">#{t.track_id}</td>
                  <td className="px-2 py-1.5"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: TEAM_COLOR[t.team] }} />{TEAM_LABEL[t.team].replace(/ \(.*/, "")}</td>
                  <td className="px-2 py-1.5 tabular-nums">{fmt(t.observed_seconds)}</td><td className="px-2 py-1.5 tabular-nums">{t.observations}</td><td className="px-2 py-1.5 tabular-nums">{fmt(t.image_distance_px, 0)}</td>
                  <td className="px-2 py-1.5 tabular-nums" title={!mapped ? "Calibrate the pitch to get metres" : t.pitch?.reason}>{mapped ? fmt(t.pitch?.distance_m) : "n/a"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{mapped ? fmt(t.pitch?.avg_speed_ms, 2) : "n/a"}</td><td className="px-2 py-1.5 tabular-nums">{mapped ? fmt(t.pitch?.max_speed_ms, 2) : "n/a"}</td>
                  {zone !== null && <td className="px-2 py-1.5 tabular-nums">{t.zone_seconds ? fmt(t.zone_seconds[zone]) : "n/a"}</td>}
                  <td className="px-2 py-1.5 text-slate-400">{t.state === "active_at_end" ? "active at end" : "ended"}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-500">{tracks.length ? "No track matches the filter." : "No tracks yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">Metres, speeds and zone times are <b className="text-slate-300">estimates</b> from smoothed foot positions mapped with your calibration; “n/a” means the value cannot be supported (no calibration, or too few mapped observations). Image distance is in stabilised image pixels, not metres.</p>
    </div>
  );
}
