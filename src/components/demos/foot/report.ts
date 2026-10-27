import type { CaptureDTO, SessionDTO } from "@/lib/foot/api-types";
import { activeAnalysis, type Results } from "@/lib/foot/results";
import { RULESET } from "@/lib/foot/sizing";
import type { Pt } from "@/lib/foot/types";
import { fmtLen } from "./api";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export type Unit = "mm" | "cm" | "in";

function outlines(r: Results): string {
  const feet = ([["left", r.left, "#b45309"], ["right", r.right, "#047857"]] as const).filter((f) => f[1]);
  if (!feet.length) return "";
  const norm = (pts: Pt[], heel: Pt, toe: Pt, mirror: boolean) => { const ang = Math.atan2(toe.y - heel.y, toe.x - heel.x), c = Math.cos(-ang), s = Math.sin(-ang); return pts.map((p) => { const x = (p.x - heel.x) * c - (p.y - heel.y) * s, y = (p.x - heel.x) * s + (p.y - heel.y) * c; return { x, y: mirror ? -y : y }; }); };
  const polys = feet.map(([side, f, col]) => ({ side, col, pts: norm(f!.outlineMm, f!.axis.heel, f!.axis.toe, false) }));
  const all = polys.flatMap((p) => p.pts); const x0 = Math.min(...all.map((p) => p.x)) - 10, x1 = Math.max(...all.map((p) => p.x)) + 10, y0 = Math.min(...all.map((p) => p.y)) - 10, y1 = Math.max(...all.map((p) => p.y)) + 10;
  return `<svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0 + 14}" style="width:100%;max-height:260px" role="img" aria-label="Outlines of the measured feet drawn to the same scale">${polys.map((p) => `<polygon points="${p.pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}" fill="${p.col}22" stroke="${p.col}" stroke-width="1.2"/>`).join("")}<line x1="${x0 + 5}" y1="${y1 + 6}" x2="${x0 + 105}" y2="${y1 + 6}" stroke="#444" stroke-width="1.5"/><text x="${x0 + 5}" y="${y1 + 13}" font-size="6" fill="#444">100 mm scale (heels aligned, toes to the right)</text></svg>`;
}

export function reportHtml(session: SessionDTO, caps: CaptureDTO[], r: Results, unit: Unit, logoSrc?: string): string {
  const row = (label: string, l?: number, rt?: number) => `<tr><th>${label}</th><td>${l != null ? fmtLen(l, unit) : "—"}</td><td>${rt != null ? fmtLen(rt, unit) : "—"}</td></tr>`;
  const sz = r.size;
  const used = ([r.left, r.right].filter(Boolean) as NonNullable<Results["left"]>[]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Foot measurement report</title><style>
  body{font:15px/1.5 Georgia,'Times New Roman',serif;color:#1c1917;margin:0;padding:28px;max-width:860px;margin-inline:auto}h1{font-size:26px;margin:.2em 0}h2{font-size:18px;margin:1.4em 0 .4em;border-bottom:1px solid #d6d3d1;padding-bottom:.2em}
  table{border-collapse:collapse;width:100%;margin:.4em 0}th,td{border:1px solid #d6d3d1;padding:6px 9px;text-align:left}thead th{background:#f5f5f4}.n{font-size:13px;color:#57534e}.b{background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:6px;margin:10px 0}
  .g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.c{border:1px solid #d6d3d1;border-radius:8px;padding:8px 10px}.c b{display:block;font-size:22px}.hd{display:flex;align-items:center;gap:14px;justify-content:space-between}img.l{height:38px}@media print{body{padding:0}}
  </style></head><body>
  <div class="hd"><div><p class="n" style="margin:0">Neo Forge Technology · AI Shoe &amp; Foot Measurement and Fitting</p><h1>Foot measurement report</h1></div>${logoSrc ? `<img class="l" src="${esc(logoSrc)}" alt="Neo Forge Technology">` : ""}</div>
  <p class="n">${esc(session.name)} · created ${esc(new Date(session.createdAt).toISOString().slice(0, 16).replace("T", " "))} UTC · session ${esc(session.id.slice(0, 8))} · sizing rules ${esc(RULESET.id)}</p>
  ${r.anySample ? `<div class="b"><b>Sample data.</b> At least one result comes from a synthetic sample photo, not from a real foot.</div>` : ""}
  <h2>Measurements</h2>
  <table><thead><tr><th></th><th>Left foot</th><th>Right foot</th></tr></thead><tbody>${row("Length", r.left?.lengthMm, r.right?.lengthMm)}${row("Width (widest point)", r.left?.widthMm, r.right?.widthMm)}${row("Forefoot (ball) width", r.left?.ballWidthMm, r.right?.ballWidthMm)}${row("Heel width", r.left?.heelWidthMm, r.right?.heelWidthMm)}<tr><th>Outline area</th><td>${r.left ? r.left.areaCm2 + " cm²" : "—"}</td><td>${r.right ? r.right.areaCm2 + " cm²" : "—"}</td></tr><tr><th>Photo quality</th><td>${esc(r.left?.grade ?? "—")}</td><td>${esc(r.right?.grade ?? "—")}</td></tr><tr><th>Source / method</th><td>${r.left ? esc(r.left.source + " / " + r.left.method) : "—"}</td><td>${r.right ? esc(r.right.source + " / " + r.right.method) : "—"}</td></tr></tbody></table>
  ${r.comparison ? `<p><b>Left vs right:</b> length difference ${r.comparison.lengthDiffMm > 0 ? "+" : ""}${r.comparison.lengthDiffMm} mm, width difference ${r.comparison.widthDiffMm > 0 ? "+" : ""}${r.comparison.widthDiffMm} mm (left minus right). ${esc(r.comparison.advice)}</p>` : ""}
  ${outlines(r)}
  ${sz ? `<h2>Shoe size estimate</h2><div class="g"><div class="c">EU<b>${sz.eu}</b></div><div class="c">UK<b>${sz.uk}</b></div><div class="c">US men's<b>${sz.usMen}</b></div><div class="c">US women's<b>${sz.usWomen}</b></div></div>
  <p class="n">Fit foot: ${esc(r.fitFoot?.side)} (${r.fitFoot ? fmtLen(r.fitFoot.lengthMm, unit) : ""}). Fit preference <b>${esc(sz.fit)}</b>, allowance ${sz.allowanceMm} mm. Width class: <b>${esc(r.width?.cls)}</b> (ratio ${r.width?.ratio}).</p><ol class="n">${sz.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p class="n">${sz.notes.map(esc).join(" ")}</p>
  <h2>Sample style profiles</h2><p class="n">These are generic, illustrative style profiles. They are not products and imply no stock.</p><table><thead><tr><th>Profile</th><th>Size</th><th>Width</th></tr></thead><tbody>${r.recommendations.map((x) => `<tr><td>${esc(x.profile.name)}</td><td>EU ${x.size.eu} · UK ${x.size.uk}</td><td>${esc(x.widthFit)} — ${esc(x.widthNote)}</td></tr>`).join("")}</tbody></table>` : ""}
  <h2>How this was measured</h2><ul>${r.method.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
  <h2>Photos used</h2><table><thead><tr><th>Side</th><th>Source</th><th>Image</th><th>Length used</th><th>Warnings</th></tr></thead><tbody>${used.map((u) => { const c = caps.find((x) => x.id === u.captureId); const a = c ? activeAnalysis(c) : null; return `<tr><td>${esc(c?.side)}</td><td>${esc(u.source)}</td><td>${c ? c.width + "×" + c.height : ""}</td><td>${fmtLen(u.lengthMm, "mm")} (uncorrected silhouette ${u.rawLengthMm} mm; correction uncertainty ±${u.parallaxBoundMm} mm)</td><td>${esc(a?.warnings.join(" ") || "none")}</td></tr>`; }).join("")}</tbody></table>
  <h2>Limitations</h2><ul>${r.limitations.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
  <p class="n">Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. This report is an estimate for information only.</p></body></html>`;
}
