"""Concise PDF report of the actual analysis results. Nothing is filled in that was not computed or supplied."""
from __future__ import annotations

import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

LIMITS = ("Automated image analysis, not a survey. The roof mask comes from a small neural network and is not guaranteed to be complete or correct. "
          "Dimensions are only given where a scale was supplied or read from GeoTIFF metadata, and they describe a plan view unless stated otherwise. "
          "Pitch and sloped surface area are never measured from a single image: they appear only if you entered a pitch. Material quantities, where shown, are planning estimates and need professional verification.")


def _fmt(v, unit="") -> str:
    return "unavailable" if v is None else f"{v:,.2f}{unit}"


def make_pdf(ok_results: list[dict], artifacts: dict[int, dict[str, Path]], params) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title="Roof analysis report", author="Neo Forge Technology")
    ss = getSampleStyleSheet()
    base = ParagraphStyle("b", parent=ss["BodyText"], fontName="Times-Roman", fontSize=10, leading=13)
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], fontName="Times-Bold", fontSize=18, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Times-Bold", fontSize=13, spaceBefore=8, spaceAfter=4)
    small = ParagraphStyle("s", parent=base, fontSize=8.5, leading=11, textColor=colors.HexColor("#444444"))
    story = [Paragraph("Roof analysis report", h1), Paragraph("Neo Forge Technology · AI Roof Measurement &amp; Estimation (prototype)", base), Spacer(1, 4), Paragraph(LIMITS, small)]
    for r in ok_results:
        res = r["result"]
        story += [PageBreak(), Paragraph(f"Image: {res['image']['name']} ({res['image']['width']}×{res['image']['height']} px)", h2)]
        ov = artifacts.get(r["index"], {}).get("overlay")
        if ov and ov.is_file():
            w = 178 * mm
            story.append(Image(str(ov), width=w, height=w * res["image"]["height"] / res["image"]["width"], kind="proportional"))
        s = res["scale"]
        story += [Paragraph(f"<b>Model</b>: {res['model']['name']} (threshold {res['params']['threshold']}). <b>Scale</b>: {s.get('kind') or 'none'}"
                            + (f" ({s.get('source')}). {s.get('meaning')}" if s.get("kind") else ". Real-world dimensions are unavailable."), base)]
        rows = [["Region", "Confidence", "Area (px)", "Area (m²)", "Perimeter (m)", "Surface area (m²)"]]
        for g in res["regions"]:
            m = g["measurements"]; met = m["metric"]; sur = m["surface"]
            rows.append([str(g["id"]), f"{g['confidence']['mean_probability']:.2f}", f"{m['pixels']['area_px']:,.0f}", _fmt(met.get("area_m2")) if met.get("available") else "unavailable",
                         _fmt(met.get("perimeter_m")) if met.get("available") else "unavailable", _fmt(sur.get("area_m2")) if sur.get("available") else "unavailable"])
        t = Table(rows, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Times-Roman", 9), ("FONT", (0, 0), (-1, 0), "Times-Bold", 9), ("GRID", (0, 0), (-1, -1), 0.3, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee"))]))
        story += [Spacer(1, 4), t]
        p = res["pitch"]
        story.append(Paragraph("<b>Pitch</b>: " + (f"{p['rise_per_12']:.2f}:12 ({p['degrees']:.1f}°), supplied by the user, not measured." if p.get("status") == "supplied" else "not measurable from this image."), base))
        for wmsg in res["warnings"]:
            story.append(Paragraph("• " + wmsg, small))
        if res["needed_for_real_world_dimensions"]:
            story.append(Paragraph("<b>What is needed for real-world dimensions</b>: " + res["needed_for_real_world_dimensions"][0], small))
        story.append(Paragraph("<b>Features</b>: roof mask (model); outline polygon and rectangle fit (derived); interior edges are unclassified candidates (inferred); ridges, hips, valleys, eaves, rakes and facets could not be determined.", small))
    doc.build(story)
    return buf.getvalue()
