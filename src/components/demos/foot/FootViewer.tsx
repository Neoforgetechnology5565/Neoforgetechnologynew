"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SideResult } from "@/lib/foot/api-types";
import { measureMesh, parseObj } from "@/lib/foot/mesh";
import type { Pt, Side } from "@/lib/foot/types";
import Stage3D, { type StageCtx } from "../Stage3D";

export type ViewerModel =
  | { kind: "inferred"; side: Side; result: SideResult }
  | { kind: "obj"; side: Side; text: string; unit: "mm" | "cm" | "m"; filename: string };

const LABEL = {
  inferred: { tag: "Inferred geometry", tone: "bg-amber-500/90 text-black", text: "The outline and the length/width lines are measured from the photo. The height of the foot is NOT measured: it is a generic estimated profile drawn only to give the outline a body." },
  sample: { tag: "Sample visualization", tone: "bg-fuchsia-500/90 text-white", text: "Built from a synthetic sample photo. Not a real foot." },
  obj: { tag: "Imported model", tone: "bg-sky-500/90 text-black", text: "Your own OBJ file shown as provided, scaled with the unit you declared. The platform did not reconstruct it." },
} as const;

function sprite(text: string, color = "#065f46") {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d")!; g.fillStyle = "rgba(255,255,255,.92)"; g.fillRect(0, 0, 256, 64); g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 253, 61); g.fillStyle = color; g.font = "bold 30px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(44, 11, 1); s.renderOrder = 10; return s;
}
function line(a: THREE.Vector3, b: THREE.Vector3, color: number) { const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 9; return l; }
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const PROFILE: [number, number][] = [[0, 42], [0.18, 58], [0.4, 62], [0.6, 40], [0.8, 28], [1, 15]];
const hProfile = (t: number) => { for (let i = 1; i < PROFILE.length; i++) if (t <= PROFILE[i][0]) { const [t0, v0] = PROFILE[i - 1], [t1, v1] = PROFILE[i]; return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0)); } return 15; };
function inPoly(poly: Pt[], x: number, y: number) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; }
function distToPoly(poly: Pt[], x: number, y: number) { let d = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j], b = poly[i]; const dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(x - a.x - t * dx, y - a.y - t * dy)); } return d; }

function buildInferred(r: SideResult): { group: THREE.Group; radius: number } {
  const g = new THREE.Group(); const hv = r.axis.heel, tv = r.axis.toe; const ang = Math.atan2(tv.y - hv.y, tv.x - hv.x); const cx = (hv.x + tv.x) / 2, cy = (hv.y + tv.y) / 2; const ca = Math.cos(-ang), sa = Math.sin(-ang);
  const tf = (p: Pt): Pt => ({ x: (p.x - cx) * ca - (p.y - cy) * sa, y: (p.x - cx) * sa + (p.y - cy) * ca });
  const poly = r.outlineMm.map(tf); const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); const step = 2; const nx = Math.ceil((x1 - x0) / step) + 2, ny = Math.ceil((y1 - y0) / step) + 2;
  const H = new Float32Array(nx * ny), IN = new Uint8Array(nx * ny); const pos: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = x0 + (i - 1) * step, y = y0 + (j - 1) * step; const inside = inPoly(poly, x, y); IN[j * nx + i] = inside ? 1 : 0; let h = 0; if (inside) { const d = distToPoly(poly, x, y); h = hProfile((x - x0) / (x1 - x0 || 1)) * Math.pow(smooth(d / 16), 0.7) + 0.4; } H[j * nx + i] = h; pos.push(x, h, y); }
  const idx: number[] = []; for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; if (IN[a] || IN[b] || IN[c] || IN[d]) idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd9b89a, roughness: 0.85, metalness: 0, side: THREE.DoubleSide })));
  const o = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map((p) => new THREE.Vector3(p.x, 0.6, p.y))), new THREE.LineBasicMaterial({ color: 0x065f46 })); g.add(o);
  // measurement overlays (these ARE measured)
  const L = line(new THREE.Vector3(x0, 1, y1 + 8), new THREE.Vector3(x1, 1, y1 + 8), 0x059669); g.add(L); const ls = sprite(`${r.lengthMm.toFixed(1)} mm`); ls.position.set((x0 + x1) / 2, 6, y1 + 18); g.add(ls);
  const wa = tf(r.axis.widestA), wb = tf(r.axis.widestB); g.add(line(new THREE.Vector3(wa.x, 1, wa.y), new THREE.Vector3(wb.x, 1, wb.y), 0xd97706)); const ws = sprite(`${r.widthMm.toFixed(1)} mm`, "#92400e"); ws.position.set(wa.x, 6, (wa.y + wb.y) / 2 - 14); g.add(ws);
  const plane = new THREE.GridHelper(Math.max(x1 - x0, y1 - y0) * 1.6, 16, 0x94a3b8, 0xcbd5e1); plane.position.y = -0.2; (plane.material as THREE.Material).transparent = true; (plane.material as THREE.Material).opacity = 0.5; g.add(plane);
  return { group: g, radius: Math.max(x1 - x0, y1 - y0) / 2 + 20 };
}
function buildObj(m: Extract<ViewerModel, { kind: "obj" }>): { group: THREE.Group; radius: number; note: string } {
  const data = parseObj(m.text); const meas = measureMesh(data, m.unit); const k = m.unit === "mm" ? 1 : m.unit === "cm" ? 10 : 1000; const [a0, a1, a2] = meas.axes; const c = meas.centre; const pos = new Float32Array(data.vertexCount * 3);
  let minY = Infinity; for (let i = 0; i < data.vertexCount; i++) { const d = [0, 1, 2].map((q) => data.positions[i * 3 + q] - c[q]); const L = (d[0] * a0[0] + d[1] * a0[1] + d[2] * a0[2]) * k, W = (d[0] * a1[0] + d[1] * a1[1] + d[2] * a1[2]) * k, T = (d[0] * a2[0] + d[1] * a2[1] + d[2] * a2[2]) * k; pos[i * 3] = L; pos[i * 3 + 1] = T; pos[i * 3 + 2] = W; if (T < minY) minY = T; }
  for (let i = 0; i < data.vertexCount; i++) pos[i * 3 + 1] -= minY;
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(data.indices, 1)); geo.computeVertexNormals();
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xc9d6df, roughness: 0.7, side: THREE.DoubleSide, flatShading: false })));
  const hl = meas.lengthMm / 2, hw = meas.widthMm / 2; g.add(line(new THREE.Vector3(-hl, 1, hw + 8), new THREE.Vector3(hl, 1, hw + 8), 0x059669)); const ls = sprite(`${meas.lengthMm.toFixed(1)} mm`); ls.position.set(0, 6, hw + 18); g.add(ls);
  g.add(line(new THREE.Vector3(hl * 0.2, 1, -hw), new THREE.Vector3(hl * 0.2, 1, hw), 0xd97706)); const ws = sprite(`${meas.widthMm.toFixed(1)} mm`, "#92400e"); ws.position.set(hl * 0.2, 6, -hw - 14); g.add(ws);
  return { group: g, radius: Math.max(meas.lengthMm, meas.widthMm) / 2 + 20, note: `${meas.vertexCount.toLocaleString()} vertices · ${meas.faceCount.toLocaleString()} faces · height ${meas.heightMm} mm (principal-axis box)` };
}

export default function FootViewer({ model, className = "h-[26rem]" }: { model: ViewerModel | null; className?: string }) {
  const [ctx, setCtx] = useState<StageCtx | null>(null); const content = useRef<THREE.Group | null>(null); const [radius, setRadius] = useState(150); const [err, setErr] = useState(""); const [note, setNote] = useState("");
  const kind: keyof typeof LABEL | null = !model ? null : model.kind === "obj" ? "obj" : model.result.sample ? "sample" : "inferred";
  const home = useMemo(() => ({ pos: [0, radius * 1.5, radius * 1.7] as [number, number, number], target: [0, 10, 0] as [number, number, number] }), [radius]);

  useEffect(() => {
    if (!ctx) return; if (content.current) { ctx.scene.remove(content.current); content.current.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); content.current = null; }
    setErr(""); setNote(""); if (!model) { ctx.invalidate(); return; }
    try {
      if (!ctx.scene.userData.lit) { ctx.scene.userData.lit = true; ctx.scene.background = new THREE.Color(0xf4f1ea); ctx.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a0, 1.15)); const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(120, 260, 140); ctx.scene.add(d); }
      const built = model.kind === "inferred" ? buildInferred(model.result) : buildObj(model); content.current = built.group; ctx.scene.add(built.group); setRadius(built.radius); if ("note" in built) setNote(String(built.note));
      ctx.goto({ pos: [0, built.radius * 1.5, built.radius * 1.7], target: [0, 10, 0] });
    } catch (e) { setErr((e as Error).message); }
    ctx.invalidate();
  }, [ctx, model]);

  const view = (v: "top" | "front" | "side" | "iso") => { if (!ctx) return; const R = radius * 2.1; const p: Record<string, [number, number, number]> = { top: [0, R * 1.15, 0.001], front: [R, 40, 0], side: [0, 40, R], iso: [R * 0.55, R * 0.75, R * 0.85] }; ctx.goto({ pos: p[v], target: [0, 10, 0] }); };
  const btn = "rounded-md border border-slate-600 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white";
  return (
    <div>
      <Stage3D home={home} className={className} label="3D view of the measured foot" onReady={setCtx}
        toolbar={<>{(["top", "front", "side", "iso"] as const).map((v) => <button key={v} type="button" className={btn} onClick={() => view(v)}>{v === "iso" ? "3D" : v[0].toUpperCase() + v.slice(1)}</button>)}</>}>
        {kind && <p className={`pointer-events-none absolute right-2 top-2 z-10 rounded px-2 py-1 text-xs font-semibold ${LABEL[kind].tone}`}>{LABEL[kind].tag}</p>}
        {!model && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400">Measure a foot or import an OBJ scan to see it here.</p>}
        {err && <p className="absolute inset-x-4 bottom-10 z-10 rounded bg-red-900/80 p-2 text-sm text-red-100">{err}</p>}
      </Stage3D>
      {kind && <p className="mt-2 text-sm text-stone-600"><b className="text-stone-800">{LABEL[kind].tag}.</b> {LABEL[kind].text}{note && <> {note}.</>}</p>}
    </div>
  );
}
