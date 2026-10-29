"""Order-insensitive text accuracy: every ground-truth line is located in the recognised text by approximate substring matching (Sellers' algorithm)."""
from __future__ import annotations

import re


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


def fuzzy_substring_distance(needle: str, haystack: str) -> int:
    """Smallest edit distance between `needle` and any substring of `haystack`."""
    prev = [0] * (len(haystack) + 1)
    for i, cn in enumerate(needle, 1):
        cur = [i]
        for j, ch in enumerate(haystack, 1):
            cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (cn != ch)))
        prev = cur
    return min(prev)


def line_cer(truth_lines: list[str], recognised: str) -> tuple[float, int, int]:
    """(character error rate, errors, truth characters). Spaces are ignored (the OCR model often drops them; reported separately)."""
    hay = squash(recognised)
    errs = chars = 0
    for line in truth_lines:
        t = squash(line)
        if not t:
            continue
        errs += fuzzy_substring_distance(t, hay)
        chars += len(t)
    return errs / max(chars, 1), errs, chars
