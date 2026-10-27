/** Run: npx tsx src/lib/bim/input.test.ts — SVG and raster (image) interpretation paths. */
import sharp from "sharp";
import { houseFilledSvg, houseSvg, HOUSE_TRUTH } from "./samples";
import { parseSvg } from "./svg";
import { interpretRaster } from "./raster";
import { buildFromDxf } from "./build";
import { DEFAULT_SETTINGS } from "./model";

let pass = 0, fail = 0; const out: string[] = [];
async function t(name: string, fn: () => void | Promise<void>) { try { await fn(); pass++; out.push(`  ok   ${name}`); } catch (e) { fail++; out.push(`  FAIL ${name}\n       ${(e as Error).message}`); } }
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const near = (a: number, b: number, tol: number, w: string) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${w}: got ${a}, expected ${b} ± ${tol}`); };
(async () => {
  await t("SVG: wall faces become walls with correct scale when units per metre are given", () => { const { doc } = parseSvg(houseSvg(), 1000); const r = buildFromDxf(doc, { ...DEFAULT_SETTINGS, layerMap: { "A-WALL": "wall" } }); ok(r.building.walls.length === 7, `walls ${r.building.walls.length}`); ok(r.building.rooms.length === 4, `rooms ${r.building.rooms.length}`); near(r.building.rooms.reduce((s, x) => s + x.area, 0), HOUSE_TRUTH.totalNetArea, 0.01, "net area"); ok(r.building.walls.every((w) => w.source.origin === "svg"), "origin tag"); });
  await t("SVG: without a scale the units are flagged ambiguous (nothing is silently scaled)", () => { const { doc, warnings } = parseSvg(houseSvg()); ok(!doc.unitsKnown && warnings.some((w) => /no real-world units/.test(w)), "flag"); });
  await t("SVG: scripts are rejected", () => { let m = ""; try { parseSvg("<svg><script>alert(1)</script></svg>"); } catch (e) { m = (e as Error).message; } ok(/scripts/.test(m), m); });
  await t("SVG: curves are reduced to chords with a warning", () => { const { warnings } = parseSvg(`<svg><g id="A-WALL"><path d="M0 0 L100 0 C100 50 150 50 150 100"/></g></svg>`, 1); ok(warnings.some((w) => /curved/.test(w)), "warn"); });
  const png = async () => { const s = houseFilledSvg(100); return { buf: await sharp(Buffer.from(s.svg)).png().toBuffer(), s }; };
  await t("raster: thick strokes are interpreted as walls; areas within image precision; origin is 'image'", async () => { const { buf } = await png(); const rr = await interpretRaster(buf, 100); ok(rr.stats.wallRects >= 8, `rects ${rr.stats.wallRects}`); const r = buildFromDxf(rr.doc, { ...DEFAULT_SETTINGS, wallMode: "outline" }); ok(r.building.walls.length >= 6 && r.building.walls.every((w) => w.source.origin === "image"), `walls ${r.building.walls.length}`); ok(r.building.rooms.length === 4, `rooms ${r.building.rooms.length}`); near(r.building.rooms.reduce((s, x) => s + x.area, 0), HOUSE_TRUTH.totalNetArea, 0.6, "net area (±0.6 m² from pixel quantisation)"); ok(r.building.warnings.some((w) => /no door\/window symbol/.test(w)), "gaps flagged as unlabelled openings"); });
  await t("raster: thin text and dimension lines are not mistaken for walls", async () => { const { buf } = await png(); const rr = await interpretRaster(buf, 100); ok(rr.stats.thicknessPx > 10 && rr.stats.thicknessPx < 32, `thickness ${rr.stats.thicknessPx}px`); ok(rr.stats.skippedDiagonalShare < 0.35, `unexplained ${rr.stats.skippedDiagonalShare}`); });
  await t("raster: a scale is mandatory", async () => { const { buf } = await png(); let m = ""; try { await interpretRaster(buf, 0); } catch (e) { m = (e as Error).message; } ok(/scale/.test(m), m); });
  await t("raster: a blank page produces a clear 'no walls' warning, not invented geometry", async () => { const blank = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#fff" } }).png().toBuffer(); const rr = await interpretRaster(blank, 100); ok(rr.stats.wallRects === 0 && rr.warnings.some((w) => /No wall-like/.test(w)), JSON.stringify(rr.warnings)); });
  console.log(out.join("\n")); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
