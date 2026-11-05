from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import polars as pl
import pytest

from gridflex.grid_area import DEFAULT_DATA_DIR, lookup, map_date, normalise_postcode

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_grid_map.py"


def _load_prepare():
    spec = importlib.util.spec_from_file_location("prepare_grid_map", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


prepare = _load_prepare()


@pytest.fixture
def data_dir(tmp_path) -> Path:
    """A tiny capacity map with the same schema scripts/prepare_grid_map.py writes."""
    pc6 = pl.DataFrame(
        {
            "postcode": ["1111AA", "2222BB", "3333CC", "4444DD", "5555EE"],
            "offtake_code": [3, 0, 2, 3, -1],
            "area_id": ["A1", "A2", "A_MISSING", "A1", "A2"],
            "area_name": ["Teststad Noord", "Rustig Zuid", "Weg Oost", "Teststad Noord", None],
            "operator": ["Liander", "Enexis", "Stedin", "Liander", None],
            "municipality": ["Teststad", "Rustig", "Weg", "Teststad", None],
            "province": ["Noord-Holland", "Limburg", "Zuid-Holland", "Noord-Holland", None],
            "multiple_areas": [False, False, False, True, False],
        },
        schema_overrides={"offtake_code": pl.Int8},
    )
    areas = pl.DataFrame(
        {
            "area_id": ["A1", "A2"],
            "operator": ["Liander", "Enexis"],
            "province": ["Noord-Holland", "Limburg"],
            "capacity_mw": [50.0, None],
            "needed_mw": [60.0, None],
            "queue_requests": [10, None],
            "queue_mw": [4.5, None],
            "expected_fix_year": [2030, None],
            "info_url": ["https://example.org/congestion", None],
            "note": [None, None],
        },
        schema_overrides={"queue_requests": pl.Int32, "expected_fix_year": pl.Int32},
    )
    projects = pl.DataFrame(
        {
            "name": ["Extra capaciteit A", "Extra capaciteit B"],
            "area_id": ["A1", "A1"],
            "year": [2030, 2031],
            "quarter": [None, 1],
            "phase": ["inProgress", None],
            "operator": ["Liander", "Liander"],
            "url": [None, None],
            "expected": ["2030", "2031 - Q1"],
        },
        schema_overrides={"year": pl.Int32, "quarter": pl.Int32},
    )
    pc6.write_parquet(tmp_path / "grid_pc6.parquet")
    areas.write_parquet(tmp_path / "grid_areas.parquet")
    projects.write_parquet(tmp_path / "grid_projects.parquet")
    (tmp_path / "grid_map_meta.json").write_text(json.dumps({"download_date": "2026-11-05"}))
    return tmp_path


def test_known_postcode_returns_its_area(data_dir):
    a = lookup("1111AA", data_dir)
    assert a is not None
    assert a.postcode == "1111AA"
    assert a.status == "shortage"
    assert a.area_name == "Teststad Noord" and a.operator == "Liander"
    assert a.municipality == "Teststad" and a.province == "Noord-Holland"
    assert (a.capacity_mw, a.needed_mw) == (50.0, 60.0)
    assert (a.queue_requests, a.queue_mw, a.expected_fix_year) == (10, 4.5, 2030)
    assert a.info_url == "https://example.org/congestion"
    assert [(p.name, p.expected, p.phase) for p in a.projects] == [
        ("Extra capaciteit A", "2030", "inProgress"),
        ("Extra capaciteit B", "2031 - Q1", None),
    ]
    assert a.data_date == "2026-11-05" == map_date(data_dir)
    assert a.ambiguous is False


@pytest.mark.parametrize("typed", ["1111 aa", "1111aa", " 1111AA ", "1111\tAa", "1111  aA"])
def test_lowercase_and_spaces_are_normalised(data_dir, typed):
    a = lookup(typed, data_dir)
    assert a is not None and a.postcode == "1111AA"
    assert normalise_postcode(typed) == "1111AA"


@pytest.mark.parametrize("bad", ["0000AA", "9999ZZ"])
def test_unknown_postcode_returns_none(data_dir, bad):
    assert lookup(bad, data_dir) is None


@pytest.mark.parametrize("bad", ["", "1234", "ABCDEF", "12345A", "1111A", "1111AAA", "11 11"])
def test_malformed_postcode_returns_none(data_dir, bad):
    assert normalise_postcode(bad) is None
    assert lookup(bad, data_dir) is None


def test_area_with_missing_values_gives_none_not_zero(data_dir):
    a = lookup("2222BB", data_dir)
    assert a.status == "available"
    assert a.area_name == "Rustig Zuid"
    assert a.capacity_mw is None and a.needed_mw is None
    assert a.queue_requests is None and a.queue_mw is None
    assert a.expected_fix_year is None and a.info_url is None
    assert a.projects == []


def test_postcode_whose_area_is_not_in_the_area_table(data_dir):
    a = lookup("3333CC", data_dir)
    assert a.status == "under_study"
    assert a.area_name == "Weg Oost"
    assert a.capacity_mw is None and a.queue_requests is None and a.projects == []


def test_unknown_status_and_missing_names(data_dir):
    a = lookup("5555EE", data_dir)
    assert a.status == "unknown"
    assert a.area_name is None and a.operator is None and a.municipality is None


def test_postcode_in_two_areas_is_flagged(data_dir):
    assert lookup("4444DD", data_dir).ambiguous is True


def test_missing_data_files_give_a_helpful_error(tmp_path):
    with pytest.raises(FileNotFoundError, match="prepare_grid_map.py"):
        lookup("1111AA", tmp_path)


# --- the rules in scripts/prepare_grid_map.py ---------------------------------------------


def _raw_pc6(rows):
    cols = ["postcode", "afname", "voedingsgebied_id", "voedingsgebied_naam", "RNB_postcode", "Gemeentenaam", "provincie"]
    return pl.DataFrame(rows, schema={c: pl.Utf8 for c in cols}, orient="row")


def test_prepare_pc6_keeps_the_most_severe_duplicate_and_flags_it():
    raw = _raw_pc6(
        [
            ("1111 aa", "1", "A", "Area A", "Liander", "Teststad", "Noord-Holland"),
            ("1111AA", "3", "B", "Area B", "Stedin", "Teststad", "Noord-Holland"),
            ("2222BB", "0", "A", "Area A", "Liander", None, None),
            (None, "-1", "C", None, "Stedin", None, None),  # area-only row without a postcode
        ]
    )
    df, stats = prepare.prepare_pc6(raw)
    assert df["postcode"].to_list() == ["1111AA", "2222BB"]
    row = df.filter(pl.col("postcode") == "1111AA").row(0, named=True)
    assert row["offtake_code"] == 3 and row["area_id"] == "B" and row["multiple_areas"] is True
    assert df.filter(pl.col("postcode") == "2222BB")["multiple_areas"].item() is False
    assert stats["rows_without_postcode"] == 1
    assert stats["duplicate_rows_dropped"] == 1
    assert stats["postcodes"] == 2


def test_prepare_pc6_identical_duplicate_rows_are_not_ambiguous():
    row = ("1111AA", "2", "A", "Area A", "Liander", "Teststad", "Noord-Holland")
    df, _ = prepare.prepare_pc6(_raw_pc6([row, row]))
    assert df.height == 1 and df["multiple_areas"].item() is False


def test_prepare_areas_parses_comma_decimals_and_ignores_placeholders():
    cols = [
        "voedingsgebied_id", "RNB", "provincie", "aanwezige_transportcapaciteit_afname",
        "benodigde_transportcapaciteit_afname", "unieke_verzoeken_afname", "wachtrij_afname",
        "jaartal_opgelost_afname", "congestie_url", "info",
    ]
    raw = pl.DataFrame(
        [
            ("X", "Liander", "Noord-Holland", "56,0", "53,5", "29,0", "5,82194", "2032,0", "https://x", None),
            ("Y", "Enexis", None, "", "-1", "", "", "2099,0", None, None),  # empty, -1 and 2099 = no information
        ],
        schema={c: pl.Utf8 for c in cols},
        orient="row",
    )
    df = prepare.prepare_areas(raw).sort("area_id")
    x, y = df.row(0, named=True), df.row(1, named=True)
    assert (x["capacity_mw"], x["needed_mw"], x["queue_requests"], x["queue_mw"], x["expected_fix_year"]) == (
        56.0, 53.5, 29, 5.82194, 2032,
    )
    assert all(y[k] is None for k in ("capacity_mw", "needed_mw", "queue_requests", "queue_mw", "expected_fix_year"))


def test_prepare_projects_builds_the_expected_label():
    cols = ["projectnaam", "gebied_id", "jaar", "kwartaal", "project_fase", "netbeheerder", "project_url"]
    raw = pl.DataFrame(
        [("P1", "A", "2032", "4", "approved", "Liander", None), ("P2", "A", "2030", None, None, "Liander", None)],
        schema={c: pl.Utf8 for c in cols},
        orient="row",
    )
    df = prepare.prepare_projects(raw)
    assert df["expected"].to_list() == ["2030", "2032 - Q4"]  # earliest first
    assert df["phase"].to_list() == [None, "approved"]


REAL = DEFAULT_DATA_DIR / "grid_pc6.parquet"


@pytest.mark.skipif(not REAL.exists(), reason="processed capacity map not present")
def test_real_map_amstelveen_postcode():
    a = lookup("1181 kj")
    assert a is not None and a.postcode == "1181KJ"
    assert a.status == "shortage" and a.operator == "Liander"
    assert a.municipality == "Amstelveen"
    assert a.data_date == map_date()
    assert lookup("0000AA") is None
