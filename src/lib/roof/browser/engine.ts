"use client";
/** In-browser engine for the roof demo: same API shape as roofApi (the FastAPI service). The U-Net runs through ONNX Runtime Web; regions, outlines, rectangle fits and candidate edges are derived from the mask (a TypeScript port of services/roof-analyzer/app/geometry.py); measurements use the same measure.ts as the service-parity UI. */
import { measurePolygon, pitchFrom, resolveScale, ScaleError, type Scale } from "../measure";
import { RoofApiError, type Health } from "../api";
import type { Edge, Georef, ImageEntry, ImageResult, JobResults, JobStatus, Region, SampleInfo, ScaleDesc, XY } from "../types";
import { approxPolyDP, arcLength, boxFilter, close, components, convexHull, edges as cannyEdges, fillPoly, houghSegments, minAreaRect, open, outerContour, percentile, polyArea, type Pt } from "./cv";

const MODEL_URL = "/models/roof/roof_unet_ft.onnx", TILE = 640, OVERLAP = 96, MAX_FILE_MB = 40, MAX_IMAGES = 8, MAX_PIXELS = 24e6;
const MODEL_INFO = { architecture: "U-Net, 3 down/up levels, 7.8 M parameters, sigmoid output (binary roof / not roof)", input: "RGB image, any size; internally BGR 0-1; tiled above ~740 px (640 px tiles, 96 px overlap, in this browser engine)", base_weights: "dida roof task U-Net by Abhirup Ghosh (MIT), trained on 25 labelled 256×256 satellite images", fine_tuned_on: "SpaceNet 2 Vegas and Paris building footprints (CC BY-SA 4.0): see docs/roof/MODEL_AND_LICENSES.md for the held-out evaluation" };
const UNAVAILABLE = { ridge: "Needs 3D information or a trained line classifier. Interior edges are listed as unclassified candidates.", hip: "Same as ridge.", valley: "Same as ridge.", eave: "A nadir image cannot tell eaves from rakes. Outline edges are listed without that classification.", rake: "Same as eave.", facet: "Splitting a roof into planes needs height or slope information that one image does not contain." };
const fail = (s: number, m: string): never => { throw new RoofApiError(s, m); };
const r1 = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/* ───────── decoding ───────── */
interface Decoded { rgb: Uint8ClampedArray; w: number; h: number; georef: Georef | null; fmt: string }
async function sniffFmt(b: Blob) { const h = new Uint8Array(await b.slice(0, 16).arrayBuffer()), is = (i: number, t: string) => [...t].every((c, k) => h[i + k] === c.charCodeAt(0)); if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpg"; if (h[0] === 0x89 && is(1, "PNG")) return "png"; if (is(0, "RIFF") && is(8, "WEBP")) return "webp"; if ((is(0, "II") && h[2] === 42) || (is(0, "MM") && h[3] === 42)) return "tif"; return null; }
type Tags = Record<string, unknown>;
function geotiffGeoref(ifd: Tags): Georef | null {
  const scale = ifd.t33550 as number[] | undefined, keys = ifd.t34735 as number[] | undefined, tie = ifd.t33922 as number[] | undefined; if (!scale || !keys || scale.length < 2) return null;
  const entries = new Map<number, number>(); for (let i = 4; i + 3 < keys.length; i += 4) entries.set(keys[i], keys[i + 3]); const model = entries.get(1024), geo = entries.get(2048), proj = entries.get(3072), sx = Math.abs(scale[0]), sy = Math.abs(scale[1]);
  if (model === 2 && geo !== undefined && [4326, 4269, 4258].includes(geo)) { if (!tie || tie.length < 6) return null; const lat = tie[4], rad = Math.PI / 180, mLat = 111132.92 - 559.82 * Math.cos(2 * lat * rad) + 1.175 * Math.cos(4 * lat * rad), mLon = 111412.84 * Math.cos(lat * rad) - 93.5 * Math.cos(3 * lat * rad); return { gsd_x_m: sx * mLon, gsd_y_m: sy * mLat, crs: `EPSG:${geo}`, note: `Pixel size ${sx.toPrecision(2)}°×${sy.toPrecision(2)}° converted to metres at latitude ${lat.toFixed(3)}° (spherical-earth approximation, error well below 1 %)` }; }
  if (model === 1 && (entries.get(3076) ?? 9001) === 9001) return { gsd_x_m: sx, gsd_y_m: sy, crs: proj ? `EPSG:${proj}` : "projected", note: "Pixel size read from the GeoTIFF as metres" };
  return null;
}
async function decode(blob: Blob): Promise<Decoded> {
  const fmt0 = await sniffFmt(blob); if (!fmt0) fail(415, "Unsupported image type. Upload a JPEG, PNG, WebP or GeoTIFF image."); const fmt = fmt0 as string;
  if (fmt === "tif") {
    try { const UTIF = (await import("utif")).default, buf = await blob.arrayBuffer(), ifds = UTIF.decode(buf), ifd = ifds[0]; UTIF.decodeImage(buf, ifd); const w = ifd.width as number, h = ifd.height as number; if (w * h > MAX_PIXELS) fail(422, `The image is too large (${w}×${h}). The limit is ${MAX_PIXELS / 1e6} megapixels.`);
      const bps = ((ifd.t258 as number[] | undefined) ?? [8])[0], spp = ((ifd.t277 as number[] | undefined) ?? [3])[0], data = ifd.data as Uint8Array | undefined;
      if (bps === 16 && data && spp >= 3 && (((ifd.t284 as number[] | undefined) ?? [1])[0] === 1)) { // 16-bit chunky RGB(+): per-channel 1-99 % stretch of the non-zero values, gamma 0.8 (as the service does)
        const little = new Uint8Array(buf, 0, 2)[0] === 0x49, dv = new DataView(data.buffer, data.byteOffset, data.byteLength), out = new Uint8ClampedArray(w * h * 4);
        for (let c = 0; c < 3; c++) { const vals: number[] = []; for (let i = 0; i < w * h; i++) { const v = dv.getUint16((i * spp + c) * 2, little); if (v > 0) vals.push(v); } vals.sort((a, b) => a - b); const lo = vals[Math.floor(0.01 * (vals.length - 1))] ?? 0, hi = Math.max(lo + 1e-6, vals[Math.floor(0.99 * (vals.length - 1))] ?? 1);
          for (let i = 0; i < w * h; i++) { const v = dv.getUint16((i * spp + c) * 2, little), t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); out[i * 4 + c] = Math.round(t ** 0.8 * 255); } }
        for (let i = 0; i < w * h; i++) out[i * 4 + 3] = 255; return { rgb: out, w, h, georef: geotiffGeoref(ifd), fmt };
      }
      const rgba = UTIF.toRGBA8(ifd); return { rgb: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), w, h, georef: geotiffGeoref(ifd), fmt };
    } catch (e) { if (e instanceof RoofApiError) throw e; return fail(422, "The TIFF could not be decoded. Only 8-bit RGB / grayscale TIFF and GeoTIFF are supported in the browser."); }
  }
  let bm: ImageBitmap; try { bm = await createImageBitmap(blob); } catch { return fail(422, "The image could not be decoded. The file may be damaged."); }
  if (bm.width * bm.height > MAX_PIXELS) { bm.close(); fail(422, `The image is too large (${bm.width}×${bm.height}). The limit is ${MAX_PIXELS / 1e6} megapixels.`); }
  const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(bm, 0, 0); bm.close(); return { rgb: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, georef: null, fmt };
}
/* ───────── model ───────── */
type Ort = typeof import("onnxruntime-web/wasm"); let sess: Promise<{ ort: Ort; s: import("onnxruntime-web/wasm").InferenceSession }> | null = null;
const session = () => (sess ??= (async () => { const ort = await import("onnxruntime-web/wasm"); ort.env.wasm.wasmPaths = "/vehicle/ort/"; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; return { ort, s: await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }) }; })().catch((e) => { sess = null; throw e; }));
async function runTile(bgr: Float32Array, w: number, h: number): Promise<Float32Array> {
  const { ort, s } = await session(), W = Math.ceil(h / 16) * 16 && Math.ceil(w / 16) * 16, H = Math.ceil(h / 16) * 16, inp = new Float32Array(H * W * 3), refl = (i: number, n: number) => { while (i < 0 || i >= n) i = i < 0 ? -i : 2 * (n - 1) - i; return i; };
  for (let y = 0; y < H; y++) { const sy = refl(y, h); for (let x = 0; x < W; x++) { const sx = refl(x, w), a = (sy * w + sx) * 3, o = (y * W + x) * 3; inp[o] = bgr[a]; inp[o + 1] = bgr[a + 1]; inp[o + 2] = bgr[a + 2]; } }
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", inp, [1, H, W, 1 * 3]) }), o = out[s.outputNames[0]].data as Float32Array, res = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) res[y * w + x] = o[y * W + x]; return res;
}
async function predict(d: Decoded, scale: number, progress: (f: number) => void, cancelled: () => boolean): Promise<Float32Array> {
  let w = d.w, h = d.h, src: Uint8ClampedArray = d.rgb; if (scale !== 1) { const a = document.createElement("canvas"); a.width = d.w; a.height = d.h; a.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(d.rgb), d.w, d.h), 0, 0); const b = document.createElement("canvas"); b.width = Math.round(d.w * scale); b.height = Math.round(d.h * scale); const g = b.getContext("2d", { willReadFrequently: true })!; g.imageSmoothingQuality = "high"; g.drawImage(a, 0, 0, b.width, b.height); w = b.width; h = b.height; src = g.getImageData(0, 0, w, h).data; }
  const bgr = new Float32Array(w * h * 3); for (let i = 0; i < w * h; i++) { bgr[i * 3] = src[i * 4 + 2] / 255; bgr[i * 3 + 1] = src[i * 4 + 1] / 255; bgr[i * 3 + 2] = src[i * 4] / 255; }
  const crop = (x0: number, y0: number, x1: number, y1: number) => { const cw = x1 - x0, ch = y1 - y0, o = new Float32Array(cw * ch * 3); for (let y = 0; y < ch; y++) o.set(bgr.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x1) * 3), y * cw * 3); return o; };
  let prob: Float32Array;
  if (h <= TILE + OVERLAP && w <= TILE + OVERLAP) { prob = await runTile(bgr, w, h); progress(1); }
  else {
    prob = new Float32Array(w * h); const wsum = new Float32Array(w * h), step = TILE - OVERLAP, ramp = Float32Array.from({ length: OVERLAP }, (_, i) => Math.min(1, (i + 1) / OVERLAP)), ys: number[] = [], xs: number[] = []; for (let y = 0; y < Math.max(1, h - OVERLAP); y += step) ys.push(y); for (let x = 0; x < Math.max(1, w - OVERLAP); x += step) xs.push(x); let n = 0;
    for (const y0 of ys) for (const x0 of xs) {
      if (cancelled()) throw new Error("cancelled"); const y1 = Math.min(h, y0 + TILE), x1 = Math.min(w, x0 + TILE), y0b = Math.max(0, y1 - TILE), x0b = Math.max(0, x1 - TILE), tw = x1 - x0b, th = y1 - y0b, p = await runTile(crop(x0b, y0b, x1, y1), tw, th);
      const wy = new Float32Array(th).fill(1), wx = new Float32Array(tw).fill(1); if (y0b > 0) for (let i = 0; i < Math.min(OVERLAP, th); i++) wy[i] = ramp[i]; if (y1 < h) for (let i = 0; i < Math.min(OVERLAP, th); i++) wy[th - 1 - i] = ramp[i]; if (x0b > 0) for (let i = 0; i < Math.min(OVERLAP, tw); i++) wx[i] = ramp[i]; if (x1 < w) for (let i = 0; i < Math.min(OVERLAP, tw); i++) wx[tw - 1 - i] = ramp[i];
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const q = (y0b + y) * w + x0b + x, wg = wy[y] * wx[x]; prob[q] += p[y * tw + x] * wg; wsum[q] += wg; } n++; progress(n / (ys.length * xs.length)); await new Promise((r) => setTimeout(r, 0));
    }
    for (let i = 0; i < prob.length; i++) prob[i] /= Math.max(wsum[i], 1e-6);
  }
  if (w !== d.w || h !== d.h) { const out = new Float32Array(d.w * d.h); for (let y = 0; y < d.h; y++) { const fy = Math.min(h - 1, ((y + 0.5) * h) / d.h - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(h - 1, y0 + 1), wy = fy - y0; for (let x = 0; x < d.w; x++) { const fx = Math.min(w - 1, ((x + 0.5) * w) / d.w - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(w - 1, x0 + 1), wx = fx - x0; out[y * d.w + x] = (prob[y0 * w + x0] * (1 - wx) + prob[y0 * w + x1] * wx) * (1 - wy) + (prob[y1 * w + x0] * (1 - wx) + prob[y1 * w + x1] * wx) * wy; } } return out; }
  return prob;
}
/* ───────── geometry ───────── */
function roofRegions(prob: Float32Array, w: number, h: number, thr: number, minArea: number, simplify = 0.012) {
  let mask: Uint8Array = new Uint8Array(w * h); for (let i = 0; i < mask.length; i++) mask[i] = prob[i] > thr ? 1 : 0; mask = close(open(mask, w, h, 1), w, h, 2);
  const { labels, comps } = components(mask, w, h), loT = Math.max(0.05, thr - 0.1), hiT = Math.min(0.95, thr + 0.1), regions: Region[] = [];
  for (const c of comps) {
    if (c.area < minArea) continue; const cnt = outerContour(labels, w, h, c.id, c.x, c.y, c.w, c.h); if (!cnt.length) continue; const eps = simplify * arcLength(cnt, true), poly = approxPolyDP(cnt, eps); if (poly.length < 3) continue;
    const pm: number[] = []; for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) if (labels[y * w + x] === c.id) pm.push(prob[y * w + x]);
    const pad = 5, y0 = Math.max(0, c.y - pad), y1 = Math.min(h, c.y + c.h + pad), x0 = Math.max(0, c.x - pad), x1 = Math.min(w, c.x + c.w + pad), ww = x1 - x0, hh = y1 - y0, full = new Uint8Array(ww * hh); for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) full[y * ww + x] = labels[(y0 + y) * w + x0 + x] === c.id ? 1 : 0;
    const near = boxFilter(full, ww, hh, 4, 4, true); let aLo = 0, aHi = 0; for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) if (near[y * ww + x]) { const p = prob[(y0 + y) * w + x0 + x]; if (p > loT) aLo++; if (p > hiT) aHi++; }
    const rect = minAreaRect(poly), hull = convexHull(poly), pa = Math.max(polyArea(poly), 1), mean = pm.reduce((a, b) => a + b, 0) / pm.length;
    regions.push({ id: regions.length + 1, bbox: [c.x, c.y, c.x + c.w, c.y + c.h], mask_area_px: c.area, polygon: poly.map(([a, b]) => [r1(a, 2), r1(b, 2)] as XY), confidence: { mean_probability: r1(mean, 4), p10_probability: r1(percentile(pm, 10), 4), meaning: "Mean model output inside the region. A network score, not a calibrated probability of being a roof." },
      area_px_range_for_threshold_pm_0_1: [Math.min(aHi, c.area), Math.max(aLo, c.area)], rectangle_fit: { center: [r1(rect.center[0]), r1(rect.center[1])], size_px: [r1(Math.max(...rect.size)), r1(Math.min(...rect.size))], angle_deg: r1(rect.angle), provenance: "derived" }, solidity: r1(pa / Math.max(polyArea(hull), 1), 3),
      touches_image_border: c.x === 0 || c.y === 0 || c.x + c.w >= w || c.y + c.h >= h, provenance: { mask: "model", outline_polygon: "derived (contour simplified from the mask)" }, measurements: undefined as never, features: undefined as never });
  }
  return { regions, mask };
}
const outlineEdges = (poly: XY[]): Edge[] => poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return { p1: [r1(a[0]), r1(a[1])], p2: [r1(b[0]), r1(b[1])], length_px: r1(Math.hypot(b[0] - a[0], b[1] - a[1]), 2), angle_deg: r1((((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180 + 180) % 180), kind: "outline_edge", provenance: "derived", classification: "not determined (eave or rake cannot be told apart in a nadir image)" }; });
function interiorCandidates(edge: Uint8Array, w: number, h: number, region: Uint8Array, rectAngle: number, minLen: number, limit = 40): Edge[] {
  const inner = boxFilter(region, w, h, 3, 3, false); let n = 0; for (let i = 0; i < inner.length; i++) n += inner[i]; if (n < 100) return [];
  const out: Edge[] = [];
  for (const sg of houghSegments(edge, w, h, minLen)) {
    const [x1, y1] = sg.p1, [x2, y2] = sg.p2, L = sg.len, k = Math.max(3, Math.floor(L / 3)); let inside = 0, tot = 0, ok = true;
    for (let i = 0; i < k; i++) { const t = k === 1 ? 0 : i / (k - 1), x = Math.round(x1 + (x2 - x1) * t), y = Math.round(y1 + (y2 - y1) * t); if (x < 0 || y < 0 || x >= w || y >= h) { ok = false; break; } tot++; inside += inner[y * w + x]; } if (!ok || inside / tot < 0.9) continue;
    const ang = (((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI) % 180 + 180) % 180, rel = Math.abs((((ang - rectAngle) + 90) % 180 + 180) % 180 - 90);
    out.push({ p1: [r1(x1), r1(y1)], p2: [r1(x2), r1(y2)], length_px: r1(L), angle_deg: r1(ang), relation_to_outline: rel < 12 ? "parallel" : Math.abs(rel - 90) < 12 ? "perpendicular" : "oblique", kind: "interior_edge_candidate", provenance: "inferred (Canny edge map + Hough transform on image intensity; not classified as ridge, hip or valley)" });
  }
  return out.sort((a, b) => b.length_px - a.length_px).slice(0, limit);
}
/* ───────── artifacts ───────── */
const toBlobUrl = (c: HTMLCanvasElement, type = "image/png", q?: number) => new Promise<string>((res) => c.toBlob((b) => res(URL.createObjectURL(b!)), type, q));
async function artifacts(d: Decoded, regions: Region[], mask: Uint8Array, prob: Float32Array) {
  const { w, h } = d, mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }, rgba = (data: Uint8ClampedArray) => new ImageData(new Uint8ClampedArray(data), w, h);
  const o = mk(); o.getContext("2d")!.putImageData(rgba(d.rgb), 0, 0); const original = await toBlobUrl(o, "image/jpeg", 0.92);
  const ov = mk(), g = ov.getContext("2d")!, im = rgba(d.rgb); for (let i = 0; i < w * h; i++) if (mask[i]) { im.data[i * 4] = im.data[i * 4] * 0.62 + 255 * 0.38; im.data[i * 4 + 1] = im.data[i * 4 + 1] * 0.62 + 80 * 0.38; im.data[i * 4 + 2] = im.data[i * 4 + 2] * 0.62 + 40 * 0.38; } g.putImageData(im, 0, 0);
  const sc = Math.max(1, Math.max(w, h) / 700); g.lineWidth = Math.max(1, Math.round(1.6 * sc)); g.strokeStyle = "#ffff00"; g.fillStyle = "#fff"; g.font = `${Math.round(14 * sc)}px sans-serif`; g.textBaseline = "middle"; g.textAlign = "center";
  for (const r of regions) { g.beginPath(); r.polygon.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke(); const cx = r.polygon.reduce((s, p) => s + p[0], 0) / r.polygon.length, cy = r.polygon.reduce((s, p) => s + p[1], 0) / r.polygon.length; g.fillText(String(r.id), cx, cy); }
  const mk2 = mk(), mi = mk2.getContext("2d")!.createImageData(w, h), pr = mk(), pi = pr.getContext("2d")!.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = mask[i] ? 255 : 0, p = Math.round(Math.min(1, Math.max(0, prob[i])) * 255); mi.data[i * 4] = mi.data[i * 4 + 1] = mi.data[i * 4 + 2] = v; mi.data[i * 4 + 3] = 255; pi.data[i * 4] = pi.data[i * 4 + 1] = pi.data[i * 4 + 2] = p; pi.data[i * 4 + 3] = 255; } mk2.getContext("2d")!.putImageData(mi, 0, 0); pr.getContext("2d")!.putImageData(pi, 0, 0);
  return { original, overlay: await toBlobUrl(ov), mask: await toBlobUrl(mk2), probability: await toBlobUrl(pr) };
}
/* ───────── analysis ───────── */
interface P { threshold: number; min_area_px: number; model_scale: number; view: string; approx_roof_type: string | null; scale: Record<string, unknown> | null; pitch: { degrees: number } | null }
async function analyseImage(d: Decoded, name: string, p: P, progress: (f: number) => void, cancelled: () => boolean): Promise<{ result: ImageResult; art: Record<string, string> }> {
  const { w, h } = d, warnings: string[] = [], t0 = performance.now(); let scale: Scale | null = null;
  try { scale = resolveScale((p.scale as never) ?? null, d.georef); } catch (e) { if (e instanceof ScaleError) fail(400, e.message); throw e; }
  const pitch = p.pitch ? pitchFrom({ degrees: p.pitch.degrees }) : null;
  if (scale && ["geo", "gsd", "reference"].includes(scale.kind) && p.view === "oblique") { warnings.push("You marked this image as oblique, but plan-view scale assumes a straight-down view. Plan-view metric values are not valid; use the plane (rectangle) calibration instead."); scale = null; }
  const prob = await predict(d, p.model_scale, progress, cancelled), inferS = (performance.now() - t0) / 1000, { regions, mask } = roofRegions(prob, w, h, p.threshold, p.min_area_px);
  const gray = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) gray[i] = Math.round(0.299 * d.rgb[i * 4] + 0.587 * d.rgb[i * 4 + 1] + 0.114 * d.rgb[i * 4 + 2]); const edge = regions.length ? cannyEdges(gray, w, h) : new Uint8Array(0); let totalPx = 0;
  for (const r of regions) {
    const poly = r.polygon; r.measurements = measurePolygon(poly, scale, pitch); totalPx += r.measurements.pixels.area_px; const comp = fillPoly(poly as Pt[], w, h), minLen = Math.max(12, 0.2 * r.rectangle_fit.size_px[1]);
    r.features = { outline_edges: outlineEdges(poly), interior_edge_candidates: interiorCandidates(edge, w, h, comp, r.rectangle_fit.angle_deg, minLen) };
    if (scale && r.measurements.metric.available) { const [lo, hi] = r.area_px_range_for_threshold_pm_0_1, ratio = (r.measurements.metric.area_m2 ?? 0) / Math.max(r.mask_area_px, 1e-9); r.measurements.metric.area_m2_range_for_threshold_pm_0_1 = [lo * ratio, hi * ratio]; }
  }
  let rc = 0; for (let i = 0; i < mask.length; i++) rc += mask[i]; const frac = rc / mask.length; if (frac > 0.45) warnings.push(`${(100 * frac).toFixed(0)} % of the image was labelled roof. That is unusually high and usually means non-roof surfaces (roads, bare ground, paved areas) are included: treat the segmentation with suspicion.`);
  const tot = regions.reduce((s, r) => s + r.mask_area_px, 0); if (tot && regions.filter((r) => r.solidity < 0.8).reduce((s, r) => s + r.mask_area_px, 0) / tot > 0.4) warnings.push("More than 40 % of the detected roof area is in regions with ragged, irregular outlines. That pattern usually means bare ground, vegetation or shadow is being mistaken for roof here (a rough heuristic, not a calibrated test): check the confidence map before trusting the areas.");
  if (!regions.length) warnings.push("No roof region was found. The model is trained for top-down (aerial or satellite) views of buildings; it is not expected to work on ordinary ground-level photographs.");
  if (regions.length > 60) warnings.push("Very many separate regions were found; the output is probably fragmented. Raise the threshold or minimum area."); if (h < 128 || w < 128) warnings.push("The image is very small; results are unreliable."); if (!scale) warnings.push("No scale: dimensions are pixel measurements only. Real-world values are unavailable (see 'What is needed').");
  const summary: ImageResult["summary"] = { regions: regions.length, roof_fraction_of_image: r1(frac, 4), total_area_px: totalPx };
  if (scale) { summary.total_area_m2 = regions.reduce((s, r) => s + (r.measurements.metric.area_m2 ?? 0), 0); summary.total_area_meaning = scale.meaning; if (pitch && scale.kind !== "plane_quad") summary.total_surface_area_m2 = regions.reduce((s, r) => s + (r.measurements.surface.area_m2 ?? 0), 0); }
  const desc: ScaleDesc = scale ? { kind: scale.kind, source: scale.source, meaning: scale.meaning, note: scale.note, ...(scale.gsdX !== undefined ? { gsd_x_m: scale.gsdX, gsd_y_m: scale.gsdY } : {}) } : { kind: null, meaning: "No scale" };
  const result: ImageResult = { image: { name, width: w, height: h, format: d.fmt, georeference: d.georef }, model: { name: "roof_unet_ft (ONNX Runtime Web, in your browser)", ...MODEL_INFO }, params: { threshold: p.threshold, min_area_px: p.min_area_px, model_scale: p.model_scale, view: p.view, approx_roof_type: p.approx_roof_type },
    scale: desc, pitch: pitch ?? { status: "not_measurable", reason: "Not measurable from one image; enter it if you know it." }, regions, summary, features_status: { model_detected: ["roof mask (per-pixel probability)"], derived: ["outline polygon", "outline edges", "rectangle fit", "areas and lengths when a scale exists"], inferred: ["interior edge candidates (unclassified)"], unavailable: UNAVAILABLE },
    needed_for_real_world_dimensions: scale ? [] : ["A GeoTIFF with georeferencing, OR a ground sample distance (metres per pixel), OR one known length between two points on the roof, OR a rectangle of known size on the roof plane (for oblique photographs)."], warnings, timing: { model_seconds: r1(inferS, 3), total_seconds: r1((performance.now() - t0) / 1000, 3) } };
  return { result, art: await artifacts(d, regions, mask, prob) };
}
/* ───────── API ───────── */
interface Job { id: string; status: JobStatus["status"]; stage: string; error: string | null; total: number; done: number; frac: number; started: number; cancel: boolean; images: ImageEntry[]; art: Record<string, Record<string, string>> }
const jobs = new Map<string, Job>(); let sampleList: SampleInfo[] | null = null;
const getSamples = async () => (sampleList ??= ((await (await fetch("/roof/samples/manifest.json")).json()).samples as SampleInfo[]).map((s) => ({ ...s, url: `/roof/samples/${s.file}` })));
const status = (j: Job): JobStatus => ({ job_id: j.id, status: j.status, stage: j.stage, error: j.error, images_total: j.total, images_done: j.done, progress: { fraction: j.status === "completed" ? 1 : j.total ? Math.min(0.99, (j.done + j.frac) / j.total) : 0 }, elapsed_seconds: r1((Date.now() - j.started) / 1000, 2) });
async function runJob(j: Job, inputs: { name: string; blob: Blob }[], p: P) {
  try {
    for (let i = 0; i < inputs.length; i++) {
      if (j.cancel) { j.status = "cancelled"; j.stage = "cancelled"; return; } j.stage = `image ${i + 1} of ${inputs.length}: loading the model and reading the image`; j.frac = 0;
      try { const d = await decode(inputs[i].blob); j.stage = `image ${i + 1} of ${inputs.length}: segmenting roofs`; const { result, art } = await analyseImage(d, inputs[i].name, p, (f) => (j.frac = f), () => j.cancel); j.images.push({ index: i, ok: true, result }); j.art[String(i)] = art; }
      catch (e) { if (j.cancel) { j.status = "cancelled"; j.stage = "cancelled"; return; } j.images.push({ index: i, ok: false, error: e instanceof Error ? e.message : "Analysis failed.", name: inputs[i].name }); } j.done = i + 1;
    }
    j.status = j.images.some((x) => x.ok) ? "completed" : "failed"; j.stage = "completed"; if (j.status === "failed") j.error = j.images[0]?.error ?? "Analysis failed.";
  } catch (e) { j.status = "failed"; j.error = e instanceof Error ? e.message : "Analysis failed."; }
}
export function browserRoof() {
  return {
    url: (p: string) => p,
    health: async (): Promise<Health> => ({ ok: true, model: "roof_unet_ft (in-browser)", runtime: "ONNX Runtime Web (WebAssembly, CPU)", limits: { max_file_mb: MAX_FILE_MB, max_images: MAX_IMAGES, max_total_mb: 120, max_pixels: MAX_PIXELS }, model_info: MODEL_INFO }),
    samples: async () => getSamples(),
    analyze: async (files: File[], sampleIds: string[], params: object): Promise<JobStatus> => {
      if (!files.length && !sampleIds.length) fail(400, "Send at least one image or sample."); if (files.length + sampleIds.length > MAX_IMAGES) fail(400, `At most ${MAX_IMAGES} images per run.`); if ([...jobs.values()].some((x) => x.status === "running" || x.status === "queued")) fail(503, "Another analysis is running in this page. Wait for it or cancel it.");
      const raw = params as Partial<P>, th = Number(raw.threshold ?? 0.5), mn = Number(raw.min_area_px ?? 150), ms = Number(raw.model_scale ?? 1); if (!(th >= 0.1 && th <= 0.9)) fail(400, "threshold must be between 0.1 and 0.9."); if (!(mn >= 10 && mn <= 100000)) fail(400, "min_area_px must be between 10 and 100000."); if (!(ms >= 0.25 && ms <= 2)) fail(400, "model_scale must be between 0.25 and 2.");
      const p: P = { threshold: th, min_area_px: mn, model_scale: ms, view: raw.view ?? "nadir", approx_roof_type: raw.approx_roof_type ?? null, scale: (raw.scale as P["scale"]) ?? null, pitch: raw.pitch ?? null }, inputs: { name: string; blob: Blob }[] = [];
      for (const f of files) { if (!f.size) fail(400, `${f.name} is empty.`); if (f.size > MAX_FILE_MB * 1e6) fail(413, `${f.name} is larger than the ${MAX_FILE_MB} MB limit.`); inputs.push({ name: f.name, blob: f }); }
      const list = await getSamples(); for (const id of sampleIds) { const s = list.find((x) => x.id === id) ?? fail(404, "Unknown sample."), r = await fetch(`/roof/samples/${s.file}`); if (!r.ok) fail(404, "The sample could not be loaded."); inputs.push({ name: s.file, blob: await r.blob() }); }
      const j: Job = { id: crypto.randomUUID().replace(/-/g, ""), status: "running", stage: "starting", error: null, total: inputs.length, done: 0, frac: 0, started: Date.now(), cancel: false, images: [], art: {} }; jobs.set(j.id, j); void runJob(j, inputs, p); return status(j);
    },
    job: async (id: string) => status(jobs.get(id) ?? fail(404, "Job not found or expired.")),
    results: async (id: string): Promise<JobResults> => { const j = jobs.get(id) ?? fail(404, "Job not found or expired."); if (j.status === "running" || j.status === "queued") fail(409, "Processing is still running."); return { ...status(j), images: j.images, artifact_urls: j.art, session_note: "Each image is analysed independently, in this page. Images are not merged into one reconstruction (photogrammetry is not part of this tool)." }; },
    cancel: async (id: string) => { const j = jobs.get(id); if (j && (j.status === "running" || j.status === "queued")) j.cancel = true; return { status: j?.status ?? "unknown" }; },
    remove: async (id: string) => { const j = jobs.get(id); if (j) { Object.values(j.art).forEach((a) => Object.values(a).forEach((u) => URL.revokeObjectURL(u))); jobs.delete(id); } return { deleted: true }; },
  };
}
