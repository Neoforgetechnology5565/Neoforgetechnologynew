"""Fetches the pretrained OpenAI CLIP ViT-B/32 ONNX image encoder and (re)builds the small class-prompt embedding file used by PropertyVision AI.

Weights: OpenAI CLIP ViT-B/32 (MIT licence), exported to ONNX by Jina AI's clip-as-service (Apache-2.0), public S3 bucket.
  image encoder  ~351 MB -> models/clip_vit_b32_visual.onnx   (needed at run time; too large for git, so it is downloaded)
  text encoder   ~254 MB -> only needed here to embed the class descriptions once; the result (a few KB) is committed as models/clip_property_prompts.npz
The tokenizer vocabulary comes from the `onnx_clip` package (pip install onnx_clip), which carries OpenAI's BPE vocabulary (MIT).

Usage: python scripts/fetch_clip.py            # download the image encoder if missing
       python scripts/fetch_clip.py --rebuild  # also download the text encoder and rebuild the prompt embeddings
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://clip-as-service.s3.us-east-2.amazonaws.com/models/onnx/ViT-B-32/"
VISUAL = ROOT / "models" / "clip_vit_b32_visual.onnx"
PROMPTS = ROOT / "models" / "clip_property_prompts.npz"
# Four property categories, each described several ways; the embeddings of all descriptions x templates are averaged per class.
CLASSES = {
    "residential_house": ["a single-family house", "a residential home with a yard", "a suburban house", "a row of residential houses", "a house with a driveway and garage"],
    "commercial_building": ["a commercial building", "an office building", "a retail store front", "a warehouse or industrial building", "a large apartment or hotel building"],
    "vacant_land": ["an empty plot of land", "vacant land covered with grass", "an undeveloped lot with no buildings", "bare empty ground", "an empty field"],
    "mobile_home": ["a mobile home", "a manufactured home on a lot", "a trailer home", "a mobile home park", "a single-wide mobile home"],
}
TEMPLATES = ["a photo of {}.", "an aerial photo of {}.", "a street view photo of {}.", "a real estate listing photo of {}."]


def download(url: str, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    print(f"downloading {url} -> {dst}", flush=True)
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dst)


def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--rebuild", action="store_true"); ap.add_argument("--cache", default=str(ROOT / "models" / ".clip-cache"))
    a = ap.parse_args()
    if not VISUAL.is_file():
        cached = Path(a.cache) / "visual.onnx"
        if cached.is_file(): VISUAL.write_bytes(cached.read_bytes())
        else: download(BASE + "visual.onnx", VISUAL)
    if a.rebuild or not PROMPTS.is_file():
        import onnxruntime as ort
        from onnx_clip.tokenizer import Tokenizer
        text = Path(a.cache) / "textual.onnx"
        if not text.is_file(): download(BASE + "textual.onnx", text)
        s = ort.InferenceSession(str(text), providers=["CPUExecutionProvider"])
        tok = Tokenizer()
        out, names = [], list(CLASSES)
        for c in names:
            prompts = [t.format(d) for d in CLASSES[c] for t in TEMPLATES]
            ids = np.array(tok.encode_text(prompts, context_length=77), dtype=np.int64) if hasattr(tok, "encode_text") else np.array(tok(prompts), dtype=np.int64)
            e = s.run(None, {"input": ids})[0].astype(np.float32); e /= np.linalg.norm(e, axis=1, keepdims=True)
            m = e.mean(0); out.append(m / np.linalg.norm(m))
        np.savez(PROMPTS, classes=np.array(names), embeddings=np.stack(out).astype(np.float32))
        print("wrote", PROMPTS)
    print("ready:", VISUAL, VISUAL.stat().st_size // 1_000_000, "MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
