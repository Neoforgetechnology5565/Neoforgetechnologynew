import * as THREE from "three";
import { facadeMap } from "./config3d";

export type Vals = Record<string, number | string | boolean>;
export type ParamDef =
  | { k: string; label: string; type: "range"; min: number; max: number; step: number; unit?: string }
  | { k: string; label: string; type: "select"; options: [string, string][] }
  | { k: string; label: string; type: "toggle" }
  | { k: string; label: string; type: "color"; swatches: string[] };

export interface CompDef {
  id: string; code: string; name: string; category: string; desc: string;
  params: ParamDef[];
  presets: Record<string, Vals>;
  build: (v: Vals) => { group: THREE.Group; parts: Record<string, string> };
  validate: (v: Vals) => string[];
  quantities: (v: Vals) => [string, string][];
}

const N = (v: Vals, k: string) => v[k] as number;
const S = (v: Vals, k: string) => v[k] as string;
const mm = (n: number) => n / 1000;
const MATERIAL_OPTS: [string, string][] = [["timber", "Timber"], ["aluminium", "Aluminium"], ["upvc", "uPVC"], ["steel", "Powder-coated steel"]];

function bodyMat(v: Vals) {
  const m = S(v, "material"), c = new THREE.Color(S(v, "color"));
  if (m === "timber") return new THREE.MeshStandardMaterial({ map: facadeMap("timber"), color: c, roughness: 0.75 });
  if (m === "aluminium") return new THREE.MeshStandardMaterial({ color: c, metalness: 0.75, roughness: 0.35 });
  if (m === "steel") return new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.45 });
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
}
const glassMat = () => new THREE.MeshStandardMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.2 });
const darkMat = (c = 0x1f2926) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.4 });

class Builder {
  group = new THREE.Group(); parts: Record<string, string> = {};
  box(id: string, label: string, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
    m.position.set(x, y, z); m.userData.id = id; m.castShadow = shadow; m.receiveShadow = true;
    this.parts[id] = label; this.group.add(m); return m;
  }
  line(pts: THREE.Vector3[], color = 0x55b52b) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })); l.userData.aid = true; this.group.add(l); return l; }
}

/* ---------------------------------------------------------------- window */
const windowDef: CompDef = {
  id: "window", code: "WIN", name: "Window system", category: "Openings", desc: "Frame, glazing, mullions and opening sashes.",
  params: [
    { k: "width", label: "Width", type: "range", min: 600, max: 3000, step: 50, unit: " mm" },
    { k: "height", label: "Height", type: "range", min: 600, max: 2400, step: 50, unit: " mm" },
    { k: "panels", label: "Number of panels", type: "range", min: 1, max: 4, step: 1 },
    { k: "frame", label: "Frame width", type: "range", min: 50, max: 120, step: 5, unit: " mm" },
    { k: "opening", label: "Opening type", type: "select", options: [["fixed", "Fixed"], ["casement", "Side-hung casement"], ["slider", "Sliding"]] },
    { k: "glazing", label: "Glazing", type: "select", options: [["single", "Single (6 mm)"], ["double", "Double (24 mm)"], ["triple", "Triple (36 mm)"]] },
    { k: "material", label: "Frame material", type: "select", options: MATERIAL_OPTS },
    { k: "color", label: "Frame colour", type: "color", swatches: ["#f2f2ee", "#3b3f42", "#7a5a3a", "#c9b79a", "#2f4a3a"] },
    { k: "bars", label: "Glazing bars", type: "toggle" },
  ],
  presets: {
    Standard: { width: 1500, height: 1200, panels: 2, frame: 70, opening: "casement", glazing: "double", material: "upvc", color: "#f2f2ee", bars: false },
    Compact: { width: 900, height: 900, panels: 1, frame: 60, opening: "casement", glazing: "double", material: "timber", color: "#c9b79a", bars: false },
    Premium: { width: 2400, height: 1800, panels: 3, frame: 90, opening: "slider", glazing: "triple", material: "aluminium", color: "#3b3f42", bars: true },
  },
  build(v) {
    const b = new Builder(), W = mm(N(v, "width")), H = mm(N(v, "height")), F = mm(N(v, "frame")), D = 0.12, n = N(v, "panels");
    const fm = bodyMat(v), gm = glassMat(), gt = { single: 0.006, double: 0.024, triple: 0.036 }[S(v, "glazing") as "single"];
    const y0 = 0.9; // window sits at sill height in a wall opening
    b.box("frame", "Outer frame", W, F, D, fm, 0, y0 + F / 2, 0); b.box("frame", "Outer frame", W, F, D, fm, 0, y0 + H - F / 2, 0);
    b.box("frame", "Outer frame", F, H - 2 * F, D, fm, -W / 2 + F / 2, y0 + H / 2, 0); b.box("frame", "Outer frame", F, H - 2 * F, D, fm, W / 2 - F / 2, y0 + H / 2, 0);
    const inner = W - 2 * F, cell = inner / n, mull = F * 0.7;
    for (let i = 1; i < n; i++) b.box("mullion", "Mullions", mull, H - 2 * F, D, fm, -inner / 2 + i * cell, y0 + H / 2, 0);
    for (let i = 0; i < n; i++) {
      const cx = -inner / 2 + (i + 0.5) * cell, cw = cell - (i < n - 1 ? mull : 0) - (i > 0 ? 0 : 0), z = S(v, "opening") === "slider" ? (i % 2 ? 0.03 : -0.03) : 0;
      const gw = Math.max(0.05, cell - mull - (S(v, "opening") !== "fixed" ? 0.06 : 0)), gh = H - 2 * F - (S(v, "opening") !== "fixed" ? 0.06 : 0);
      void cw;
      b.box("glass", "Glazing", gw, gh, gt, gm, cx, y0 + H / 2, z, false);
      if (S(v, "opening") !== "fixed") {
        const sw = gw + 0.06, sh = gh + 0.06, t = 0.035;
        for (const [w2, h2, ox, oy] of [[sw, t, 0, sh / 2 - t / 2], [sw, t, 0, -sh / 2 + t / 2], [t, sh, -sw / 2 + t / 2, 0], [t, sh, sw / 2 - t / 2, 0]] as const) b.box("sash", "Opening sashes", w2, h2, 0.05, fm, cx + ox, y0 + H / 2 + oy, z, false);
        const hx = S(v, "opening") === "casement" ? (i % 2 ? -1 : 1) * (sw / 2 - 0.05) : (i % 2 ? -1 : 1) * (sw / 2 - 0.05);
        b.box("handle", "Handles", 0.02, 0.1, 0.03, darkMat(0xc9ccd0), cx + hx, y0 + H / 2, z + 0.045, false);
        if (S(v, "opening") === "casement") { const hinge = (i % 2 ? 1 : -1) * sw / 2; b.line([new THREE.Vector3(cx + hinge, y0 + H / 2 + sh / 2, 0.08), new THREE.Vector3(cx - hinge * 0, y0 + H / 2, 0.14), new THREE.Vector3(cx + hinge, y0 + H / 2 - sh / 2, 0.08)]); }
      }
      if (v.bars) { b.box("bars", "Glazing bars", gw, 0.018, gt + 0.01, fm, cx, y0 + H / 2, z, false); b.box("bars", "Glazing bars", 0.018, gh, gt + 0.01, fm, cx, y0 + H / 2, z, false); }
    }
    b.box("sill", "Window sill", W + 0.12, 0.04, D + 0.08, bodyMat({ ...v, material: "aluminium", color: "#cfd3d0" }), 0, y0 - 0.02, 0.03);
    return { group: b.group, parts: b.parts };
  },
  validate(v) {
    const w: string[] = [], cell = (N(v, "width") - 2 * N(v, "frame")) / N(v, "panels");
    if (cell < 350) w.push(`Each panel is ${cell.toFixed(0)} mm wide; the minimum for this system is 350 mm. Reduce the number of panels.`);
    if (S(v, "opening") !== "fixed" && cell > 1000) w.push(`Opening sashes wider than 1000 mm (${cell.toFixed(0)} mm) are not recommended. Add a panel or use a fixed window.`);
    if (S(v, "opening") === "slider" && N(v, "panels") < 2) w.push("A sliding window needs at least 2 panels.");
    if (S(v, "material") === "timber" && N(v, "width") * N(v, "height") > 3_000_000) w.push("Timber frames above 3.0 m² should be checked against the manufacturer's limits.");
    return w;
  },
  quantities(v) {
    const W = mm(N(v, "width")), H = mm(N(v, "height")), F = mm(N(v, "frame")), n = N(v, "panels");
    const glass = (W - 2 * F) * (H - 2 * F);
    return [["Overall area", `${(W * H).toFixed(2)} m²`], ["Glazed area", `${glass.toFixed(2)} m²`], ["Frame length", `${(2 * (W + H) + (n - 1) * (H - 2 * F)).toFixed(2)} m`], ["Panels", String(n)], ["Glazing", S(v, "glazing")]];
  },
};

/* ------------------------------------------------------------------ door */
const doorDef: CompDef = {
  id: "door", code: "DOR", name: "Hinged door", category: "Openings", desc: "Leaf, frame, panels, glazing, handle and swing.",
  params: [
    { k: "width", label: "Leaf width", type: "range", min: 700, max: 1200, step: 10, unit: " mm" },
    { k: "height", label: "Height", type: "range", min: 1900, max: 2400, step: 10, unit: " mm" },
    { k: "thick", label: "Leaf thickness", type: "range", min: 35, max: 60, step: 1, unit: " mm" },
    { k: "style", label: "Style", type: "select", options: [["flush", "Flush"], ["two", "Two panel"], ["four", "Four panel"], ["glazed", "Half glazed"]] },
    { k: "swing", label: "Hinge side", type: "select", options: [["left", "Left"], ["right", "Right"]] },
    { k: "material", label: "Material", type: "select", options: MATERIAL_OPTS },
    { k: "color", label: "Colour", type: "color", swatches: ["#7a5a3a", "#2f4a3a", "#3b3f42", "#f2f2ee", "#a33b2c"] },
    { k: "sidelight", label: "Side light", type: "toggle" },
    { k: "handle", label: "Handle and lock", type: "toggle" },
  ],
  presets: {
    Standard: { width: 900, height: 2100, thick: 44, style: "two", swing: "left", material: "timber", color: "#7a5a3a", sidelight: false, handle: true },
    Compact: { width: 760, height: 2000, thick: 40, style: "flush", swing: "right", material: "upvc", color: "#f2f2ee", sidelight: false, handle: true },
    Premium: { width: 1100, height: 2300, thick: 56, style: "glazed", swing: "left", material: "aluminium", color: "#3b3f42", sidelight: true, handle: true },
  },
  build(v) {
    const b = new Builder(), W = mm(N(v, "width")), H = mm(N(v, "height")), T = mm(N(v, "thick")), fm = bodyMat(v), gm = glassMat(), left = S(v, "swing") === "left";
    const J = 0.07, side = v.sidelight ? 0.4 : 0, total = W + side;
    b.box("frame", "Door frame", J, H + J, 0.11, fm, -total / 2 - J / 2 + 0 - 0.0, (H + J) / 2, 0); b.box("frame", "Door frame", J, H + J, 0.11, fm, total / 2 + J / 2, (H + J) / 2, 0); b.box("frame", "Door frame", total + 2 * J, J, 0.11, fm, 0, H + J / 2, 0);
    const lx = v.sidelight ? (left ? -side / 2 : side / 2) : 0;
    b.box("leaf", "Door leaf", W - 0.01, H - 0.02, T, fm, lx, H / 2, 0);
    const style = S(v, "style"), pm = bodyMat({ ...v, color: S(v, "color") });
    const panel = (cx: number, cy: number, w: number, h: number) => b.box("panels", "Raised panels", w, h, T + 0.012, pm, lx + cx, cy, 0, false);
    if (style === "two") { panel(0, H * 0.28, W * 0.62, H * 0.3); panel(0, H * 0.7, W * 0.62, H * 0.38); }
    if (style === "four") for (const [cy, h] of [[H * 0.18, H * 0.2], [H * 0.44, H * 0.26], [H * 0.72, H * 0.2]] as const) for (const cx of [-W * 0.2, W * 0.2]) panel(cx, cy, W * 0.3, h);
    if (style === "glazed") b.box("glass", "Glazing", W * 0.6, H * 0.4, 0.014, gm, lx, H * 0.68, 0, false);
    if (v.sidelight) b.box("glass", "Glazing", side - 0.06, H - 0.3, 0.014, gm, left ? side / 2 + W / 2 - side / 2 + 0 : -(W / 2), H / 2, 0, false).position.x = left ? W / 2 : -W / 2;
    if (v.handle) { const hx = lx + (left ? 1 : -1) * (W / 2 - 0.09); b.box("handle", "Handle and lock", 0.14, 0.025, 0.05, darkMat(0xc9ccd0), hx - (left ? 0.05 : -0.05), 1.0, T / 2 + 0.03, false); b.box("handle", "Handle and lock", 0.05, 0.1, 0.02, darkMat(0xc9ccd0), hx, 1.0, T / 2 + 0.012, false); }
    for (const y of [0.25, H / 2, H - 0.25]) { const hxx = lx + (left ? -1 : 1) * (W / 2); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), darkMat(0x9aa1a6)); m.position.set(hxx, y, 0); m.userData.id = "hinges"; b.parts.hinges = "Hinges"; b.group.add(m); }
    // swing arc on the floor
    const pts: THREE.Vector3[] = [], hx = lx + (left ? -W / 2 : W / 2);
    for (let a = 0; a <= 90; a += 6) { const r = (a * Math.PI) / 180; pts.push(new THREE.Vector3(hx + (left ? 1 : -1) * Math.sin(r) * W, 0.01, Math.cos(r) * W)); }
    b.line([new THREE.Vector3(hx, 0.01, 0), ...pts]);
    return { group: b.group, parts: b.parts };
  },
  validate(v) {
    const w: string[] = [];
    if (N(v, "width") < 800 && !v.sidelight) w.push("Leaf width under 800 mm does not give accessible clear opening.");
    if (S(v, "style") === "glazed" && N(v, "thick") < 44) w.push("Glazed leaves need at least 44 mm thickness.");
    if (S(v, "material") === "timber" && N(v, "height") > 2300 && N(v, "thick") < 50) w.push("Tall timber leaves should be 50 mm thick or more.");
    if (S(v, "material") === "upvc" && N(v, "width") > 1000) w.push("uPVC leaves wider than 1000 mm need steel reinforcement.");
    return w;
  },
  quantities(v) {
    const W = mm(N(v, "width")), H = mm(N(v, "height")), T = mm(N(v, "thick"));
    return [["Leaf area", `${(W * H).toFixed(2)} m²`], ["Leaf volume", `${(W * H * T).toFixed(3)} m³`], ["Clear opening", `${(N(v, "width") - 60).toFixed(0)} mm`], ["Hinges", "3"], ["Side light", v.sidelight ? "Yes" : "No"]];
  },
};

/* --------------------------------------------------------------- shelving */
const shelfDef: CompDef = {
  id: "shelving", code: "SHF", name: "Modular shelving unit", category: "Furniture", desc: "Carcass, adjustable shelves, back panel and doors.",
  params: [
    { k: "width", label: "Width", type: "range", min: 600, max: 2400, step: 50, unit: " mm" },
    { k: "height", label: "Height", type: "range", min: 800, max: 2400, step: 50, unit: " mm" },
    { k: "depth", label: "Depth", type: "range", min: 250, max: 600, step: 10, unit: " mm" },
    { k: "shelves", label: "Number of shelves", type: "range", min: 1, max: 10, step: 1 },
    { k: "board", label: "Board thickness", type: "range", min: 16, max: 30, step: 2, unit: " mm" },
    { k: "material", label: "Material", type: "select", options: [["timber", "Oak veneer"], ["upvc", "Laminate"], ["steel", "Steel"], ["aluminium", "Aluminium"]] },
    { k: "color", label: "Colour", type: "color", swatches: ["#d8b48a", "#f2f2ee", "#3b3f42", "#7a5a3a", "#2f4a3a"] },
    { k: "back", label: "Back panel", type: "toggle" },
    { k: "doors", label: "Doors on lower half", type: "toggle" },
    { k: "plinth", label: "Plinth", type: "toggle" },
  ],
  presets: {
    Standard: { width: 1200, height: 1800, depth: 350, shelves: 5, board: 22, material: "timber", color: "#d8b48a", back: true, doors: false, plinth: true },
    Compact: { width: 800, height: 1000, depth: 300, shelves: 2, board: 18, material: "upvc", color: "#f2f2ee", back: true, doors: true, plinth: false },
    Premium: { width: 2000, height: 2200, depth: 450, shelves: 8, board: 28, material: "timber", color: "#7a5a3a", back: true, doors: true, plinth: true },
  },
  build(v) {
    const b = new Builder(), W = mm(N(v, "width")), H = mm(N(v, "height")), D = mm(N(v, "depth")), T = mm(N(v, "board")), m = bodyMat(v), n = N(v, "shelves");
    const pl = v.plinth ? 0.08 : 0, h0 = pl, inH = H - pl;
    b.box("sides", "Side panels", T, inH, D, m, -W / 2 + T / 2, h0 + inH / 2, 0); b.box("sides", "Side panels", T, inH, D, m, W / 2 - T / 2, h0 + inH / 2, 0);
    b.box("top", "Top and bottom", W, T, D, m, 0, h0 + inH - T / 2, 0); b.box("top", "Top and bottom", W, T, D, m, 0, h0 + T / 2, 0);
    const span = inH - 2 * T;
    for (let i = 1; i <= n; i++) b.box("shelves", "Shelves", W - 2 * T, T, D - 0.02, m, 0, h0 + T + (span * i) / (n + 1), 0.01);
    if (v.back) b.box("back", "Back panel", W - 2 * T, inH - 2 * T, 0.006, bodyMat({ ...v, color: "#8a7a68" }), 0, h0 + inH / 2, -D / 2 + 0.003);
    if (pl) b.box("plinth", "Plinth", W - 0.06, pl, D - 0.06, darkMat(0x2a2f2c), 0, pl / 2, 0);
    if (v.doors) { const dh = (inH - 2 * T) * 0.45; for (const sx of [-1, 1]) { b.box("doors", "Doors", (W - 2 * T) / 2 - 0.003, dh, 0.018, m, sx * ((W - 2 * T) / 4), h0 + T + dh / 2, D / 2 + 0.009); b.box("handle", "Handles", 0.012, 0.1, 0.02, darkMat(0xc9ccd0), sx * 0.04, h0 + T + dh * 0.8, D / 2 + 0.028, false); } }
    return { group: b.group, parts: b.parts };
  },
  validate(v) {
    const w: string[] = [], span = N(v, "width") - 2 * N(v, "board"), sag = (N(v, "board") <= 18 && span > 900) || (N(v, "board") <= 22 && span > 1100) || (span > 1400 && N(v, "board") < 28);
    if (sag) w.push(`Shelf span of ${span.toFixed(0)} mm with ${N(v, "board")} mm boards may sag under load. Increase thickness or reduce the width.`);
    const gap = (N(v, "height") - (v.plinth ? 80 : 0) - 2 * N(v, "board")) / (N(v, "shelves") + 1) - N(v, "board");
    if (gap < 150) w.push(`The gap between shelves is only ${gap.toFixed(0)} mm. Reduce the number of shelves.`);
    if (N(v, "height") / N(v, "depth") > 7) w.push("This unit is tall and shallow; fix it to the wall to prevent tipping.");
    return w;
  },
  quantities(v) {
    const W = mm(N(v, "width")), H = mm(N(v, "height")), D = mm(N(v, "depth")), T = mm(N(v, "board")), n = N(v, "shelves");
    const boards = 2 * H * D + 2 * W * D + n * (W - 2 * T) * D;
    return [["Board area", `${boards.toFixed(2)} m²`], ["Boards", String(4 + n)], ["Shelf clear gap", `${(((H - (v.plinth ? 0.08 : 0) - 2 * T) / (n + 1) - T) * 1000).toFixed(0)} mm`], ["Doors", v.doors ? "2" : "0"], ["Volume", `${(W * H * D).toFixed(2)} m³`]];
  },
};

/* ---------------------------------------------------------------- stairs */
const stairDef: CompDef = {
  id: "stair", code: "STR", name: "Staircase", category: "Circulation", desc: "Steps from floor-to-floor height, stringers and handrail.",
  params: [
    { k: "rise", label: "Floor-to-floor height", type: "range", min: 2400, max: 3300, step: 50, unit: " mm" },
    { k: "going", label: "Tread depth (going)", type: "range", min: 200, max: 320, step: 5, unit: " mm" },
    { k: "width", label: "Stair width", type: "range", min: 800, max: 1400, step: 50, unit: " mm" },
    { k: "stringer", label: "Stringer", type: "select", options: [["closed", "Closed stringers"], ["open", "Open (central)"]] },
    { k: "rail", label: "Handrail", type: "select", options: [["none", "None"], ["left", "Left"], ["both", "Both sides"]] },
    { k: "risers", label: "Closed risers", type: "toggle" },
    { k: "material", label: "Material", type: "select", options: MATERIAL_OPTS },
    { k: "color", label: "Colour", type: "color", swatches: ["#c9b79a", "#7a5a3a", "#3b3f42", "#f2f2ee", "#2f4a3a"] },
  ],
  presets: {
    Standard: { rise: 2700, going: 250, width: 1000, stringer: "closed", rail: "left", risers: true, material: "timber", color: "#c9b79a" },
    Compact: { rise: 2500, going: 220, width: 800, stringer: "open", rail: "left", risers: false, material: "steel", color: "#3b3f42" },
    Premium: { rise: 3000, going: 280, width: 1300, stringer: "open", rail: "both", risers: false, material: "timber", color: "#7a5a3a" },
  },
  build(v) {
    const b = new Builder(), R = mm(N(v, "rise")), G = mm(N(v, "going")), Wd = mm(N(v, "width")), n = Math.round(R / 0.18), r = R / n, m = bodyMat(v), steel = darkMat(0x2b3430);
    for (let i = 0; i < n - 1; i++) {
      b.box("treads", "Treads", Wd, 0.04, G + 0.03, m, 0, (i + 1) * r - 0.02, -i * G - G / 2);
      if (v.risers) b.box("risers", "Risers", Wd, r - 0.04, 0.02, m, 0, i * r + r / 2 - 0.0, -i * G + 0.01);
    }
    const run = (n - 1) * G, len = Math.hypot(run, R - r), ang = Math.atan2(R - r, run);
    const stringer = (x: number, w: number) => { const s = b.box("stringers", "Stringers", w, 0.22, len, steel, x, (R - r) / 2 - 0.08, -run / 2 + G / 2 - 0.1); s.rotation.x = ang; };
    if (S(v, "stringer") === "closed") { stringer(-Wd / 2 - 0.02, 0.04); stringer(Wd / 2 + 0.02, 0.04); } else stringer(0, 0.14);
    const rails = S(v, "rail") === "both" ? [-1, 1] : S(v, "rail") === "left" ? [-1] : [];
    for (const sx of rails) {
      const x = sx * (Wd / 2 + 0.03);
      for (let i = 0; i < n - 1; i += 2) b.box("handrail", "Handrail and posts", 0.04, 0.9, 0.04, steel, x, (i + 1) * r + 0.43, -i * G - G / 2, false);
      const h = b.box("handrail", "Handrail and posts", 0.05, 0.05, len, bodyMat({ ...v, color: S(v, "color") }), x, (R - r) / 2 + 0.92, -run / 2 + G / 2); h.rotation.x = ang;
    }
    b.box("landing", "Upper landing", Wd + 0.4, 0.2, 0.9, steel, 0, R - 0.1, -run - 0.3, false);
    return { group: b.group, parts: b.parts };
  },
  validate(v) {
    const w: string[] = [], n = Math.round(N(v, "rise") / 180), r = N(v, "rise") / n, g = N(v, "going");
    if (r > 200) w.push(`Riser height ${r.toFixed(0)} mm exceeds 200 mm.`);
    if (r < 150) w.push(`Riser height ${r.toFixed(0)} mm is below 150 mm.`);
    const f = 2 * r + g; if (f < 550 || f > 700) w.push(`2 × riser + going = ${f.toFixed(0)} mm is outside the comfortable 550–700 mm range.`);
    if (N(v, "width") < 900 && S(v, "rail") === "none") w.push("Narrow stairs without a handrail are not recommended.");
    return w;
  },
  quantities(v) {
    const n = Math.round(N(v, "rise") / 180), r = N(v, "rise") / n;
    return [["Risers", String(n)], ["Treads", String(n - 1)], ["Riser height", `${r.toFixed(1)} mm`], ["Total run", `${((n - 1) * N(v, "going") / 1000).toFixed(2)} m`], ["Tread area", `${((n - 1) * mm(N(v, "going")) * mm(N(v, "width"))).toFixed(2)} m²`]];
  },
};

/* ---------------------------------------------------------------- façade */
const facadeDef: CompDef = {
  id: "facade", code: "FCD", name: "Façade panel", category: "Envelope", desc: "Framed grid with glass, solid or louvre infill.",
  params: [
    { k: "width", label: "Panel width", type: "range", min: 1200, max: 3000, step: 50, unit: " mm" },
    { k: "height", label: "Panel height", type: "range", min: 2400, max: 3600, step: 50, unit: " mm" },
    { k: "depth", label: "Frame depth", type: "range", min: 120, max: 300, step: 10, unit: " mm" },
    { k: "cols", label: "Columns", type: "range", min: 1, max: 6, step: 1 },
    { k: "rows", label: "Rows", type: "range", min: 1, max: 8, step: 1 },
    { k: "infill", label: "Infill", type: "select", options: [["glass", "Glass"], ["solid", "Solid panel"], ["louvre", "Louvres"], ["mixed", "Glass and solid"]] },
    { k: "material", label: "Frame material", type: "select", options: [["aluminium", "Aluminium"], ["steel", "Powder-coated steel"], ["timber", "Timber"], ["upvc", "uPVC"]] },
    { k: "color", label: "Frame colour", type: "color", swatches: ["#3b3f42", "#c9ccd0", "#2f4a3a", "#f2f2ee", "#7a5a3a"] },
  ],
  presets: {
    Standard: { width: 2000, height: 3000, depth: 180, cols: 3, rows: 4, infill: "glass", material: "aluminium", color: "#3b3f42" },
    Compact: { width: 1400, height: 2600, depth: 140, cols: 2, rows: 3, infill: "solid", material: "steel", color: "#c9ccd0" },
    Premium: { width: 2800, height: 3400, depth: 240, cols: 5, rows: 6, infill: "mixed", material: "aluminium", color: "#2f4a3a" },
  },
  build(v) {
    const b = new Builder(), W = mm(N(v, "width")), H = mm(N(v, "height")), D = mm(N(v, "depth")), c = N(v, "cols"), r = N(v, "rows"), fm = bodyMat(v), gm = glassMat(), t = 0.06;
    b.box("frame", "Outer frame", W, t, D, fm, 0, t / 2, 0); b.box("frame", "Outer frame", W, t, D, fm, 0, H - t / 2, 0); b.box("frame", "Outer frame", t, H, D, fm, -W / 2 + t / 2, H / 2, 0); b.box("frame", "Outer frame", t, H, D, fm, W / 2 - t / 2, H / 2, 0);
    for (let i = 1; i < c; i++) b.box("mullions", "Mullions", 0.05, H - 2 * t, D * 0.9, fm, -W / 2 + (W * i) / c, H / 2, 0);
    for (let j = 1; j < r; j++) b.box("transoms", "Transoms", W - 2 * t, 0.05, D * 0.9, fm, 0, (H * j) / r, 0);
    const cw = (W - 2 * t) / c - 0.05, ch = (H - 2 * t) / r - 0.05, infill = S(v, "infill");
    for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) {
      const x = -W / 2 + t + ((i + 0.5) * (W - 2 * t)) / c, y = t + ((j + 0.5) * (H - 2 * t)) / r, solid = infill === "solid" || (infill === "mixed" && (i + j) % 2 === 1);
      if (infill === "louvre") { const k = Math.max(3, Math.round(ch / 0.09)); for (let q = 0; q < k; q++) { const l = b.box("louvres", "Louvres", cw, 0.012, D * 0.8, fm, x, y - ch / 2 + ((q + 0.5) * ch) / k, 0, false); l.rotation.x = -0.5; } }
      else if (solid) b.box("infill", "Solid panels", cw, ch, 0.05, bodyMat({ ...v, material: "upvc", color: "#cfd3d0" }), x, y, 0);
      else b.box("glass", "Glass infill", cw, ch, 0.024, gm, x, y, 0, false);
    }
    return { group: b.group, parts: b.parts };
  },
  validate(v) {
    const w: string[] = [], cw = (N(v, "width") / N(v, "cols")), ch = N(v, "height") / N(v, "rows");
    if (cw < 400) w.push(`Modules are ${cw.toFixed(0)} mm wide; the minimum is 400 mm. Reduce the columns.`);
    if (ch < 400) w.push(`Modules are ${ch.toFixed(0)} mm high; the minimum is 400 mm. Reduce the rows.`);
    if (S(v, "infill") === "glass" && cw * ch > 3_000_000) w.push("Glass modules larger than 3 m² need specialist glazing.");
    return w;
  },
  quantities(v) {
    const W = mm(N(v, "width")), H = mm(N(v, "height")), c = N(v, "cols"), r = N(v, "rows");
    return [["Modules", String(c * r)], ["Module size", `${(N(v, "width") / c).toFixed(0)} × ${(N(v, "height") / r).toFixed(0)} mm`], ["Infill area", `${((W - 0.12) * (H - 0.12)).toFixed(2)} m²`], ["Mullion length", `${((c - 1) * (H - 0.12) + (r - 1) * (W - 0.12)).toFixed(2)} m`], ["Infill", S(v, "infill")]];
  },
};

export const COMPONENTS: CompDef[] = [windowDef, doorDef, shelfDef, stairDef, facadeDef];

/** Dimension overlay: three measured lines with millimetre labels, added to a built group. */
export function addDimensions(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group), s = box.getSize(new THREE.Vector3()), mn = box.min, mx = box.max;
  const out = new THREE.Group(); out.userData.dim = true;
  const label = (text: string, p: THREE.Vector3, scale: number) => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d")!;
    g.fillStyle = "rgba(10,15,12,0.85)"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#9be26b"; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.set(scale * 4, scale, 1); sp.position.copy(p); sp.renderOrder = 10; out.add(sp);
  };
  const line = (a: THREE.Vector3, b: THREE.Vector3) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x9be26b, depthTest: false })); l.renderOrder = 9; out.add(l); };
  const off = Math.max(s.x, s.y, s.z) * 0.1 + 0.05, sc = Math.max(s.x, s.y) * 0.07 + 0.04;
  const zf = mx.z + off * 0.6;
  line(new THREE.Vector3(mn.x, mn.y - off, zf), new THREE.Vector3(mx.x, mn.y - off, zf)); label(`${(s.x * 1000).toFixed(0)} mm`, new THREE.Vector3((mn.x + mx.x) / 2, mn.y - off * 1.6, zf), sc);
  line(new THREE.Vector3(mn.x - off, mn.y, zf), new THREE.Vector3(mn.x - off, mx.y, zf)); label(`${(s.y * 1000).toFixed(0)} mm`, new THREE.Vector3(mn.x - off * 2.4, (mn.y + mx.y) / 2, zf), sc);
  line(new THREE.Vector3(mx.x + off, mn.y - off, mn.z), new THREE.Vector3(mx.x + off, mn.y - off, mx.z)); label(`${(s.z * 1000).toFixed(0)} mm`, new THREE.Vector3(mx.x + off * 1.2, mn.y - off * 1.6, (mn.z + mx.z) / 2), sc);
  group.add(out); return { size: s, center: box.getCenter(new THREE.Vector3()) };
}
