"""Тесты структуры HTML: баланс тегов, уникальность id, целостность якорей."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "tools"))

from check_html import ROOT, check_file  # noqa: E402

PAGES = ["index.html", "privacy.html", "offer.html", "404.html"]


def test_pages_exist():
    for name in PAGES:
        assert (ROOT / name).exists(), f"нет файла {name}"


def test_html_structure_is_valid():
    """Сломанная разметка (лишний </div>, незакрытый блок) — частая причина «съездов»."""
    for name in PAGES:
        problems = check_file(ROOT / name)
        assert not problems, f"{name}: " + "; ".join(problems)


def test_promo_cards_inside_grid():
    """Три карточки скидок должны быть детьми .promo__grid — иначе они разъезжаются."""
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    block = html.split('class="promo__grid"', 1)[1].split("</section>", 1)[0]
    assert block.count('class="promo__card"') == 3, "в сетке скидок должно быть ровно 3 карточки"
    # после последней карточки сетка закрывается, а сноска остаётся внутри .wrap
    assert block.index("promo__card") < block.index("promo__foot"), "сноска должна идти после карточек"
