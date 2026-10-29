/** Team grouping from jersey colour (port of teams.py): median torso colour per track in CIE-Lab, two-means clustering, with explicit "other" and "uncertain" outcomes. Jersey colour is not identity. */
export type Team = "team_a" | "team_b" | "other" | "uncertain";
export const TEAM_A: Team = "team_a", TEAM_B: Team = "team_b", OTHER: Team = "other", UNCERTAIN: Team = "uncertain", MIN_SEPARATION = 1.8;
export type Lab = [number, number, number];
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function rgb2lab(r: number, g: number, b: number): Lab {
  const R = lin(r), G = lin(g), B = lin(b), X = (0.412453 * R + 0.35758 * G + 0.180423 * B) / 0.950456, Y = 0.212671 * R + 0.71516 * G + 0.072169 * B, Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / 1.088754, f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export function lab2hex(l: Lab): string {
  const fy = (l[0] + 16) / 116, fx = fy + l[1] / 500, fz = fy - l[2] / 200, inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787), X = inv(fx) * 0.950456, Y = l[0] > 7.9996 ? fy ** 3 : l[0] / 903.3, Z = inv(fz) * 1.088754;
  const rl = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, gl = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z, gam = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  return "#" + [rl, gl, bl].map((c) => gam(c).toString(16).padStart(2, "0")).join("");
}
export const hex2lab = (h: string): Lab => { const s = h.replace("#", ""); return rgb2lab(parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)); };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
/** Median Lab of the non-grass torso pixels of a player box (upper-middle part of the box), or null when too few remain. `px` is RGBA image data of width W. */
export function torsoColour(px: Uint8ClampedArray, W: number, H: number, box: [number, number, number, number]): Lab | null {
  const [x1, y1, x2, y2] = box, w = x2 - x1, h = y2 - y1; if (w < 6 || h < 14) return null;
  const ix1 = Math.max(0, Math.trunc(x1 + 0.22 * w)), ix2 = Math.min(W, Math.trunc(x2 - 0.22 * w)), iy1 = Math.max(0, Math.trunc(y1 + 0.16 * h)), iy2 = Math.min(H, Math.trunc(y1 + 0.52 * h)); if (ix2 - ix1 < 2 || iy2 - iy1 < 2) return null;
  const L: number[] = [], A: number[] = [], B: number[] = []; let total = 0;
  for (let y = iy1; y < iy2; y++) for (let x = ix1; x < ix2; x++) {
    total++; const i = (y * W + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hue = 0; if (d > 0) hue = mx === r ? (60 * (((g - b) / d) % 6)) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); if (hue < 0) hue += 360; const Hh = hue / 2, S = mx ? (255 * d) / mx : 0;
    if (Hh >= 30 && Hh <= 90 && S > 45 && mx > 30) continue; const lab = rgb2lab(r, g, b); L.push(lab[0]); A.push(lab[1]); B.push(lab[2]);
  }
  if (L.length < Math.max(6, 0.2 * total)) return null; return [median(L), median(A), median(B)];
}
function kmeans2(X: number[][], seed: number[][], iters = 30): { cents: number[][]; assign: number[] } {
  let cents = seed.map((c) => [...c]); const assign: number[] = new Array(X.length).fill(0);
  for (let it = 0; it < iters; it++) { let changed = false; X.forEach((x, i) => { const d = cents.map((c) => Math.hypot(x[0] - c[0], x[1] - c[1], x[2] - c[2])), a = d[0] <= d[1] ? 0 : 1; if (a !== assign[i]) { assign[i] = a; changed = true; } }); cents = cents.map((c, j) => { const m = X.filter((_, i) => assign[i] === j); return m.length ? [0, 1, 2].map((k) => m.reduce((s, v) => s + v[k], 0) / m.length) : c; }); if (!changed && it > 0) break; }
  return { cents, assign };
}
export interface TeamInfo { method: string; status: string; tracks_with_colour: number; reason?: string; separation?: number; centroids_hex?: string[]; other_cutoff?: number; counts?: Record<string, number> }
export function classify(colours: Map<number, Lab>, mode = "auto", userColours?: string[] | null): { labels: Map<number, Team>; info: TeamInfo } {
  const ids = [...colours.keys()], info: TeamInfo = { method: mode, status: "unavailable", tracks_with_colour: ids.length }, uncertain = () => new Map(ids.map((i) => [i, UNCERTAIN as Team]));
  if (mode === "off" || !ids.length) { info.status = mode === "off" ? "off" : "unavailable"; info.reason = mode === "off" ? "Team classification was switched off." : "No track had enough non-grass jersey pixels to measure a colour."; return { labels: uncertain(), info }; }
  const X = ids.map((i) => colours.get(i)!);
  if (mode === "colors" && userColours && userColours.length === 2) {
    const cents = userColours.map(hex2lab), labels = new Map<number, Team>(); ids.forEach((id, k) => { const d = cents.map((c) => Math.hypot(X[k][0] - c[0], X[k][1] - c[1], X[k][2] - c[2])), j = d[0] <= d[1] ? 0 : 1; labels.set(id, d[j] <= 30 ? (j === 0 ? TEAM_A : TEAM_B) : OTHER); });
    info.status = "user_colours"; info.centroids_hex = userColours; info.reason = "Teams were assigned by the nearest of the two colours you supplied (Lab distance up to 30); further colours are 'other'."; return { labels, info };
  }
  if (ids.length < 4) { info.status = "uncertain"; info.reason = "Fewer than 4 tracks have a measurable jersey colour, which is too few to separate two teams."; return { labels: uncertain(), info }; }
  const L = X.map((x) => x[0]), iMin = L.indexOf(Math.min(...L)), iMax = L.indexOf(Math.max(...L)); let seed: number[][];
  if (Math.max(...L) - Math.min(...L) > 5) seed = [X[iMin], X[iMax]]; else seed = [X[0], X[Math.floor(X.length / 2)]];
  const { cents, assign } = kmeans2(X, seed);
  if (new Set(assign).size < 2) { info.status = "uncertain"; info.reason = "All tracks have similar colours; no second team was found."; return { labels: uncertain(), info }; }
  const dist = X.map((x, i) => Math.hypot(x[0] - cents[assign[i]][0], x[1] - cents[assign[i]][1], x[2] - cents[assign[i]][2])), spread = Math.sqrt(dist.reduce((s, d) => s + d * d, 0) / dist.length) + 1e-6, sep = Math.hypot(cents[0][0] - cents[1][0], cents[0][1] - cents[1][1], cents[0][2] - cents[1][2]) / spread, sizes = [0, 1].map((j) => assign.filter((a) => a === j).length);
  info.separation = Math.round(sep * 100) / 100; if (sep < MIN_SEPARATION || Math.min(...sizes) < 2) { info.status = "uncertain"; info.reason = `The two colour groups are not clearly separated (separation ${sep.toFixed(2)}, need at least ${MIN_SEPARATION}). Jersey colour alone does not tell the teams apart in this footage.`; return { labels: uncertain(), info }; }
  const cut = Math.max(18, 2.5 * median(dist)), order = sizes[0] >= sizes[1] ? [0, 1] : [1, 0], names: Record<number, Team> = { [order[0]]: TEAM_A, [order[1]]: TEAM_B }, labels = new Map<number, Team>(ids.map((id, k) => [id, dist[k] <= cut ? names[assign[k]] : OTHER]));
  const cnt = (t: Team) => [...labels.values()].filter((v) => v === t).length; info.status = "clustered"; info.centroids_hex = [lab2hex(cents[order[0]] as Lab), lab2hex(cents[order[1]] as Lab)]; info.other_cutoff = Math.round(cut * 10) / 10; info.counts = { team_a: cnt(TEAM_A), team_b: cnt(TEAM_B), other: cnt(OTHER) };
  info.reason = "Two-means clustering of torso colour per track; tracks far from both centroids are 'other' (goalkeepers, officials or noise). Colour grouping is not identity and can be wrong."; return { labels, info };
}
