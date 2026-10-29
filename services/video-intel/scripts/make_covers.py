"""Portfolio covers for samples 22-24 (public/covers/cv-22..24.jpg, 1200x675), built from REAL pipeline output.

* 22: an ILLUSTRATIVE rendered dining room (no restaurant footage is available to bundle) with real-pixel person cut-outs. The boxes, track numbers and the event
  table on the cover are produced by the actual detector, tracker and presence analytics run on that rendered sequence.
* 23 / 24: frames of the bundled composite clips with the real tracker output (boxes, ball trail) and real numbers from the analytics.
Every cover carries a small 'Illustrative composite' label because none of them is customer or match footage.
Run: python scripts/make_covers.py"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
import make_samples as ms  # noqa: E402
from app import analytics as A  # noqa: E402
from app.detector import Detector  # noqa: E402
from app.media import probe_video  # noqa: E402
from app.pipeline import JobParams, Progress, analyse  # noqa: E402
from app.tracker import ByteTracker  # noqa: E402

OUT = REPO / "public" / "covers"
S = REPO / "public" / "vi" / "samples"
W, H = 1200, 675
SERIF, SERIFB = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
GREEN, DARK, LIGHT, PALE, TEXT, SUB, BORDER, WARN = (22, 131, 74), (17, 100, 58), (233, 247, 239), (243, 251, 246), (28, 41, 34), (102, 115, 107), (226, 234, 229), (217, 119, 6)
font = lambda s, b=False: ImageFont.truetype(SERIFB if b else SERIF, s)  # noqa: E731
det = Detector(REPO / "services" / "activity-monitor" / "models" / "yolox_s.onnx")


def frame_at(path: Path, t: float) -> np.ndarray:
    cap = cv2.VideoCapture(str(path)); cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * cap.get(cv2.CAP_PROP_FPS))); ok, f = cap.read(); cap.release()
    assert ok
    return f


def to_cover(img_bgr: np.ndarray, crop: tuple[int, int, int, int] | None = None):
    """Scale (and optionally crop) a frame to fill the cover; returns the image, the scale and the offset so that cover_xy = source_xy * scale - offset."""
    cx0, cy0 = (crop[0], crop[1]) if crop else (0, 0)
    src = img_bgr[crop[1]:crop[3], crop[0]:crop[2]] if crop else img_bgr
    im = Image.fromarray(cv2.cvtColor(src, cv2.COLOR_BGR2RGB))
    r = max(W / im.width, H / im.height)
    im = im.resize((int(im.width * r) + 1, int(im.height * r) + 1), Image.LANCZOS)
    dx, dy = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((dx, dy, dx + W, dy + H)).convert("RGB"), r, (cx0 * r + dx, cy0 * r + dy)


def card(d: ImageDraw.ImageDraw, box, title: str, rows: list[tuple[str, str]], width_label: int = 190):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 14, fill=(255, 255, 255), outline=BORDER, width=2)
    d.rounded_rectangle((x0, y0, x1, y0 + 40), 14, fill=LIGHT)
    d.rectangle((x0, y0 + 24, x1, y0 + 40), fill=LIGHT)
    d.text((x0 + 16, y0 + 8), title, font=font(19, True), fill=DARK)
    y = y0 + 52
    for a, b in rows:
        d.text((x0 + 16, y), a, font=font(17), fill=SUB); d.text((x0 + 16 + width_label, y), b, font=font(18, True), fill=TEXT); y += 30


def finish(im: Image.Image, no: str, title: str, sub: str, label: str) -> Image.Image:
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((0, H - 96, W, H), fill=(255, 255, 255, 245)); d.rectangle((0, H - 100, W, H - 96), fill=GREEN + (255,))
    d.text((36, H - 84), title, font=font(34, True), fill=DARK); d.text((38, H - 38), sub, font=font(19), fill=SUB)
    d.rounded_rectangle((W - 120, H - 78, W - 36, H - 24), 12, fill=GREEN); d.text((W - 78, H - 51), no, font=font(30, True), fill=(255, 255, 255), anchor="mm")
    d.rounded_rectangle((W - 330, 18, W - 18, 52), 10, fill=(255, 255, 255, 225)); d.text((W - 174, 35), label, font=font(15), fill=SUB, anchor="mm")
    return im


def boxes(im: Image.Image, items, k, off, color=GREEN):
    d = ImageDraw.Draw(im, "RGBA")
    for label, x0, y0, x1, y1, col in items:
        b = (x0 * k - off[0], y0 * k - off[1], x1 * k - off[0], y1 * k - off[1])
        d.rectangle(b, outline=col, width=3)
        tw = d.textlength(label, font=font(15, True)) + 12
        d.rectangle((b[0], b[1] - 22, b[0] + tw, b[1]), fill=col); d.text((b[0] + 6, b[1] - 20), label, font=font(15, True), fill=(255, 255, 255))


# ------------------------------------------------------------------------------------------------------------ 22 restaurant (illustrative render)
def restaurant():
    cam = ms.Cam((-0.6, -0.8, 3.1), (5.2, 3.6, 0.0), 540)
    crops = ms.person_crops(4)
    rng = np.random.default_rng(3)
    tables = [(2.2, 2.0), (4.4, 2.0), (6.6, 2.0), (2.2, 4.4), (4.4, 4.4), (6.6, 4.4)]
    paths = [  # (crop index, waypoints in metres over 14 s): two staff walk the service lane, one guest enters
        (0, [(1.0, 0.8), (1.0, 3.2), (8.8, 3.2), (8.8, 3.0)]), (1, [(9.0, 1.0), (7.9, 3.2), (3.0, 3.2), (1.0, 3.2)]), (2, [(5.0, 6.2), (5.0, 5.4), (5.0, 3.2), (5.0, 3.2)]), (3, [(7.6, 6.0), (7.6, 6.0), (7.6, 6.0), (7.6, 5.9)]),
    ]
    roi_world = [(0.2, 2.6), (9.6, 2.6), (9.6, 3.9), (0.2, 3.9)]  # the service lane between the two table rows
    fps, dur = 10, 16.0

    def pos(wp, t):
        seg = len(wp) - 1; u = min(seg - 1e-6, max(0.0, t / dur * seg)); i = int(u); f = u - i
        return (wp[i][0] + (wp[i + 1][0] - wp[i][0]) * f, wp[i][1] + (wp[i + 1][1] - wp[i][1]) * f)

    def room() -> np.ndarray:
        img = np.full((H, W, 3), (40, 40, 40), np.uint8)
        # back wall and side wall
        wall = cam.px([(0, 7, 0), (10, 7, 0), (10, 7, 3), (0, 7, 3)]).astype(np.int32); cv2.fillConvexPoly(img, wall, (196, 214, 205))
        side = cam.px([(10, 0, 0), (10, 7, 0), (10, 7, 3), (10, 0, 3)]).astype(np.int32); cv2.fillConvexPoly(img, side, (176, 196, 186))
        for x0 in (1.0, 4.4, 7.8):
            win = cam.px([(x0, 7, 0.9), (x0 + 1.5, 7, 0.9), (x0 + 1.5, 7, 2.4), (x0, 7, 2.4)]).astype(np.int32); cv2.fillConvexPoly(img, win, (235, 238, 225)); cv2.polylines(img, [win], True, (150, 165, 155), 2)
        floor = cam.px([(0, 0, 0), (10, 0, 0), (10, 7, 0), (0, 7, 0)]).astype(np.int32); cv2.fillConvexPoly(img, floor, (178, 190, 182))
        for i in range(10):
            for j in range(7):
                if (i + j) % 2 == 0:
                    q = cam.px([(i, j, 0), (i + 1, j, 0), (i + 1, j + 1, 0), (i, j + 1, 0)]).astype(np.int32); cv2.fillConvexPoly(img, q, (166, 180, 172))
        # bar counter along the back wall (right)
        bar = [(5.6, 6.3, 0), (9.8, 6.3, 0), (9.8, 6.3, 1.05), (5.6, 6.3, 1.05)]; cv2.fillConvexPoly(img, cam.px(bar).astype(np.int32), (84, 120, 96))
        top = [(5.6, 6.3, 1.05), (9.8, 6.3, 1.05), (9.8, 6.9, 1.05), (5.6, 6.9, 1.05)]; cv2.fillConvexPoly(img, cam.px(top).astype(np.int32), (60, 96, 74))
        for (tx, ty) in tables:
            ang = np.linspace(0, 2 * math.pi, 40)
            leg = cam.px([(tx, ty, 0), (tx, ty, 0.74)]).astype(np.int32); cv2.line(img, tuple(leg[0]), tuple(leg[1]), (70, 70, 70), 4)
            disc = cam.px([(tx + 0.5 * math.cos(a), ty + 0.5 * math.sin(a), 0.74) for a in ang]).astype(np.int32); cv2.fillConvexPoly(img, disc, (244, 244, 238)); cv2.polylines(img, [disc], True, (200, 205, 198), 1)
            for a in (0.4, 2.0, 3.6, 5.2):
                c = cam.px([(tx + 0.85 * math.cos(a), ty + 0.85 * math.sin(a), 0.45)])[0].astype(int); cv2.circle(img, tuple(c), 9, (60, 96, 74), -1)
        noise = rng.normal(0, 3.0, img.shape).astype(np.int16); img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        yy, xx = np.mgrid[0:H, 0:W]; vig = 1 - 0.35 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2); img = (img * vig[..., None]).astype(np.uint8)
        return img

    base = room()
    roi_px = cam.px([(x, y, 0) for x, y in roi_world])
    tracker = ByteTracker(high_thresh=0.35, low_thresh=0.1, buffer_frames=30)
    tracks, snaps = {}, {}
    for i in range(int(dur * fps)):
        t = i / fps
        img = base.copy()
        order = sorted(range(len(paths)), key=lambda k: -cam.depth((*pos(paths[k][1], t), 0)))
        for k in order:
            p = pos(paths[k][1], t)
            fp, hp = cam.px([(p[0], p[1], 0), (p[0], p[1], 1.75)])
            ms.paste(img, crops[paths[k][0]], fp, abs(fp[1] - hp[1]))
        d = det(img, person_thr=0.1)["person"]
        tr = tracker.update(d[0], d[1], ["person"] * len(d[1]))
        for st in tr:
            b = [float(v) for v in st.tlbr]
            tracks.setdefault(int(st.track_id), []).append({"t": round(t, 2), "box": b, "score": float(st.score)})
        snaps[i] = (img, [(int(st.track_id), [float(v) for v in st.tlbr]) for st in tr])
    # real analytics on the real tracks
    from app.pipeline import Analysis
    an = Analysis(params=JobParams(), effective_fps=fps, width=W, height=H)
    an.tracks = tracks; an.times = [round(i / fps, 2) for i in range(int(dur * fps))]
    ev = A.presence_events(an, roi_px.tolist(), min_stay_s=5.0, merge_gap_s=1.5, min_obs=3)
    print("restaurant events:", ev["summary"], [(e["track_id"], e["entry_t"], e["exit_t"], e["flag"]) for e in ev["events"]])
    # choose a frame where several tracked people are visible
    pick = max(range(40, 120), key=lambda i: len(snaps[i][1]))
    img, items = snaps[pick]
    cv2.polylines(img, [roi_px.astype(np.int32)], True, (74, 131, 22), 3)
    ov = img.copy(); cv2.fillPoly(ov, [roi_px.astype(np.int32)], (74, 131, 22)); img = cv2.addWeighted(ov, 0.18, img, 0.82, 0)
    cover, k, off = to_cover(img)
    flagged = {e["track_id"] for e in ev["events"] if e["flag"]}
    boxes(cover, [(f"#{i}", *b, WARN if i in flagged else GREEN) for i, b in items], k, off)
    d = ImageDraw.Draw(cover, "RGBA"); d.rectangle((18, 16, 368, 52), fill=(0, 0, 0, 150)); d.text((28, 22), f"CAM 02  DINING ROOM   12:00:{(pick // 10) % 60:02d}", font=font(17, True), fill=(255, 255, 255)); d.ellipse((344, 28, 354, 38), fill=(220, 38, 38))
    rows = [(f"#{e['track_id']}  {e['entry_t']:.1f}–{e['exit_t']:.1f}s", f"{e['duration_s']:.1f}s" + ("  FLAG" if e["flag"] else "")) for e in ev["events"][:4]]
    card(d, (W - 372, 70, W - 22, 70 + 52 + 30 * max(1, len(rows)) + 44), "Area events (real output)", rows or [("No events", "")], 215)
    d.text((W - 356, 70 + 52 + 30 * max(1, len(rows)) + 10), "FLAG = Potential Extended Area Presence", font=font(14), fill=WARN)
    return finish(cover, "22", "Restaurant Area-Presence Review", "Entry · exit · duration events for human review, with no face recognition", "Illustrative rendered dining room")


# ------------------------------------------------------------------------------------------------------------ 23 table tennis
def pipeline(name: str, **kw):
    p = S / f"{name}.mp4"
    return analyse(p, probe_video(p, 10**8, 10**5), JobParams(**kw), det, Progress(), lambda: False, 10000)


def tabletennis():
    an = pipeline("table-tennis-composite", mode="tabletennis", sample_fps=30, ball=True, ball_kind="white")
    t = json.loads((S / "table-tennis-composite.truth.json").read_text())
    r = A.table_tennis(an, t["table_corners_px_left_near_right_near_right_far_left_far"], 0.6, 1.0)
    print("tt:", r["ball"]["visibility_pct"], len(r["segments"]))
    ok = [f for f in an.frames if 2.0 <= f["t"] <= 4.0 and len(f["persons"]) == 2 and f["ball"]]
    tt = ok[len(ok) // 2]["t"]
    img = frame_at(S / "table-tennis-composite.mp4", tt)
    j = min(range(len(an.frames)), key=lambda i: abs(an.frames[i]["t"] - tt))
    cover, k, off = to_cover(img, (60, 110, 900, 110 + 473))
    d = ImageDraw.Draw(cover, "RGBA")
    pts = [p for p in an.ball_points if tt - 0.7 <= p["t"] <= tt]
    sc = lambda x, y: (x * k - off[0], y * k - off[1])  # noqa: E731
    if len(pts) > 1:
        d.line([sc(p["x"], p["y"]) for p in pts], fill=WARN + (230,), width=4)
        cx, cy = sc(pts[-1]["x"], pts[-1]["y"]); d.ellipse((cx - 11, cy - 11, cx + 11, cy + 11), outline=WARN, width=3)
    corners = [sc(*c) for c in t["table_corners_px_left_near_right_near_right_far_left_far"]]
    d.polygon(corners, outline=GREEN + (255,), fill=GREEN + (36,))
    for c, lbl in zip(corners, "1234"):
        d.ellipse((c[0] - 6, c[1] - 6, c[0] + 6, c[1] + 6), fill=GREEN, outline=(255, 255, 255), width=2); d.text((c[0] + 9, c[1] - 24), lbl, font=font(16, True), fill=DARK)
    boxes(cover, [(f"#{p['id']}", *p["box"], GREEN) for p in an.frames[j]["persons"]], k, off)
    seg = r["segments"][0]
    card(d, (W - 372, 70, W - 22, 290), "Real tracker output", [("Ball visible", f"{r['ball']['visibility_pct']}%"), ("Ball detections", str(r["ball"]["detected_points"])), ("Ball-visible segments", str(len(r["segments"]))), ("Bounce candidates", str(sum(len(g["bounce_candidates"]) for g in r["segments"])))], 215)
    d.text((W - 356, 258), "Experimental ball tracking", font=font(14), fill=WARN)
    del seg
    return finish(cover, "23", "Table Tennis Video Intelligence", "Player and ball tracking, table calibration and honest rally analytics", "Illustrative composite clip")


# ------------------------------------------------------------------------------------------------------------ 24 basketball
def basketball():
    an = pipeline("basketball-composite", mode="basketball", sample_fps=15, ball=True, ball_kind="orange")
    t = json.loads((S / "basketball-composite.truth.json").read_text())
    refs = [x for x in t["landmarks_px"] if x["visible"]]
    r = A.basketball(an, [x["px"] for x in refs], [x["world"] for x in refs], 1.0, None, 0.6, 0.08)
    print("bb:", r["calibration"], len(r["possession"]), r["players"][:2])
    ok = [f for f in an.frames if 4.0 <= f["t"] <= 9.0 and len(f["persons"]) >= 3 and f["ball"]]
    tt = ok[len(ok) // 2]["t"] if ok else 6.0
    img = frame_at(S / "basketball-composite.mp4", tt)
    j = min(range(len(an.frames)), key=lambda i: abs(an.frames[i]["t"] - tt))
    cover, k, off = to_cover(img, (200, 120, 960, 120 + 428))
    d = ImageDraw.Draw(cover, "RGBA"); sc = lambda x, y: (x * k - off[0], y * k - off[1])  # noqa: E731
    pts = [p for p in an.ball_points if tt - 1.0 <= p["t"] <= tt]
    if len(pts) > 1:
        d.line([sc(p["x"], p["y"]) for p in pts], fill=WARN + (230,), width=4)
    boxes(cover, [(f"#{p['id']}", *p["box"], GREEN) for p in an.frames[j]["persons"]], k, off)
    # real heat map card (top view of the mapped court)
    hm = np.array(r["heatmap"]["seconds"]); mx = hm.max() or 1
    cx0, cy0, cw, ch = W - 372, 70, 350, 252
    d.rounded_rectangle((cx0, cy0, cx0 + cw, cy0 + ch), 14, fill=(255, 255, 255, 250), outline=BORDER, width=2); d.rounded_rectangle((cx0, cy0, cx0 + cw, cy0 + 40), 14, fill=LIGHT); d.rectangle((cx0, cy0 + 24, cx0 + cw, cy0 + 40), fill=LIGHT)
    d.text((cx0 + 16, cy0 + 8), "Heat map (real tracks)", font=font(19, True), fill=DARK)
    gx, gy, gw = cx0 + 16, cy0 + 52, cw - 32; gh = gw * 15 / 28
    d.rectangle((gx, gy, gx + gw, gy + gh), fill=PALE, outline=GREEN, width=2)
    for rr in range(hm.shape[0]):
        for cc in range(hm.shape[1]):
            if hm[rr, cc] > 0:
                x0, y0 = gx + cc * gw / 28, gy + gh - (rr + 1) * gh / 15; d.rectangle((x0, y0, x0 + gw / 28, y0 + gh / 15), fill=GREEN + (int(40 + 200 * hm[rr, cc] / mx),))
    d.line((gx + gw / 2, gy, gx + gw / 2, gy + gh), fill=GREEN, width=1)
    d.text((cx0 + 16, gy + gh + 10), f"{len(r['possession'])} potential possession events (rule-based)", font=font(15), fill=SUB)
    return finish(cover, "24", "Basketball Video Intelligence", "Court mapping, player heat maps and possession candidates from real tracks", "Illustrative composite clip")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for fn, no in ((restaurant, "22"), (tabletennis, "23"), (basketball, "24")):
        im = fn(); im.save(OUT / f"cv-{no}.jpg", quality=90); print("wrote", no)
