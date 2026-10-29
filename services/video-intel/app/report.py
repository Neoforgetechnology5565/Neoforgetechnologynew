"""A plain, honest PDF built from the structured results the browser sends (no layout guessing: headings, text and tables)."""
from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

GREEN = colors.HexColor("#16834A")
LIGHT = colors.HexColor("#E9F7EF")


def _t(x) -> str:
    return str(x if x is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")[:600]


def build(title: str, subtitle: str, sections: list[dict], footer: str) -> bytes:
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Times-Bold", textColor=GREEN, fontSize=20, alignment=0)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Times-Bold", textColor=colors.HexColor("#11643A"), fontSize=13)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontName="Times-Roman", fontSize=10.5, leading=14, textColor=colors.HexColor("#1C2922"))
    small = ParagraphStyle("s", parent=body, fontSize=9, textColor=colors.HexColor("#66736B"))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm, title=title[:120], author="Neo Forge Technology demonstration")
    out = [Paragraph(_t(title), h1)]
    if subtitle:
        out.append(Paragraph(_t(subtitle), small))
    out.append(Spacer(1, 6))
    for s in sections:
        out.append(Paragraph(_t(s["heading"]), h2))
        if s.get("text"):
            out.append(Paragraph(_t(s["text"]), body))
        for ln in s.get("lines", [])[:40]:
            out.append(Paragraph("• " + _t(ln), body))
        rows = s.get("rows")
        if rows:
            data = [[Paragraph(_t(c), small) for c in r[:8]] for r in rows[:150]]
            t = Table(data, repeatRows=1)
            t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), LIGHT), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2EAE5")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
            out.append(t)
        out.append(Spacer(1, 6))
    if footer:
        out.append(Spacer(1, 8))
        out.append(Paragraph(_t(footer), small))
    doc.build(out)
    return buf.getvalue()
