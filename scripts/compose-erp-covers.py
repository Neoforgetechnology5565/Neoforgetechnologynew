"""Turns the real screenshots from make-erp-covers.mjs into public/covers/erp-NN.jpg (1200x675) with a title band. Run after make-erp-covers.mjs."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, "")
TITLES = ["CRM & Sales Pipeline", "Finance, Accounting & Reporting", "HRM & Employee Management", "Payroll, Attendance & Workforce", "Inventory & Warehouse Management", "Procurement & Purchase Orders", "Helpdesk & Service Management", "Marketing Automation CRM", "Project & Resource Management", "Executive Analytics & Automation", "Workflow Automation & Approvals"]
SUBS = ["Kanban pipeline, leads, quotations, forecasts", "Ledger, invoices, bills, P&L and balance sheet", "Directory, profiles, leave, reviews", "Day board, shifts, overtime, payslips", "Stock ledger, transfers, floor map, valuation", "Requisitions, approvals, orders, goods receipt", "Tickets, SLA clocks, conversations", "Segments, campaigns, simulated sending", "Board, timeline, time tracking, budgets", "KPIs, drill-down, alerts, data import", "Rules, approvals, execution log"]
SERIFB = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"; SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
out = Path("public/covers")
for i in range(11):
    im = Image.open(f"/tmp/erp-shots/{i + 1:02d}.png").convert("RGB").resize((1200, 675), Image.LANCZOS)
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((0, 575, 1200, 675), fill=(15, 23, 42, 240)); d.rectangle((0, 571, 1200, 575), fill=(59, 130, 246, 255))
    d.text((36, 586), TITLES[i], font=ImageFont.truetype(SERIFB, 34), fill=(255, 255, 255)); d.text((38, 634), SUBS[i], font=ImageFont.truetype(SERIF, 19), fill=(148, 163, 184))
    d.rounded_rectangle((1096, 592, 1176, 650), 12, fill=(37, 99, 235)); d.text((1136, 621), f"{i + 1:02d}", font=ImageFont.truetype(SERIFB, 30), fill=(255, 255, 255), anchor="mm")
    im.save(out / f"erp-{i + 1:02d}.jpg", quality=90)
print("ok")
