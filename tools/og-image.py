# /// script
# dependencies = ["pillow"]
# ///
"""Generate calm GetMyYes social cards and application icons.

The navy/teal brand deliberately keeps error red out of shared links, browser
tabs, and installed-app icons. Everything renders offline from bundled fonts.

Usage:
    uv run tools/og-image.py --all
    uv run tools/og-image.py --brand-assets
    uv run tools/og-image.py <slug> "<title>"
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import math
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
GUIDES = ROOT / "web" / "appeals"
OUT = GUIDES / "og"
FONTS = ROOT / "assets" / "fonts"

W, H = 1200, 630
PAPER = (246, 248, 247)
LETTER = (255, 255, 255)
INK = (31, 43, 55)
INK_SOFT = (74, 88, 101)
INK_FAINT = (23, 50, 77, 80)
NAVY = (23, 50, 77)
NAVY_DARK = (16, 38, 59)
TEAL = (47, 111, 98)
TEAL_SOFT = (234, 243, 241)

SERIF = FONTS / "Tinos-Bold.ttf"
MONO = FONTS / "IBMPlexMono-SemiBold.ttf"
SANS = FONTS / "IBMPlexSans-Regular.ttf"
SANS_BOLD = FONTS / "IBMPlexSans-Bold.ttf"
MARK = ROOT / "web" / "icons" / "Icon-512.png"

# The dawn print (web/home.css): warm paper, a sky that lifts from night to
# morning over a print sea. Shared links use it, as the site does.
PAPER_WARM = (250, 245, 236)
LETTER_WARM = (255, 253, 248)
HAIR = (227, 215, 196)
SKY = [(126, 151, 196), (201, 195, 222), (240, 191, 166), (249, 210, 160)]
SEA = [(59, 75, 107), (28, 42, 67)]


def _ramp(stops: list[tuple[int, int, int]], t: float) -> tuple[int, int, int]:
    t = min(1.0, max(0.0, t))
    span = 1 / (len(stops) - 1)
    i = min(len(stops) - 2, int(t / span))
    k = (t - i * span) / span
    a, b = stops[i], stops[i + 1]
    return tuple(int(a[n] + (b[n] - a[n]) * k) for n in range(3))


def dawn_window(w: int, h: int, *, sun_x: float = 0.7, plane: bool = True) -> Image.Image:
    """A window onto the dawn: sky, a sun with soft rays and haze, and a
    print sea with the sun's path glittering on it."""
    horizon = int(h * 0.68)
    img = Image.new("RGBA", (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(horizon):
        draw.line([(0, y), (w, y)], fill=(*_ramp(SKY, y / horizon), 255))

    sx, sr = int(w * sun_x), int(h * 0.11)
    sy = horizon - int(sr * 0.9)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((sx - sr * 4, sy - sr * 4, sx + sr * 4, sy + sr * 4), fill=(255, 232, 186, 120))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(sr * 1.6)))
    rays = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    for i in range(14):
        a = math.pi + (i + 0.5) * math.pi / 14
        rd.polygon([(sx, sy),
                    (sx + math.cos(a - 0.03) * w * 1.5, sy + math.sin(a - 0.03) * w * 1.5),
                    (sx + math.cos(a + 0.03) * w * 1.5, sy + math.sin(a + 0.03) * w * 1.5)],
                   fill=(255, 244, 220, 26))
    img.alpha_composite(rays.filter(ImageFilter.GaussianBlur(3)))
    draw = ImageDraw.Draw(img)
    draw.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=(255, 236, 190, 255))

    haze = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(haze)
    for (cx, cy, hw) in ((0.22, 0.24, 0.34), (0.66, 0.42, 0.42), (0.3, 0.55, 0.28)):
        hd.rounded_rectangle((int(w * (cx - hw / 2)), int(h * cy), int(w * (cx + hw / 2)), int(h * cy) + 10),
                             radius=5, fill=(255, 248, 238, 120))
    img.alpha_composite(haze.filter(ImageFilter.GaussianBlur(4)))

    # The sea, drawn last so it covers the lower half of the sun.
    draw = ImageDraw.Draw(img)
    for y in range(horizon, h):
        draw.line([(0, y), (w, y)], fill=(*_ramp(SEA, (y - horizon) / max(1, h - horizon)), 255))
    # Swells and glitter go on their own layer so their alpha blends.
    fx = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fx)
    for y in range(horizon + 4, h, 7):
        draw.line([(0, y), (w, y)], fill=(255, 255, 255, 16))
    rnd = random.Random(7)
    for row in range(10):
        depth = (row + 1) / 10
        y = horizon + 4 + (h - horizon - 8) * depth * depth
        for _ in range(4):
            x = sx + (rnd.random() - 0.5) * (16 + depth * w * 0.22)
            ln = 4 + depth * 22 * (0.5 + rnd.random())
            draw.rounded_rectangle((x - ln / 2, y, x + ln / 2, y + 2), radius=1,
                                   fill=(255, 236, 196, int(120 + 100 * rnd.random())))
    img.alpha_composite(fx)

    if plane:
        _paper_plane(img, int(w * 0.22), int(h * 0.2), int(w * 0.18))
    return img


def _paper_plane(img: Image.Image, x: int, y: int, size: int) -> None:
    """The site's paper plane (web/media/home/orn-plane.svg), nose up-right."""
    k = size / 160

    def pt(px: float, py: float) -> tuple[float, float]:
        return (x + (px - 214) * k, y + (py - 97) * k)

    d = ImageDraw.Draw(img)
    d.polygon([pt(138, 118), pt(292, 18), pt(196, 150)], fill=(231, 220, 200, 255))
    d.polygon([pt(138, 118), pt(292, 18), pt(176, 128)], fill=(255, 253, 247, 255))
    d.polygon([pt(176, 128), pt(292, 18), pt(206, 176), pt(190, 140)], fill=(242, 232, 214, 255))
    d.polygon([pt(190, 140), pt(206, 176), pt(176, 128)], fill=(205, 189, 159, 255))


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def paper(size: tuple[int, int]) -> Image.Image:
    """Warm paper with a faint grain."""
    img = Image.new("RGB", size, PAPER_WARM)
    noise = Image.effect_noise(size, 18).convert("L")
    grain = Image.new("RGB", size, (120, 110, 96))
    return Image.composite(grain, img, noise.point(lambda v: int(v * 0.07)))


def shadow(img: Image.Image, box: tuple[int, int, int, int], radius: int, blur: int = 22, alpha: int = 70) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(box, radius=radius, fill=(16, 38, 59, alpha))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def wrap_to_width(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    max_width: int,
) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        probe = f"{line} {word}".strip()
        if draw.textlength(probe, font=font) <= max_width:
            line = probe
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def fit_title(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    """Return the largest serif title that fits in at most three lines."""
    for size in range(84, 43, -4):
        font = ImageFont.truetype(str(SERIF), size)
        lines = wrap_to_width(draw, text, font, max_width)
        if len(lines) <= 3 and all(
            draw.textlength(line, font=font) <= max_width for line in lines
        ):
            return font, lines
    font = ImageFont.truetype(str(SERIF), 44)
    return font, wrap_to_width(draw, text, font, max_width)[:3]


def draw_brand_mark(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
) -> None:
    """Draw a simple teal tile and white check without relying on a glyph."""
    x0, y0, x1, y1 = box
    side = x1 - x0
    draw.rounded_rectangle(box, radius=max(6, int(side * 0.24)), fill=TEAL)
    points = [
        (x0 + int(side * 0.27), y0 + int(side * 0.52)),
        (x0 + int(side * 0.44), y0 + int(side * 0.68)),
        (x0 + int(side * 0.75), y0 + int(side * 0.34)),
    ]
    draw.line(
        points,
        fill=LETTER,
        width=max(4, int(side * 0.09)),
        joint="curve",
    )


def info_chip(text: str) -> Image.Image:
    """Create a quiet teal information chip for guide cards."""
    font = ImageFont.truetype(str(MONO), 26)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    text_width = int(probe.textlength(text, font=font))
    pad_x, pad_y = 26, 14
    chip = Image.new(
        "RGBA",
        (text_width + pad_x * 2 + 8, 26 + pad_y * 2 + 8),
        (0, 0, 0, 0),
    )
    draw = ImageDraw.Draw(chip)
    draw.rounded_rectangle(
        (4, 4, chip.width - 4, chip.height - 4),
        radius=10,
        fill=(*TEAL, 255),
    )
    draw.text(
        (pad_x + 4, pad_y + 2),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )
    return chip


def render_icon(size: int, *, maskable: bool = False) -> Path:
    img = Image.new("RGB", (size, size), PAPER)
    draw = ImageDraw.Draw(img)
    margin = int(size * (0.20 if maskable else 0.10))
    draw_brand_mark(draw, (margin, margin, size - margin, size - margin))
    name = f"Icon-maskable-{size}.png" if maskable else f"Icon-{size}.png"
    out = ROOT / "web" / "icons" / name
    img.save(out, "PNG", optimize=True)
    return out


def render_favicon() -> Path:
    """Tab-sized mark: full bleed, heavier check, transparent corners.

    A favicon gets about 16 real pixels. The paper margin and inset rounding the
    installed-app icons use were spending a quarter of them on padding, which
    left the mark reading as a checkbox rather than a brand. Transparent corners
    keep it correct on both light and dark tab strips.
    """
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=13, fill=(*TEAL, 255))
    draw.line(
        [(15, 34), (27, 45), (49, 20)],
        fill=(255, 255, 255, 255),
        width=9,
        joint="curve",
    )
    out = ROOT / "web" / "favicon.png"
    img.save(out, "PNG", optimize=True)
    return out


def render_home() -> Path:
    """The homepage card: the hero's headline on paper beside a dawn window,
    where a letter lies under the plain-English lens."""
    img = paper((W, H)).convert("RGBA")
    draw = ImageDraw.Draw(img, "RGBA")

    draw_brand_mark(draw, (64, 56, 120, 112))
    draw.text((136, 60), "GetMyYes", font=ImageFont.truetype(str(SERIF), 42), fill=NAVY_DARK)

    head = ImageFont.truetype(str(SERIF), 78)
    y = 160
    draw.text((62, y), "Understand", font=head, fill=NAVY_DARK)
    draw.text((62, y + 82), "the denial.", font=head, fill=NAVY_DARK)
    accent = "Build the appeal."
    aw = draw.textlength(accent, font=head)
    mark = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(mark).rounded_rectangle((58, y + 164 + 60, 66 + aw, y + 164 + 76), radius=8,
                                           fill=(47, 111, 98, 52))
    img.alpha_composite(mark)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.text((62, y + 164), accent, font=head, fill=TEAL)

    sub = ImageFont.truetype(str(SANS), 28)
    draw.text((64, 446), "Your denial letter, in plain English.", font=sub, fill=INK_SOFT)

    chip_font = ImageFont.truetype(str(MONO), 20)
    chip_text = "FREE PREVIEW  ·  NO CARD"
    cw = int(draw.textlength(chip_text, font=chip_font)) + 44
    draw.rounded_rectangle((64, 528, 64 + cw, 574), radius=23, fill=NAVY)
    draw.text((86, 539), chip_text, font=chip_font, fill=LETTER)

    # The dawn window, and the letter under the lens.
    wx0, wy0, wx1, wy1 = 742, 46, 1158, 584
    shadow(img, (wx0, wy0 + 14, wx1, wy1 + 10), 30, alpha=60)
    img.alpha_composite(rounded(dawn_window(wx1 - wx0, wy1 - wy0, sun_x=0.7), 30), (wx0, wy0))

    sheet = Image.new("RGBA", (330, 300), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheet)
    sd.rounded_rectangle((0, 0, 329, 299), radius=14, fill=(*LETTER_WARM, 255), outline=(*HAIR, 255), width=2)
    sd.text((26, 22), "NOTICE OF DENIAL", font=ImageFont.truetype(str(MONO), 15), fill=(95, 110, 120, 255))
    sd.line((26, 50, 304, 50), fill=(23, 50, 77, 40), width=2)
    widths = [250, 210, 236, 180, 226, 150]
    for i, lw in enumerate(widths):
        yy = 72 + i * 36
        sd.rounded_rectangle((26, yy, 26 + lw, yy + 10), radius=5,
                             fill=(23, 50, 77, 255) if i < 2 else (201, 207, 212, 255))
    ly = 72 + 2 * 36 - 14
    sd.rounded_rectangle((14, ly, 316, ly + 38), radius=12, fill=(*TEAL_SOFT, 255),
                         outline=(*TEAL, 255), width=2)
    sd.rounded_rectangle((26, ly + 14, 26 + 236, ly + 24), radius=5, fill=(23, 50, 77, 255))
    tab_font = ImageFont.truetype(str(SANS_BOLD), 15)
    tw = int(sd.textlength("Plain English", font=tab_font)) + 22
    sd.rounded_rectangle((300 - tw, ly - 12, 300, ly + 12), radius=12, fill=(*TEAL, 255))
    sd.text((300 - tw + 11, ly - 10), "Plain English", font=tab_font, fill=(255, 255, 255, 255))
    sheet = sheet.rotate(-4, resample=Image.BICUBIC, expand=True)
    sx, sy = 704, 300
    shadow(img, (sx + 20, sy + 30, sx + sheet.width - 10, sy + sheet.height), 16, blur=18, alpha=90)
    img.alpha_composite(sheet, (sx, sy))

    out = ROOT / "web" / "og-image.png"
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out


def render_brand_assets() -> list[Path]:
    outputs = [render_home(), render_favicon()]
    outputs.extend(
        render_icon(size, maskable=maskable)
        for size in (192, 512)
        for maskable in (False, True)
    )
    return outputs


def render(slug: str, title: str) -> Path:
    """A guide card: the guide's title on paper beside a strip of dawn."""
    img = paper((W, H)).convert("RGBA")
    draw = ImageDraw.Draw(img, "RGBA")

    x = 64
    draw_brand_mark(draw, (x, 58, x + 52, 110))
    draw.text((x + 68, 62), "GetMyYes", font=ImageFont.truetype(str(SERIF), 38), fill=NAVY_DARK)
    draw.text((x, 150), "FREE APPEAL GUIDE", font=ImageFont.truetype(str(MONO), 22), fill=TEAL)

    font, lines = fit_title(draw, title, 700)
    line_height = int(font.size * 1.12)
    y = 196 + max(0, (300 - line_height * len(lines)) // 2)
    for line in lines:
        draw.text((x, y), line, font=font, fill=NAVY_DARK)
        y += line_height

    draw.text((x, H - 86), "getmyyes.com/appeals", font=ImageFont.truetype(str(MONO), 22), fill=(*NAVY, 190))

    wx0, wy0, wx1, wy1 = 850, 46, 1158, 584
    shadow(img, (wx0, wy0 + 14, wx1, wy1 + 10), 28, alpha=55)
    img.alpha_composite(rounded(dawn_window(wx1 - wx0, wy1 - wy0, sun_x=0.6), 28), (wx0, wy0))

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{slug}.png"
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out


def og_title(html: str) -> str | None:
    match = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html)
    return match.group(1) if match else None


def main() -> None:
    args = sys.argv[1:]
    if args and args[0] == "--all":
        for output in render_brand_assets():
            print(f"wrote {output.relative_to(ROOT)}")
        jobs: list[tuple[str, str]] = []
        for page in sorted(GUIDES.glob("*.html")):
            title = og_title(page.read_text(encoding="utf-8"))
            if not title:
                print(f"skip {page.name}: no og:title")
                continue
            slug = "index" if page.stem == "index" else page.stem
            jobs.append((slug, title))
        for slug, title in jobs:
            print(f"wrote {render(slug, title).relative_to(ROOT)}")
    elif args and args[0] == "--brand-assets":
        for output in render_brand_assets():
            print(f"wrote {output.relative_to(ROOT)}")
    elif len(args) == 2:
        print(f"wrote {render(args[0], args[1]).relative_to(ROOT)}")
    else:
        sys.exit(
            'usage: og-image.py --all | --brand-assets | og-image.py <slug> "<title>"'
        )


if __name__ == "__main__":
    main()
