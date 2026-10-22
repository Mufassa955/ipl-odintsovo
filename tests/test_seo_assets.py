"""Тесты SEO-активов, иконок и формы записи."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "privacy.html", "offer.html", "404.html"]


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_icons_exist():
    for name in ("favicon.ico", "apple-touch-icon.png", "site.webmanifest",
                 "assets/icons/icon-192.png", "assets/icons/icon-512.png"):
        assert (ROOT / name).exists(), f"нет файла {name}"


def test_icons_referenced_on_every_page():
    for page in PAGES:
        html = read(page)
        assert 'href="favicon.ico' in html, f"{page}: нет favicon.ico"
        assert 'href="apple-touch-icon.png' in html, f"{page}: нет apple-touch-icon"
        assert 'href="site.webmanifest"' in html, f"{page}: нет манифеста"
        assert 'favicon.svg' not in html, f"{page}: осталась ссылка на старую иконку"
        # версия в ссылке обязательна — иначе браузер месяцами держит старую иконку
        assert 'favicon.ico?v=' in html, f"{page}: у favicon.ico нет версии — браузер не обновит иконку"


def test_manifest_is_valid_json():
    data = json.loads(read("site.webmanifest"))
    assert data["name"] and data["start_url"]
    assert data["icons"], "в манифесте нет иконок"
    for icon in data["icons"]:
        assert (ROOT / icon["src"]).exists(), f"нет файла иконки {icon['src']}"


def test_og_image_and_twitter():
    for page in ("index.html", "privacy.html", "offer.html"):
        html = read(page)
        assert 'property="og:image"' in html, f"{page}: нет og:image"
        assert 'name="twitter:card"' in html, f"{page}: нет twitter:card"
    assert (ROOT / "assets" / "img" / "og-image.png").exists(), "нет og-image.png"


def test_description_length():
    """Мета-описание длиннее 160 символов обрезается в поисковой выдаче."""
    for page in PAGES:
        m = re.search(r'<meta name="description" content="([^"]+)"', read(page))
        if not m:
            continue
        assert len(m.group(1)) <= 160, f"{page}: описание {len(m.group(1))} символов"


def test_gallery_images_have_srcset():
    html = read("index.html")
    block = html.split('id="galleryGrid"', 1)[1].split("gallery__hint", 1)[0]
    images = re.findall(r'<img [^>]*>', block)
    assert len(images) == 10, f"в галерее {len(images)} фото, ожидалось 10"
    for img in images:
        assert "srcset=" in img, "у фото галереи нет srcset: " + img[:80]
        assert "sizes=" in img, "у фото галереи нет sizes: " + img[:80]


def test_form_has_status_and_telegram_hook():
    html = read("index.html")
    assert "data-telegram-form" in html, "форма не помечена для Telegram"
    assert 'class="form__status"' in html, "нет блока статуса отправки"
    assert 'src="telegram.js' in html, "не подключён telegram.js"


def test_telegram_script_has_placeholders():
    js = read("telegram.js")
    assert "TELEGRAM_BOT_TOKEN" in js and "TELEGRAM_CHAT_ID" in js
    # основной режим — через прокси, чтобы токен не попадал в страницу
    assert "PROXY_URL" in js, "нет поддержки прокси"
    # fallback: пока ничего не настроено, форма работает через mailto
    assert "mailto" in read("index.html"), "нет запасного варианта mailto"
    assert "configured" in js, "нет проверки готовности отправки"


def test_telegram_token_not_committed():
    """Токен бота не должен лежать в репозитории: только в секретах."""
    for name in ("telegram.js", "index.html", "app.js"):
        text = read(name)
        assert not re.search(r"\b\d{8,10}:[A-Za-z0-9_-]{30,}\b", text), f"токен найден в {name}"


def test_marquee_has_no_repeated_neighbours():
    """В бегущей строке один и тот же пункт не должен идти дважды подряд."""
    html = read("index.html")
    block = html.split('class="marquee"', 1)[1].split("</div>", 1)[0]
    items = re.findall(r"<span>(.*?)</span>", block)
    assert items, "бегущая строка пустая"
    half = len(items) // 2
    assert items[:half] == items[half:], "вторая копия бегущей строки отличается от первой"
    for a, b in zip(items[:half], items[1:half + 1]):
        assert a != b, f"повтор подряд: «{a}»"


def test_no_console_friendly_placeholder_icons():
    """Иконки должны быть сгенерированы, а не пустыми."""
    ico = (ROOT / "favicon.ico").read_bytes()
    assert len(ico) > 1000, "favicon.ico слишком маленький — возможно, не сгенерирован"
    assert (ROOT / "assets" / "img" / "og-image.png").stat().st_size > 10000
