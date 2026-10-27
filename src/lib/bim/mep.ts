/**
 * MEP extraction from 2D drawings. Each configured layer becomes a system/category with an elevation and a section.
 * Sizes and elevations written as drawing annotations ("400x250", "Ø150", "EL+2.60") override the layer defaults; everything that comes from
 * the defaults is recorded in `assumed` so the UI and reports never present it as extracted data.
 */
import { DxfDoc, DxfEntity, entityBounds, explode, polyPoints, resolveUnits } from "./dxf";
import { closestOnSeg, dist, mul, type V2, type V3 } from "./geom";
import type { MepCategory, MepElement, MepLayerConfig, MepSection, MepSystem, Settings } from "./model";

const PREFIX: Record<MepSystem, string> = { "supply-air": "SA", "return-air": "RA", "exhaust-air": "EA", "water-cold": "CW", "water-hot": "HW", drainage: "DR", vent: "VT", "fire-protection": "FP", "electrical-power": "EP", "electrical-lighting": "EL", "cable-tray": "CT", "mechanical-pipe": "MP", equipment: "EQ" };
export const SYSTEM_LABEL: Record<MepSystem, string> = { "supply-air": "Supply air", "return-air": "Return air", "exhaust-air": "Exhaust air", "water-cold": "Cold water", "water-hot": "Hot water", drainage: "Drainage", vent: "Vent", "fire-protection": "Fire protection", "electrical-power": "Electrical (power)", "electrical-lighting": "Electrical (lighting)", "cable-tray": "Cable tray", "mechanical-pipe": "Mechanical pipework", equipment: "HVAC / plant equipment" };
export const isHvac = (s: MepSystem) => s === "supply-air" || s === "return-air" || s === "exhaust-air" || s === "equipment";
export const LINEAR: MepCategory[] = ["duct", "pipe", "conduit", "cable-tray"];

/** Suggest a MEP layer configuration from layer names (the user confirms / edits it). */
export function guessMepConfig(layers: string[]): MepLayerConfig[] {
  const rules: [RegExp, Omit<MepLayerConfig, "layer">][] = [
    [/(duct|hvac).*(sup|sa\b)|sup.*duct|supply/i, { system: "supply-air", category: "duct", elevation: 2.45, width: 0.3, height: 0.2 }],
    [/(duct|hvac).*(ret|ra\b)|ret.*duct|return/i, { system: "return-air", category: "duct", elevation: 2.3, width: 0.3, height: 0.2 }],
    [/(duct|hvac).*(exh|ex\b)|exh.*duct|exhaust/i, { system: "exhaust-air", category: "duct", elevation: 2.55, diameter: 0.15 }],
    [/diff|supply.*(term|air)|terminal/i, { system: "supply-air", category: "air-terminal", elevation: 2.7 }], [/grill|return.*term/i, { system: "return-air", category: "air-terminal", elevation: 2.7 }],
    [/equip|ahu|fcu|hvac-equip|plant/i, { system: "equipment", category: "equipment", elevation: 2.2, height: 0.5 }], [/duct/i, { system: "supply-air", category: "duct", elevation: 2.45, width: 0.3, height: 0.2 }],
    [/drain|waste|sewer|sanitary/i, { system: "drainage", category: "pipe", elevation: -0.1, diameter: 0.1 }], [/vent/i, { system: "vent", category: "pipe", elevation: 2.4, diameter: 0.05 }], [/hot|hw|dhw/i, { system: "water-hot", category: "pipe", elevation: 0.55, diameter: 0.022 }],
    [/water|cold|cw|plumb|pipe/i, { system: "water-cold", category: "pipe", elevation: 0.5, diameter: 0.022 }], [/sprink|fire|fp/i, { system: "fire-protection", category: "pipe", elevation: 2.6, diameter: 0.05 }],
    [/tray/i, { system: "cable-tray", category: "cable-tray", elevation: 2.5, width: 0.2, height: 0.05 }], [/cond|elec.*pow|power|wire/i, { system: "electrical-power", category: "conduit", elevation: 2.62, diameter: 0.025 }], [/light|lumin|lamp/i, { system: "electrical-lighting", category: "light", elevation: 2.75 }],
  ];
  const out: MepLayerConfig[] = []; for (const l of layers) { if (/^(a-|arch|wall|door|glaz|dim|room|0$|defpoints)/i.test(l)) continue; const r = rules.find(([re]) => re.test(l)); if (r) out.push({ layer: l, ...r[1], label: SYSTEM_LABEL[r[1].system] }); } return out;
}

const SIZE = /^\s*(\d{2,4})\s*[xX×]\s*(\d{2,4})\s*(mm)?\s*$/; const ROUND = /^\s*(?:%%c|Ø|⌀|DIA\.?|D)\s*(\d{2,4})\s*(mm)?\s*$/i; const ELEV = /EL\.?\s*([+-]?\d+(?:\.\d+)?)\s*(mm|m)?/i;

export interface MepResult { elements: MepElement[]; warnings: string[]; assumptions: string[]; networks: { id: string; system: MepSystem; length: number; elements: string[] }[]; annotationsUsed: number; unmappedLayers: string[] }
export function extractMep(doc: DxfDoc, cfgs: MepLayerConfig[], st: Settings, levelId = "L0", baseElevation = 0): MepResult {
  const ents = explode(doc); const units = resolveUnits(doc, ents, st.unitsOverride); const k = units.toM; const warnings: string[] = []; const assumptions: string[] = []; if (units.ambiguous) warnings.push(`Units: ${units.note}`);
  const byLayer = new Map(cfgs.map((c) => [c.layer, c])); const els: MepElement[] = []; const count: Record<string, number> = {}; const tag = (s: MepSystem, cat: string) => { const key = `${s}`; count[key] = (count[key] ?? 0) + 1; return `${PREFIX[s]}-${cat === "air-terminal" ? "T" : ""}${String(count[key]).padStart(3, "0")}`; };
  const texts = ents.filter((e): e is Extract<DxfEntity, { t: "TEXT" }> => e.t === "TEXT").map((t) => ({ ...t, p: mul(t.p, k) }));
  const nearestText = (pts: V2[], pred: (s: string) => boolean) => { let best: { s: string; d: number } | null = null; for (const t of texts) { if (!pred(t.text)) continue; let d = Infinity; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, closestOnSeg(t.p, pts[i], pts[i + 1]).d); if (pts.length === 1) d = dist(t.p, pts[0]); if (d < 0.6 && (!best || d < best.d)) best = { s: t.text, d }; } return best?.s; };
  let annotationsUsed = 0; const unmapped = new Set<string>();
  for (const e of ents) {
    const cfg = byLayer.get(e.layer); if (!cfg) continue;
    const linear = LINEAR.includes(cfg.category);
    if (linear && (e.t === "LINE" || e.t === "POLY")) {
      const pts2 = e.t === "LINE" ? [mul(e.a, k), mul(e.b, k)] : polyPoints(e, 0.05).map((p) => mul(p, k)); if (pts2.length < 2) continue; if (pts2.reduce((s, p, i) => (i ? s + dist(p, pts2[i - 1]) : 0), 0) < 0.05) continue;
      const assumed: string[] = []; let z = baseElevation + cfg.elevation; const elTxt = nearestText(pts2, (s) => ELEV.test(s)); if (elTxt) { const m = ELEV.exec(elTxt)!; let v = parseFloat(m[1]); if (m[2] === "mm" || (!m[2] && Math.abs(v) > 50)) v /= 1000; z = baseElevation + v; annotationsUsed++; } else assumed.push("elevation (layer configuration)");
      let section: MepSection; const sTxt = nearestText(pts2, (s) => SIZE.test(s) || ROUND.test(s)); if (sTxt) { annotationsUsed++; const r = SIZE.exec(sTxt); if (r) section = { shape: "rect", w: +r[1] / 1000, h: +r[2] / 1000 }; else { const d = +ROUND.exec(sTxt)![1] / 1000; section = { shape: "round", w: d, h: d }; } }
      else if (cfg.diameter) { section = { shape: "round", w: cfg.diameter, h: cfg.diameter }; assumed.push("diameter (layer configuration)"); } else { section = { shape: "rect", w: cfg.width ?? 0.2, h: cfg.height ?? 0.2 }; assumed.push("width × height (layer configuration)"); }
      const path: V3[] = pts2.map((p) => ({ x: p.x, y: p.y, z })); const length = path.reduce((s, p, i) => (i ? s + dist(p, path[i - 1]) : 0), 0);
      els.push({ id: `${PREFIX[cfg.system]}${String(els.length + 1).padStart(4, "0")}`, tag: tag(cfg.system, cfg.category), category: cfg.category, system: cfg.system, level: levelId, path, section, props: { "System": SYSTEM_LABEL[cfg.system], "Layer": e.layer, "Length (m)": Math.round(length * 1000) / 1000, "Elevation, centreline (m)": Math.round(z * 1000) / 1000, ...(section.shape === "rect" ? { "Width (mm)": Math.round(section.w * 1000), "Height (mm)": Math.round(section.h * 1000) } : { "Diameter (mm)": Math.round(section.w * 1000) }), "Source handle": e.h ?? "" }, source: { origin: "dxf", layer: e.layer, handle: e.h }, assumed, connections: [] });
    } else if (!linear) {
      let c: V2 | null = null, w = 0.3, d = 0.3, rotn = 0, fromGeom = false; if (e.t === "CIRCLE") { c = mul(e.c, k); w = d = e.r * 2 * k; fromGeom = true; } else if (e.t === "POLY" && e.closed) { const b = entityBounds(e)!; c = mul({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, k); w = (b.x1 - b.x0) * k; d = (b.y1 - b.y0) * k; fromGeom = true; } else if (e.t === "INSERT") { c = mul(e.p, k); const b = doc.blocks[e.name]; const bb = b ? entityBoundsOfBlock(b.entities) : null; if (bb) { w = (bb.x1 - bb.x0) * Math.abs(e.sx) * k; d = (bb.y1 - bb.y0) * Math.abs(e.sy) * k; fromGeom = true; } rotn = e.rotation; } else if (e.t === "POINT") c = mul(e.p, k);
      if (!c) continue; const assumed: string[] = ["elevation (layer configuration)"]; if (!fromGeom) assumed.push("plan size (default)"); const hgt = cfg.height ?? (cfg.category === "equipment" ? 0.5 : 0.1); if (cfg.category === "equipment" || cfg.category === "air-terminal") assumed.push("height (layer configuration)"); else if (cfg.category === "light") assumed.push("height (default)");
      const z = baseElevation + cfg.elevation; const round = e.t === "CIRCLE";
      els.push({ id: `${PREFIX[cfg.system]}${String(els.length + 1).padStart(4, "0")}`, tag: tag(cfg.system, cfg.category), category: cfg.category, system: cfg.system, level: levelId, path: [{ x: c.x, y: c.y, z }], section: { shape: round ? "round" : "rect", w, h: d }, size3: { x: w, y: d, z: hgt, rotation: rotn }, props: { "System": SYSTEM_LABEL[cfg.system], "Layer": e.layer, "Plan size (mm)": round ? `Ø${Math.round(w * 1000)}` : `${Math.round(w * 1000)} × ${Math.round(d * 1000)}`, "Elevation, centre (m)": Math.round(z * 1000) / 1000, "Height (mm)": Math.round(hgt * 1000), "Source handle": e.h ?? "" }, source: { origin: "dxf", layer: e.layer, handle: e.h }, assumed, connections: [] });
      if (e.t === "INSERT" && e.attribs) Object.assign(els[els.length - 1].props, e.attribs); const nm = nearestText([c], (s) => /^[A-Z]{2,4}[- ]?\d{1,3}$/.test(s.trim())); if (nm && cfg.category === "equipment") { els[els.length - 1].props["Equipment identifier"] = nm.trim(); annotationsUsed++; }
    }
  }
  for (const l of Object.keys(doc.layers)) if (!byLayer.has(l) && /duct|pipe|hvac|elec|plumb|cond|tray|diff|grill|drain|sprink|light/i.test(l) && doc.layers[l]) unmapped.add(l);
  if (unmapped.size) warnings.push(`MEP-looking layers without configuration were ignored: ${[...unmapped].join(", ")}.`);
  addFittings(els); connect(els);
  const networks = buildNetworks(els);
  if (els.some((e) => e.assumed.some((a) => a.startsWith("elevation")))) assumptions.push("2D drawings carry no vertical routing: elevations come from per-layer configuration unless an EL annotation is present. Vertical risers and level changes are not inferred.");
  if (els.some((e) => e.assumed.some((a) => /layer configuration|default/.test(a) && !a.startsWith("elevation")))) assumptions.push("Sizes without a drawing annotation use the layer configuration (shown as 'assumed' on every element).");
  return { elements: els, warnings, assumptions, networks, annotationsUsed, unmappedLayers: [...unmapped] };
}
function entityBoundsOfBlock(es: DxfEntity[]) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const e of es) { const b = entityBounds(e); if (!b) continue; x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); } return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null; }

export function segmentsOf(e: MepElement): [V3, V3][] { const out: [V3, V3][] = []; for (let i = 0; i + 1 < e.path.length; i++) out.push([e.path[i], e.path[i + 1]]); return out; }

function addFittings(els: MepElement[]) {
  const add: MepElement[] = []; const lin = els.filter((e) => LINEAR.includes(e.category));
  // tees first (a branch that starts on a bend vertex is a tee, not just an elbow)
  for (const e of lin) for (const o of lin) { if (o === e || o.system !== e.system) continue; for (const end of [o.path[0], o.path[o.path.length - 1]]) for (let i = 0; i + 1 < e.path.length; i++) { const cs = closestOnSeg(end, e.path[i], e.path[i + 1]); const atPathEnd = dist(cs.pt, e.path[0]) < 0.05 || dist(cs.pt, e.path[e.path.length - 1]) < 0.05; if (cs.d < 0.06 && !atPathEnd && Math.abs(end.z - e.path[i].z) < 0.3) add.push(fitting(e, { x: cs.pt.x, y: cs.pt.y, z: e.path[i].z }, "tee", `branch ${o.tag} joins ${e.tag}`, els.length + add.length)); } }
  for (const e of lin) for (let i = 1; i + 1 < e.path.length; i++) { const a = e.path[i - 1], b = e.path[i], c = e.path[i + 1]; const u1 = { x: b.x - a.x, y: b.y - a.y }, u2 = { x: c.x - b.x, y: c.y - b.y }; const l1 = Math.hypot(u1.x, u1.y), l2 = Math.hypot(u2.x, u2.y); if (l1 < 1e-6 || l2 < 1e-6) continue; const ang = (Math.acos(Math.max(-1, Math.min(1, (u1.x * u2.x + u1.y * u2.y) / (l1 * l2)))) * 180) / Math.PI; if (ang > 15) add.push(fitting(e, b, "elbow", `${Math.round(ang)}° bend`, els.length + add.length)); }
  const seen: V3[] = []; for (const f of add) { if (seen.some((p) => dist(p as unknown as V2, f.path[0] as unknown as V2) < 0.05)) continue; seen.push(f.path[0]); els.push(f); }
}
function fitting(host: MepElement, at: V3, kind: string, note: string, n: number): MepElement {
  const s = host.section; const size = Math.max(s.w, s.h) * 1.15; return { id: `FT${String(n + 1).padStart(4, "0")}`, tag: `${host.tag}-${kind.toUpperCase()}`, category: "fitting", system: host.system, level: host.level, path: [at], section: { shape: s.shape, w: size, h: size }, size3: { x: size, y: size, z: s.h * 1.15, rotation: 0 }, props: { "Fitting type": kind, "Note": note, "System": SYSTEM_LABEL[host.system], "Host element": host.tag }, source: { origin: "derived", note: "fitting inferred at a bend or branch of the drawn centreline" }, assumed: ["fitting geometry (generated from the connected sizes)"], connections: [host.id] };
}
function connect(els: MepElement[]) {
  const lin = els.filter((e) => LINEAR.includes(e.category)); const pts = els.filter((e) => !LINEAR.includes(e.category) && e.category !== "fitting");
  const link = (a: MepElement, b: MepElement) => { if (!a.connections.includes(b.id)) a.connections.push(b.id); if (!b.connections.includes(a.id)) b.connections.push(a.id); };
  for (let i = 0; i < lin.length; i++) for (let j = i + 1; j < lin.length; j++) { const A = lin[i], B = lin[j]; if (A.system !== B.system) continue; for (const ea of [A.path[0], A.path[A.path.length - 1]]) for (const eb of [B.path[0], B.path[B.path.length - 1]]) if (dist({ ...ea, z: 0 } as unknown as V2, { ...eb, z: 0 } as unknown as V2) < 0.06) link(A, B); for (const ea of [A.path[0], A.path[A.path.length - 1]]) for (let q = 0; q + 1 < B.path.length; q++) if (closestOnSeg(ea, B.path[q], B.path[q + 1]).d < 0.06) link(A, B); for (const eb of [B.path[0], B.path[B.path.length - 1]]) for (let q = 0; q + 1 < A.path.length; q++) if (closestOnSeg(eb, A.path[q], A.path[q + 1]).d < 0.06) link(A, B); }
  for (const p of pts) { const c = p.path[0]; const half = Math.max(p.section.w, p.section.h) / 2; for (const l of lin) { const sysOk = p.category === "equipment" ? isHvac(l.system) : p.category === "air-terminal" ? l.system === p.system : p.category === "light" ? l.system.startsWith("electrical") : true; if (!sysOk) continue; for (let q = 0; q + 1 < l.path.length; q++) { const cs = closestOnSeg(c, l.path[q], l.path[q + 1]); if (cs.d < half + (p.category === "equipment" ? 0.25 : 0.1)) { link(p, l); break; } } } }
}
function buildNetworks(els: MepElement[]) {
  const by = new Map(els.map((e) => [e.id, e])); const seen = new Set<string>(); const nets: MepResult["networks"] = []; let n = 0;
  for (const e of els) { if (seen.has(e.id) || e.category === "equipment" || e.category === "fitting") continue; const q = [e]; const members: MepElement[] = []; seen.add(e.id); while (q.length) { const x = q.pop()!; members.push(x); for (const id of x.connections) { const y = by.get(id); if (y && !seen.has(id) && y.system === e.system && y.category !== "equipment") { seen.add(id); q.push(y); } } } const nid = `N${++n}`; members.forEach((m) => (m.networkId = nid)); nets.push({ id: nid, system: e.system, length: Math.round(members.reduce((s, m) => s + (LINEAR.includes(m.category) ? Number(m.props["Length (m)"] ?? 0) : 0), 0) * 1000) / 1000, elements: members.map((m) => m.id) }); }
  return nets;
}
