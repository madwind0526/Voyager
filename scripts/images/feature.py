"""Google Play feature graphic (1024x500, landscape): title on the left, three real app screenshots in phone frames on the right.
Usage: python scripts/images/feature.py   (reads store/gen/ref-*.png, writes store/feature-1024x500.png)"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1024, 500
FONT = "C:/Windows/Fonts/segoeui.ttf"
FONT_L = "C:/Windows/Fonts/segoeuil.ttf"
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"

top, bottom = (24, 28, 70), (196, 112, 104)
bg = Image.new("RGB", (W, H))
px = bg.load()
for x in range(W):
    t = x / (W - 1)
    c = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
    for y in range(H):
        px[x, y] = c


def phone(ref, sw, x, y):
    sh = round(sw * 1280 / 720)
    shot = Image.open(f"store/gen/{ref}.png").convert("RGB").resize((sw, sh), Image.LANCZOS)
    bez = 16
    pw, ph = sw + 2 * bez, sh + 2 * bez
    sh_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh_layer).rounded_rectangle((x, y + 10, x + pw, y + ph + 10), 34, fill=(0, 0, 0, 130))
    sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(12))
    bg.paste(sh_layer, (0, 0), sh_layer)
    d = ImageDraw.Draw(bg)
    d.rounded_rectangle((x, y, x + pw, y + ph), 34, fill=(14, 14, 18), outline=(70, 70, 78), width=2)
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), 12, fill=255)
    bg.paste(shot, (x + bez, y + bez), mask)


# Three phones of the same size, centred vertically (equal space above and below).
phone("ref-grass-eve", 170, 430, 83)
phone("ref-snow-day", 170, 802, 83)
phone("ref-salt-eve", 170, 616, 83)

d = ImageDraw.Draw(bg)
d.text((56, 160), "Voyager", font=ImageFont.truetype(FONT_B, 84), fill="white", anchor="lm")
d.text((60, 245), "Walk. Breathe.", font=ImageFont.truetype(FONT, 38), fill="white", anchor="lm")
d.text((60, 295), "A calm walk through changing skies", font=ImageFont.truetype(FONT_L, 24), fill=(255, 255, 255), anchor="lm")
bg.save("store/feature-1024x500.png")
print("wrote store/feature-1024x500.png")
