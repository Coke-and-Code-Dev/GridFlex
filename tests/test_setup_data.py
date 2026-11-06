import importlib.util
import zipfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "setup_data.py"
spec = importlib.util.spec_from_file_location("setup_data", SCRIPT)
setup_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup_data)


@pytest.fixture
def small(tmp_path, monkeypatch):
    """A one-file data set in a temporary folder."""
    monkeypatch.setattr(setup_data, "PROCESSED", tmp_path / "processed")
    monkeypatch.setattr(setup_data, "CATEGORIES", ["009"])
    monkeypatch.setattr(setup_data, "MONTHS", ["2024-01"])
    monkeypatch.setattr(setup_data, "LEVELS", [1])
    (tmp_path / "processed").mkdir()
    return tmp_path


def test_status_says_what_is_missing(small, capsys):
    assert setup_data.status() == 1
    assert "0 of 1" in capsys.readouterr().out
    (small / "processed" / "glass_009_2024-01_L1.parquet").write_bytes(b"data")
    assert setup_data.status() == 0


def test_pack_then_unpack_restores_the_files(small):
    target = small / "processed" / "glass_009_2024-01_L1.parquet"
    target.write_bytes(b"parquet bytes")
    assert setup_data.pack(small / "share.zip") == 0
    target.unlink()
    assert setup_data.unpack(small / "share.zip") == 0
    assert target.read_bytes() == b"parquet bytes"


def test_pack_refuses_an_incomplete_set(small):
    assert setup_data.pack(small / "share.zip") == 1
    assert not (small / "share.zip").exists()


def test_unpack_rejects_damaged_and_foreign_zips(small):
    name = "glass_009_2024-01_L1.parquet"
    good = small / "good.zip"
    with zipfile.ZipFile(good, "w") as z:
        z.writestr(name, b"data")
        z.writestr(setup_data.MANIFEST, f"{'0' * 64}  {name}\n")  # wrong checksum
    assert setup_data.unpack(good) == 1
    assert not (small / "processed" / name).exists()

    sneaky = small / "sneaky.zip"
    with zipfile.ZipFile(sneaky, "w") as z:
        z.writestr("../evil.parquet", b"x")
        z.writestr(setup_data.MANIFEST, f"{'0' * 64}  ../evil.parquet\n")
    assert setup_data.unpack(sneaky) == 1
    assert not (small / "evil.parquet").exists()

    plain = small / "plain.zip"
    with zipfile.ZipFile(plain, "w") as z:
        z.writestr(name, b"data")
    assert setup_data.unpack(plain) == 1  # no manifest


def test_build_explains_a_missing_raw_file(small, monkeypatch, capsys):
    monkeypatch.setattr(setup_data, "RAW", small / "missing.parquet")
    assert setup_data.build() == 1
    assert "unpack" in capsys.readouterr().out


def test_the_expected_set_is_the_documented_480():
    assert len(setup_data.expected_names()) == 480  # 10 categories x 12 months x 4 levels
