/** Regenerates the SYNTHETIC test photos in public/foot/samples (npx tsx scripts/make-foot-samples.ts). They are rendered, not photographed. */
import sharp from "sharp";
import { boxBlur, renderScene } from "../src/lib/foot/synthetic";

const out = "public/foot/samples";
const base = { footHeightMm: 25, noise: 3 };
const jobs: [string, Parameters<typeof renderScene>[0], number?][] = [
  ["synthetic-right-254x97.jpg", { ...base, footLengthMm: 254, footWidthMm: 97, side: "right", yawDeg: 3, pitchDeg: 4, rollDeg: -2, seed: 3 }],
  ["synthetic-left-257x99.jpg", { ...base, footLengthMm: 257, footWidthMm: 99, side: "left", yawDeg: -3, pitchDeg: 3, rollDeg: 3, seed: 5 }],
  ["synthetic-right-letter-243x93.jpg", { ...base, footLengthMm: 243, footWidthMm: 93, side: "right", paper: "letter", yawDeg: 5, seed: 8 }],
  ["bad-too-dark.jpg", { ...base, footLengthMm: 254, footWidthMm: 97, brightness: 0.3, seed: 4 }],
  ["bad-blurry.jpg", { ...base, footLengthMm: 254, footWidthMm: 97, blurPx: 9, seed: 6 }],
  ["bad-white-sock.jpg", { ...base, footLengthMm: 254, footWidthMm: 97, footRgb: [236, 234, 230], seed: 9 }],
];
(async () => {
for (const [name, o] of jobs) { const s = renderScene({ w: 1280, h: 960, ...o }); await sharp(Buffer.from(s.img.data), { raw: { width: s.img.w, height: s.img.h, channels: 3 } }).jpeg({ quality: 86 }).toFile(`${out}/${name}`); console.log("wrote", name); }
// no paper at all: floor texture only
const nf = renderScene({ w: 1280, h: 960, footLengthMm: 254, footWidthMm: 97, paperShift: { x: 4000, y: 0 }, seed: 2 });
await sharp(Buffer.from(boxBlur(nf.img, 1).data), { raw: { width: 1280, height: 960, channels: 3 } }).jpeg({ quality: 80 }).toFile(`${out}/bad-no-paper.jpg`); console.log("wrote bad-no-paper.jpg");
})();
