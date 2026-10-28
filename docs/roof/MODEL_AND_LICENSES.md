# Model, training data, evaluation, licences

**Architecture**: 3-level U-Net, 7.8 M parameters, sigmoid output, input BGR/255, exported with tf2onnx (opset 13, dynamic size), file `services/roof-analyzer/models/roof_unet_ft.onnx` (30.8 MB, committed).

**Base weights**: "dida roof task" U-Net by Abhirup Ghosh (MIT), trained by its author on 25 labelled 256×256 satellite images. The original Keras 3 cannot load the h5 directly, so the same architecture was rebuilt and the h5 weights loaded layer by layer.

**Problem found**: the base weights were evaluated on 60 held-out SpaceNet chips and over-predict heavily (they treat most built-up area as roof).

**Fine-tuning** (`services/roof-analyzer/scripts/train_finetune.py`): SpaceNet 2 (Las Vegas + Paris) pan-sharpened RGB chips with building-footprint labels rasterised from the WKT in the solutions CSV; 188 train / 60 held-out chips (`heldout-split.json`); 1 200 steps, batch 6, 192/256 crops, Adam 2e-4, BCE + Dice. Chips are 16-bit; each channel is stretched 1–99 % with γ 0.8.

| Held-out (60 chips, threshold 0.5) | IoU | F1 | predicted roof fraction | true fraction 0.168 |
|---|---|---|---|---|
| Base (dida) weights | 0.199 | 0.332 | 0.438 | |
| **Fine-tuned (shipped)** | **0.456** | **0.626** | **0.144** | |

Caveats stated honestly: labels are **building footprints, not roofs** (a footprint can include things a roof detector would split, and vice versa); the held-out chips are from the same two cities as training; performance on other imagery (different GSD, oblique, other regions) is unknown and often worse. The Vegas desert-edge sample is included as a known weak case.

**Licences**
* SpaceNet data: CC BY-SA 4.0, © DigitalGlobe, via SpaceNet (https://spacenet.ai, AWS Open Data). The four bundled sample images are unmodified chips; derived overlays are distributed under the same licence. The fine-tuned weights are derived from this data and from the MIT base model; if you redistribute them, keep this attribution (and consider the share-alike obligations of the data licence for the derived weights).
* Base weights: MIT (dida roof task, Abhirup Ghosh). Retain its notice.
* Software: FastAPI, ONNX Runtime, OpenCV (Apache-2.0), NumPy, SciPy, tifffile (BSD), reportlab (BSD).
* Not bundled: the dida chips (Google imagery) and any unlicensed photographs.
