"""Composes store images: real app screenshot inside a phone frame, gradient background, headline.
Usage: python scripts/images/mockup.py   (reads store/gen/ref-*.png, writes store/promo/real-*.png)"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 720, 1280
FONT = "C:/Windows/Fonts/segoeui.ttf"
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"

ITEMS = [
    ("salt", "ref-salt-eve", (24, 28, 70), (196, 112, 104), "Walk. Breathe.", "A calm walk across a mirror of salt"),
    ("grass", "ref-grass-eve", (14, 70, 80), (214, 160, 70), "Stroll Through Quiet Meadows", "Sky, light and wind change with the hour"),
    ("snow", "ref-snow-day", (30, 36, 84), (120, 170, 220), "Walk Until You Are Calm", "Sit down and rest when your stamina runs out"),
    ("forest", "ref-forest-day", (18, 66, 40), (200, 170, 80), "Wander the Forest Path", "Trees grow and pass by as you walk"),
]


def gradient(top, bottom):
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    return img


def fit_text(d, text, font_path, size, max_w):
    while size > 20:
        f = ImageFont.truetype(font_path, size)
        if d.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(font_path, 20)


for key, ref, top, bottom, head, sub in ITEMS:
    bg = gradient(top, bottom)
    d = ImageDraw.Draw(bg)
    f1 = fit_text(d, head, FONT_B, 54, W - 80)
    f2 = fit_text(d, sub, FONT, 26, W - 80)
    d.text((W / 2, 92), head, font=f1, fill="white", anchor="mm")
    d.text((W / 2, 150), sub, font=f2, fill=(255, 255, 255, 220), anchor="mm")

    # Phone: the real screenshot (720x1280) scaled into a rounded black frame with a soft shadow.
    sw = 540
    sh = round(sw * 1280 / 720)
    shot = Image.open(f"store/gen/{ref}.png").convert("RGB").resize((sw, sh), Image.LANCZOS)
    bez = 26
    pw, ph = sw + 2 * bez, sh + 2 * bez
    px0, py0 = (W - pw) // 2, 190
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((px0, py0 + 14, px0 + pw, py0 + ph + 14), 56, fill=(0, 0, 0, 120))
    bg.paste(shadow.filter(ImageFilter.GaussianBlur(18)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(bg)
    d.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), 56, fill=(14, 14, 18), outline=(70, 70, 78), width=2)
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), 16, fill=255)
    bg.paste(shot, (px0 + bez, py0 + bez), mask)
    d.rounded_rectangle((W / 2 - 40, py0 + bez + 10, W / 2 + 40, py0 + bez + 26), 8, fill=(14, 14, 18)) # camera pill
    bg.save(f"store/promo/real-{key}-720x1280.png")
    print("wrote", key)
