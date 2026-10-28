# Measurement rules

1. **Pixels are always available; metres only with a defensible scale.** With no scale, the page shows pixel values and nothing else.
2. **Scale sources**: GeoTIFF tags (ModelPixelScale 33550, ModelTiepoint 33922, GeoKeys 34735) give metres per pixel in x and y (kept separate); a user GSD; a user reference length (one length ⇒ one scale, valid for an orthographic view); or a 4-corner plane quad of known size (homography, area measured on the real plane). GeoTIFF, GSD and one-length scales assume a straight-down view.
3. **Oblique images** (user states view = oblique): a GeoTIFF/GSD/one-length scale is flagged as not valid for plan-view metric values, and the plane (rectangle) calibration is the supported route.
4. **Pitch** is used only if supplied (rise per 12 ⇄ degrees). Surface area = plan area / cos θ; it is labelled "derived from your pitch". It is never estimated from the image.
5. **Sensitivity range**: area at threshold −0.1 and +0.1 around the chosen threshold shows how much the number depends on the decision threshold; it is not a confidence interval.
6. **Units**: m, cm, ft, in; conversion is exact (0.3048 m/ft).
7. **Estimate**: `area × (1 + waste%) / coverage_per_unit` rounded up to whole units; costs only if the user enters prices. Without a metric area the estimate is withheld.
8. **Warnings** shown when the output looks out of domain: roof fraction above 45 %, or over 40 % of area in ragged regions (solidity < 0.8), or tiny images.
