# Model, data and licences

## Method
PatchCore-style anomaly detection (Roth et al., *Towards Total Recall in Industrial Anomaly Detection*, CVPR 2022; the method is re-implemented here, no code copied). Features: layers 2 and 3 of an ImageNet-trained **ResNet-50** (He et al., CVPR 2016) from the Keras applications release, converted to ONNX (`scripts/convert_backbone.py`, weights SHA-256 `66c8b43d…af504`). The ResNet-50 here is the Keras ("caffe-style") variant, a stand-in for the Wide-ResNet-50 of the paper: lighter, and measured below.

## Built-in references: VisA
* Dataset: **VisA** (Visual Anomaly), Zou, Jeong, Pemula, Zhang, Dabeer, *SPot-the-Difference Self-Supervised Pre-training for Anomaly Detection and Segmentation*, ECCV 2022, Amazon. Licence **CC BY 4.0** (text in `public/defects/samples/LICENSE-VisA-CC-BY-4.0.txt`). 12 object types, 10,821 images in total.
* Each reference uses 200 randomly chosen good training images (memory bank of 2000 coreset patches, 384x384 input) and 50 other good training images to calibrate the flag threshold τ = mean + 3 standard deviations of their image scores (`scripts/build_references.py`, seed 0).
* **Evaluation uses only VisA's own test split (1-class protocol), which was never used to build or calibrate anything:**

| object | test good / anomalous | image AUROC | pixel AUROC | anomalous flagged at τ | good flagged at τ |
|---|---|---|---|---|---|
| pcb1 | 100 / 100 | 0.946 | 0.994 | 83% | 10% |
| candle | 100 / 100 | 0.919 | 0.992 | 38% | 3% |
| capsules | 60 / 100 | 0.877 | 0.991 | 33% | 2% |
| cashew | 50 / 100 | 0.876 | 0.952 | 40% | 0% |
| chewinggum | 50 / 100 | 0.974 | 0.985 | 84% | 0% |
| fryum | 50 / 100 | 0.971 | 0.911 | 73% | 0% |
| macaroni1 | 100 / 100 | 0.946 | 0.993 | 50% | 3% |
| macaroni2 | 100 / 100 | 0.815 | 0.983 | 20% | 2% |
| pcb2 | 100 / 100 | 0.922 | 0.981 | 63% | 4% |
| pcb3 | 101 / 100 | 0.951 | 0.985 | 57% | 1% |
| pcb4 | 101 / 100 | 0.993 | 0.987 | 91% | 1% |
| pipe_fryum | 50 / 100 | 0.989 | 0.987 | 98% | 16% |

How to read it: AUROC says how well scores *rank* anomalous above good images regardless of threshold (1.0 = perfect, 0.5 = chance). The last two columns are what happens at the calibrated flag threshold: for several objects (candles, capsules, cashews, macaroni 2) most anomalous test images are **not** flagged at τ, which is why the review band exists and why a PASS is not proof of a defect-free part. Pixel AUROC measures localisation against the dataset's masks (the many easy background pixels flatter it).

## Custom references
Built in the service from the user's own good images with the same features and a k-fold threshold (see `ARCHITECTURE.md`). No accuracy figure exists for them; the UI says so.

## Software
FastAPI/Starlette (MIT/BSD), ONNX Runtime (MIT), OpenCV (Apache-2.0), NumPy/SciPy (BSD), reportlab (BSD). TensorFlow/Keras/tf2onnx are only needed to regenerate the ONNX backbone.
