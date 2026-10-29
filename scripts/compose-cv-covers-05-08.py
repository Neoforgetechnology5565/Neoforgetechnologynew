"""Builds public/covers/cv-05.jpg and cv-08.jpg from real Playwright screenshots of the two apps (scripts/test-med-ui.mjs and test-farm-ui.mjs write them). 1200x675 with a green title band."""
from PIL import Image, ImageDraw, ImageFont
SERIFB = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"; SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
JOBS = [("/tmp/med-shots/segmentation.png", "cv-05", "Medical Imaging AI & Analysis", "Enhance, denoise, segment and compare, with every step logged", "05"),
        ("/tmp/farm-shots/sample-cat.png", "cv-08", "Animal Detection for Smart Farming", "Detect, count, track and watch a crop-protection zone", "08")]
for shot, out, title, sub, no in JOBS:
    im = Image.open(shot).convert("RGB").crop((0, 68, 1500, 68 + 844)).resize((1200, 675), Image.LANCZOS)
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((0, 575, 1200, 675), fill=(255, 255, 255, 255)); d.rectangle((0, 571, 1200, 575), fill=(22, 131, 74, 255))
    d.text((36, 586), title, font=ImageFont.truetype(SERIFB, 34), fill=(17, 100, 58)); d.text((38, 634), sub, font=ImageFont.truetype(SERIF, 19), fill=(71, 85, 105))
    d.rounded_rectangle((1096, 592, 1176, 650), 12, fill=(22, 131, 74)); d.text((1136, 621), no, font=ImageFont.truetype(SERIFB, 30), fill=(255, 255, 255), anchor="mm")
    im.save(f"public/covers/{out}.jpg", quality=90)
print("ok")
