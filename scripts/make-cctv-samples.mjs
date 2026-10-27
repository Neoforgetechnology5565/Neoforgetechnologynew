#!/usr/bin/env node
/**
 * Renders the two SYNTHETIC CCTV sample clips (public/cctv/*.mp4) and their ground-truth annotations (*.json).
 * Everything is drawn from simple shapes: no real people, vehicles or footage, nothing to license.
 * The annotations are the exact boxes used to draw each shape, i.e. reference data, not model output.
 *   node scripts/make-cctv-samples.mjs
 */
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 640, H = 360, FPS = 25, ANN_FPS = 4;
const lerp = (a, b, k) => a + (b - a) * k;
/** Piecewise-linear path: [[t, x, y], …]; returns null outside its time span. Boxes are [left, top] of a w×h normalised box. */
const path = (pts) => (t) => {
  if (t < pts[0][0] || t > pts.at(-1)[0]) return null;
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, x0, y0] = pts[i - 1], [t1, x1, y1] = pts[i]; const k = (t - t0) / (t1 - t0 || 1); return [lerp(x0, x1, k), lerp(y0, y1, k)]; }
};
const mk = (cls, w, h, p, sway = 0) => ({ cls, w, h, at: (t) => { const q = p(t); if (!q) return null; const s = sway ? Math.sin(t * 2.2) * sway : 0; return [q[0] + s, q[1]]; } });
const person = (p, sway) => mk("person", 0.05, 0.24, p, sway), car = (p) => mk("car", 0.17, 0.13, p), truck = (p) => mk("truck", 0.24, 0.17, p);

const SCENES = {
  "gate-crossing": {
    duration: 12, title: "SYNTHETIC SAMPLE · gate crossing", gate: true,
    objects: [person(path([[1, -0.06, 0.62], [10, 1.02, 0.62]])), person(path([[3, 1.02, 0.66], [11, -0.06, 0.66]])), car(path([[2, -0.18, 0.45], [6, 1.02, 0.45]])), truck(path([[7, 1.02, 0.40], [11.8, -0.26, 0.40]]))],
    suggested: { lines: [{ id: "gate", name: "Gate line", a: { x: 0.5, y: 0.3 }, b: { x: 0.5, y: 0.95 }, classes: [] }], zones: [] },
  },
  "loading-bay": {
    duration: 14, title: "SYNTHETIC SAMPLE · restricted bay", zone: true,
    objects: [person(path([[2, 0.9, 0.62], [5, 0.34, 0.62], [11, 0.34, 0.62], [13.5, 1.02, 0.62]]), 0.004), person(path([[1, 1.02, 0.17], [8, -0.06, 0.17]])), truck(path([[5, 1.05, 0.25], [13.9, -0.3, 0.25]])), car(path([[8.5, -0.2, 0.68], [11, 0.2, 0.68], [14, 0.2, 0.68]]))],
    suggested: { zones: [{ id: "bay", name: "Restricted bay", points: [{ x: 0.12, y: 0.45 }, { x: 0.62, y: 0.45 }, { x: 0.62, y: 0.98 }, { x: 0.12, y: 0.98 }], classes: [], dwellSeconds: 4 }], lines: [] },
  },
};

const col = { person: "#e0a94a", car: "#4a7fb0", truck: "#7a8a52" };
function svg(sc, t) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4654"/><stop offset="1" stop-color="#232a33"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/><rect y="${H * 0.36}" width="${W}" height="${H * 0.64}" fill="#2c323a"/>
<g stroke="#586270" stroke-width="2" stroke-dasharray="18 14"><line x1="0" y1="${H * 0.62}" x2="${W}" y2="${H * 0.62}"/></g>`;
  if (sc.zone) s += `<rect x="${W * 0.12}" y="${H * 0.45}" width="${W * 0.5}" height="${H * 0.53}" fill="none" stroke="#c0a030" stroke-width="2" stroke-dasharray="6 6" opacity="0.5"/>`;
  if (sc.gate) s += `<rect x="${W * 0.5 - 2}" y="${H * 0.28}" width="4" height="${H * 0.7}" fill="#586270" opacity="0.45"/>`;
  for (const o of sc.objects) {
    const p = o.at(t); if (!p) continue;
    const x = p[0] * W, y = p[1] * H, w = o.w * W, h = o.h * H, c = col[o.cls];
    if (o.cls === "person") s += `<ellipse cx="${x + w / 2}" cy="${y + h * 0.12}" rx="${w * 0.28}" ry="${h * 0.1}" fill="#d9b48f"/><rect x="${x + w * 0.1}" y="${y + h * 0.24}" width="${w * 0.8}" height="${h * 0.5}" rx="6" fill="${c}"/><rect x="${x + w * 0.18}" y="${y + h * 0.72}" width="${w * 0.24}" height="${h * 0.28}" fill="#3d4756"/><rect x="${x + w * 0.58}" y="${y + h * 0.72}" width="${w * 0.24}" height="${h * 0.28}" fill="#3d4756"/>`;
    else s += `<rect x="${x}" y="${y + h * 0.2}" width="${w}" height="${h * 0.65}" rx="8" fill="${c}"/><rect x="${x + w * 0.14}" y="${y}" width="${w * (o.cls === "truck" ? 0.34 : 0.55)}" height="${h * 0.4}" rx="6" fill="${c}"/><rect x="${x + w * 0.2}" y="${y + h * 0.06}" width="${w * (o.cls === "truck" ? 0.2 : 0.4)}" height="${h * 0.26}" fill="#cfe3ee" opacity="0.8"/><circle cx="${x + w * 0.22}" cy="${y + h * 0.88}" r="${h * 0.14}" fill="#15191e"/><circle cx="${x + w * 0.78}" cy="${y + h * 0.88}" r="${h * 0.14}" fill="#15191e"/>`;
  }
  s += `<rect x="8" y="8" width="${sc.title.length * 7.4 + 14}" height="20" rx="4" fill="#000" opacity="0.6"/><text x="15" y="22" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#e8c860">${sc.title}</text></svg>`;
  return s;
}

mkdirSync("public/cctv", { recursive: true });
for (const [id, sc] of Object.entries(SCENES)) {
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-movflags", "+faststart", `public/cctv/${id}.mp4`], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = 0; f < sc.duration * FPS; f++) {
    const png = await sharp(Buffer.from(svg(sc, f / FPS))).png({ compressionLevel: 1 }).toBuffer();
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on("close", r));
  const frames = [];
  for (let i = 0; i < sc.duration * ANN_FPS; i++) {
    const t = i / ANN_FPS, dets = [];
    for (const o of sc.objects) {
      const p = o.at(t); if (!p) continue;
      const x0 = Math.max(0, p[0]), y0 = Math.max(0, p[1]), x1 = Math.min(1, p[0] + o.w), y1 = Math.min(1, p[1] + o.h);
      if (x1 - x0 < o.w * 0.35) continue; // mostly outside the frame
      dets.push({ cls: o.cls, conf: 1, box: [+x0.toFixed(4), +y0.toFixed(4), +(x1 - x0).toFixed(4), +(y1 - y0).toFixed(4)] });
    }
    frames.push({ i, t, dets });
  }
  writeFileSync(`public/cctv/${id}.json`, JSON.stringify({ kind: "reference-annotations", synthetic: true, note: "Ground-truth boxes of rendered shapes; not detector output.", fps: ANN_FPS, suggested: sc.suggested, frames }));
  console.log("wrote", id);
}
