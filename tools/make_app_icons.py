#!/usr/bin/env python3
"""Генерация иконок приложения и картинки для соцсетей из лейбла кабинета.

Источник истины — assets/img/label.webp (круглый лейбл «esthetic beauty studio»),
тот же, что стоит в шапке сайта. Из него делаются:
  favicon.ico                     — иконка вкладки (16/32/48)
  apple-touch-icon.png            — иконка для iOS (180×180, без прозрачности)
  assets/icons/icon-192.png       — иконка для манифеста (PWA)
  assets/icons/icon-512.png
  assets/icons/icon-maskable.png  — с безопасной зоной для Android
  assets/img/og-image.png         — 1200×630 для OG/Twitter

Запуск:  python3 tools/make_app_icons.py
"""
from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
LABEL = ROOT / "assets" / "img" / "label.webp"

BG = "#f5f5f3"
OLIVE = "#464827"
MUTED = "#6b6f63"


def label() -> Image.Image:
    return Image.open(LABEL).convert("RGBA")


def olive_of(img: Image.Image) -> tuple[int, int, int]:
    """Цвет круга лейбла — им заливаем фон квадратных иконок."""
    px = img.convert("RGB").getpixel((img.width // 2, int(img.height * 0.12)))
    return px


def calligraphy_mask(img: Image.Image) -> Image.Image:
    """Выделяем белую каллиграфию из лейбла — без мелкого текста внизу."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    mask = Image.new("L", (w, h), 0)
    src = rgb.load()
    dst = mask.load()
    limit = int(h * 0.76)   # ниже — подпись «esthetic beauty studio», её убираем
    for y in range(limit):
        for x in range(w):
            r, g, b = src[x, y]
            if r > 185 and g > 185 and b > 170:
                dst[x, y] = 255
    return mask


def calligraphy_box(img: Image.Image) -> tuple[int, int, int, int]:
    """Границы каллиграфии в лейбле (без подписи внизу)."""
    mask = calligraphy_mask(img)
    bbox = mask.getbbox()
    return bbox or (0, 0, img.width, int(img.height * 0.7))


def sticker(size: int) -> Image.Image:
    """Круглый знак: оливковый круг с каллиграфией (читается даже в 16 px)."""
    src = label()
    olive = olive_of(src)
    scale = 4  # рисуем с запасом, потом уменьшаем — края будут гладкими
    big = size * scale

    canvas = Image.new("RGBA", (big, big), olive + (255,))
    calligraphy = Image.new("RGBA", src.size, (255, 255, 255, 0))
    calligraphy.putalpha(calligraphy_mask(src))
    calligraphy = calligraphy.resize((big, big), Image.LANCZOS)
    canvas = Image.alpha_composite(canvas, calligraphy)

    # круглая маска
    circle = Image.new("L", (big, big), 0)
    ImageDraw.Draw(circle).ellipse([0, 0, big - 1, big - 1], fill=255)
    canvas.putalpha(circle)
    return canvas.resize((size, size), Image.LANCZOS)


def square_mark(size: int, scale: float = 1.0, bg: str | None = None) -> Image.Image:
    """Квадратная иконка без «круга в квадрате»: сплошное оливковое поле,
    каллиграфия выровнена по центру. iOS/Android сами скругляют края."""
    src = label()
    olive = olive_of(src) if bg is None else bg
    box = calligraphy_box(src)
    art = src.crop(box).convert("RGBA")
    art.putalpha(calligraphy_mask(src).crop(box))

    # вписываем каллиграфию в центр с полями
    side = int(size * 0.62 * scale)
    art = art.resize((side, side), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), olive + (255,))
    canvas.alpha_composite(art, ((size - side) // 2, (size - side) // 2))
    return canvas.convert("RGB")


def square_with_sticker(size: int, scale: float = 1.0, bg: str | None = None) -> Image.Image:
    """Квадратная иконка с круглым знаком (для мест, где круг уместен)."""
    src = label()
    base = olive_of(src) if bg is None else bg
    canvas = Image.new("RGB", (size, size), base)
    diameter = int(size * scale)
    st = sticker(diameter)
    canvas.paste(st, ((size - diameter) // 2, (size - diameter) // 2), st)
    return canvas


def circle_on_olive(size: int, scale: float = 1.0, bg: str | None = None) -> Image.Image:
    """Квадратная иконка с полным лейблом (с текстом) — для крупных размеров."""
    src = label()
    base = olive_of(src) if bg is None else bg
    canvas = Image.new("RGB", (size, size), base)
    diameter = int(size * scale)
    st = src.resize((diameter, diameter), Image.LANCZOS)
    canvas.paste(st, ((size - diameter) // 2, (size - diameter) // 2), st)
    return canvas


def make_favicon() -> pathlib.Path:
    frames = [sticker(n) for n in (48, 32, 16)]
    out = ROOT / "favicon.ico"
    frames[0].save(out, format="ICO", sizes=[(n, n) for n in (16, 32, 48)], append_images=frames[1:])
    return out


def make_apple() -> pathlib.Path:
    out = ROOT / "apple-touch-icon.png"
    square_mark(180).save(out, "PNG")
    return out


def make_pwa_icons() -> list[pathlib.Path]:
    folder = ROOT / "assets" / "icons"
    folder.mkdir(parents=True, exist_ok=True)
    out = []
    for n in (192, 512):
        p = folder / f"icon-{n}.png"
        square_mark(n).save(p, "PNG")
        out.append(p)
    # maskable: знак занимает 78% — безопасная зона под обрезку Android
    p = folder / "icon-maskable.png"
    square_mark(512, scale=0.78).save(p, "PNG")
    out.append(p)
    return out


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "Georgia Bold.ttf" if bold else "Georgia.ttf"
    path = pathlib.Path("/System/Library/Fonts/Supplemental") / name
    if not path.exists():
        path = pathlib.Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    return ImageFont.truetype(str(path), size)


def make_og() -> pathlib.Path:
    """1200×630 — как картинка будет выглядеть в мессенджерах и соцсетях."""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # едва заметная текстура полосами справа
    for i in range(22):
        x = 800 + i * 20
        d.rectangle([x, 0, x + 9, H], fill="#efede7")
    d.rectangle([0, 0, W, 12], fill=OLIVE)
    d.rectangle([0, 12, W, 20], fill="#a2a478")

    # лейбл кабинета — тот же знак, что в шапке
    sticker = label().resize((130, 130), Image.LANCZOS)
    img.paste(sticker, (80, 80), sticker)

    d.text((240, 92), "IPL", font=font(74, bold=True), fill="#262a1b")
    d.text((240, 176), "esthetic beauty studio", font=font(27), fill="#7a7f52")
    d.text((240, 216), "ОДИНЦОВО · БЦ «ТЕЛЕГРАФ»", font=font(20), fill=MUTED)

    d.text((80, 330), "Лазерная эпиляция", font=font(56, bold=True), fill="#262a1b")
    d.text((80, 404), "1S PRO · INDIBA · МИКРОТЕРМ 5М", font=font(28), fill=OLIVE)
    d.text((80, 452), "Можайское шоссе, 20 · каб. 206 · 5 минут от МЦК", font=font(24), fill=MUTED)

    d.rounded_rectangle([80, 516, 520, 574], radius=29, fill=OLIVE)
    d.text((108, 529), "−20% на первый комплекс", font=font(26, bold=True), fill="#f2f4ec")

    out = ROOT / "assets" / "img" / "og-image.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    return out


def main() -> None:
    made = [make_favicon(), make_apple(), make_og(), *make_pwa_icons()]
    for p in made:
        print(f"✅ {p.relative_to(ROOT)}  ({p.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()
