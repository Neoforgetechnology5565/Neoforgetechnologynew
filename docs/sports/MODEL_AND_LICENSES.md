# Model, libraries, licences

## Detector: FootAndBall
* Paper: Komorowski, Kurzejamski, Sarwas, *FootAndBall: Integrated Player and Ball Detector*, VISAPP 2020. Code: https://github.com/jac99/FootAndBall (MIT, © 2020 Sport Algorithmics and Gaming).
* A small fully convolutional network (≈0.2 M parameters): a five-stage backbone with a two-level feature pyramid; a stride-16 player map with box regression and a stride-4 ball map.
* Weights: `models/model_20201019_1416_final.pth` from the upstream repository (SHA-256 `42fbc1f457fc34d804b403e26138524fc40facde303ccd7b4be73121e8da4cd5`). They were trained on ISSIA-CNR Soccer (cameras 1-4) and SoccerPlayerDetection set 1: fixed, high-resolution long-shot cameras.
* No PyTorch is needed: `scripts/torch_zip.py` reads the checkpoint with a restricted unpickler (tensors only) and `scripts/convert_footandball.py` writes `models/footandball.onnx` (0.8 MB, committed) with BatchNorm folded. The port was checked on real footage; `app/footandball.py` reproduces the authors' peak picking (3x3 non-maximum suppression, cell-to-pixel decoding).
* **Licence caveats (read before commercial use):** the upstream repository states MIT for the code; whether the *weights* are covered, and what obligations follow from the training datasets (ISSIA-CNR and SoccerPlayerDetection are research datasets with their own terms), is an open question in the upstream issue tracker. Obtain written clarification before redistributing the weights or using them commercially. This repository ships the converted weights for demonstration.
* **Domain:** the detector was not trained on broadcast close-ups or panoramic 4K stitching. Footage far from fixed long shots is outside its domain; the app warns when players are very small or too few.
* **Resolution matters for the ball:** in tests on a real clip the ball peak was 0.93–0.98 at full resolution and 0.27–0.38 at 0.75 scale, so the default is full resolution (down to 2000 px wide).

## Other components
ByteTrack (Zhang et al., ECCV 2022; MIT reference implementation, re-implemented here), OpenCV (Apache-2.0), NumPy/SciPy (BSD), ONNX Runtime (MIT), FastAPI/Starlette (MIT/BSD), ffmpeg (invoked as an external program for browser previews; LGPL/GPL depending on the build), Three.js is not used by this demo.

## Footage used for development
A 2-minute clip from the FootAndBall authors' published results video for ISSIA-CNR camera 5 was used **locally only** (with the overlay removed by inpainting) to develop and test. It is not in the repository and is not redistributable; ISSIA-CNR is a research dataset.
