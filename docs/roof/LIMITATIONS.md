# Limitations

* Top-down (nadir) imagery only. Oblique photos are accepted for viewing and segmentation but plan-view metric values are flagged as invalid.
* The network was trained on 0.3 m-class satellite imagery; behaviour on drone orthomosaics, other GSDs, snow, shadows, solar panels or dense vegetation is not validated. IoU 0.456 on held-out data means boundaries and some roofs will be wrong; use the overlay toggle and probability image to judge.
* Predictions are regions, not roof planes. Ridges, hips, valleys, eaves and slopes are not detected; pitch is user-supplied.
* Areas depend on the scale you supply. A wrong GSD or reference length scales every number.
* Multiple images are not stitched or reconstructed; each is analysed independently.
* The estimate is arithmetic on your assumptions: it ignores waste from cuts, overhangs, penetrations and complex geometry beyond the waste % you enter.
* CPU inference: roughly a few seconds per megapixel; images are limited by file size (`ROOF_MAX_FILE_MB`, 40), pixels (`ROOF_MAX_PIXELS`, 36 M) and count (`ROOF_MAX_IMAGES`, 8).
* Not a survey, appraisal or insurance document.
