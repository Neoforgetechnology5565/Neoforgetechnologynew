/** Parity of the TypeScript heatmap with the Python implementation on shared fixtures (services/sports-analyzer/scripts/make_heatmap_fixtures.py). Run: npm run test:sports */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { heatmap, mappedPoints, inPitch } from "./heatmap";
import type { Frame } from "./types";

const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "heatmap-cases.json"), "utf8")) as { cases: { name: string; length: number; width: number; cell: number; sigma: number; points: [number, number][]; rows: number; cols: number; grid: number[] }[] };
let failed = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { failed++; console.error("FAIL", msg); } else console.log("  ok", msg); };

for (const c of fx.cases) {
  const h = heatmap(c.points, c.length, c.width, c.cell, c.sigma);
  let worst = 0; for (let i = 0; i < c.grid.length; i++) worst = Math.max(worst, Math.abs(h.grid[i] - c.grid[i]));
  check(h.rows === c.rows && h.cols === c.cols && worst < 2e-6, `${c.name}: grid ${h.rows}x${h.cols}, max difference to Python ${worst.toExponential(2)}`);
}
const mk = (t: number, rows: Frame["p"]): Frame => ({ i: Math.round(t * 25), t, seg: 0, p: rows, b: null });
const frames = [mk(0, [[1, 0, 0, 1, 1, 0.9, "team_a", 10, 10], [2, 0, 0, 1, 1, 0.9, "team_b", 20, 20], [3, 0, 0, 1, 1, 0.9, "team_a", null, null]]), mk(5, [[1, 0, 0, 1, 1, 0.9, "team_a", 11, 10], [2, 0, 0, 1, 1, 0.9, "team_b", 200, 20]])];
check(mappedPoints(frames, { t0: 0, t1: 10 }, 105, 68).length === 3, "unmapped (null) and off-pitch positions are never used");
check(mappedPoints(frames, { tracks: [1], t0: 0, t1: 10 }, 105, 68).length === 2, "track filter");
check(mappedPoints(frames, { team: "team_b", t0: 0, t1: 10 }, 105, 68).length === 1, "team filter");
check(mappedPoints(frames, { t0: 1, t1: 10 }, 105, 68).length === 1, "time-range filter");
check(inPitch(-2, 10, 105, 68) && !inPitch(-4, 10, 105, 68), "pitch margin");
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("sports heatmap parity: all checks passed");
