from __future__ import annotations

import datetime as dt
import importlib.util
import zipfile
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from gridflex.profiles import DEFAULT_DATA_DIR
from gridflex.reality import RealityCheck, compare, compare_all, summary

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_liander_sbi.py"
spec = importlib.util.spec_from_file_location("prepare_liander_sbi", SCRIPT)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

TIME_COLS = [f"{h:02d}:{m:02d}:00" for h in range(24) for m in (0, 15, 30, 45)]
JAN = [dt.date(2023, 1, 1) + dt.timedelta(days=i) for i in range(31)]
WORKING_DAYS_JAN_2023 = sum(d.weekday() < 5 for d in JAN)  # 22
CURVE = 1 + 0.5 * np.sin(np.linspace(0, 2 * np.pi, 96, endpoint=False))  # mean exactly 1.0


def weekend_factor(d: dt.date) -> float:
    """Weekends get a crazy level: results must not change if weekends are really excluded."""
    return 100.0 if d.weekday() >= 5 else 1.0


def write_glass(folder: Path, level: int = 1, n_samples: int = 5) -> None:
    rows = []
    for s in range(n_samples):
        for d in JAN:
            vals = CURVE * (s + 1) * weekend_factor(d)  # sample s is (s+1) times the base curve
            rows.append(
                {"category": "009", "date": d.isoformat(), "level_id": level, "level_value": 1.0, "sample_id": s}
                | dict(zip(TIME_COLS, vals))
            )
    pl.DataFrame(rows).write_parquet(folder / f"glass_009_2023-01_L{level}.parquet")


def write_liander(folder: Path, code: str, curve: np.ndarray, band: bool = True, scale: float = 0.07) -> None:
    ts, vals = [], []
    for d in JAN:
        for slot in range(96):
            ts.append(dt.datetime.combine(d, dt.time()) + dt.timedelta(minutes=15 * slot))
            vals.append(curve[slot] * scale * weekend_factor(d))
    v = np.array(vals)
    none = [None] * len(v)
    pl.DataFrame(
        {
            "timestamp": ts,
            "median": v if band else none,
            "p10": v * 0.5 if band else none,
            "p90": v * 1.5 if band else none,
            "mean": v,
        },
        schema_overrides={"median": pl.Float64, "p10": pl.Float64, "p90": pl.Float64},
    ).write_parquet(folder / f"liander_sbi_{code}_2023-01.parquet")


@pytest.fixture
def folder(tmp_path) -> Path:
    write_glass(tmp_path)
    return tmp_path


def test_same_shape_gives_perfect_agreement_whatever_the_scale(folder):
    write_liander(folder, "52", CURVE, scale=0.07)  # Liander is relative, GLASS is kW: scale must not matter
    r = compare("009", "2023-01", "52", level=1, data_dir=folder)

    assert r.correlation == pytest.approx(1.0)
    assert r.mean_abs_diff == pytest.approx(0.0, abs=1e-9)  # also proves weekends (x100) were left out
    assert r.glass_band.shape == r.liander_band.shape == (3, 96)
    assert r.liander_has_band is True
    assert (r.n_glass_samples, r.n_glass_days, r.n_liander_days) == (5, WORKING_DAYS_JAN_2023, WORKING_DAYS_JAN_2023)
    assert (r.category, r.month, r.level, r.sbi_code) == ("009", "2023-01", 1, "52")


def test_bands_are_percentiles_across_samples_rescaled_to_mean_one(folder):
    write_liander(folder, "52", CURVE)
    r = compare("009", "2023-01", "52", data_dir=folder)
    # Samples are 1..5 times CURVE: p10/median/p90 = 1.4/3/4.6, mean 3, so after rescaling by the mean:
    expected = np.array([1.4 / 3, 1.0, 4.6 / 3])[:, None] * CURVE
    assert np.allclose(r.glass_band, expected)
    assert r.glass_band[1].mean() == pytest.approx(1.0)
    assert np.allclose(r.liander_band, np.array([0.5, 1.0, 1.5])[:, None] * CURVE)


def test_a_different_shape_gives_low_correlation(folder):
    write_liander(folder, "49", np.roll(CURVE, 48))  # peak twelve hours later
    r = compare("009", "2023-01", "49", data_dir=folder)
    assert r.correlation < 0
    assert r.mean_abs_diff > 0.5


def test_standard_profile_has_no_band(folder):
    write_liander(folder, "KO_LOGISTIEK", CURVE, band=False)
    r = compare("009", "2023-01", "KO_LOGISTIEK", data_dir=folder)
    assert r.liander_has_band is False
    assert np.isnan(r.liander_band[0]).all() and np.isnan(r.liander_band[2]).all()
    assert r.liander_band[1] == pytest.approx(CURVE)  # the single curve, rescaled to mean 1
    assert r.correlation == pytest.approx(1.0)


def test_missing_files_give_helpful_errors(folder):
    with pytest.raises(FileNotFoundError, match="prepare_liander_sbi.py"):
        compare("009", "2023-01", "52", data_dir=folder)
    write_liander(folder, "52", CURVE)
    with pytest.raises(FileNotFoundError, match="extract_glass.py"):
        compare("009", "2023-01", "52", level=3, data_dir=folder)


def test_compare_all_uses_only_the_extracts_that_exist(folder):
    write_liander(folder, "KO_LOGISTIEK", CURVE, band=False)
    write_liander(folder, "52", CURVE)  # no SBI 49 extract
    assert [c.sbi_code for c in compare_all("009", "2023-01", 1, folder)] == ["52", "KO_LOGISTIEK"]
    assert compare_all("999", "2023-01", 1, folder) == []


@pytest.mark.parametrize("corr, word", [(0.95, "closely"), (0.8, "broadly"), (0.3, "only loosely")])
def test_summary_words_follow_the_number(corr, word):
    check = RealityCheck("52", corr, 0.07, np.zeros((3, 96)), np.zeros((3, 96)), category="009", month="2023-01")
    text = summary(check)
    assert word in text and f"{corr:.2f}" in text and "SBI 52" in text and "0.07" in text


REAL = DEFAULT_DATA_DIR / "liander_sbi_52_2023-01.parquet"


@pytest.mark.skipif(not (REAL.exists() and (DEFAULT_DATA_DIR / "glass_009_2024-01_L1.parquet").exists()),
                    reason="Liander or GLASS extract not present")
def test_real_development_condition_against_sbi_52():
    r = compare("009", "2024-01", "52")
    # GLASS January 2024 has 23 working days; Liander's real January 2023 has 22 (matched by calendar month).
    assert r.n_glass_samples == 40 and (r.n_glass_days, r.n_liander_days) == (23, WORKING_DAYS_JAN_2023)
    assert 0.8 < r.correlation <= 1.0
    assert r.mean_abs_diff < 0.5


# --- scripts/prepare_liander_sbi.py ----------------------------------------------------------


def make_overview(path: Path, rows: list[list[str | None]]) -> None:
    strings: list[str] = []
    xml_rows = []
    for r, row in enumerate(rows, start=1):
        cells = []
        for c, value in enumerate(row):
            if value is None:
                continue
            if value not in strings:
                strings.append(value)
            cells.append(f'<c r="{chr(65 + c)}{r}" t="s"><v>{strings.index(value)}</v></c>')
        xml_rows.append(f'<row r="{r}">{"".join(cells)}</row>')
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    sst = "".join(f"<si><t>{s}</t></si>" for s in strings)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/sharedStrings.xml", f'<sst xmlns="{ns}">{sst}</sst>')
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{ns}"><sheetData>{"".join(xml_rows)}</sheetData></worksheet>')


HEADER = ["code", "description", "Warning", "Tijdseries in deze SBI", "Profiel hoogste correlatie"]


def test_overview_reads_warning_series_and_recommended_profile(tmp_path):
    make_overview(
        tmp_path / "o.xlsx",
        [
            HEADER,
            ["49", "Vervoer over land", None, "141", "KO_LOGISTIEK"],
            ["46", "Groothandel", "Pas op: minder dan 10 timeseries.", "0", "Onbekend"],
        ],
    )
    o = prepare.read_overview(tmp_path / "o.xlsx")
    assert o["49"] == {"description": "Vervoer over land", "warning": None, "series": 141, "recommended_profile": "KO_LOGISTIEK"}
    assert o["46"]["warning"].startswith("Pas op") and o["46"]["series"] == 0


def january_csv_sbi() -> str:
    lines = [",min,p10,median,mean,p90,max,median_renorm,mean_renorm,p90_renorm"]
    for d in JAN:
        for slot in range(96):
            t = dt.datetime.combine(d, dt.time()) + dt.timedelta(minutes=15 * slot)
            lines.append(f"{t:%Y-%m-%d %H:%M:%S},0.0,0.1,0.2,0.3,0.4,0.5,0.1,0.2,0.3")
    return "\n".join(lines) + "\n"


def january_csv_ko() -> str:
    lines = ["DATUM_TIJDSTIP;WAARDE"]
    for d in JAN:
        for slot in range(96):
            t = dt.datetime.combine(d, dt.time()) + dt.timedelta(minutes=15 * slot)
            lines.append(f"{t:%Y-%m-%d %H:%M};0.5")
    return "\n".join(lines) + "\n"


def test_series_from_the_sbi_and_ko_zips(tmp_path):
    with zipfile.ZipFile(tmp_path / prepare.SBI_ZIP, "w") as z:
        z.writestr("49.csv", january_csv_sbi())
    with zipfile.ZipFile(tmp_path / prepare.KO_ZIP, "w") as z:
        z.writestr("KO Profielen/KO_LOGISTIEK_clean_2023_semicolon.csv", january_csv_ko())

    sbi = prepare.month_rows(prepare.read_series(tmp_path, "49"), "2023-01")
    assert sbi.height == 31 * 96
    assert sbi.row(0, named=True) | {"timestamp": None} == {"timestamp": None, "median": 0.2, "p10": 0.1, "p90": 0.4, "mean": 0.3}

    ko = prepare.month_rows(prepare.read_series(tmp_path, "KO_LOGISTIEK"), "2023-01")
    assert ko["mean"].to_list()[:2] == [0.5, 0.5]
    assert ko["median"].null_count() == ko.height and ko["p10"].null_count() == ko.height


def test_incomplete_month_and_unknown_codes_are_refused(tmp_path):
    with zipfile.ZipFile(tmp_path / prepare.SBI_ZIP, "w") as z:
        z.writestr("49.csv", january_csv_sbi())
    series = prepare.read_series(tmp_path, "49")
    with pytest.raises(SystemExit):
        prepare.month_rows(series, "2023-02")  # not in the file
    with pytest.raises(SystemExit, match="KO_LOGISTIEK"):
        prepare.read_series(tmp_path, "46")  # no such file: points to the fallback
    with pytest.raises(SystemExit):
        prepare.read_series(tmp_path, "../../etc/passwd")


def test_liander_file_is_matched_by_calendar_month_not_year():
    from gridflex.reality import liander_path
    assert liander_path("52", "2024-03").name == "liander_sbi_52_2023-03.parquet"
    assert liander_path("52", "2023-03").name == "liander_sbi_52_2023-03.parquet"


def test_extract_script_keeps_the_first_samples_of_a_condition():
    spec = importlib.util.spec_from_file_location("extract_glass", Path(SCRIPT).with_name("extract_glass.py"))
    extract = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(extract)
    df = pl.DataFrame({"sample_id": [5, 3, 3, 9, 1, 1], "date": ["d"] * 6})
    assert sorted(extract.keep_first_samples(df, 2)["sample_id"].unique().to_list()) == [1, 3]
    assert extract.keep_first_samples(df, None).height == 6
    with pytest.raises(SystemExit):
        extract.keep_first_samples(df, 1)
