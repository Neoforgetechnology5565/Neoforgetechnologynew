# Architecture

```
Browser (DefectApp)                          services/defect-inspector
 part type, rules, upload/sample ──────────▶ POST /api/inspect
 gallery, viewer, decision panel                ├ media.decode      magic bytes, header size, pixel cap, 2400 px bound
 reeval ───────────────────────────────────▶   ├ patchcore.Backbone ResNet-50 up to layer 3 (ONNX Runtime), patch descriptors
 review ───────────────────────────────────▶   ├ nn_distance        nearest good patch per patch  →  anomaly map  →  image score
 report PDF / JSON  ◀──────────────────────    ├ inspect.evaluate    regions (connected components ≥ band×τ) → rules.decide
                                                └ store              per-inspection directory (meta.json, images, map.npy), TTL
```
* **Patch descriptors.** Layers 2 and 3 of an ImageNet ResNet-50 (strides 8 and 16) are locally averaged (3×3), channel-reduced (256 + 256), and concatenated: 512 numbers per patch, one patch per 8×8 input pixels (a 384×384 input gives 48×48 patches). Images are resized (not cropped) to the reference's input size.
* **Memory and coreset.** Patch descriptors of the good images are reduced by greedy k-centre selection on a 128-d random projection (2000 patches per built-in reference).
* **Score.** The distance from each patch to its nearest memory patch forms a grid; it is resized to the input resolution and Gaussian-smoothed (σ = 4). The image score is its maximum.
* **Threshold τ and the score ratio.** τ = mean + 3 standard deviations of the image scores of held-out *good* images (50 for built-in references; k-fold for custom ones). `score_ratio = score / τ`. Rules are written in ratios so they mean the same thing for every reference.
* **Regions.** Pixels with map ≥ `review_band × τ` are grouped (8-connectivity); regions below `min_region_area_pct` are dropped; a region is *flagged* when its peak ratio ≥ `min_score_ratio`, otherwise *borderline*. Each has a box, polygon, area, peak and mean ratio.
* **Rules** (`rules.decide`), in order: an image ratio ≥ `wrong_part_ratio` (default 3) → MANUAL REVIEW (probably the wrong part or setup); counted flagged regions > `max_defects` → FAIL; image-condition differences from the reference (aspect, brightness, sharpness) → MANUAL REVIEW; flagged regions within the limit → MANUAL REVIEW; ratio or a region inside the review band → MANUAL REVIEW; reference built from fewer than `min_reference_images` (30) good images → MANUAL REVIEW; otherwise PASS. Optional severity: regions at least `major_area_pct` of the image are *major*; with `fail_on_major_only` only those count towards the limit.
* **Re-evaluation.** The anomaly map (model resolution) is stored with each inspection, so changing rules re-derives regions and the recommendation without running the model; earlier human decisions stay and show which recommendation they answered.
* **Concurrency and storage.** `INSPECT_MAX_CONCURRENT` inspections at once (others get 503); inspections expire after `INSPECT_TTL_SECONDS` (24 h) or when the cap (300) is exceeded; uploads are decoded in memory, re-encoded, and the original upload bytes are not kept.
