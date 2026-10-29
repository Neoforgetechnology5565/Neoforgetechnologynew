# Sample data

48 sample images (2 good and 2 anomalous per VisA object) in `public/defects/samples/`, chosen at random (seed 3) from VisA's **test** split, so no sample was used to build a reference. Source: **VisA** (Amazon; Zou et al., ECCV 2022), licence **CC BY 4.0**. Attribution is shown in the app. **Modifications:** resized to 960 px on the longest side and re-encoded as JPEG; annotation masks (anomalous samples) resized with nearest-neighbour. `manifest.json` lists each sample with its VisA file name.

The dataset's own label (good / anomalous) and mask are shown in the viewer **as dataset annotation, not model output**, so you can compare what the model found with what the dataset says. Samples are inspected by the real model on request; there are no precomputed results.

Outcome of the default rules on all 48 samples (run with `POST /api/inspect`, for transparency; one run of one threshold, not an accuracy measure): 14 good parts PASS, 10 good parts go to MANUAL REVIEW, 14 anomalous parts FAIL, 7 anomalous parts go to MANUAL REVIEW, **3 anomalous parts PASS (missed)**: `candle-anomalous-2`, `macaroni2-anomalous-2`, `pcb2-anomalous-2`. No good sample was failed. The misses are real and are left in the sample set on purpose.

The samples are consumer-product and PCB photographs, not industrial surfaces such as machined metal, so they demonstrate the workflow, not performance on any particular production line.
