"""Frame selection from video: evenly spaced time windows, the sharpest frame in each window (motion blur is the most common reason a video fails to reconstruct)."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def _resize(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    return cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else img


def sharpness(img: np.ndarray) -> float:
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (320, round(320 * g.shape[0] / g.shape[1]))) if g.shape[1] > 320 else g
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def select_keyframes(video: Path, max_frames: int, cancelled=lambda: False) -> tuple[list[int], dict]:
    """Choose keyframes by tracking: a new frame is taken when the features followed from the previous keyframe have mostly been lost, have moved far enough, or 0.2 s have passed.
    This keeps overlap high (>= ~60 % of tracked features survive) whatever the camera speed, which is what structure from motion needs."""
    cap = cv2.VideoCapture(str(video))
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
        if not (1 <= fps <= 240):
            fps = 25.0
        every = max(1, round(fps / 10))  # about 10 candidate frames per second
        grays: list[tuple[int, np.ndarray]] = []
        idx = -1
        while True:
            if cancelled():
                raise InterruptedError
            if not cap.grab():
                break
            idx += 1
            if idx % every:
                continue
            ok, f = cap.retrieve()
            if not ok:
                continue
            g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
            g = cv2.resize(g, (320, max(1, round(320 * g.shape[0] / g.shape[1]))), interpolation=cv2.INTER_AREA)
            grays.append((idx, g))
    finally:
        cap.release()
    if len(grays) < 3:
        raise ValueError("The video has fewer than three usable frames.")
    sel = [0]
    ref = grays[0][1]
    feat = lambda g: cv2.goodFeaturesToTrack(g, 300, 0.01, 7)  # noqa: E731
    pts = feat(ref)
    for k in range(1, len(grays)):
        if cancelled():
            raise InterruptedError
        g = grays[k][1]
        if pts is None or len(pts) < 30:
            sel.append(k); ref = g; pts = feat(ref); continue
        p1, st, _ = cv2.calcOpticalFlowPyrLK(ref, g, pts, None, winSize=(21, 21), maxLevel=3)
        good = st.reshape(-1) == 1
        frac = float(good.mean())
        disp = float(np.median(np.linalg.norm((p1[good] - pts[good]).reshape(-1, 2), axis=1))) / g.shape[1] if good.any() else 1.0
        if frac < 0.6 or disp > 0.07 or (grays[k][0] - grays[sel[-1]][0]) >= 0.2 * fps:  # also never let more than 0.2 s pass: forward motion keeps features 'tracked' while the baseline grows
            sel.append(k); ref = g; pts = feat(ref)
    info = {"candidates": len(grays), "selected_by_tracking": len(sel)}
    if len(sel) > max_frames:
        sel = [sel[int(round(i))] for i in np.linspace(0, len(sel) - 1, max_frames)]
        info["subsampled_to"] = len(sel)
    if len(sel) < 3:
        sel = sorted(set(int(round(i)) for i in np.linspace(0, len(grays) - 1, min(max_frames, len(grays)))))
        info["fallback"] = "uniform (tracking found too few keyframes)"
    return [grays[k][0] for k in sel], info


def extract_frames(video: Path, out_dir: Path, n_frames: int, max_side: int, cancelled=lambda: False) -> tuple[list[dict], dict]:
    """Returns ([{name, frame_index, time_s, sharpness}], selection_info) for the saved JPEGs (ordered by time)."""
    chosen, info = select_keyframes(video, n_frames, cancelled)
    cap = cv2.VideoCapture(str(video))
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
        if not (1 <= fps <= 240):
            fps = 25.0
        out_dir.mkdir(parents=True, exist_ok=True)
        want = set(chosen)
        saved: list[dict] = []
        idx = -1
        while want:
            if cancelled():
                raise InterruptedError
            if not cap.grab():
                break
            idx += 1
            if idx in want:
                ok, f = cap.retrieve()
                if ok:
                    name = f"f{len(saved) + 1:03d}.jpg"
                    cv2.imwrite(str(out_dir / name), _resize(f, max_side), [cv2.IMWRITE_JPEG_QUALITY, 92])
                    saved.append({"name": name, "frame_index": idx, "time_s": round(idx / fps, 3), "sharpness": round(sharpness(f), 2)})
                want.discard(idx)
        return saved, info
    finally:
        cap.release()


def prepare_images(paths: list[Path], out_dir: Path, max_side: int) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for i, p in enumerate(paths):
        im = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if im is None:
            continue
        name = f"i{i + 1:03d}.jpg"
        cv2.imwrite(str(out_dir / name), _resize(im, max_side), [cv2.IMWRITE_JPEG_QUALITY, 92])
        saved.append({"name": name, "frame_index": i, "time_s": None, "sharpness": round(sharpness(im), 2), "original_name": p.name})
    return saved
