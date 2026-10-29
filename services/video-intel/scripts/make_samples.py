"""Builds the composite test clips used by the table tennis and basketball demos and by the tests.

These are NOT match recordings. A table (or court) and a ball are RENDERED with a known camera, so the true calibration and the true ball path are known and the
tracking and calibration can be checked against them. The people are real pixels: cut-outs of walkers from the OpenCV pedestrian sample clip, pasted so that the
person detector has real people to find. Ground truth is written next to each clip (*.truth.json).
Run: python scripts/make_samples.py   (needs opencv, numpy, onnxruntime and ffmpeg)"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
OUT = REPO / "test-fixtures" / "vi"  # composite clips are test fixtures, not site samples
SAMPLES_PUBLIC = REPO / "public" / "vi" / "samples"
sys.path.insert(0, str(ROOT))
from app.detector import Detector  # noqa: E402

W, H, FPS = 960, 540, 30
rng = np.random.default_rng(7)


def look_at(c, t, up=(0, 0, 1)):
    c, t, up = (np.array(v, float) for v in (c, t, up))
    f = t - c; f /= np.linalg.norm(f)
    r = np.cross(f, up); r /= np.linalg.norm(r)
    d = np.cross(f, r)
    R = np.stack([r, d, f])   # world -> camera (x right, y down, z forward)
    return R, -R @ c


class Cam:
    def __init__(self, c, t, f):
        self.R, self.t = look_at(c, t)
        self.K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1.0]])

    def px(self, pts):
        p = np.array(pts, float).reshape(-1, 3)
        q = (self.R @ p.T).T + self.t
        uv = (self.K @ q.T).T
        return uv[:, :2] / uv[:, 2:3]

    def depth(self, p):
        return float((self.R @ np.array(p, float) + self.t)[2])


def person_crops(n: int) -> list[np.ndarray]:
    """BGRA cut-outs of real walkers (the box with an elliptical soft mask), tallest and sharpest first."""
    det = Detector(REPO / "services" / "activity-monitor" / "models" / "yolox_s.onnx")
    cap = cv2.VideoCapture(str(REPO / "public" / "activity" / "samples" / "pedestrians-opencv-vtest.mp4"))
    found = []
    fi = 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        if fi % 20 == 0:
            b, s = det(fr, person_thr=0.6)["person"]
            for bb, ss in zip(b, s):
                x0, y0, x1, y1 = (int(v) for v in bb)
                h, w = y1 - y0, x1 - x0
                if h >= 110 and 0.25 < w / h < 0.6 and y0 > 2 and x0 > 2 and x1 < fr.shape[1] - 2 and y1 < fr.shape[0] - 2:
                    found.append((float(ss) * h, fr[y0:y1, x0:x1].copy()))
        fi += 1
    cap.release()
    found.sort(key=lambda x: -x[0])
    picked, sizes = [], []
    for _, c in found:
        if all(abs(c.shape[0] - s) > 6 for s in sizes):
            picked.append(c); sizes.append(c.shape[0])
        if len(picked) == n:
            break
    out = []
    for c in picked:
        h, w = c.shape[:2]
        m = np.zeros((h, w), np.uint8)
        rect = (int(w * 0.06), int(h * 0.02), int(w * 0.88), int(h * 0.96))
        bg, fg = np.zeros((1, 65)), np.zeros((1, 65))
        try:
            cv2.grabCut(c, m, rect, bg, fg, 6, cv2.GC_INIT_WITH_RECT)
            a = np.where((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        except cv2.error:
            a = np.full((h, w), 255, np.uint8)
        a = cv2.GaussianBlur(cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), (0, 0), 1.2)
        out.append(np.dstack([c, a]))
    if len(out) < n:
        raise SystemExit(f"only {len(out)} usable person crops found")
    return out


def paste(img, crop, foot_px, height_px):
    """Alpha-paste a person cut-out with its feet at foot_px and the given pixel height."""
    s = height_px / crop.shape[0]
    w, h = max(2, int(crop.shape[1] * s)), max(2, int(height_px))
    c = cv2.resize(crop, (w, h), interpolation=cv2.INTER_AREA)
    x0, y0 = int(foot_px[0] - w / 2), int(foot_px[1] - h)
    xs, ys = max(0, x0), max(0, y0)
    xe, ye = min(img.shape[1], x0 + w), min(img.shape[0], y0 + h)
    if xe <= xs or ye <= ys:
        return
    c = c[ys - y0:ye - y0, xs - x0:xe - x0]
    a = c[:, :, 3:4].astype(np.float32) / 255
    img[ys:ye, xs:xe] = (img[ys:ye, xs:xe] * (1 - a) + c[:, :, :3] * a).astype(np.uint8)


def draw_ball(img, uv, r, color, blur_dir=None):
    x, y = int(round(uv[0])), int(round(uv[1]))
    if blur_dir is not None and np.linalg.norm(blur_dir) > 3:
        cv2.line(img, (x, y), (int(x - blur_dir[0] * 0.35), int(y - blur_dir[1] * 0.35)), tuple(int(c * 0.8) for c in color), max(1, int(r * 1.4)), cv2.LINE_AA)
    cv2.circle(img, (x, y), max(2, int(round(r))), color, -1, cv2.LINE_AA)


def encode(frames: list[np.ndarray], path: Path):
    raw = path.with_suffix(".raw.mp4")
    vw = cv2.VideoWriter(str(raw), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    for f in frames:
        vw.write(f)
    vw.release()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)], check=True)
    raw.unlink()


# ------------------------------------------------------------------------------------------------------------ table tennis
def table_tennis(crops):
    L, Wt = 2.74, 1.525
    cam = Cam((L / 2 + 0.2, -4.3, 1.5), (L / 2, Wt / 2 + 0.15, -0.1), 800)
    corners = [(0, 0, 0), (L, 0, 0), (L, Wt, 0), (0, Wt, 0)]
    cpx = cam.px(corners)
    # rallies: (start_s, strokes). Each stroke is a flight of 0.62 s from one end to the other with one bounce on the receiving half.
    rallies = [(1.0, 5), (6.2, 7), (11.5, 4)]
    flights = []
    for start, n in rallies:
        t = start
        side = 0
        for k in range(n):
            x0 = 0.1 if side == 0 else L - 0.1
            x1 = L - 0.1 if side == 0 else 0.1
            y0, y1 = rng.uniform(0.3, 1.2), rng.uniform(0.3, 1.2)
            flights.append(dict(t0=t, t1=t + 0.62, x0=x0, x1=x1, y0=y0, y1=y1, rally=len(flights) and None))
            t += 0.62
            side = 1 - side
    rally_truth = [{"start_t": s, "end_t": round(s + 0.62 * n, 2), "strokes": n} for s, n in rallies]
    dur = 15.5

    def ball_pos(t):
        for f in flights:
            if f["t0"] <= t <= f["t1"]:
                u = (t - f["t0"]) / (f["t1"] - f["t0"])
                x = f["x0"] + (f["x1"] - f["x0"]) * u
                y = f["y0"] + (f["y1"] - f["y0"]) * u
                ub = 0.55
                z = 0.30 * (1 - (u / ub) ** 2) + (0 if u < ub else 0) if u <= ub else 0.22 * (1 - ((u - ub) / (1 - ub) - 0.5) ** 2 * 4 * 0.0) * ((u - ub) / (1 - ub)) * (1 - (u - ub) / (1 - ub)) * 4 * 0.9 + 0.0
                z = max(0.0, z) if u <= ub else max(0.0, 0.22 * 4 * ((u - ub) / (1 - ub)) * (1 - (u - ub) / (1 - ub))) + 0.12 * ((u - ub) / (1 - ub))
                return (x, y, z)
        return None

    frames, truth_ball = [], []
    for i in range(int(dur * FPS)):
        t = i / FPS
        img = np.full((H, W, 3), (74, 78, 70), np.uint8)
        img[int(H * 0.0):] = (86, 92, 84)
        noise = rng.normal(0, 3, (H, W, 1)).astype(np.int16)
        # floor gradient
        grad = np.linspace(-10, 14, H, dtype=np.int16)[:, None, None]
        img = np.clip(img.astype(np.int16) + noise + grad, 0, 255).astype(np.uint8)
        # people (real pixels) behind both ends, swaying
        for k, (px_x, crop) in enumerate(((-1.1, crops[0]), (L + 1.1, crops[1]))):
            sway = 0.12 * math.sin(2 * math.pi * (t * 0.45 + k * 0.3))
            foot = (px_x, Wt / 2 + sway * 2.5, -0.76)
            head = (px_x, Wt / 2 + sway * 2.5, 0.95)
            fp, hp = cam.px([foot, head])
            paste(img, crop, fp, abs(fp[1] - hp[1]))
        # table
        cv2.fillConvexPoly(img, cpx.astype(np.int32), (118, 86, 36), cv2.LINE_AA)
        cv2.polylines(img, [cpx.astype(np.int32)], True, (235, 235, 235), 2, cv2.LINE_AA)
        mid = cam.px([(L / 2, 0, 0), (L / 2, Wt, 0)]).astype(np.int32)
        cv2.line(img, tuple(mid[0]), tuple(mid[1]), (235, 235, 235), 1, cv2.LINE_AA)
        cen = cam.px([(0, Wt / 2, 0), (L, Wt / 2, 0)]).astype(np.int32)
        cv2.line(img, tuple(cen[0]), tuple(cen[1]), (200, 200, 200), 1, cv2.LINE_AA)
        net = cam.px([(L / 2, -0.1, 0), (L / 2, Wt + 0.1, 0), (L / 2, Wt + 0.1, 0.1525), (L / 2, -0.1, 0.1525)]).astype(np.int32)
        ov = img.copy(); cv2.fillConvexPoly(ov, net, (60, 60, 60)); img = cv2.addWeighted(ov, 0.55, img, 0.45, 0)
        cv2.polylines(img, [net], True, (230, 230, 230), 1, cv2.LINE_AA)
        bp = ball_pos(t)
        if bp is not None:
            uv = cam.px([bp])[0]
            nxt = ball_pos(t + 1 / FPS) or bp
            d = cam.px([nxt])[0] - uv
            draw_ball(img, uv, 4.2, (250, 250, 250), blur_dir=-d)
            truth_ball.append({"t": round(t, 3), "x_px": round(float(uv[0]), 1), "y_px": round(float(uv[1]), 1), "table_x_m": round(bp[0], 3), "table_y_m": round(bp[1], 3), "height_m": round(bp[2], 3)})
        frames.append(img)
    encode(frames, OUT / "table-tennis-composite.mp4")
    truth = {"kind": "table-tennis-composite", "fps": FPS, "size": [W, H], "table_m": [L, Wt], "table_corners_px_left_near_right_near_right_far_left_far": [[round(float(x), 1), round(float(y), 1)] for x, y in cpx],
             "rallies": rally_truth, "ball": truth_ball, "note": "Rendered table and ball, real-pixel person cut-outs. Not match footage."}
    (OUT / "table-tennis-composite.truth.json").write_text(json.dumps(truth, indent=1))
    cv2.imwrite(str(OUT / "_tt-frame.jpg"), frames[int(2.0 * FPS)])


# ------------------------------------------------------------------------------------------------------------ basketball
def court_lines():
    pts = []

    def line(a, b):
        pts.append(np.linspace(a, b, 24))

    def arc(c, r, a0, a1):
        a = np.linspace(math.radians(a0), math.radians(a1), 48)
        pts.append(np.stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)], 1))
    line((0, 0), (28, 0)); line((28, 0), (28, 15)); line((28, 15), (0, 15)); line((0, 15), (0, 0)); line((14, 0), (14, 15))
    arc((14, 7.5), 1.8, 0, 360)
    for sx, ox in ((1, 0.0), (-1, 28.0)):
        x = lambda d: ox + sx * d  # noqa: E731
        line((x(0), 5.05), (x(5.8), 5.05)); line((x(5.8), 5.05), (x(5.8), 9.95)); line((x(5.8), 9.95), (x(0), 9.95))
        a0, a1 = (-90, 90) if sx == 1 else (90, 270)
        arc((x(5.8), 7.5), 1.8, a0, a1)
        line((x(0), 0.9), (x(2.99), 0.9)); line((x(0), 14.1), (x(2.99), 14.1))
        arc((x(1.575), 7.5), 6.75, (-68 if sx == 1 else 112), (68 if sx == 1 else 248))
    return [np.hstack([p, np.zeros((len(p), 1))]) for p in pts]


def basketball(crops):
    cam = Cam((20.5, -9.5, 6.2), (20.5, 6.0, 0), 700)
    corners_world = [(0, 0), (28, 0), (28, 15), (0, 15)]
    lines = court_lines()
    dur = 20.0
    # four players move on smooth closed paths in the right half-court (world metres)
    centres = [(20.5, 4.5), (21.5, 10.5), (17.0, 7.5), (24.0, 7.5)]
    radii = [(3.0, 1.8), (2.6, 2.0), (2.2, 2.6), (1.8, 1.4)]
    phases = [0.0, 1.3, 2.4, 3.6]
    speeds = [0.30, 0.26, 0.33, 0.28]

    def pos(k, t):
        a = 2 * math.pi * speeds[k] * t / 4 + phases[k]
        return (centres[k][0] + radii[k][0] * math.cos(a), centres[k][1] + radii[k][1] * math.sin(a * 1.3))

    # ball: held by one player at a time (dribbling), passes in flight between them
    plan = [(0.5, 4.0, 0), (4.0, 4.7, "pass", 0, 1), (4.7, 9.0, 1), (9.0, 9.7, "pass", 1, 3), (9.7, 14.0, 3), (14.0, 14.7, "pass", 3, 2), (14.7, 19.5, 2)]
    holds = []

    def ball_at(t):
        for seg in plan:
            if seg[0] <= t < seg[1]:
                if seg[2] == "pass":
                    u = (t - seg[0]) / (seg[1] - seg[0])
                    a, b = pos(seg[3], seg[0]), pos(seg[4], seg[1])
                    return ((a[0] + (b[0] - a[0]) * u), (a[1] + (b[1] - a[1]) * u), 1.3 + 0.9 * math.sin(math.pi * u)), None
                k = seg[2]
                p = pos(k, t)
                z = 0.55 + 0.45 * abs(math.cos(2 * math.pi * 1.9 * t))
                return (p[0] + 0.25, p[1], z), k
        return None, None

    frames, ball_truth, players_truth = [], [], []
    for i in range(int(dur * FPS)):
        t = i / FPS
        img = np.full((H, W, 3), (92, 112, 128), np.uint8)   # darker surround
        floor = cam.px([(-0.7, -0.7, 0), (28.7, -0.7, 0), (28.7, 15.7, 0), (-0.7, 15.7, 0)]).astype(np.int32)
        cv2.fillConvexPoly(img, floor, (112, 156, 196), cv2.LINE_AA)   # pale wood (BGR)
        noise = rng.normal(0, 3, (H, W, 1)).astype(np.int16)
        img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        for ln in lines:
            cv2.polylines(img, [cam.px(ln).astype(np.int32)], False, (240, 240, 240), 2, cv2.LINE_AA)
        order = sorted(range(4), key=lambda k: -cam.depth((*pos(k, t), 0)))
        for k in order:
            p = pos(k, t)
            fp, hp = cam.px([(p[0], p[1], 0), (p[0], p[1], 1.78)])
            paste(img, crops[k % len(crops)], fp, abs(fp[1] - hp[1]))
        b, holder = ball_at(t)
        if b is not None:
            uv = cam.px([b])[0]
            nb = ball_at(t + 1 / FPS)[0] or b
            draw_ball(img, uv, max(3.5, 700 * 0.12 / max(cam.depth(b), 1)), (24, 112, 232), blur_dir=-(cam.px([nb])[0] - uv))
            ball_truth.append({"t": round(t, 3), "x_px": round(float(uv[0]), 1), "y_px": round(float(uv[1]), 1), "court_x_m": round(b[0], 2), "court_y_m": round(b[1], 2), "height_m": round(b[2], 2), "held_by": holder})
        players_truth.append({"t": round(t, 3), "players": [[round(v, 2) for v in pos(k, t)] for k in range(4)]})
        frames.append(img)
    encode(frames, OUT / "basketball-composite.mp4")
    possession = [{"player": s[2], "start_t": s[0], "end_t": s[1]} for s in plan if s[2] != "pass"]
    truth = {"kind": "basketball-composite", "fps": FPS, "size": [W, H], "court_m": [28, 15],
             "court_corners_px_in_world_order_(0,0)_(28,0)_(28,15)_(0,15)": [[round(float(x), 1), round(float(y), 1)] for x, y in cam.px([(x, y, 0) for x, y in corners_world])],
             "possession_intervals": possession, "ball": ball_truth, "players": players_truth[::3], "note": "Rendered court and ball, real-pixel person cut-outs. Not game footage."}
    (OUT / "basketball-composite.truth.json").write_text(json.dumps(truth, indent=1))
    cv2.imwrite(str(OUT / "_bb-frame.jpg"), frames[int(2.0 * FPS)])


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(REPO / "public" / "activity" / "samples" / "pedestrians-opencv-vtest.mp4", SAMPLES_PUBLIC / "pedestrians-opencv-vtest.mp4")
    crops = person_crops(4)
    print("crops:", [c.shape[:2] for c in crops])
    table_tennis(crops)
    basketball(crops)
    print("done")
