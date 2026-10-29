"""Page structure from positioned text items: reading order, headings and ruled tables. Everything is rule-based and labelled as such."""
from __future__ import annotations

import cv2
import numpy as np


def height(it: dict) -> float:
    return it["bbox"][3] - it["bbox"][1]


def centre(it: dict) -> tuple[float, float]:
    b = it["bbox"]
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def rows(items: list[dict]) -> list[list[dict]]:
    """Group items that share a text line (vertical overlap) and sort them: top to bottom, left to right."""
    out: list[list[dict]] = []
    for it in sorted(items, key=lambda i: centre(i)[1]):
        cy = centre(it)[1]
        for r in out:
            ry = float(np.mean([centre(x)[1] for x in r]))
            if abs(cy - ry) <= 0.5 * min(height(it), min(height(x) for x in r)):
                r.append(it)
                break
        else:
            out.append([it])
    for r in out:
        r.sort(key=lambda i: i["bbox"][0])
    out.sort(key=lambda r: float(np.mean([centre(x)[1] for x in r])))
    return out


def row_text(r: list[dict]) -> str:
    return "  ".join(i["text"] for i in r)


# ---- ruled tables -------------------------------------------------------------------------------------------------------
def _clusters(idx: np.ndarray, gap: int = 3) -> list[tuple[int, int]]:
    if len(idx) == 0:
        return []
    out, s, p = [], int(idx[0]), int(idx[0])
    for v in idx[1:]:
        if v - p > gap:
            out.append((s, p))
            s = int(v)
        p = int(v)
    out.append((s, p))
    return out


def find_grids(bgr: np.ndarray) -> list[dict]:
    """Tables drawn with ruling lines. Method: binarise, keep long horizontal and vertical strokes with morphological opening, find the
    connected line structures, and read row and column boundaries from where the strokes lie. Tables without ruling lines are not found."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 12)
    hk = cv2.getStructuringElement(cv2.MORPH_RECT, (max(25, w // 22), 1))
    vk = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(25, h // 40)))
    hm, vm = cv2.morphologyEx(bw, cv2.MORPH_OPEN, hk), cv2.morphologyEx(bw, cv2.MORPH_OPEN, vk)
    both = cv2.dilate(cv2.bitwise_or(hm, vm), np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(both, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    grids = []
    for c in cnts:
        x, y, bw_, bh = cv2.boundingRect(c)
        if bw_ < 0.2 * w or bh < 0.025 * h:
            continue
        sub_h, sub_v = hm[y:y + bh, x:x + bw_], vm[y:y + bh, x:x + bw_]
        ys = [int(round((a + b) / 2)) + y for a, b in _clusters(np.where(sub_h.sum(axis=1) > 0.6 * 255 * bw_)[0])]
        xs = [int(round((a + b) / 2)) + x for a, b in _clusters(np.where(sub_v.sum(axis=0) > 0.6 * 255 * bh)[0])]
        if len(ys) >= 3 and len(xs) >= 3:  # at least two rows and two columns
            grids.append({"ys": ys, "xs": xs, "w": w, "h": h})
    grids.sort(key=lambda g: g["ys"][0])
    return grids


def fill_grid(g: dict, items: list[dict], tid: int, page: int) -> dict:
    """Assign items to the cells their centres fall in. Cell text joins its items in reading order."""
    ys, xs, W, H = g["ys"], g["xs"], g["w"], g["h"]
    nr, nc = len(ys) - 1, len(xs) - 1
    cells: list[list[list[dict]]] = [[[] for _ in range(nc)] for _ in range(nr)]
    used = set()
    for it in items:
        cx, cy = centre(it)
        px, py = cx * W, cy * H
        if not (xs[0] <= px <= xs[-1] and ys[0] <= py <= ys[-1]):
            continue
        r = max(0, min(nr - 1, int(np.searchsorted(ys, py) - 1)))
        c = max(0, min(nc - 1, int(np.searchsorted(xs, px) - 1)))
        cells[r][c].append(it)
        used.add(id(it))
    grid = [[" ".join(i["text"] for i in sorted(cell, key=lambda i: (round(centre(i)[1] * 100), i["bbox"][0]))) for cell in row] for row in cells]
    return {"id": f"t{page}-{tid}", "page": page, "bbox": [round(xs[0] / W, 5), round(ys[0] / H, 5), round(xs[-1] / W, 5), round(ys[-1] / H, 5)], "rows": nr, "cols": nc, "cells": grid,
            "row_edges": [round(v / H, 5) for v in ys], "col_edges": [round(v / W, 5) for v in xs],
            "item_ids": [[[i["id"] for i in cell if "id" in i] for cell in row] for row in cells],
            "method": "ruled-grid detection (OpenCV line morphology) with text assigned to cells by position", "header_row_assumed": True,
            "empty_cells": sum(1 for row in grid for c in row if not c)}, used


def headings(items: list[dict], exclude: set[int]) -> list[dict]:
    """Items set in clearly larger type than the page's typical text (at least 1.35x the median height), short, and not inside a table."""
    cand = [i for i in items if id(i) not in exclude]
    if len(cand) < 4:
        return []
    med = float(np.median([height(i) for i in cand]))
    big = [i for i in cand if height(i) >= 1.35 * med and len(i["text"]) <= 90]
    sizes = sorted({round(height(i), 3) for i in big}, reverse=True)
    out = []
    for i in big:
        lvl = 1 + next((k for k, s in enumerate(sizes) if abs(s - round(height(i), 3)) < 1e-9), 0)
        out.append({"item_id": i.get("id"), "text": i["text"], "level": min(lvl, 3), "rule": f"text height {height(i) / med:.2f}x the page median (>= 1.35x)"})
    return out
