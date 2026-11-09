import importlib.util
import sys
import zipfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "data" / "scripts" / "setup_data.py"
spec = importlib.util.spec_from_file_location("setup_data", SCRIPT)
setup_data = importlib.util.module_from_spec(spec)
sys.modules["setup_data"] = setup_data
spec.loader.exec_module(setup_data)


@pytest.fixture
def small(tmp_path, monkeypatch):
    """A tiny data set (one file or two per group) in a temporary folder."""
    monkeypatch.setattr(setup_data, "PROCESSED", tmp_path / "processed")
    monkeypatch.setattr(setup_data, "CATEGORIES", ["009"])
    monkeypatch.setattr(setup_data, "MONTHS", ["2024-01"])
    monkeypatch.setattr(setup_data, "LEVELS", [1])
    monkeypatch.setattr(setup_data, "GRID_FILES", ["grid_pc6.parquet"])
    monkeypatch.setattr(setup_data, "LIANDER_CODES", ["49"])
    monkeypatch.setattr(setup_data, "LIANDER_MONTHS", ["2023-01"])
    (tmp_path / "processed").mkdir()
    return tmp_path


def write_all(small, content=b"data"):
    for name in setup_data.all_names():
        (small / "processed" / name).write_bytes(content + name.encode())


def test_status_names_the_incomplete_group(small, capsys):
    assert setup_data.status() == 1
    out = capsys.readouterr().out
    assert "GLASS" in out and "0 of 1" in out and "download_data.py" in out
    write_all(small)
    assert setup_data.status() == 0


def test_status_works_when_the_folder_does_not_exist_yet(small, capsys):
    (small / "processed").rmdir()
    assert setup_data.status() == 1
    assert "incomplete" in capsys.readouterr().out


def test_pack_then_unpack_restores_everything(small):
    write_all(small)
    assert setup_data.pack(small / "share.zip") == 0
    before = {n: (small / "processed" / n).read_bytes() for n in setup_data.all_names()}
    for n in before:
        (small / "processed" / n).unlink()
    assert setup_data.unpack(small / "share.zip") == 0
    assert {n: (small / "processed" / n).read_bytes() for n in before} == before


def test_pack_refuses_an_incomplete_set(small):
    (small / "processed" / "glass_009_2024-01_L1.parquet").write_bytes(b"only this one")
    assert setup_data.pack(small / "share.zip") == 1
    assert not (small / "share.zip").exists()


def test_unpack_rejects_damaged_foreign_and_manifest_less_zips(small):
    name = "glass_009_2024-01_L1.parquet"
    damaged = small / "damaged.zip"
    with zipfile.ZipFile(damaged, "w") as z:
        z.writestr(name, b"data")
        z.writestr(setup_data.MANIFEST, f"{'0' * 64}  {name}\n")  # wrong checksum
    assert setup_data.unpack(damaged) == 1
    assert not (small / "processed" / name).exists()

    for odd in ("../evil.parquet", "glass_999_2024-01_L1.parquet", "notes.txt"):  # outside or not expected
        sneaky = small / "sneaky.zip"
        with zipfile.ZipFile(sneaky, "w") as z:
            z.writestr(odd, b"x")
            z.writestr(setup_data.MANIFEST, f"{'0' * 64}  {odd}\n")
        assert setup_data.unpack(sneaky) == 1
        assert not (small / "evil.parquet").exists()

    plain = small / "plain.zip"
    with zipfile.ZipFile(plain, "w") as z:
        z.writestr(name, b"data")
    assert setup_data.unpack(plain) == 1  # no manifest


def test_build_lists_every_missing_raw_file_and_how_to_get_it(small, monkeypatch, capsys):
    for raw in ("RAW", "RAW_CAPACITY", "RAW_LIANDER"):
        monkeypatch.setattr(setup_data, raw, small / "nothing-here" / raw)
    assert setup_data.build() == 1
    out = capsys.readouterr().out
    assert "download_data.py glass" in out and "download_data.py capacity" in out
    assert "download_data.py liander" in out and "unpack" in out


def test_build_skips_what_is_already_complete(small, monkeypatch, capsys):
    write_all(small)
    assert setup_data.build() == 0
    assert "already built" in capsys.readouterr().out


def test_the_real_set_is_the_documented_one():
    names = setup_data.groups()
    assert len(names["GLASS"]) == 480  # 10 categories x 12 months x 4 levels
    assert len(names["grid map"]) == 4
    assert len(names["Liander"]) == 37  # 3 codes x 12 months, and the meta file
    assert len(setup_data.all_names()) == 521
