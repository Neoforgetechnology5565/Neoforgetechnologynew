/** Parity test: the TypeScript measurement engine must reproduce the Python engine on shared cases. Run: npm run test:roof */
import { readFileSync } from "node:fs";
import { measurePolygon, pitchFrom, resolveScale, ScaleError } from "./measure";
import type { PitchSpec, ScaleSpec, XY } from "./types";

const cases = JSON.parse(readFileSync(new URL("./fixtures/measure-cases.json", import.meta.url), "utf8")) as { name: string; polygon: XY[]; scale: ScaleSpec | null; georef?: { gsd_x_m: number; gsd_y_m: number; crs: string; note: string }; pitch: PitchSpec | null; expected: ReturnType<typeof measurePolygon> }[];
let failed = 0; const ok = (c: boolean, m: string) => { if (!c) { failed++; console.error("  ✗", m); } };
const close = (a: number | undefined, b: number | undefined, tol = 1e-6) => a !== undefined && b !== undefined && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
for (const c of cases) {
  const got = measurePolygon(c.polygon, resolveScale(c.scale, c.georef ?? null), pitchFrom(c.pitch)); const e = c.expected;
  ok(close(got.pixels.area_px, e.pixels.area_px) && close(got.pixels.perimeter_px, e.pixels.perimeter_px), `${c.name}: pixel measures`);
  ok(got.metric.available === e.metric.available, `${c.name}: availability`);
  if (e.metric.available) {
    ok(close(got.metric.area_m2, e.metric.area_m2) && close(got.metric.perimeter_m, e.metric.perimeter_m), `${c.name}: metric area/perimeter ${got.metric.area_m2} vs ${e.metric.area_m2}`);
    ok(close(got.metric.bounding_rectangle_m?.length, e.metric.bounding_rectangle_m?.length, 1e-4) && close(got.metric.bounding_rectangle_m?.width, e.metric.bounding_rectangle_m?.width, 1e-4), `${c.name}: bounding rectangle ${JSON.stringify(got.metric.bounding_rectangle_m)} vs ${JSON.stringify(e.metric.bounding_rectangle_m)}`);
  }
  ok(got.surface.available === e.surface.available && close(got.surface.area_m2 ?? 0, e.surface.area_m2 ?? 0), `${c.name}: surface`);
  ok(got.pitch.status === e.pitch.status, `${c.name}: pitch status`);
  console.log("  ·", c.name, got.metric.available ? `${got.metric.area_m2!.toFixed(3)} m²` : "no scale");
}
// invalid input is rejected, not silently accepted
for (const [name, fn] of [["reference too short", () => resolveScale({ type: "reference", p1: [0, 0], p2: [1, 1], length_m: 5 }, null)], ["non-convex quad", () => resolveScale({ type: "plane_quad", quad: [[0, 0], [100, 0], [20, 20], [0, 100]], width_m: 1, height_m: 1 }, null)], ["geo without metadata", () => resolveScale({ type: "geo" }, null)], ["pitch out of range", () => pitchFrom({ degrees: 95 })]] as [string, () => unknown][]) {
  let threw = false; try { fn(); } catch (e) { threw = e instanceof ScaleError; } ok(threw, `${name} must throw ScaleError`);
}
console.log(failed ? `${failed} failed` : `${cases.length} parity cases and 4 rejection cases passed`); process.exit(failed ? 1 : 0);
