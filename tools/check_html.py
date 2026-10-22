#!/usr/bin/env python3
"""Проверка структуры HTML: баланс тегов, дубли id, битые ссылки-якоря.

Запуск:  python3 tools/check_html.py [файл.html ...]
Код возврата 0 — ошибок нет, 1 — есть ошибки.
"""
from __future__ import annotations

import pathlib
import re
import sys
from html.parser import HTMLParser

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}

ROOT = pathlib.Path(__file__).resolve().parent.parent


class StructureParser(HTMLParser):
    """Следит за балансом тегов и собирает id/якоря/ссылки."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.errors: list[str] = []
        self.ids: list[str] = []
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        attrs_d = {k: (v or "") for k, v in attrs}
        if "id" in attrs_d:
            self.ids.append(attrs_d["id"])
        if tag == "a" and "href" in attrs_d:
            self.hrefs.append(attrs_d["href"])
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID:
            return
        line = self.getpos()[0]
        if not self.stack:
            self.errors.append(f"лишний </{tag}> (строка {line})")
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        open_tags = [t for t, _ in self.stack]
        if tag in open_tags:
            while self.stack and self.stack[-1][0] != tag:
                t, pos = self.stack.pop()
                self.errors.append(f"не закрыт <{t}> (открыт в строке {pos}) — закрыт на </{tag}> (строка {line})")
            if self.stack:
                self.stack.pop()
        else:
            self.errors.append(f"лишний </{tag}> (строка {line})")


def check_file(path: pathlib.Path) -> list[str]:
    parser = StructureParser()
    parser.feed(path.read_text(encoding="utf-8"))
    problems = list(parser.errors)
    for tag, line in parser.stack:
        problems.append(f"не закрыт <{tag}> (открыт в строке {line})")

    seen: set[str] = set()
    for i in parser.ids:
        if i in seen:
            problems.append(f"дублирующийся id=\"{i}\"")
        seen.add(i)

    for href in parser.hrefs:
        if href.startswith("#") and href != "#" and href[1:] not in seen:
            problems.append(f"битый якорь {href}")
    return problems


def main(argv: list[str]) -> int:
    files = [pathlib.Path(a) for a in argv[1:]] or sorted(ROOT.glob("*.html"))
    failed = False
    for f in files:
        problems = check_file(f)
        if problems:
            failed = True
            print(f"── {f.name} ──")
            for p in problems:
                print(f"   ❌ {p}")
        else:
            print(f"── {f.name} ✅ структура в порядке")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
