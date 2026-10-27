import type { Det, Frame, Pt, Settings, TrackSummary } from "@/lib/cctv/types";

export const CLS_COLOR: Record<string, string> = { person: "#fbbf24", car: "#60a5fa", truck: "#a3e635", bus: "#f472b6", motorcycle: "#c084fc", bicycle: "#2dd4bf" };
export const colorOf = (c: string) => CLS_COLOR[c] ?? "#e2e8f0";

/** Latest analysed frame at or before time t. Returns null when t is outside the analysed range (no stale boxes on screen). */
export function frameAt(frames: Frame[], t: number, fps: number): Frame | null {
  let lo = 0, hi = frames.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (frames[m].t <= t + 1e-3) { best = m; lo = m + 1; } else hi = m - 1; }
  if (best < 0) return null;
  return t - frames[best].t <= 1.6 / Math.max(1, fps) ? frames[best] : null;
}
export interface OverlayState { frame: Frame | null; tracks: TrackSummary[]; t: number; settings: Settings; selectedTid: number | null; trails: boolean; zones: boolean; draft: { kind: "zone" | "line"; pts: Pt[]; hover: Pt | null } | null }

export function drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, s: OverlayState) {
  ctx.clearRect(0, 0, W, H);
  const px = (p: Pt) => [p.x * W, p.y * H] as const;
  const dpr = Math.max(1, W / 640);
  ctx.lineWidth = 1.5 * dpr; ctx.font = `${11 * dpr}px system-ui, sans-serif`;
  if (s.zones) {
    for (const z of s.settings.zones) {
      ctx.beginPath(); z.points.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p)))); ctx.closePath();
      ctx.fillStyle = "rgba(245,158,11,0.14)"; ctx.fill(); ctx.strokeStyle = "#f59e0b"; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.stroke(); ctx.setLineDash([]);
      for (const p of z.points) { ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(...px(p), 3.5 * dpr, 0, 7); ctx.fill(); }
      const [x, y] = px(z.points[0]); ctx.fillStyle = "#fbbf24"; ctx.fillText(z.name, x + 4 * dpr, y - 5 * dpr);
    }
    for (const l of s.settings.lines) {
      ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2.5 * dpr; ctx.beginPath(); ctx.moveTo(...px(l.a)); ctx.lineTo(...px(l.b)); ctx.stroke(); ctx.lineWidth = 1.5 * dpr;
      const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2, dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, n = Math.hypot(dx, dy) || 1;
      ctx.beginPath(); ctx.moveTo(mx * W, my * H); ctx.lineTo((mx - (dy / n) * 0.04) * W, (my + (dx / n) * 0.04) * H); ctx.stroke(); // arrow toward the "A → B" side
      for (const [p, lab] of [[l.a, "A"], [l.b, "B"]] as const) { ctx.fillStyle = "#22d3ee"; ctx.beginPath(); ctx.arc(...px(p), 4 * dpr, 0, 7); ctx.fill(); ctx.fillStyle = "#0f172a"; ctx.fillText(lab, px(p)[0] - 3 * dpr, px(p)[1] + 4 * dpr); }
      ctx.fillStyle = "#67e8f9"; ctx.fillText(l.name, mx * W + 8 * dpr, my * H - 6 * dpr);
    }
  }
  if (s.trails) {
    for (const tr of s.tracks) {
      if (tr.firstT > s.t || tr.lastT < s.t - 2) continue;
      const k = tr.path.filter((_, i) => tr.firstT + (i * (tr.lastT - tr.firstT)) / Math.max(1, tr.path.length - 1) <= s.t);
      if (k.length < 2) continue;
      ctx.strokeStyle = colorOf(tr.cls) + (s.selectedTid === tr.id ? "" : "99"); ctx.beginPath(); k.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H))); ctx.stroke();
    }
  }
  if (s.frame) {
    for (const d of s.frame.dets) box(ctx, W, H, d, d.tid != null && d.tid === s.selectedTid, dpr);
  }
  if (s.draft) {
    const pts = s.draft.hover ? [...s.draft.pts, s.draft.hover] : s.draft.pts;
    ctx.strokeStyle = "#f8fafc"; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p)))); if (s.draft.kind === "zone" && pts.length > 2) ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    for (const p of s.draft.pts) { ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.arc(...px(p), 4 * dpr, 0, 7); ctx.fill(); }
  }
}
function box(ctx: CanvasRenderingContext2D, W: number, H: number, d: Det, sel: boolean, dpr: number) {
  const [x, y, w, h] = d.box, c = colorOf(d.cls);
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? 3.5 : 2) * dpr; ctx.strokeRect(x * W, y * H, w * W, h * H);
  const label = `${d.cls}${d.tid != null ? ` #${d.tid}` : ""} ${Math.round(d.conf * 100)}%`, tw = ctx.measureText(label).width + 8 * dpr, ly = Math.max(0, y * H - 16 * dpr);
  ctx.fillStyle = c; ctx.fillRect(x * W, ly, tw, 16 * dpr); ctx.fillStyle = "#0f172a"; ctx.fillText(label, x * W + 4 * dpr, ly + 12 * dpr); ctx.lineWidth = 1.5 * dpr;
}
