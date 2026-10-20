"""
photo_prep — подготовка фотографий для веб-сайта.

Что делает:
  • очищает EXIF (удаляет GPS, модель телефона и дату съёмки — приватность)
  • учитывает ориентацию камеры (EXIF rotation)
  • уменьшает до заданной ширины без потери пропорций
  • сохраняет JPEG (для совместимости) + WebP (современный формат, меньше вес)
  • делает превью (thumbnail) для галереи
  • печатает отчёт: было → стало, сколько сэкономили

Использование:
    python tools/photo_prep.py ./photos --out assets/img --max-width 1600
    python tools/photo_prep.py ./photos --out assets/img --report report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Нужен Pillow: pip install -r requirements.txt")

try:  # HEIC с iPhone — без этой библиотеки Pillow их не откроет
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIF = True
except Exception:  # noqa: BLE001
    HEIF = False

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
if HEIF:
    SUPPORTED |= {".heic", ".heif"}

# Форматы, из которых имеет смысл делать JPEG
OPAQUE_NEEDED = {".png", ".webp", ".bmp", ".tif", ".tiff"}


@dataclass
class Result:
    source: str
    width: int
    height: int
    original_kb: float
    jpeg_kb: float
    webp_kb: float
    thumb_kb: float
    saved_kb: float
    exif_removed: bool


def is_image(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED


def prepare_one(
    src: Path,
    out_dir: Path,
    max_width: int = 1600,
    jpeg_quality: int = 82,
    webp_quality: int = 78,
    thumb_width: int = 480,
    write_jpeg: bool = True,
) -> Result:
    """Обрабатывает один файл и возвращает отчёт по нему."""
    original_kb = src.stat().st_size / 1024

    with Image.open(src) as raw:
        exif_present = bool(raw.info.get("exif"))
        img = ImageOps.exif_transpose(raw)  # разворачивает по EXIF-ориентации
        img = img.convert("RGB") if img.mode not in ("RGB", "L") else img

        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, max(1, round(img.height * ratio))), Image.LANCZOS)

        out_dir.mkdir(parents=True, exist_ok=True)
        stem = src.stem
        ext = src.suffix.lower()

        jpeg_path = out_dir / f"{stem}.jpg"
        webp_path = out_dir / f"{stem}.webp"
        thumb_path = out_dir / f"{stem}-thumb.webp"

        if write_jpeg or ext in OPAQUE_NEEDED:
            img.save(jpeg_path, "JPEG", quality=jpeg_quality, optimize=True, progressive=True, exif=b"")
        img.save(webp_path, "WEBP", quality=webp_quality, method=6, exif=b"")

        thumb = img.copy()
        if thumb.width > thumb_width:
            thumb = thumb.resize((thumb_width, max(1, round(thumb.height * thumb_width / thumb.width))), Image.LANCZOS)
        thumb.save(thumb_path, "WEBP", quality=70, method=6, exif=b"")

    jpeg_kb = jpeg_path.stat().st_size / 1024 if jpeg_path.exists() else 0.0
    webp_kb = webp_path.stat().st_size / 1024
    thumb_kb = thumb_path.stat().st_size / 1024

    return Result(
        source=src.name,
        width=img.width,
        height=img.height,
        original_kb=round(original_kb, 1),
        jpeg_kb=round(jpeg_kb, 1),
        webp_kb=round(webp_kb, 1),
        thumb_kb=round(thumb_kb, 1),
        saved_kb=round(original_kb - webp_kb, 1),
        exif_removed=exif_present,
    )


def prepare_dir(
    src_dir: Path,
    out_dir: Path,
    max_width: int = 1600,
    jpeg_quality: int = 82,
    webp_quality: int = 78,
    thumb_width: int = 480,
) -> list[Result]:
    files = sorted(p for p in src_dir.iterdir() if p.is_file() and is_image(p))
    return [
        prepare_one(f, out_dir, max_width, jpeg_quality, webp_quality, thumb_width)
        for f in files
    ]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Подготовка фото для сайта")
    p.add_argument("src", type=Path, help="папка с исходниками")
    p.add_argument("--out", type=Path, default=Path("assets/img"), help="куда складывать")
    p.add_argument("--max-width", type=int, default=1600, help="максимальная ширина (px)")
    p.add_argument("--jpeg-quality", type=int, default=82)
    p.add_argument("--webp-quality", type=int, default=78)
    p.add_argument("--thumb-width", type=int, default=480)
    p.add_argument("--report", type=Path, help="сохранить отчёт в JSON")
    args = p.parse_args(argv)

    if not args.src.is_dir():
        print(f"Нет такой папки: {args.src}", file=sys.stderr)
        return 1

    results = prepare_dir(
        args.src, args.out,
        args.max_width, args.jpeg_quality, args.webp_quality, args.thumb_width,
    )
    if not results:
        print("В папке нет подходящих изображений.")
        return 0

    print(f"{'файл':<28}{'размер':>12}{'было':>10}{'JPEG':>9}{'WebP':>9}{'экономия':>11}")
    print("-" * 79)
    total_before = total_after = 0.0
    for r in results:
        total_before += r.original_kb
        total_after += r.webp_kb
        print(f"{r.source[:27]:<28}{f'{r.width}x{r.height}':>12}"
              f"{r.original_kb:>9.1f}K{r.jpeg_kb:>8.1f}K{r.webp_kb:>8.1f}K{r.saved_kb:>10.1f}K")
    print("-" * 79)
    pct = (1 - total_after / total_before) * 100 if total_before else 0
    print(f"Итого: {total_before:.1f} КБ → {total_after:.1f} КБ  (экономия {pct:.0f}%)")
    exif_n = sum(1 for r in results if r.exif_removed)
    if exif_n:
        print(f"EXIF (в т.ч. GPS) удалён из {exif_n} файлов")

    if args.report:
        args.report.write_text(
            json.dumps([asdict(r) for r in results], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Отчёт: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
