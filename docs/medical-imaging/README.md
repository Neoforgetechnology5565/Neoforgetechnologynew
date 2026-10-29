# Sample 05 — Medical Imaging AI & Analysis

Route: `/ai-demos/ai-medical-imaging-analysis` (app at `/app`). Replaces the former spatial-mapping demo (COLMAP cannot run in a browser).
Runs entirely in the page: nothing is uploaded, no service is needed, any static host works.

## What it does
- Opens PNG or JPEG images (DICOM, TIFF and other formats are refused with an explanation) or one of five bundled teaching images.
- Converts to 8-bit grayscale (luma) and applies, in a fixed order, only what you switch on: median or Gaussian noise reduction, percentile contrast stretch, window / level, CLAHE (8×8 tiles), unsharp mask, gamma, inversion.
- Segments by brightness with classical algorithms: Otsu, three-class Otsu, a manual threshold, or region growing from a clicked seed; then morphological opening / closing, hole filling and a minimum region size. Regions get area (pixels, or mm² when you enter a pixel size), centroid, bounding box and grey-level statistics.
- Side-by-side or swipe comparison, per-region highlighting, mask opacity.
- Downloads: processed PNG, mask PNG, overlay PNG, JSON analysis report. The JSON and the on-page "Operations performed" list contain only what actually ran.

## What it does not do (stated in the UI)
- It is not a trained medical model and produces no diagnosis, finding, abnormality label or confidence score.
- Window / level acts on 8-bit PNG / JPEG values, not on DICOM Hounsfield units.
- Intensity-based regions do not know anatomy: structures with similar brightness merge, and faint ones are missed.
- No radiology (X-ray, CT, MRI) sample is bundled (none with a clear licence could be fetched); modalities of the bundled samples: fundus photography, H&E and IHC histology, fluorescence and phase microscopy.

## Sample provenance (`public/med/samples/manifest.json`)
| Sample | Source / licence |
|---|---|
| Retinal fundus photograph | Mikael Häggström, Wikimedia Commons, CC0 1.0 (via scikit-image data) |
| Skin, H&E slide | Kilbad, Wikimedia Commons, public domain (via scikit-image data) |
| Colon glands, IHC | CMMI; no known copyright restrictions (via scikit-image data) |
| Human cells in mitosis | David Root, CC0 1.0 (via scikit-image data) |
| Cell, quantitative phase | CC0 1.0 (via scikit-image data) |
All are teaching images, not clinical cases.

## Tests
`npx tsx src/lib/med/ops.test.ts` — 10 tests on a phantom with known geometry (Otsu + opening recovers both disc areas within 3 %, window/level exactness, CLAHE contrast, median removes salt-and-pepper noise, region growing selects exactly one disc, hole filling, component statistics).
`node scripts/test-med-ui.mjs` — 11 Playwright checks (honest notice, refused DICOM / TIFF / text / broken / empty files, pixel statistics of original vs processed canvases, every operation logged, regions and statistics, mm² after entering a pixel size, swipe/side-by-side, PNG/mask/overlay/JSON downloads, phone and tablet width, no console errors).
