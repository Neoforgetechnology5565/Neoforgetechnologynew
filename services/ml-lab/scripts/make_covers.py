"""Render the portfolio cover images (public/covers/cv-NN.jpg, 1200x675) from REAL outputs: model results from the running ML lab / defect / documents
services and the bundled sample data. Graphic covers (sports, forecasting, sensors, search, recommendation) are drawn from real results of the same
services or, for sports, are a labelled illustration (no sports footage is bundled).
Needs: ml-lab on :8110, defect-inspector on :8060, public sample data, Pillow, numpy, opencv, laspy (for the LiDAR render).
  python scripts/make_covers.py"""
from __future__ import annotations

import base64
import re
import io
import json
import subprocess
import urllib.request
import uuid
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent.parent.parent.parent
PUB = REPO / "public"
OUT = PUB / "covers"
OUT.mkdir(exist_ok=True)
ML, DEF = "http://localhost:8110", "http://localhost:8060"
W, H = 1200, 675
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIFB = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
BG = (15, 23, 42)
font = lambda s, b=False: ImageFont.truetype(SERIFB if b else SERIF, s)  # noqa: E731


def post(url: str, fields: dict, files: dict | None = None) -> dict:
    b = "----" + uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (name, data) in (files or {}).items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + data + b"\r\n"
    body += f"--{b}--\r\n".encode()
    req = urllib.request.Request(url, body, {"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req, timeout=300))


def get(url: str) -> dict:
    return json.load(urllib.request.urlopen(url, timeout=120))


def durl(u: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(u.split(",", 1)[1]))).convert("RGB")


def frame(video: Path, t: float) -> Image.Image:
    cap = cv2.VideoCapture(str(video))
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, f = cap.read()
    cap.release()
    assert ok, video
    return Image.fromarray(f[:, :, ::-1])


def cover(im: Image.Image, focus: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    s = max(W / im.width, H / im.height)
    r = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
    x = int((r.width - W) * focus[0]); y = int((r.height - H) * focus[1])
    return r.crop((x, y, x + W, y + H))


def finish(im: Image.Image, no: str, caption: str) -> None:
    """Bottom shade with a small caption so every cover reads as part of one set; the photograph/graphic stays unmodified above it."""
    a = np.asarray(im.convert("RGB"), np.float32)
    g = np.clip((np.arange(H)[:, None] - H * 0.72) / (H * 0.28), 0, 1) ** 1.4 * 0.78
    a = a * (1 - g[:, :, None]) + np.array(BG, np.float32) * g[:, :, None]
    out = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(out)
    d.text((36, H - 62), caption, font=font(24, True), fill=(255, 255, 255))
    d.text((W - 36, H - 62), f"{no}", font=font(24, True), fill=(96, 165, 250), anchor="ra")
    out.save(OUT / f"cv-{no}.jpg", quality=84, optimize=True, progressive=True)
    print("wrote", f"cv-{no}.jpg", (OUT / f"cv-{no}.jpg").stat().st_size // 1024, "KB")


def detect(im: Image.Image, thr=0.4) -> Image.Image:
    b = io.BytesIO(); im.save(b, "JPEG", quality=95)
    return durl(post(f"{ML}/api/detect/image", {"threshold": thr}, {"file": ("a.jpg", b.getvalue())})["annotated"])


def pose(im: Image.Image) -> Image.Image:
    b = io.BytesIO(); im.save(b, "JPEG", quality=95)
    return durl(post(f"{ML}/api/pose/image", {"threshold": 0.35}, {"file": ("a.jpg", b.getvalue())})["annotated"])


def chart_base(title: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", (W, H), (15, 23, 42))
    d = ImageDraw.Draw(im)
    d.text((48, 40), title, font=font(30, True), fill=(226, 232, 240))
    return im, d


def poly(d, pts, col, w=3):
    d.line(pts, fill=col, width=w, joint="curve")


# ---- 01-04 existing demos -----------------------------------------------------------------------------------------------
def c01():
    """Real person detections on the OpenCV pedestrian clip, with an illustrative restricted zone and counting line drawn on top (as the CCTV demo lets a user do)."""
    im = detect(frame(PUB / "activity/samples/pedestrians-opencv-vtest.mp4", 62.0), 0.4)
    d = ImageDraw.Draw(im, "RGBA")
    z = [(60, 330), (560, 300), (700, 470), (120, 540)]
    d.polygon(z, fill=(250, 204, 21, 40)); d.line(z + [z[0]], fill=(250, 204, 21, 255), width=4)
    d.line([(0, 250), (768, 215)], fill=(56, 189, 248, 255), width=4)
    finish(cover(im, (0.5, 0.5)), "01", "AI CCTV Intelligence")


def c02():
    p = PUB / "ppe/samples/factory-corridor-ppe.annotated.mp4"
    finish(cover(frame(p, 5.0 if p.is_file() else 3.0)), "02", "Factory PPE Compliance")


def c03():
    finish(cover(detect(frame(PUB / "vehicle/samples/highway-dashcam.mp4", 4.0), 0.3), (0.5, 0.6)), "03", "Vehicle Detection & Counting")


def c04():
    orig = Image.open(PUB / "roof/samples/paris-flat-roofs.original.jpg").convert("RGB")
    ov = Image.open(PUB / "roof/samples/paris-flat-roofs.overlay.png").convert("RGBA")
    if ov.size != orig.size:
        ov = ov.resize(orig.size)
    base = orig.convert("RGBA"); base.alpha_composite(ov)
    finish(cover(base.convert("RGB")), "04", "Roof Measurement")


def c05():
    hw = PUB / "spatial/samples/highway"
    fr, dp = Image.open(hw / "frame_f037.jpg").convert("RGB"), Image.open(hw / "depth_f033.jpg").convert("RGB")
    im = Image.new("RGB", (W, H))
    im.paste(cover(fr).crop((0, 0, W // 2, H)).resize((W // 2, H)), (0, 0))
    im.paste(cover(dp).crop((0, 0, W // 2, H)).resize((W // 2, H)), (W // 2, 0))
    ImageDraw.Draw(im).line([(W // 2, 0), (W // 2, H)], fill=(255, 255, 255), width=3)
    finish(im, "05", "Spatial Mapping & 3D Reconstruction")


def c06():
    """Illustration only: no sports footage is bundled. A pitch with a heat map drawn from a seeded random walk, labelled as such."""
    im = Image.new("RGB", (W, H), (22, 80, 45)); d = ImageDraw.Draw(im)
    m = 60
    for k in range(0, 8):
        d.rectangle([m + k * (W - 2 * m) / 8, m, m + (k + 1) * (W - 2 * m) / 8, H - m - 60], fill=(26, 92, 52) if k % 2 else (22, 80, 45))
    ln = (230, 240, 230)
    d.rectangle([m, m, W - m, H - m - 60], outline=ln, width=4); d.line([(W / 2, m), (W / 2, H - m - 60)], fill=ln, width=4)
    cy = (m + H - m - 60) / 2
    d.ellipse([W / 2 - 70, cy - 70, W / 2 + 70, cy + 70], outline=ln, width=4)
    for sx in (m, W - m):
        s = 1 if sx == m else -1
        d.rectangle([min(sx, sx + s * 160), cy - 130, max(sx, sx + s * 160), cy + 130], outline=ln, width=4); d.rectangle([min(sx, sx + s * 55), cy - 60, max(sx, sx + s * 55), cy + 60], outline=ln, width=4)
    rng = np.random.default_rng(3)
    heat = np.zeros((H, W), np.float32)
    for centre in ((380, cy), (700, cy - 90), (880, cy + 80)):
        p = np.array(centre, float)
        for _ in range(900):
            p += rng.normal(0, 14, 2); p[0] = np.clip(p[0], m + 10, W - m - 10); p[1] = np.clip(p[1], m + 10, H - m - 70)
            cv2.circle(heat, (int(p[0]), int(p[1])), 26, 1.0, -1)
    heat = cv2.GaussianBlur(heat, (0, 0), 28); heat /= heat.max()
    col = cv2.applyColorMap((heat * 255).astype(np.uint8), cv2.COLORMAP_INFERNO)[:, :, ::-1]
    base = np.asarray(im, np.float32); a = (np.clip(heat * 1.4, 0, 0.8))[:, :, None]
    im = Image.fromarray((base * (1 - a) + col * a).astype(np.uint8))
    ImageDraw.Draw(im).text((m + 8, m + 6), "Illustration: seeded random-walk positions, not match data", font=font(15), fill=(240, 240, 240))
    finish(im, "06", "Sports Video Intelligence")


def defect_cover(sample: str, no: str, cap: str):
    ss = get(f"{DEF}/api/sample-images")["samples"]
    s = next(x for x in ss if x["id"] == sample)
    r = post(f"{DEF}/api/inspect", {"sample_id": s["id"], "reference_id": s["reference_id"], "rules": json.dumps({"max_defects": 0, "min_score_ratio": 1.0, "review_band": 0.85, "min_region_area_pct": 0.01, "major_area_pct": None, "fail_on_major_only": False, "min_reference_images": 30, "wrong_part_ratio": 3.0})})
    orig = Image.open(io.BytesIO(urllib.request.urlopen(f"{DEF}/api/inspections/{r['id']}/images/original").read())).convert("RGB")
    heat = Image.open(io.BytesIO(urllib.request.urlopen(f"{DEF}/api/inspections/{r['id']}/images/heatmap").read())).convert("RGBA")
    base = orig.convert("RGBA"); base.alpha_composite(heat.resize(orig.size))
    finish(cover(base.convert("RGB")), no, cap)


def c07():
    defect_cover("pcb1-anomalous-1", "07", "AI Visual Inspection")


def c08():
    import laspy
    las = laspy.read(PUB / "lidar/samples/power-corridor-synthetic.laz")
    p = np.c_[las.x, las.y, las.z]; p = p[np.random.default_rng(1).permutation(len(p))[:120000]]
    p -= p.mean(0); sc = 560 / np.ptp(p[:, 0])
    th = np.radians(32); R = np.array([[np.cos(th), -np.sin(th), 0], [np.sin(th), np.cos(th), 0], [0, 0, 1]])
    q = p @ R.T
    X = W / 2 + q[:, 0] * sc * 1.9; Y = H * 0.62 - q[:, 2] * sc * 1.9 + q[:, 1] * sc * 0.55
    z = (p[:, 2] - p[:, 2].min()) / np.ptp(p[:, 2])
    col = cv2.applyColorMap((z * 255).astype(np.uint8)[:, None], cv2.COLORMAP_TURBO)[:, 0, ::-1]
    img = np.zeros((H, W, 3), np.uint8); img[:] = BG
    order = np.argsort(q[:, 1])
    for i in order:
        x, y = int(X[i]), int(Y[i])
        if 0 <= x < W - 1 and 0 <= y < H - 1:
            img[y:y + 2, x:x + 2] = col[i]
    finish(Image.fromarray(img), "08", "LiDAR Point Cloud & Wire Measurement")


def c09():
    finish(cover(pose(frame(PUB / "activity/samples/pedestrians-opencv-vtest.mp4", 30.0)), (0.5, 0.35)), "09", "Human Activity, Fall & Aggression Review")


def c10():
    r = post(f"{ML}/api/ocr", {"sample_id": "invoice-scanned"})
    pg = r["pages"][0]; im = durl(pg["image"]); d = ImageDraw.Draw(im, "RGBA")
    for l in pg["lines"]:
        b = l["bbox"]; col = (239, 68, 68, 255) if l["confidence"] < 0.85 else (245, 158, 11, 255)
        d.rectangle([b[0] * im.width, b[1] * im.height, b[2] * im.width, b[3] * im.height], outline=col, width=2)
    finish(cover(im, (0.5, 0.1)), "10", "Document Intelligence & OCR")


def c11():
    finish(cover(Image.open(PUB / "foot/samples/synthetic-right-254x97.jpg").convert("RGB"), (0.5, 0.5)), "11", "Shoe & Foot Measurement")


# ---- 12-21 --------------------------------------------------------------------------------------------------------------------
def c12():
    r = post(f"{ML}/api/classify", {"sample_id": "chelsea", "top_k": 4})
    im = Image.open(PUB / "ml/samples/chelsea.jpg").convert("RGB"); c = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(c)
    sc = min((H - 120) / im.height, 560 / im.width); im = im.resize((int(im.width * sc), int(im.height * sc))); c.paste(im, (40, 40))
    x0 = 40 + im.width + 50
    d.text((x0, 60), "Top predictions", font=font(26, True), fill=(226, 232, 240))
    for i, p in enumerate(r["predictions"]):
        y = 130 + i * 90
        d.text((x0, y), p["label"], font=font(24, i == 0), fill=(255, 255, 255)); d.text((W - 60, y), f"{p['probability'] * 100:.1f}%", font=font(24), fill=(148, 163, 184), anchor="ra")
        d.rounded_rectangle([x0, y + 40, W - 60, y + 54], 6, fill=(30, 41, 59)); d.rounded_rectangle([x0, y + 40, x0 + max(8, (W - 60 - x0) * p["probability"]), y + 54], 6, fill=(59, 130, 246) if i == 0 else (100, 116, 139))
    finish(c, "12", "Image Classification & Recognition")


def c13():
    finish(cover(detect(Image.open(PUB / "ml/samples/street.jpg").convert("RGB"), 0.4), (0.5, 0.45)), "13", "Object Detection & Video Analytics")


def c14():
    im = Image.open(PUB / "ml/samples/astronaut.jpg").convert("RGB"); b = io.BytesIO(); im.save(b, "JPEG")
    r = post(f"{ML}/api/segment", {"opacity": 0.55}, {"file": ("a.jpg", b.getvalue())})
    ov = durl(r["overlay"]); ori = durl(r["original"]); c = Image.new("RGB", (W, H), BG)
    s = H / ori.height; a, o = ori.resize((int(ori.width * s), H)), ov.resize((int(ori.width * s), H))
    c.paste(a, (W // 2 - a.width, 0)); c.paste(o, (W // 2, 0)); finish(c, "14", "Image Segmentation & Scene Understanding")


def c15():
    r = post(f"{ML}/api/ocr", {"sample_id": "invoice-text"})
    pg = r["pages"][0]; im = durl(pg["image"]); d = ImageDraw.Draw(im, "RGBA")
    # draw field boxes by locating the field text with a second OCR pass over the page so the boxes are real
    r2 = post(f"{ML}/api/ocr", {"sample_id": "invoice-text", "force_ocr": "true"})
    vals = [f["value"].replace(" ", "") for f in r["fields"]]
    for l in r2["pages"][0]["lines"]:
        hit = any(v and v in l["text"].replace(" ", "") for v in vals)
        b = l["bbox"]; d.rectangle([b[0] * im.width, b[1] * im.height, b[2] * im.width, b[3] * im.height], outline=(168, 85, 247, 255) if hit else (245, 158, 11, 255), width=3 if hit else 2, fill=(168, 85, 247, 40) if hit else None)
    finish(cover(im, (0.5, 0.38)), "15", "OCR & Document Extraction")


def c16():
    defect_cover("macaroni1-anomalous-1", "16", "Image Anomaly & Defect Detection")


def c17():
    r = post(f"{ML}/api/forecast", {"sample_id": "co2-monthly", "date_column": "month", "value_column": "co2_ppm", "horizon": 48})
    im, d = chart_base("Atmospheric CO2 (ppm): history, hold-out check, forecast")
    h, f = r["history"]["y"][-200:], r["forecast"]; ho = r["holdout"]
    allv = h + f["mean"] + (f["lower"] or []) + (f["upper"] or []); lo, hi = min(allv), max(allv)
    n = len(h) + len(f["mean"]); X = lambda i: 70 + i / (n - 1) * (W - 110); Y = lambda v: 110 + (1 - (v - lo) / (hi - lo)) * (H - 260)  # noqa: E731
    for k in range(5):
        y = 110 + k * (H - 260) / 4; d.line([(70, y), (W - 40, y)], fill=(30, 41, 59), width=1)
    if f["lower"]:
        d.polygon([(X(len(h) + i), Y(v)) for i, v in enumerate(f["upper"])] + [(X(len(h) + i), Y(v)) for i, v in reversed(list(enumerate(f["lower"])))], fill=(34, 197, 94, 60))
    poly(d, [(X(i), Y(v)) for i, v in enumerate(h)], (56, 189, 248), 3)
    poly(d, [(X(len(h) - len(ho["predicted"]) + i), Y(v)) for i, v in enumerate(ho["predicted"])], (245, 158, 11), 3)
    poly(d, [(X(len(h) + i), Y(v)) for i, v in enumerate(f["mean"])], (34, 197, 94), 4)
    finish(im, "17", "Time-Series Forecasting")


def c18():
    r = post(f"{ML}/api/sensors", {"sample_id": "pump-sensors-synthetic", "time_column": "timestamp", "sensor_columns": "temperature_c,vibration_mm_s,pressure_bar", "method": "baseline", "window": 48, "z_threshold": 5, "contamination": 0.03})
    im, d = chart_base("Pump sensors: readings (blue) and flagged anomalies (red)")
    for k, name in enumerate(["temperature_c", "vibration_mm_s", "pressure_bar"]):
        y0, hh = 100 + k * 150, 120; v = np.array(r["series"][name]); lo, hi = v.min(), v.max(); n = len(v)
        X = lambda i: 70 + i / (n - 1) * (W - 110); Y = lambda a: y0 + (1 - (a - lo) / (hi - lo + 1e-9)) * hh  # noqa: E731
        poly(d, [(X(i), Y(a)) for i, a in enumerate(v)], (56, 189, 248), 1)
        for i in r["flags"]["baseline"]:
            d.ellipse([X(i) - 3, Y(v[i]) - 3, X(i) + 3, Y(v[i]) + 3], fill=(239, 68, 68))
        d.text((70, y0 - 4), name, font=font(16), fill=(148, 163, 184))
    finish(im, "18", "Predictive Maintenance")


def c19():
    finish(cover(pose(Image.open(PUB / "ml/samples/astronaut.jpg").convert("RGB")), (0.5, 0.3)), "19", "Human Pose Estimation")


def c20():
    sess = uuid.uuid4().hex
    for sid in ("docs-activity-rules", "docs-lidar-measurement", "docs-defects-limitations", "docs-documents-methods"):
        post(f"{ML}/api/search/documents", {"session": sess, "sample_id": sid})
    q = "how are falls detected from body posture"
    r = post(f"{ML}/api/search/query", {"session": sess, "query": q, "mode": "hybrid", "k": 3})
    im, d = chart_base("Semantic search over documents")
    d.rounded_rectangle([48, 100, W - 48, 160], 12, outline=(59, 130, 246), width=3); d.text((72, 114), q, font=font(26), fill=(255, 255, 255))
    for i, h in enumerate(r["results"]):
        y = 190 + i * 140
        d.rounded_rectangle([48, y, W - 48, y + 124], 10, fill=(30, 41, 59))
        d.text((70, y + 10), f"{i + 1}. {h['document']}  ·  semantic {h['semantic_similarity']:.2f}  ·  BM25 {h['bm25']:.1f}", font=font(18, True), fill=(147, 197, 253))
        words, line, yy = re.sub(r"[*#`_]+", "", h["text"]).split(), "", y + 42
        for w in words:
            if d.textlength(line + w, font=font(17)) > W - 150:
                d.text((70, yy), line, font=font(17), fill=(226, 232, 240)); yy += 24; line = ""
                if yy > y + 90: break
            line += w + " "
        d.text((70, yy), line, font=font(17), fill=(226, 232, 240))
    finish(im, "20", "Semantic Document Search")


def c21():
    cat = get(f"{ML}/api/products?category=Sneaker&limit=1")["items"][0]
    r = get(f"{ML}/api/products/{cat['id']}/similar?k=5&image_weight=0.5")
    im, d = chart_base("Similar products: image + text similarity")
    def tile(pid, x, y, s, label, hl):
        t = Image.open(io.BytesIO(urllib.request.urlopen(f"{ML}/api/products/{pid}/image").read())).convert("RGB").resize((s, s), Image.NEAREST)
        d.rounded_rectangle([x - 8, y - 8, x + s + 8, y + s + 40], 10, fill=(30, 41, 59), outline=(59, 130, 246) if hl else None, width=3); im.paste(t, (x, y)); d.text((x, y + s + 6), label, font=font(15), fill=(226, 232, 240))
    tile(cat["id"], 60, 150, 280, "Selected", True)
    for i, x in enumerate(r["results"]):
        tile(x["id"], 420 + (i % 3) * 250, 120 + (i // 3) * 250, 210, f"{x['category']}  {x['score']:.2f}", False)
    finish(im, "21", "Product Recommendation")


if __name__ == "__main__":
    import sys
    for n in (sys.argv[1:] or [f"{i:02d}" for i in range(1, 22)]):
        globals()[f"c{n}"]()
