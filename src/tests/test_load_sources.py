from datetime import datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app
from gridflex.load_sources import (MIN_METER_WINDOWS, meter_windows, nearest_level, parse_meter_csv,
                                   scale_windows, split_by_date)
from gridflex.profiles import Condition, DEFAULT_DATA_DIR, Windows, build_windows, split_by_sample

DEV = DEFAULT_DATA_DIR / "glass_009_2024-01_L1.parquet"


def meter_csv(start="2024-01-01", days=60, header="timestamp,kw", fmt="{t:%Y-%m-%d %H:%M},{v}", value=None):
    rows = [header]
    t = datetime.fromisoformat(start)
    end = t + timedelta(days=days)
    while t < end:
        v = value(t) if value else 10 + t.day  # each day has its own level, so we can tell days apart
        rows.append(fmt.format(t=t, v=v))
        t += timedelta(minutes=15)
    return "\n".join(rows)


# --- bill: sector + monthly kWh ---

def test_nearest_level_is_closest_by_ratio():
    levels = [Condition("009", "2024-01", i, kwh) for i, kwh in enumerate((3450, 8000, 13700, 29100))]
    assert nearest_level(levels, "009", "2024-01", 9000).level == 1
    assert nearest_level(levels, "009", "2024-01", 18000).level == 2  # 18000/13700 < 29100/18000
    assert nearest_level(levels, "009", "2024-01", 100).level == 0
    with pytest.raises(FileNotFoundError):
        nearest_level(levels, "008", "2024-01", 9000)
    with pytest.raises(ValueError):
        nearest_level(levels, "009", "2024-01", 0)


def test_scaling_keeps_the_shape_and_sets_the_size():
    w = Windows(np.arange(2 * 96, dtype=float).reshape(2, 96), np.array([0, 1]), np.array(["2023-01-02", "2023-01-03"], dtype="datetime64[D]"))
    scaled = scale_windows(w, 1.5)
    np.testing.assert_allclose(scaled.values, w.values * 1.5)
    np.testing.assert_array_equal(scaled.sample_ids, w.sample_ids)
    with pytest.raises(ValueError):
        scale_windows(w, -1)


# --- meter: the site's own readings ---

def test_meter_csv_in_kw_gives_whole_days():
    meter = parse_meter_csv(meter_csv(days=3))
    assert meter.values.shape == (3, 96)
    assert meter.values[0, 0] == 11 and meter.values[2, 95] == 13
    assert str(meter.dates[0]) == "2024-01-01"


def test_meter_csv_in_kwh_with_semicolons_and_decimal_commas():
    text = meter_csv(days=1, header="Timestamp;kWh", fmt="{t:%d-%m-%Y %H:%M};{v}", value=lambda t: "1,25")
    assert np.all(parse_meter_csv(text).values == 5.0)  # 1.25 kWh in 15 minutes = 5 kW


def test_incomplete_and_repeated_days_are_left_out_and_negatives_clipped():
    lines = meter_csv(days=3).split("\n")
    del lines[1 + 96 + 10]  # one reading missing on day 2
    lines.append(lines[1 + 2 * 96 - 1 + 5])  # day 3 has a repeated reading
    lines[1] = "2024-01-01 00:00,-4"
    meter = parse_meter_csv("\n".join(lines))
    assert [str(d) for d in meter.dates] == ["2024-01-01"]
    assert meter.values[0, 0] == 0 and meter.dropped_days == 2 and meter.clipped_readings == 1
    assert len(meter.warnings) == 2


def test_meter_times_ignore_the_offset_and_must_be_quarter_hours():
    meter = parse_meter_csv(meter_csv(days=1, fmt="{t:%Y-%m-%dT%H:%M:00+01:00},{v}"))
    assert meter.values.shape == (1, 96)
    with pytest.raises(ValueError, match="quarter hour"):
        parse_meter_csv("timestamp,kw\n2024-01-01 00:10,3")
    with pytest.raises(ValueError, match="time column"):
        parse_meter_csv("when,kw\n2024-01-01 00:00,3")
    with pytest.raises(ValueError, match="line 2"):
        parse_meter_csv("timestamp,kw\n2024-01-01 00:00,abc")


def test_meter_windows_cross_months_and_split_by_date():
    meter = parse_meter_csv(meter_csv(start="2024-01-01", days=60))
    windows = meter_windows(meter)
    assert np.datetime64("2024-01-31") in windows.dates  # Wednesday 31 Jan runs into 1 Feb
    # Noon-to-noon: first half from the start day, second half from the next day.
    first = windows.values[0]
    assert first[0] == 11 and first[95] == 12
    planning, test = split_by_date(windows)
    assert planning.dates.max() < test.dates.min()
    assert len(test) == round(0.3 * len(windows))
    with pytest.raises(ValueError, match="at least"):
        split_by_date(windows.select(np.arange(len(windows)) < MIN_METER_WINDOWS - 1))


def test_build_windows_still_keeps_glass_months_apart():
    meter = parse_meter_csv(meter_csv(start="2024-01-01", days=60))
    import polars as pl
    df = pl.DataFrame({"date": meter.dates, "sample_id": np.zeros(len(meter.dates), dtype=np.int64)})
    df = pl.concat([df, pl.DataFrame(meter.values, schema=[f"{h:02d}:{m:02d}:00" for h in range(24) for m in (0, 15, 30, 45)], orient="row")], how="horizontal")
    assert np.datetime64("2024-01-31") not in build_windows(df).dates


# --- through the API ---

@pytest.mark.skipif(not DEV.exists(), reason="development extract not present")
def test_bill_source_scales_the_closest_level():
    client = TestClient(app)
    result = client.post("/optimize", json={"load_source": "bill", "monthly_kwh": 16000, "vans": 4}).json()
    assert result["load"]["source"] == "bill" and result["load"]["level"] == 2
    assert result["load"]["scale"] == pytest.approx(16000 / 13700)
    assert result["report"]["synthetic"] is True
    assert client.post("/optimize", json={"load_source": "bill"}).status_code == 422


def test_meter_source_through_the_api(monkeypatch):
    def offline(*args, **kwargs):
        raise RuntimeError("no LLM in tests")
    monkeypatch.setattr("gridflex.assistant.call_llm", offline)
    client = TestClient(app)
    upload = client.post("/meter-data", json={"csv": meter_csv(days=70, value=lambda t: 20 if 8 <= t.hour < 18 else 8)})
    assert upload.status_code == 200
    info = upload.json()
    assert info["days"] == 70 and info["test_days"] > 0 and info["planning_days"] > info["test_days"]
    scenario = {"load_source": "meter", "meter_id": info["meter_id"], "vans": 4}
    result = client.post("/optimize", json=scenario).json()
    assert result["report"]["synthetic"] is False
    assert result["report"]["n_windows"] == info["test_days"]
    assert result["load"]["source"] == "meter"
    text = client.post("/explain", json={"scenario": scenario}).json()["text"]
    assert "synthetic windows" not in text
    missing = client.post("/optimize", json={"load_source": "meter", "meter_id": "0" * 16})
    assert missing.status_code == 404 and "upload the file again" in missing.json()["detail"]
    assert client.post("/meter-data", json={"csv": meter_csv(days=5)}).status_code == 422


# --- the example meter files in examples/ ---

from pathlib import Path  # noqa: E402

EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


@pytest.mark.parametrize("case", ["case_2_own_meter_data", "case_3_dutch_meter_export"])
def test_clean_example_meter_files_load_without_warnings(case):
    meter = parse_meter_csv((EXAMPLES / case / "meter-data.csv").read_text(encoding="utf-8"))
    planning, test = split_by_date(meter_windows(meter))
    assert meter.warnings == () and len(test) >= 20 and len(planning) > len(test)
    assert meter.values.max() < 160  # inside the 60-160 kW range the app is built for


def test_the_solar_example_shows_what_the_warnings_look_like():
    meter = parse_meter_csv((EXAMPLES / "case_4_solar_with_gaps" / "meter-data.csv").read_text(encoding="utf-8"))
    assert meter.dropped_days == 2 and meter.clipped_readings > 100 and len(meter.warnings) == 2
    assert len(split_by_date(meter_windows(meter))[1]) >= 20
