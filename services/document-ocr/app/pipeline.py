"""Document -> page images -> text items (PDF text layer or OCR) -> layout (rows, tables, headings) -> fields, checks, classification."""
from __future__ import annotations

import io
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageOps

from . import embedded, extract, layout
from .media import MediaError
from .ocr import ENGINE_INFO, Ocr, enhance, estimate_skew, rotate

Image.MAX_IMAGE_PIXELS = None  # sizes are checked against the configured limit before decoding


class Cancelled(Exception):
    pass


@dataclass
class Params:
    ocr_mode: str = "auto"      # auto: OCR only pages without a usable text layer | ocr: OCR every page | embedded: PDF text layer only
    deskew: bool = True
    enhance: bool = False
    sensitivity: str = "high"   # OCR detection sensitivity: standard | high
    pages: tuple[int, int] | None = None  # 1-based inclusive page range


@dataclass
class Progress:
    stage: str = "queued"
    done: int = 0
    total: int = 0
    seconds: float = 0.0


@dataclass
class Result:
    pages: list[dict] = field(default_factory=list)
    fields: list[dict] = field(default_factory=list)
    validations: list[dict] = field(default_factory=list)
    classification: dict = field(default_factory=dict)
    summary: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    page_images: list[bytes] = field(default_factory=list)  # PNG per page
    page_pt: list[tuple[float, float]] = field(default_factory=list)  # page size in points for the searchable PDF export


SOURCE_LABEL = {"embedded_text": "PDF text layer", "ocr_model": "OCR"}


def _fit(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    if max(h, w) <= max_side:
        return img
    s = max_side / max(h, w)
    return cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)


def _pil_to_bgr(im: Image.Image) -> np.ndarray:
    im = ImageOps.exif_transpose(im)
    if im.mode in ("I;16", "I;16B", "I;16L", "I", "F"):
        a = np.asarray(im, np.float32)
        a = (a - a.min()) / max(float(a.max() - a.min()), 1.0) * 255
        im = Image.fromarray(a.astype(np.uint8), "L")
    if im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[3])
        im = bg
    return cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2BGR)


class Source:
    """Yields (page_number, bgr image, pdf page or None, size in points) for each page, validating as it goes."""

    def __init__(self, path: Path, fmt: str, dpi: int, max_side: int, max_pages: int, max_pixels: int):
        self.path, self.fmt, self.dpi, self.max_side, self.max_pages, self.max_pixels = path, fmt, dpi, max_side, max_pages, max_pixels
        self.pdf = None
        if fmt == "pdf":
            try:
                self.pdf = pdfium.PdfDocument(str(path))
            except Exception as e:  # noqa: BLE001
                msg = str(e).lower()
                raise MediaError("The PDF is password-protected. Remove the password and upload it again." if "password" in msg else "The PDF could not be opened. The file may be damaged.") from None
            self.n = len(self.pdf)
        else:
            try:
                im = Image.open(path)
                self.n = getattr(im, "n_frames", 1)
                if im.size[0] * im.size[1] > max_pixels:
                    raise MediaError(f"The image is {im.size[0]}x{im.size[1]} pixels; the limit is {max_pixels / 1e6:.0f} megapixels.")
                im.close()
            except MediaError:
                raise
            except Exception:  # noqa: BLE001
                raise MediaError("The image could not be read. The file may be damaged.") from None
        if self.n == 0:
            raise MediaError("The document has no pages.")
        if self.n > max_pages:
            raise MediaError(f"The document has {self.n} pages; this service accepts up to {max_pages}. Upload fewer pages.")

    def page(self, i: int):
        if self.pdf is not None:
            pg = self.pdf[i]
            W, H = pg.get_size()
            scale = min(self.dpi / 72, self.max_side / max(W, H))
            bmp = pg.render(scale=scale)
            arr = np.ascontiguousarray(bmp.to_numpy())
            if arr.shape[2] == 4:
                arr = cv2.cvtColor(arr, cv2.COLOR_BGRA2BGR)
            return arr, pg, (W, H)
        with Image.open(self.path) as im:
            im.seek(i)
            if im.size[0] * im.size[1] > self.max_pixels:
                raise MediaError("A page of this image is too large.")
            dpi = im.info.get("dpi", (150, 150))[0] or 150
            bgr = _pil_to_bgr(im)
        h, w = bgr.shape[:2]
        dpi = dpi if 50 <= dpi <= 1200 else 150
        return _fit(bgr, self.max_side), None, (w * 72 / dpi, h * 72 / dpi)


def _polish(items: list[dict], src: str, page: int) -> None:
    for n, it in enumerate(items, 1):
        it["id"] = f"p{page}-l{n}"
        it["source"] = src
        it.setdefault("conf", None)


def analyse(path: Path, fmt: str, params: Params, ocr: Ocr, progress: Progress, cancelled, limits) -> Result:
    t_all = time.perf_counter()
    src = Source(path, fmt, limits.render_dpi, limits.max_side_px, limits.max_pages, limits.max_pixels)
    lo, hi = (params.pages or (1, src.n))
    lo, hi = max(1, lo), min(src.n, hi)
    if lo > hi:
        raise MediaError("The page range is outside the document.")
    progress.total, progress.stage = hi - lo + 1, "analysing"
    res = Result()
    stage_t = {"render": 0.0, "text_layer": 0.0, "preprocess": 0.0, "ocr": 0.0, "layout": 0.0, "fields": 0.0}
    all_fields: list[dict] = []
    all_tables: list[dict] = []
    texts: list[str] = []
    for pno in range(lo, hi + 1):
        if cancelled():
            raise Cancelled()
        t = time.perf_counter()
        img, pg, size_pt = src.page(pno - 1)
        stage_t["render"] += time.perf_counter() - t
        h, w = img.shape[:2]
        warn: list[str] = []
        items: list[dict] = []
        origin = "ocr_model"
        pre = {"deskew": None, "enhance": False}
        ocr_info = None
        rotated = pg is not None and pg.get_rotation() != 0
        if pg is not None and params.ocr_mode != "ocr" and not rotated:
            t = time.perf_counter()
            items = embedded.extract(pg)
            stage_t["text_layer"] += time.perf_counter() - t
            origin = "embedded_text"
            if sum(len(i["text"]) for i in items) < 20 and params.ocr_mode == "auto":
                items, origin = [], "ocr_model"   # (nearly) no text layer: this is a scan
            elif not items and params.ocr_mode == "embedded":
                warn.append("This page has no text layer and OCR was switched off, so no text was read.")
        elif pg is not None and rotated and params.ocr_mode != "ocr":
            warn.append(f"The page is rotated by {pg.get_rotation()} degrees in the PDF; the text layer was not used and OCR was applied instead.")
        elif pg is None and params.ocr_mode == "embedded":
            raise MediaError("Images have no text layer. Use OCR for image uploads.")
        if origin == "ocr_model" and not (params.ocr_mode == "embedded" and not items and pg is not None):
            t = time.perf_counter()
            progress.stage = f"page {pno}: preparing"
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            if params.deskew:
                ang, gain = estimate_skew(gray)
                if abs(ang) >= 0.3 and gain >= 1.05:
                    img = rotate(img, ang)
                    pre["deskew"] = {"applied": True, "correction_degrees": round(ang, 2), "evidence_gain": round(gain, 2)}
                else:
                    pre["deskew"] = {"applied": False, "estimated_degrees": round(ang, 2), "evidence_gain": round(gain, 2)}
            ocr_in = img
            if params.enhance:
                ocr_in, pre["enhance"] = enhance(img), True
            stage_t["preprocess"] += time.perf_counter() - t
            progress.stage = f"page {pno}: recognising text"
            items, dt = ocr(ocr_in, params.sensitivity)
            stage_t["ocr"] += dt
            ocr_info = {"engine": ENGINE_INFO["name"], "seconds": round(dt, 2), "lines": len(items), "sensitivity": params.sensitivity}
            tall = sum(1 for i in items if len(i["text"]) > 3 and (i["bbox"][3] - i["bbox"][1]) * h > 2 * (i["bbox"][2] - i["bbox"][0]) * w)
            if items and tall > 0.5 * len(items):
                warn.append("Most recognised lines are vertical: the page may be rotated by 90 degrees, which this service does not correct.")
            if not items:
                warn.append("No text was recognised on this page.")
        _polish(items, origin, pno)
        t = time.perf_counter()
        progress.stage = f"page {pno}: layout"
        grids = layout.find_grids(img)
        tables, in_table = [], set()
        for k, g in enumerate(grids, 1):
            tb, used = layout.fill_grid(g, items, k, pno)
            tables.append(tb)
            in_table |= used
        for it in items:
            it["in_table"] = id(it) in in_table
        rws = layout.rows(items)
        for ri, r in enumerate(rws):
            for it in r:
                it["row"] = ri
        heads = layout.headings(items, in_table)
        stage_t["layout"] += time.perf_counter() - t
        t = time.perf_counter()
        fields = extract.extract_fields(pno, rws, in_table, lambda it: it["source"])
        stage_t["fields"] += time.perf_counter() - t
        all_fields += fields
        all_tables += tables
        page_text = "\n".join(layout.row_text([i for i in r]) for r in rws)
        texts.append(page_text)
        ok, png = cv2.imencode(".png", img)
        res.page_images.append(png.tobytes())
        res.page_pt.append(size_pt)
        res.pages.append({"page": pno, "width_px": w, "height_px": h, "source": origin, "source_label": SOURCE_LABEL[origin], "items": [{k: v for k, v in it.items() if k not in ("char_x", "poly")} for it in items],
                          "tables": tables, "headings": heads, "preprocessing": pre, "ocr": ocr_info, "warnings": warn, "text": page_text})
        progress.done = pno - lo + 1
        progress.seconds = time.perf_counter() - t_all
    for p in res.pages:
        res.warnings += [f"Page {p['page']}: {w}" for w in p["warnings"]]
    res.fields = all_fields
    res.validations = extract.validations(all_fields, all_tables)
    res.classification = extract.classify("\n".join(texts), len(all_tables))
    confs = [i["conf"] for p in res.pages for i in p["items"] if i.get("conf") is not None]
    by_src: dict[str, int] = {}
    for p in res.pages:
        by_src[p["source"]] = by_src.get(p["source"], 0) + len(p["items"])
    flagged = sum(1 for f in all_fields if f["flags"])
    res.summary = {"pages": len(res.pages), "text_items": sum(by_src.values()), "items_by_source": by_src, "ocr_lines": by_src.get("ocr_model", 0),
                   "ocr_confidence": {"mean": round(float(np.mean(confs)), 3), "min": round(float(np.min(confs)), 3), "lines_below_0.85": int(sum(c < extract.LOW_CONF for c in confs))} if confs else None,
                   "tables": len(all_tables), "fields": len(all_fields), "fields_by_type": {t: sum(1 for f in all_fields if f["type"] == t) for t in sorted({f["type"] for f in all_fields})}, "fields_flagged": flagged,
                   "validations": {"run": len(res.validations), "failed": sum(1 for v in res.validations if not v["passed"])},
                   "seconds": {**{k: round(v, 2) for k, v in stage_t.items()}, "total": round(time.perf_counter() - t_all, 2)}}
    if any(p["source"] == "embedded_text" for p in res.pages):
        res.warnings.append("Pages read from a PDF text layer show what the file contains; whoever made the PDF (or an earlier OCR run) decided that text, and it can differ from what the page image shows.")
    progress.stage = "done"
    return res
