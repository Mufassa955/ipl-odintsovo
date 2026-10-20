"""
contact_sheet — собирает все фото из папки в одну сетку-лист.

Зачем: за один взгляд видно всю фото-базу, её пропорции и качество —
без открытия файлов по одному. Готовый PNG можно приложить к диплому
или показать клиенту.

Запуск:
    python tools/contact_sheet.py photos --out contact-sheet.png
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}


def build_sheet(
    src_dir: Path,
    out_path: Path,
    cols: int = 5,
    cell: int = 300,
    label_h: int = 34,
    bg: tuple = (26, 28, 22),
    fg: tuple = (244, 241, 234),
) -> Path:
    files = sorted(
        p for p in src_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in SUPPORTED
    )
    if not files:
        raise SystemExit(f"В папке {src_dir} нет изображений")

    rows = math.ceil(len(files) / cols)
    pad = 18
    sheet_w = cols * (cell + pad) + pad
    sheet_h = rows * (cell + label_h + pad) + pad + 46

    sheet = Image.new("RGB", (sheet_w, sheet_h), bg)
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 16), f"{src_dir.name}  —  {len(files)} фото", fill=fg)

    for i, path in enumerate(files):
        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y = 46 + pad + r * (cell + label_h + pad)
        try:
            with Image.open(path) as im:
                thumb = ImageOps.fit(im.convert("RGB"), (cell, cell), Image.LANCZOS)
                sheet.paste(thumb, (x, y))
                size = f"{im.width}×{im.height}"
        except Exception as exc:  # noqa: BLE001
            draw.rectangle([x, y, x + cell, y + cell], outline=(120, 40, 40), width=2)
            size = "ошибка"
        name = path.stem[:34]
        draw.text((x + 2, y + cell + 9), name, fill=fg)
        draw.text((x + 2, y + cell + 22), f"{size}  {path.stat().st_size/1024:.0f} КБ", fill=(150, 153, 140))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, "PNG", optimize=True)
    return out_path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Контактный лист фотографий")
    p.add_argument("src", type=Path)
    p.add_argument("--out", type=Path, default=Path("contact-sheet.png"))
    p.add_argument("--cols", type=int, default=5)
    p.add_argument("--cell", type=int, default=300)
    args = p.parse_args(argv)

    if not args.src.is_dir():
        print(f"Нет папки: {args.src}")
        return 1
    out = build_sheet(args.src, args.out, args.cols, args.cell)
    print(f"Готово: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
