"""Тесты для photo_prep — проверяем поведение, а не детали реализации."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from photo_prep import prepare_dir, prepare_one  # noqa: E402


def make_image(path: Path, w: int = 2400, h: int = 1600, color=(120, 140, 100)) -> Path:
    Image.new("RGB", (w, h), color).save(path, "JPEG", quality=95)
    return path


def test_resize_keeps_aspect_ratio(tmp_path):
    src = make_image(tmp_path / "big.jpg", 2400, 1600)
    res = prepare_one(src, tmp_path / "out", max_width=1200)
    assert res.width == 1200
    assert res.height == 800  # 1600 * 1200 / 2400


def test_image_smaller_than_limit_is_not_enlarged(tmp_path):
    src = make_image(tmp_path / "small.jpg", 800, 600)
    res = prepare_one(src, tmp_path / "out", max_width=1600)
    assert (res.width, res.height) == (800, 600)


def test_creates_jpeg_webp_and_thumbnail(tmp_path):
    src = make_image(tmp_path / "photo.jpg")
    res = prepare_one(src, tmp_path / "out", max_width=1000, thumb_width=200)
    out = tmp_path / "out"
    assert (out / "photo.jpg").exists()
    assert (out / "photo.webp").exists()
    assert (out / "photo-thumb.webp").exists()
    assert res.webp_kb > 0


def test_exif_is_removed(tmp_path):
    src = make_image(tmp_path / "with_exif.jpg")
    with Image.open(src) as im:
        exif = im.getexif()
        exif[0x010E] = "Описание"  # ImageDescription
        exif[0x0131] = "SecretGPS"  # Software / GPS-подобный тег
        im.save(src, "JPEG", exif=exif)

    prepare_one(src, tmp_path / "out")

    with Image.open(tmp_path / "out" / "with_exif.jpg") as im:
        assert not im.getexif()
    with Image.open(tmp_path / "out" / "with_exif.webp") as im:
        assert not im.getexif()


def test_non_image_files_are_skipped(tmp_path):
    (tmp_path / "notes.txt").write_text("не картинка", encoding="utf-8")
    make_image(tmp_path / "ok.jpg")
    results = prepare_dir(tmp_path, tmp_path / "out")
    assert len(results) == 1
    assert results[0].source == "ok.jpg"


def test_empty_folder_produces_nothing(tmp_path):
    assert prepare_dir(tmp_path, tmp_path / "out") == []


def test_webp_is_smaller_than_jpeg(tmp_path):
    src = make_image(tmp_path / "photo.jpg", 2000, 1400)
    res = prepare_one(src, tmp_path / "out")
    assert res.webp_kb < res.jpeg_kb


def test_cli_reports_and_writes_json(tmp_path, capsys):
    from photo_prep import main

    make_image(tmp_path / "a.jpg")
    report = tmp_path / "report.json"
    code = main([str(tmp_path), "--out", str(tmp_path / "out"), "--report", str(report)])

    assert code == 0
    out = capsys.readouterr().out
    assert "Итого" in out
    data = json.loads(report.read_text(encoding="utf-8"))
    assert data[0]["source"] == "a.jpg"


def test_cli_fails_on_missing_folder(tmp_path):
    from photo_prep import main

    assert main([str(tmp_path / "нет-такой-папки")]) == 1
