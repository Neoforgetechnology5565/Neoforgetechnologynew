/** Run: npx tsx src/lib/vehicle/tracker.test.ts — the TypeScript ByteTracker must reproduce the Python service's track ids on the same detections. */
import { readFileSync } from "node:fs";
import { ByteTracker, hungarian } from "./tracker";
import type { VClass } from "./types";

let pass = 0, fail = 0;
const t = (n: string, f: () => void) => { try { f(); pass++; console.log("  ok  " + n); } catch (e) { fail++; console.log("FAIL  " + n + "\n      " + (e as Error).message); } };
const eq = (c: boolean, m: string) => { if (!c) throw new Error(m); };

t("hungarian finds the optimal assignment (square, wide and tall matrices)", () => {
  const sum = (c: number[][], m: [number, number][]) => m.reduce((s, [r, k]) => s + c[r][k], 0);
  const sq = [[4, 1, 3], [2, 0, 5], [3, 2, 2]]; eq(sum(sq, hungarian(sq)) === 5, "square optimum is 5");
  const wide = [[9, 2, 7, 8], [6, 4, 3, 7]]; eq(sum(wide, hungarian(wide)) === 5, "wide optimum is 5");
  const tall = [[9, 6], [2, 4], [7, 3], [8, 7]]; eq(sum(tall, hungarian(tall)) === 5, "tall optimum is 5");
});

const fx = JSON.parse(readFileSync(new URL("./fixtures/highway-python-tracks.json", import.meta.url), "utf8")) as { conf: number; fps: number; frames: { t: number; dets: { id: number | null; cls: VClass; c: number; b: number[] }[]; unique: number }[] };
t("TypeScript tracker reproduces the Python track ids on the same detections", () => {
  const tr = new ByteTracker(Math.max(0.5, fx.conf + 0.1), Math.min(0.1, fx.conf), 0.8, Math.max(5, Math.round(fx.fps)));
  let compared = 0, same = 0;
  const pairs = new Map<string, number>();
  for (const f of fx.frames) {
    const out = tr.update(f.dets.map((d) => d.b), f.dets.map((d) => d.c), f.dets.map((d) => d.cls));
    const byDet = new Map(out.map((o) => [o.detIndex, o.trackId]));
    f.dets.forEach((d, i) => { if (d.id === null && !byDet.has(i)) { same++; compared++; return; } compared++; const ts = byDet.get(i); if (ts !== undefined && d.id !== null) { const k = `${d.id}>${ts}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); } if ((ts ?? null) === d.id || (ts !== undefined && d.id !== null)) same++; });
  }
  // ids are assigned in creation order by both implementations, so the mapping should be the identity
  const mapped = [...pairs.keys()].map((k) => k.split(">")); eq(mapped.every(([a, b]) => a === b), "python id -> ts id mapping is not the identity: " + [...pairs.keys()].join(" "));
  eq(same / compared > 0.99, `agreement ${(same / compared * 100).toFixed(2)}% on ${compared} detections`);
});
t("unique confirmed tracks match the Python count at the end of the clip", () => {
  const tr = new ByteTracker(0.5, 0.1, 0.8, 25); const confirmed = new Set<number>();
  for (const f of fx.frames) for (const o of tr.update(f.dets.map((d) => d.b), f.dets.map((d) => d.c), f.dets.map((d) => d.cls))) if (o.hits >= 3) confirmed.add(o.trackId);
  const py = fx.frames[fx.frames.length - 1].unique; eq(confirmed.size === py, `ts ${confirmed.size} vs python ${py}`);
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
