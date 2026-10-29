# Limitations

* **Classification** names one of 1000 ImageNet classes for any image; probabilities are uncalibrated. **Detection**: COCO classes only, small or occluded objects missed, no tracking, not real time (video is 3 fps and CPU-bound). **Segmentation**: 21 classes at 257×257, coarse edges, not for medical use.
* **OCR**: see `docs/documents/LIMITATIONS.md`; this demo has no deskew, no table detection and only pattern fields. Scanned PDFs are limited to 10 pages.
* **Anomaly**: unclassified unusual regions, a reference only fits its own part; see `docs/defects/LIMITATIONS.md`.
* **Forecasting**: classical extrapolation of one series, one hold-out window; no covariates, no events, no external feeds; accuracy figures do not transfer to the future.
* **Sensors**: anomalies are not faults; the bundled data is synthetic so the measured scores describe that file only; no failure or remaining-life prediction.
* **Pose**: joint positions only; people are not tracked or identified; no activity, intent, emotion, fall or health inference; horizontal or small bodies are unreliable.
* **Search**: static word vectors (not a sentence encoder); no negation or word-order understanding; a 20 000-word vocabulary, so rare and technical words have no vector (shown per query); no OCR (scanned PDFs are refused with an explanation); indexes are temporary and per browser session.
* **Recommendation**: tiny 28×28 images, synthetic metadata, no behavioural data.
* **Privacy**: uploaded files are processed in memory or in an expiring temp folder; nothing is sent to third parties; search text is kept in memory for the session. Do not upload personal or confidential material to a public demonstration.
* The anomaly demo and the document demos depend on their own services; without them the pages say so.
