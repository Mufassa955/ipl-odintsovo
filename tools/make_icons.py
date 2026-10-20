"""
make_icons — генерация иконок услуг и преимуществ в формате SVG.

Почему SVG, а не картинки:
  • масштабируется без потерь и весит 1–2 КБ;
  • цвет наследуется через currentColor — иконка работает в тёмной и светлой теме;
  • генерируется кодом: можно массово менять стиль (толщина линий, сетка).

Запуск:
    python tools/make_icons.py --out assets/icons
"""

from __future__ import annotations

import argparse
from pathlib import Path

# Каждая иконка — набор SVG-элементов в сетке 24x24
ICONS: dict[str, dict] = {
    # --- Услуги ---
    "laser": {
        "title": "Лазерная эпиляция — аппарат 1S PRO",
        "paths": [
            '<rect x="2.5" y="3" width="10" height="11" rx="1.5"/>',
            '<path d="M7.5 14v7M4 21h7"/>',
            '<path d="M15 9.5 21 3.5M18 6.5 21 3.5M15 9.5l2.5 2.5"/>',
        ],
    },
    "electro": {
        "title": "Электроэпиляция — аппарат МИКРОТЕРМ 5М",
        "paths": [
            '<path d="M12 2.5v7"/>',
            '<path d="M8.5 9.5 12 13l3.5-3.5"/>',
            '<path d="M4 18c2.5-2.5 13.5-2.5 16 0"/>',
            '<path d="M7 21.5c2-1.6 8-1.6 10 0"/>',
        ],
    },
    "indiba": {
        "title": "INDIBA — восстановление и омоложение кожи",
        "paths": [
            '<path d="M7 20a9 9 0 0 1 0-12"/>',
            '<path d="M12 20a4 4 0 0 1 0-12"/>',
            '<path d="M17 20a9 9 0 0 0 0-12"/>',
            '<path d="M12 14.5v.01"/>',
        ],
    },
    # --- Преимущества ---
    "sterile": {
        "title": "Стерильность и гигиена",
        "paths": [
            '<path d="M12 2.5 19 5v6.5c0 4.6-3 7.8-7 9.5-4-1.7-7-4.9-7-9.5V5l7-2.5z"/>',
            '<path d="m8.8 11.8 2.2 2.2 4.2-4.4"/>',
        ],
    },
    "comfort": {
        "title": "Комфорт и деликатность",
        "paths": [
            '<path d="M20.5 3.5c-6.5 0-11.5 4.3-13.5 9.5l-3.5 7.5 7.5-3.5C16.2 14.5 20.5 9.5 20.5 3.5z"/>',
            '<path d="M4 20.5 13.5 11"/>',
        ],
    },
    "result": {
        "title": "Результат с первого визита",
        "paths": [
            '<path d="m12 2.5 2.1 5.6 5.9 2.1-5.9 2.1L12 17.9l-2.1-5.6L4 10.2l5.9-2.1L12 2.5z"/>',
            '<path d="M18.5 16.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z"/>',
        ],
    },
    "consult": {
        "title": "Бесплатная консультация-тест",
        "paths": [
            '<rect x="3" y="5" width="18" height="16" rx="2"/>',
            '<path d="M3 10h18M8 3v4M16 3v4"/>',
            '<path d="m9 15 2 2 4-4"/>',
        ],
    },
    "certificate": {
        "title": "Подарочный сертификат",
        "paths": [
            '<rect x="2.5" y="7" width="19" height="12" rx="1.5"/>',
            '<path d="M2.5 11h19M12 11v8"/>',
            '<path d="M12 7C10 4 7.5 3 5.5 3.5 5.8 5 6 6.5 6 7"/>',
            '<path d="M12 7c2-3 4.5-4 6.5-3.5C17.2 5 17 6.5 17 7"/>',
        ],
    },
    "parking": {
        "title": "Парковка",
        "paths": [
            '<path d="M4 16v-3.5L6.5 7h11L20 12.5V16"/>',
            '<path d="M3 16h18v3H3z"/>',
            '<circle cx="7.5" cy="19" r="1.6"/>',
            '<circle cx="16.5" cy="19" r="1.6"/>',
        ],
    },
    "clock": {
        "title": "Ежедневно с 10:00 до 22:00",
        "paths": [
            '<circle cx="12" cy="12" r="9"/>',
            '<path d="M12 6.5V12l3.5 2.2"/>',
        ],
    },
    "location": {
        "title": "Одинцово, БЦ «Телеграф»",
        "paths": [
            '<path d="M12 21.5s7-6.2 7-11.2a7 7 0 1 0-14 0c0 5 7 11.2 7 11.2z"/>',
            '<circle cx="12" cy="10" r="2.8"/>',
        ],
    },
    "phone": {
        "title": "Телефон",
        "paths": [
            '<path d="M6 2.5h3.5l2 5-2.4 1.5a13 13 0 0 0 5.4 5.4L16 12l5 2v3.5a2 2 0 0 1-2.2 2A17 17 0 0 1 4 4.7 2 2 0 0 1 6 2.5z"/>',
        ],
    },
    "guarantee": {
        "title": "Гарантия результата",
        "paths": [
            '<circle cx="12" cy="12" r="9"/>',
            '<path d="m8 12 2.5 2.5L16 9"/>',
            '<path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21"/>',
        ],
    },
}

TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{size}" height="{size}"
     fill="none" stroke="currentColor" stroke-width="{stroke}" stroke-linecap="round"
     stroke-linejoin="round" role="img" aria-label="{title}">
  <title>{title}</title>
{body}
</svg>
"""


def render(name: str, spec: dict, size: int = 24, stroke: float = 1.4) -> str:
    # Элементы, уже записанные как теги (<path .../>, <rect .../>), вставляем как есть;
    # голые строки с координатами оборачиваем в <path d="...">
    parts = []
    for p in spec["paths"]:
        parts.append(f"  {p}" if p.lstrip().startswith("<") else f'  <path d="{p}"/>')
    body = "\n".join(parts)
    return TEMPLATE.format(size=size, stroke=stroke, title=spec["title"], body=body)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Генерация SVG-иконок")
    p.add_argument("--out", type=Path, default=Path("assets/icons"))
    p.add_argument("--size", type=int, default=24)
    p.add_argument("--stroke", type=float, default=1.4)
    p.add_argument("--prefix", default="")
    args = p.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    for name, spec in ICONS.items():
        path = args.out / f"{args.prefix}{name}.svg"
        path.write_text(render(name, spec, args.size, args.stroke), encoding="utf-8")
    print(f"Создано иконок: {len(ICONS)} → {args.out}")
    for f in sorted(args.out.glob("*.svg")):
        print(f"  {f.name:22s} {f.stat().st_size/1024:5.1f} КБ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
