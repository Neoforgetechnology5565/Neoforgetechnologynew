# Limitations

* **No defect classification.** Regions are unclassified. Missing components, dents, cracks and scratches are not named; what is *found* depends on how different they look from good parts.
* **One part type per reference.** Wrong part, lighting, camera angle, distance, background or focus produce high scores that are not defects. The service warns when brightness, sharpness or proportions differ from the reference images, and sends extreme scores (≥ 3× threshold) to manual review.
* **Statistical threshold.** τ comes from a limited number of good images; the held-out figures show that some references miss many defects at τ (for example candles and capsules) or raise false alarms. The review band catches part of this; it is not a guarantee. A custom reference built from few images is rough: fewer than 30 good images can never auto-PASS under the default rules.
* **Small defects.** One feature patch covers 8×8 input pixels (384 px input), so very small or low-contrast defects may be missed; inspection at higher resolution requires a reference built at that resolution.
* **Scores are distances, not probabilities** and are not comparable between references; use the ratio.
* **Not certified quality assurance.** The recommendation is advice from rules. Humans decide; the report says who decided what.
* **Speed and hardware.** CPU only: about 0.3-0.5 s per image on 4 vCPUs at 384 px; building a custom reference from 20 images takes about half a minute.
* **Storage.** Inspections and custom references live in a temporary directory for 24 h and are lost when the service restarts.
