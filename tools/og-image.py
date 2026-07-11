# /// script
# dependencies = ["pillow"]
# ///
"""OG-card generator for the appeal guides.

Renders a branded 1200x630 social-preview image per guide (bone paper,
carmine stamp chip, Fraunces headline — same case-file aesthetic as the
site) into web/appeals/og/<slug>.png. Pages reference them via og:image,
and tool/post_bluesky.mjs attaches them to Bluesky link cards.

Usage (uv installs Pillow in an isolated cache from the metadata above):
    uv run tools/og-image.py --all              # every guide + the index
    uv run tools/og-image.py <slug> "<title>"   # one card

Idempotent and offline: fonts come from assets/fonts/, the brand mark from
web/icons/ — no network, no third-party services (GDPR posture).
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
PAPER = (243, 237, 223)      # bone paper
INK = (28, 22, 12)           # warm ink
INK_FAINT = (28, 22, 12, 90)
CARMINE = (179, 32, 42)

SERIF = FONTS / "Fraunces72pt-Bold.ttf"
MONO = FONTS / "IBMPlexMono-SemiBold.ttf"
MARK = ROOT / "web" / "icons" / "Icon-512.png"


def wrap_to_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont,
                  max_width: int) -> list[str]:
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


def fit_title(draw: ImageDraw.ImageDraw, text: str, max_width: int) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    """Largest Fraunces size that fits the title in <=3 lines."""
    for size in range(84, 43, -4):
        font = ImageFont.truetype(str(SERIF), size)
        lines = wrap_to_width(draw, text, font, max_width)
        if len(lines) <= 3 and all(draw.textlength(l, font=font) <= max_width for l in lines):
            return font, lines
    font = ImageFont.truetype(str(SERIF), 44)
    return font, wrap_to_width(draw, text, font, max_width)[:3]


def stamp_chip(text: str) -> Image.Image:
    """Carmine bordered chip, slightly rotated like a rubber stamp."""
    font = ImageFont.truetype(str(MONO), 26)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    tw = int(probe.textlength(text, font=font))
    pad_x, pad_y = 26, 14
    chip = Image.new("RGBA", (tw + pad_x * 2 + 8, 26 + pad_y * 2 + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(chip)
    d.rounded_rectangle(
        (4, 4, chip.width - 4, chip.height - 4),
        radius=8, outline=(*CARMINE, 255), width=4,
    )
    d.text((pad_x + 4, pad_y + 2), text, font=font, fill=(*CARMINE, 255))
    return chip.rotate(-3, expand=True, resample=Image.BICUBIC)


def render(slug: str, title: str) -> Path:
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img, "RGBA")

    # Case-file hairline frame
    draw.rectangle((26, 26, W - 26, H - 26), outline=INK_FAINT, width=2)

    # Header: brand mark + wordmark + kicker
    x = 64
    mark = Image.open(MARK).convert("RGBA").resize((64, 64), Image.LANCZOS)
    img.paste(mark, (x, 58), mark)
    mono_lg = ImageFont.truetype(str(MONO), 30)
    mono_sm = ImageFont.truetype(str(MONO), 24)
    draw.text((x + 84, 66), "GETMYYES", font=mono_lg, fill=INK)
    draw.text((x + 84, 104), "APPEAL GUIDE — PLAIN ENGLISH", font=mono_sm, fill=CARMINE)
    draw.line((x, 168, W - 64, 168), fill=INK_FAINT, width=2)

    # Headline
    font, lines = fit_title(draw, title, W - 2 * 64)
    line_h = int(font.size * 1.18)
    total = line_h * len(lines)
    y = 168 + ((H - 90 - 168) - total) // 2
    for line in lines:
        draw.text((x, y), line, font=font, fill=INK)
        y += line_h

    # Footer: domain + stamp chip
    draw.text((x, H - 92), "getmyyes.com/appeals", font=mono_sm, fill=(28, 22, 12, 150))
    chip = stamp_chip("FREE GUIDE")
    img.paste(chip, (W - 64 - chip.width, H - 78 - chip.height // 2), chip)

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{slug}.png"
    img.save(out, "PNG", optimize=True)
    return out


def og_title(html: str) -> str | None:
    m = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html)
    return m.group(1) if m else None


def main() -> None:
    args = sys.argv[1:]
    if args and args[0] == "--all":
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
    elif len(args) == 2:
        print(f"wrote {render(args[0], args[1]).relative_to(ROOT)}")
    else:
        sys.exit("usage: og-image.py --all | og-image.py <slug> \"<title>\"")


if __name__ == "__main__":
    main()
