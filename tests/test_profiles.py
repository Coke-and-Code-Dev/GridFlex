from __future__ import annotations

import datetime as dt

import numpy as np
import polars as pl
import pytest

from gridflex.profiles import (
    DEFAULT_DATA_DIR,
    Condition,
    available_conditions,
    build_windows,
    cautious_baseline,
    condition_path,
    load_condition,
    split_by_sample,
)

EPOCH = dt.date(2023, 1, 1)
TIME_COLS = [f"{h:02d}:{m:02d}:00" for h in range(24) for m in (0, 15, 30, 45)]


def make_df(sample_ids, start: str = "2023-01-01", n_days: int = 31, skip: tuple[str, ...] = ()) -> pl.DataFrame:
    """Every slot of a day holds sample*1000 + days since 2023-01-01, so a window's
    contents say exactly which sample and day each half came from."""
    first = dt.date.fromisoformat(start)
    rows = []
    for s in sample_ids:
        for i in range(n_days):
            d = first + dt.timedelta(days=i)
            if d.isoformat() in skip:
                continue
            code = float(s * 1000 + (d - EPOCH).days)
            rows.append(
                {"category": "009", "date": d.isoformat(), "level_id": 1, "level_value": 1.0, "sample_id": s}
                | {c: code for c in TIME_COLS}
            )
    return pl.DataFrame(rows)


def test_windows_never_cross_a_month_or_sample():
    df = pl.concat([make_df([0, 1, 2], "2023-01-01", 31), make_df([0, 1, 2], "2023-02-01", 28)])
    w = build_windows(df, working_days_only=False)

    assert len(w) == 3 * 30 + 3 * 27  # one window per day except each month's last day
    for i in range(len(w)):
        s = int(w.sample_ids[i])
        d0 = int((w.dates[i] - np.datetime64("2023-01-01")).astype(int))
        assert np.all(w.values[i, :48] == s * 1000 + d0)  # evening: day d, same sample
        assert np.all(w.values[i, 48:] == s * 1000 + d0 + 1)  # morning: day d+1, same sample
        assert w.dates[i].astype("datetime64[M]") == (w.dates[i] + 1).astype("datetime64[M]")  # same month


def test_window_count_working_days_only():
    df = make_df(range(4), "2023-01-01", 31)
    w = build_windows(df, working_days_only=True)

    start_days = [EPOCH + dt.timedelta(days=i) for i in range(30)]  # Jan 1..30 can start a window
    expected = sum(d.weekday() < 5 for d in start_days) * 4
    assert len(w) == expected
    assert all(dt.date.fromisoformat(str(d)).weekday() < 5 for d in w.dates)


def test_start_hour_zero_gives_one_window_per_day():
    df = make_df([0, 1], "2023-01-01", 31)
    w = build_windows(df, start_hour=0, working_days_only=False)
    assert len(w) == 2 * 31
    assert w.values.shape == (62, 96)


def test_missing_day_drops_windows_spanning_the_gap():
    df = make_df([0], "2023-01-01", 31, skip=("2023-01-10",))
    w = build_windows(df, working_days_only=False)
    starts = {str(d) for d in w.dates}
    assert "2023-01-09" not in starts and "2023-01-10" not in starts
    assert len(w) == 30 - 2


def test_window_shape_and_dtypes():
    w = build_windows(make_df([0, 1], n_days=10), working_days_only=False)
    assert w.values.shape[1] == 96
    assert w.values.dtype == np.float64
    assert w.start_hour == 12
    assert len(w.sample_ids) == len(w.dates) == len(w)


def test_split_never_shares_a_sample():
    w = build_windows(make_df(range(100), n_days=10), working_days_only=False)
    planning, test = split_by_sample(w, 0.3, seed=42)

    assert set(planning.sample_ids).isdisjoint(set(test.sample_ids))
    assert len(planning) + len(test) == len(w)
    assert len(set(test.sample_ids)) == 30
    assert len(set(planning.sample_ids)) == 70


def test_split_is_deterministic_and_depends_on_seed():
    w = build_windows(make_df(range(50), n_days=5), working_days_only=False)
    a1, b1 = split_by_sample(w, seed=1)
    a2, b2 = split_by_sample(w, seed=1)
    _, b3 = split_by_sample(w, seed=2)
    assert set(b1.sample_ids) == set(b2.sample_ids)
    assert set(b1.sample_ids) != set(b3.sample_ids)


@pytest.mark.parametrize("n_samples", [2, 3, 4])
def test_split_of_a_tiny_condition_keeps_both_groups_non_empty(n_samples):
    w = build_windows(make_df(range(n_samples), n_days=10), working_days_only=False)
    planning, test = split_by_sample(w)
    assert len(planning) > 0 and len(test) > 0
    assert set(planning.sample_ids).isdisjoint(set(test.sample_ids))
    assert cautious_baseline(planning).shape == (96,)


def test_a_short_month_still_gives_the_expected_window_count():
    w = build_windows(make_df(range(3), "2023-02-01", n_days=28), working_days_only=False)
    assert len(w) == 3 * 27  # February: 28 days give 27 windows per sample


def test_split_needs_two_samples():
    w = build_windows(make_df([0], n_days=5), working_days_only=False)
    with pytest.raises(ValueError):
        split_by_sample(w)


def test_cautious_baseline_percentile():
    from gridflex.profiles import Windows

    values = np.tile(np.arange(10, dtype=float)[:, None], (1, 96))  # slots all hold 0..9
    w = Windows(values, np.arange(10), np.zeros(10, dtype="datetime64[D]"))
    b = cautious_baseline(w, q=0.9)
    assert b.shape == (96,)
    assert np.allclose(b, np.quantile(np.arange(10), 0.9))  # 8.1
    assert np.all(cautious_baseline(w, 0.99) >= b)
    assert np.all(cautious_baseline(w, 0.5) <= b)


def test_cautious_baseline_rejects_bad_input():
    from gridflex.profiles import Windows

    empty = Windows(np.empty((0, 96)), np.empty(0), np.empty(0, dtype="datetime64[D]"))
    with pytest.raises(ValueError):
        cautious_baseline(empty)
    w = build_windows(make_df([0, 1], n_days=5), working_days_only=False)
    with pytest.raises(ValueError):
        cautious_baseline(w, q=0)


def test_load_condition_and_available_conditions(tmp_path):
    df = make_df([0, 1], n_days=5)
    df.write_parquet(condition_path("009", "2023-01", 1, tmp_path))

    loaded = load_condition("009", "2023-01", 1, data_dir=tmp_path)
    assert loaded.shape == df.shape
    assert available_conditions(tmp_path) == [Condition("009", "2023-01", 1, 1.0)]

    with pytest.raises(FileNotFoundError, match="extract_glass.py"):
        load_condition("009", "2023-02", 1, data_dir=tmp_path)


REAL = DEFAULT_DATA_DIR / "glass_009_2024-01_L1.parquet"


@pytest.mark.skipif(not REAL.exists(), reason="development extract not present")
def test_real_development_condition():
    df = load_condition("009", "2024-01", 1)
    w = build_windows(df)
    planning, test = split_by_sample(w)

    n_samples = df["sample_id"].n_unique()
    assert n_samples == 40  # slim extract (extract_glass.py --samples 40)
    assert 0 < len(w) <= n_samples * 30  # at most (31 - 1) windows per sample in January
    assert set(planning.sample_ids).isdisjoint(set(test.sample_ids))
    assert all(d.astype("datetime64[M]") == np.datetime64("2024-01") for d in w.dates)
    assert cautious_baseline(planning).shape == (96,)


def test_available_conditions_notices_new_and_removed_files(tmp_path):
    make_df([0, 1], n_days=3).write_parquet(condition_path("009", "2024-01", 1, tmp_path))
    assert len(available_conditions(tmp_path)) == 1
    make_df([0, 1], n_days=3).write_parquet(condition_path("008", "2024-02", 2, tmp_path))
    assert [(c.category, c.month, c.level) for c in available_conditions(tmp_path)] == [
        ("008", "2024-02", 2), ("009", "2024-01", 1)]
    condition_path("009", "2024-01", 1, tmp_path).unlink()
    assert [c.category for c in available_conditions(tmp_path)] == ["008"]
