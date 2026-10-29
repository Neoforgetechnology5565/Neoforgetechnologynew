"""PDF inspection report with the three layers (model output, automated recommendation, human decision) kept visibly apart."""
from __future__ import annotations

import io
import time
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

COL = {"PASS": "#15803d", "FAIL": "#b91c1c", "MANUAL_REVIEW": "#b45309"}


def make_pdf(meta: dict, orig: Path, annotated: Path) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title=f"Inspection report {meta['id'][:8]}")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], fontName="Times-Bold", fontSize=18)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Times-Bold", fontSize=13, spaceBefore=10)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontName="Times-Roman", fontSize=10, leading=13)
    small = ParagraphStyle("s", parent=body, fontSize=8.5, leading=11, textColor=colors.HexColor("#475569"))
    mo, rec, rv = meta["model_output"], meta["recommendation"], meta["review"]["current"]
    f = []
    f.append(Paragraph("Visual inspection report", h1))
    f.append(Paragraph(f"Inspection {meta['id'][:8]} · {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(meta['created_at']))} · file: {meta['filename']} · reference: {meta['reference']['name']} ({meta['reference']['kind']})", small))
    f.append(Paragraph("1. Model output", h2))
    f.append(Paragraph(f"Anomaly score <b>{mo['anomaly_score']}</b> against a reference threshold of <b>{mo['reference_threshold']}</b> (score ratio <b>{mo['score_ratio']}</b>; 1.00 = threshold). {mo['score_meaning']}", body))
    rows = [["#", "Status", "Score ratio", "Area (% of image)", "Bounding box x,y,w,h", "Severity"]] + [[str(r["id"]), r["status"], f"{r['score_ratio']:.2f}", f"{r['area_pct']:.3f}", ", ".join(str(v) for v in r["bbox"]), r["severity"]] for r in mo["regions"]]
    if len(rows) == 1:
        f.append(Paragraph("No unusual region reached the review band.", body))
    else:
        t = Table(rows, repeatRows=1, colWidths=[10 * mm, 24 * mm, 24 * mm, 32 * mm, 52 * mm, 28 * mm])
        t.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Times-Roman", 9), ("FONT", (0, 0), (-1, 0), "Times-Bold", 9), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#94a3b8")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0"))]))
        f.append(t)
    f.append(Paragraph("Regions are <i>unclassified</i>: the model shows where the part differs from good examples, not what kind of defect it is.", small))
    f.append(Paragraph("2. Automated recommendation", h2))
    f.append(Paragraph(f"<font color='{COL[rec['decision']]}'><b>{rec['decision'].replace('_', ' ')}</b></font> — " + " ".join(rec["reasons"]), body))
    f.append(Paragraph("Rules: " + ", ".join(f"{k} = {v}" for k, v in rec["rules"].items()) + ". " + rec["disclaimer"], small))
    f.append(Paragraph("3. Human reviewer decision", h2))
    if rv:
        f.append(Paragraph(f"<font color='{COL[rv['decision']]}'><b>{rv['decision'].replace('_', ' ')}</b></font> by {rv.get('reviewer') or 'reviewer'} ({'agrees with' if rv['agrees_with_recommendation'] else 'overrides'} the recommendation) at {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(rv['at']))}. Notes: {rv.get('notes') or '—'}", body))
    else:
        f.append(Paragraph("Not reviewed yet. The automated recommendation above has not been confirmed by a person.", body))
    imgs = []
    for p in (orig, annotated):
        im = Image(str(p)); r = min(85 * mm / im.imageWidth, 85 * mm / im.imageHeight); im.drawWidth, im.drawHeight = im.imageWidth * r, im.imageHeight * r; imgs.append(im)
    f.append(Spacer(1, 6))
    f.append(KeepTogether([Table([[imgs[0], imgs[1]], ["Original", "Annotated (heat = unusual areas, boxes = regions)"]], style=TableStyle([("FONT", (0, 1), (-1, 1), "Times-Italic", 8.5), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))]))
    f.append(Spacer(1, 8))
    f.append(Paragraph("Method: PatchCore-style anomaly detection with a frozen ImageNet ResNet-50 against a memory of good parts. It cannot name defect types and can flag harmless variation. This report is not a certified quality-assurance document.", small))
    doc.build(f)
    return buf.getvalue()
