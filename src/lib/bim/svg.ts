/**
 * SVG plan reader: converts line, polyline, polygon, rect, circle and straight-segment paths into the same entity model as DXF.
 * Group ids / inkscape:label become layer names. Curves (C, Q, A) are reduced to straight chords and reported. SVG has no real-world units:
 * the caller supplies "user units per metre", otherwise the units are guessed and flagged as ambiguous.
 */
import type { DxfDoc, DxfEntity } from "./dxf";
import { rot } from "./geom";

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function parseTransform(t: string | undefined): M { let m = I; if (!t) return m; for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) { const a = args.split(/[\s,]+/).filter(Boolean).map(Number); let n: M = I; if (fn === "matrix" && a.length === 6) n = a as M; else if (fn === "translate") n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; else if (fn === "scale") n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; else if (fn === "rotate") { const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); n = [c, s, -s, c, 0, 0]; if (a.length === 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]); } m = mul(m, n); } return m; }
const attrs = (s: string) => { const o: Record<string, string> = {}; for (const [, k, v] of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) o[k] = v; return o; };
const ap = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

export function parseSvg(text: string, unitsPerMetre?: number): { doc: DxfDoc; warnings: string[] } {
  if (/<script|onload\s*=|javascript:/i.test(text)) throw new Error("SVG files containing scripts are rejected.");
  const warnings: string[] = []; const ents: DxfEntity[] = []; const stack: { name: string; m: M; layer: string }[] = [{ name: "svg", m: I, layer: "0" }]; let curves = 0;
  const flip = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y }); // SVG y runs downward; plans run upward
  const add = (layer: string, pts: { x: number; y: number }[], closed: boolean) => { if (pts.length < 2) return; if (pts.length === 2 && !closed) ents.push({ t: "LINE", layer, a: flip(pts[0]), b: flip(pts[1]) }); else ents.push({ t: "POLY", layer, closed, pts: pts.map(flip) }); };
  for (const [, close, name, rest] of text.matchAll(/<(\/?)([\w:-]+)([^>]*?)\/?>/g)) {
    const selfClose = /\/>$/.test(rest) || false; void selfClose;
    if (close) { if (name === "g" && stack.length > 1) stack.pop(); continue; }
    const a = attrs(rest); const top = stack[stack.length - 1]; const m = mul(top.m, parseTransform(a.transform)); const layer = a["inkscape:label"] || a.id || a["data-layer"] || top.layer;
    if (name === "g") { if (!/\/>\s*$/.test(`<${name}${rest}>`) || true) stack.push({ name: "g", m, layer: name === "g" && (a["inkscape:label"] || a.id) ? layer : top.layer }); if (/\/\s*$/.test(rest)) stack.pop(); continue; }
    const L = (a["inkscape:label"] || a.class || top.layer) && top.layer !== "0" ? top.layer : (a.class || a["data-layer"] || top.layer);
    if (name === "line") add(L, [ap(m, +a.x1, +a.y1), ap(m, +a.x2, +a.y2)], false);
    else if (name === "polyline" || name === "polygon") { const n = (a.points ?? "").trim().split(/[\s,]+/).map(Number); const pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push(ap(m, n[i], n[i + 1])); add(L, pts, name === "polygon"); }
    else if (name === "rect") { const x = +(a.x ?? 0), y = +(a.y ?? 0), w = +a.width, h = +a.height; if (w > 0 && h > 0) add(L, [ap(m, x, y), ap(m, x + w, y), ap(m, x + w, y + h), ap(m, x, y + h)], true); }
    else if (name === "circle") { const c = ap(m, +(a.cx ?? 0), +(a.cy ?? 0)); const r = +a.r * Math.hypot(m[0], m[1]); ents.push({ t: "CIRCLE", layer: L, c: flip(c), r }); }
    else if (name === "path" && a.d) { const toks = [...a.d.matchAll(/([MmLlHhVvZzCcSsQqTtAa])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi)]; let i = 0; let cmd = ""; let x = 0, y = 0, sx = 0, sy = 0; let cur: { x: number; y: number }[] = []; const num = () => Number(toks[i++][2]); const flush = (closed: boolean) => { add(L, cur, closed); cur = []; };
      while (i < toks.length) { if (toks[i][1]) { cmd = toks[i][1]; i++; if (cmd === "Z" || cmd === "z") { flush(true); x = sx; y = sy; continue; } } const rel = cmd === cmd.toLowerCase();
        if (/m/i.test(cmd)) { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; if (cur.length) flush(false); sx = x; sy = y; cur = [ap(m, x, y)]; cmd = rel ? "l" : "L"; }
        else if (/l/i.test(cmd)) { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; cur.push(ap(m, x, y)); } else if (/h/i.test(cmd)) { const nx = num(); x = rel ? x + nx : nx; cur.push(ap(m, x, y)); } else if (/v/i.test(cmd)) { const ny = num(); y = rel ? y + ny : ny; cur.push(ap(m, x, y)); }
        else { curves++; const n = /c/i.test(cmd) ? 6 : /[sq]/i.test(cmd) ? 4 : /a/i.test(cmd) ? 7 : 2; const v: number[] = []; for (let q = 0; q < n && i < toks.length; q++) v.push(num()); const ex = v[n - 2], ey = v[n - 1]; x = rel ? x + ex : ex; y = rel ? y + ey : ey; cur.push(ap(m, x, y)); } }
      if (cur.length) flush(false); }
  }
  if (curves) warnings.push(`${curves} curved path segments (C/Q/A) were reduced to straight chords.`);
  void rot;
  let up = unitsPerMetre; let insunits = 6; let unitsKnown = !!unitsPerMetre; const k = up ? 1 / up : 1;
  if (up) for (const e of ents) { if (e.t === "LINE") { e.a = { x: e.a.x * k, y: e.a.y * k }; e.b = { x: e.b.x * k, y: e.b.y * k }; } else if (e.t === "POLY") e.pts = e.pts.map((p) => ({ x: p.x * k, y: p.y * k })); else if (e.t === "CIRCLE") { e.c = { x: e.c.x * k, y: e.c.y * k }; e.r *= k; } }
  else { insunits = 0; up = undefined; }
  const layers: DxfDoc["layers"] = {}; for (const e of ents) layers[e.layer] ??= { name: e.layer, color: 7, off: false, frozen: false };
  const counts: Record<string, number> = {}; for (const e of ents) counts[e.t] = (counts[e.t] ?? 0) + 1;
  if (!unitsKnown) warnings.push("SVG has no real-world units: provide the number of SVG user units per metre, or confirm the guessed units.");
  return { doc: { version: "SVG", insunits, unitsKnown, layers, blocks: {}, entities: ents, warnings: [], counts }, warnings };
}
