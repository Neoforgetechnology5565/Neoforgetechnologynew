# Measurement method

1. **Decode & prepare** – EXIF-rotated, flattened, downscaled to ≤1400 px (analysis runs on exactly the stored image).
2. **Find the sheet** – threshold on brightness (Otsu, floor 110) with low saturation; connected components; the component with the best rectangular fit; convex hull → 4-point polygon (Douglas–Peucker); each side re-fitted by total-least-squares to boundary pixels and intersected for sub-pixel corners. A4 vs US Letter is chosen from the aspect ratio unless the user fixed it. Rejects shapes whose aspect is >45% off.
3. **Calibrate** – a 4-point DLT homography maps the paper plane (mm) to the image. The photo is rectified to 2 px/mm (0.5 mm resolution). *Manual mode* uses user-placed corners instead.
4. **Segment the foot** – inside the rectified sheet (6 mm margin), a score from luminance drop and chroma distance relative to the paper colour (median of the brighter 35%), shadow-dampened, Otsu-thresholded, morphologically cleaned, largest component, holes filled. Fails with an explanation if foreground ≈ background (white sock) or too much of the sheet is "foot".
5. **Measure** – PCA principal axis; 1 mm slices along it give length (extent), widest width, forefoot width (widest in 55–85% from heel), heel width (10–22%), area, outline polygon. The toe end is the end with the wider neighbourhood.
6. **Parallax** – the silhouette sits above the sheet so looks bigger. Camera height *d* and nadir are recovered from the homography using an **assumed 65° horizontal field of view** and image-centre principal point. The mask is rescaled about the nadir by *(d−h)/d* with an **assumed silhouette height h = 25 mm**. `rawLengthMm` keeps the uncorrected value. The remaining uncertainty `±(10 mm / d) × length` (if h is off by 10 mm) is shown as a bound, **not** a statistical confidence.
7. **Quality grade** – from warnings: blur, darkness, glare, tilt > 1.35, small paper coverage, camera very close (< 450 mm), curved paper edges, foot touching the sheet edge, length outside 120–340 mm, large parallax uncertainty. `good` / `fair` / `poor` / `unusable`.

## Known error sources
Unflat paper, shadows, glare, white socks, foot not flat/weight-bearing, phone tilt, lens distortion (not corrected), true FOV ≠ 65°, actual foot height ≠ 25 mm, toes curled. Real-world error has **not** been characterised; see TESTING.md.

## What is not measured
Girth, instep, arch height, volume, toe lengths, hallux angle. Width class is a ratio heuristic.
