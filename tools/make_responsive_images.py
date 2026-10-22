#!/usr/bin/env python3
"""Адаптивные версии фотографий для галереи (srcset).

Галерея показывает снимки в ячейках ~240 px (5 колонок) и ~330–460 px (2 колонки),
а файлы весят по 100–270 КБ — браузер скачивает лишнее. Здесь делаются копии
480 px и 800 px, а в разметку добавляется srcset/sizes.

Запуск:  python3 tools/make_responsive_images.py
"""
from __future__ import annotations

import pathlib
import re

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
WIDTHS = (480, 800)
QUALITY = 78

# файлы, которые используются в галерее (порядок как в index.html)
GALLERY_FILES = [
    "foto-kabineta-4.webp", "foto-kabineta-3.webp", "foto-kabineta-2.webp",
    "lazer-apparat-2.webp", "lazer-apparat-3.webp", "indiba-apparat.webp",
    "apparat-elektro-epilyatsii.webp", "pro-tec-needles.webp",
    "vyveska-kabinet.webp", "lokatsiya-1.webp",
]


def variants(name: str) -> list[pathlib.Path]:
    src = IMG / name
    if not src.exists():
        return []
    im = Image.open(src).convert("RGB")
    made = []
    for w in WIDTHS:
        if im.width <= w:
            continue
        h = round(im.height * w / im.width)
        out = IMG / f"{src.stem}-{w}.webp"
        im.resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
        made.append(out)
    return made


def patch_markup() -> int:
    """Добавляет srcset/sizes к фото галереи."""
    path = ROOT / "index.html"
    s = path.read_text(encoding="utf-8")
    sizes = "(max-width: 680px) 46vw, (max-width: 1100px) 45vw, 250px"
    count = 0

    # работаем только внутри блока галереи — фото hero имеют другие размеры
    start = s.find('id="galleryGrid"')
    end = s.find("</div>", s.find("gallery__hint", start)) if start != -1 else -1
    if start == -1 or end == -1:
        return 0

    for name in GALLERY_FILES:
        stem = name[:-5]
        src = IMG / name
        if not src.exists():
            continue
        with Image.open(src) as im:
            w = im.width
        parts = [f"assets/img/{stem}-{width}.webp {width}w" for width in WIDTHS if (IMG / f"{stem}-{width}.webp").exists()]
        parts.append(f"assets/img/{name} {w}w")
        srcset = ", ".join(parts)

        # ищем <img src="assets/img/NAME" ...> только внутри галереи
        pattern = re.compile(r'(<img src="assets/img/' + re.escape(name) + r'")((?:\s+[^>]*?)?)(>)')
        m = pattern.search(s, start, end)
        if not m:
            continue
        if "srcset=" in m.group(2):
            continue
        new = f'{m.group(1)}{m.group(2)} srcset="{srcset}" sizes="{sizes}"{m.group(3)}'
        s = s[:m.start()] + new + s[m.end():]
        end += len(new) - len(m.group(0))
        count += 1

    path.write_text(s, encoding="utf-8")
    return count


def main() -> None:
    total_before = total_after = 0
    for name in GALLERY_FILES:
        src = IMG / name
        if not src.exists():
            print(f"⚠️  {name} — нет файла")
            continue
        before = src.stat().st_size
        made = variants(name)
        after = sum(p.stat().st_size for p in made)
        total_before += before
        total_after += after
        print(f"  {name:36} {before//1024:>4} КБ  →  " +
              " + ".join(f"{p.stem.split('-')[-1]}:{p.stat().st_size//1024}КБ" for p in made))

    if total_before:
        print(f"\nИтого на одну картинку: {total_before//1024} КБ → {total_after//1024} КБ "
              f"(браузер возьмёт 480-px версию: ~{total_after//len(GALLERY_FILES)//1024} КБ)")
    n = patch_markup()
    print(f"✅ srcset добавлен в {n} фото галереи")


if __name__ == "__main__":
    main()
