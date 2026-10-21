"""
update_schema — генерирует блок JSON-LD разметки из содержимого index.html.

Зачем: микроразметка отзывов (schema.org/Review) должна всегда совпадать
с тем, что реально показано на странице. Вручную это рассинхронизируется,
поэтому разметка собирается автоматически из самих отзывов.

Запуск:
    python tools/update_schema.py
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

INDEX = Path("index.html")
BLOCK_RE = re.compile(
    r'(  <script type="application/ld\+json">\n)(.*?)(\n  </script>)',
    re.S,
)


def parse_reviews(index_html: str) -> list[dict]:
    """Достаёт отзывы из блоков <blockquote class="review">."""
    reviews = []
    for block in re.findall(
        r'<blockquote class="review">(.*?)</blockquote>', index_html, re.S
    ):
        text = re.search(r'<p class="review__text">(.*?)</p>', block, re.S)
        author = re.search(r'<cite class="review__author">(.*?)</cite>', block, re.S)
        rating = re.search(r'aria-label="(\d) из 5"', block)
        if not (text and author):
            continue
        clean = lambda s: html.unescape(re.sub(r"\s+", " ", s)).strip()  # noqa: E731
        reviews.append(
            {
                "@type": "Review",
                "author": {"@type": "Person", "name": clean(author.group(1))},
                "datePublished": "2026-01-01",
                "reviewBody": clean(text.group(1)),
                "reviewRating": {
                    "@type": "Rating",
                    "ratingValue": rating.group(1) if rating else "5",
                    "bestRating": "5",
                },
            }
        )
    return reviews


def main() -> int:
    source = INDEX.read_text(encoding="utf-8")
    block = BLOCK_RE.search(source)
    if not block:
        print("Не найден блок JSON-LD в index.html")
        return 1

    schema = json.loads(block.group(2))
    reviews = parse_reviews(source)
    if reviews:
        schema["review"] = reviews

    new_json = json.dumps(schema, ensure_ascii=False, indent=2)
    updated = source[: block.start(2)] + new_json + source[block.end(2):]

    if updated != source:
        INDEX.write_text(updated, encoding="utf-8")
        print(f"Разметка обновлена: отзывов в JSON-LD — {len(reviews)}")
    else:
        print("Разметка уже актуальна")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
