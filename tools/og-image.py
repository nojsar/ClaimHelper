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

from PIL import Image, ImageDraw, ImageFont

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
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img, "RGBA")

    draw.rounded_rectangle(
        (28, 28, W - 28, H - 28),
        radius=24,
        fill=LETTER,
        outline=(*NAVY, 45),
        width=2,
    )
    draw_brand_mark(draw, (66, 58, 126, 118))
    draw.text(
        (146, 70),
        "GetMyYes",
        font=ImageFont.truetype(str(SANS_BOLD), 31),
        fill=NAVY_DARK,
    )

    title_font, title_lines = fit_title(
        draw,
        "Health insurance appeal help, step by step.",
        650,
    )
    y = 164
    for line in title_lines:
        draw.text((66, y), line, font=title_font, fill=NAVY_DARK)
        y += int(title_font.size * 1.08)

    sub_font = ImageFont.truetype(str(SANS), 28)
    sub_lines = wrap_to_width(
        draw,
        "Understand your denial, review a free summary, and build paperwork you control.",
        sub_font,
        660,
    )
    y += 18
    for line in sub_lines:
        draw.text((68, y), line, font=sub_font, fill=INK_SOFT)
        y += 42

    card = (800, 94, 1136, 484)
    draw.rounded_rectangle(
        card,
        radius=22,
        fill=TEAL_SOFT,
        outline=(*TEAL, 90),
        width=2,
    )
    draw.text(
        (834, 126),
        "A clear path forward",
        font=ImageFont.truetype(str(SANS_BOLD), 24),
        fill=NAVY_DARK,
    )
    step_font = ImageFont.truetype(str(SANS), 22)
    number_font = ImageFont.truetype(str(SANS_BOLD), 21)
    steps = [
        "Add your denial",
        "Review the free summary",
        "Choose what to do next",
    ]
    for index, label in enumerate(steps, start=1):
        cy = 204 + (index - 1) * 86
        draw.ellipse((832, cy - 5, 874, cy + 37), fill=TEAL)
        number_width = draw.textlength(str(index), font=number_font)
        draw.text(
            (853 - number_width / 2, cy + 3),
            str(index),
            font=number_font,
            fill=LETTER,
        )
        draw.text((892, cy + 2), label, font=step_font, fill=INK)

    chip_font = ImageFont.truetype(str(SANS_BOLD), 20)
    chip_text = "FREE PREVIEW  |  NO CARD  |  NO SUBSCRIPTION"
    chip_width = int(draw.textlength(chip_text, font=chip_font)) + 38
    draw.rounded_rectangle((66, 530, 66 + chip_width, 580), radius=12, fill=NAVY)
    draw.text((85, 542), chip_text, font=chip_font, fill=LETTER)

    out = ROOT / "web" / "og-image.png"
    img.save(out, "PNG", optimize=True)
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
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img, "RGBA")

    draw.rectangle((26, 26, W - 26, H - 26), outline=INK_FAINT, width=2)

    x = 64
    mark = Image.open(MARK).convert("RGBA").resize((64, 64), Image.LANCZOS)
    img.paste(mark, (x, 58), mark)
    mono_lg = ImageFont.truetype(str(MONO), 30)
    mono_sm = ImageFont.truetype(str(MONO), 24)
    draw.text((x + 84, 66), "GETMYYES", font=mono_lg, fill=INK)
    draw.text(
        (x + 84, 104),
        "APPEAL GUIDE - PLAIN ENGLISH",
        font=mono_sm,
        fill=TEAL,
    )
    draw.line((x, 168, W - 64, 168), fill=INK_FAINT, width=2)

    font, lines = fit_title(draw, title, W - 2 * 64)
    line_height = int(font.size * 1.18)
    total = line_height * len(lines)
    y = 168 + ((H - 90 - 168) - total) // 2
    for line in lines:
        draw.text((x, y), line, font=font, fill=INK)
        y += line_height

    draw.text(
        (x, H - 92),
        "getmyyes.com/appeals",
        font=mono_sm,
        fill=(*NAVY, 170),
    )
    chip = info_chip("FREE GUIDE")
    img.paste(chip, (W - 64 - chip.width, H - 78 - chip.height // 2), chip)

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{slug}.png"
    img.save(out, "PNG", optimize=True)
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
