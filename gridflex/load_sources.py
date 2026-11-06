"""Where the building's own electricity use comes from (idea.md 5.2a).

Three sources, from best to fallback:
- "meter":   the site's own 15-minute meter readings, uploaded as CSV.
- "bill":    no meter history; a GLASS profile of the same sector, scaled to the monthly
             kWh on the energy bill ("a business like yours").
- "profile": a GLASS profile picked as-is (the demo default).

Every source returns planning and test `Windows`, so the scheduler, replay, sweeps and
explanations work the same for all three.
"""
from __future__ import annotations

import csv
import math
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from io import StringIO

import numpy as np
import polars as pl

from gridflex.profiles import N_SLOTS, Condition, Windows, build_windows, sector_label

MIN_METER_WINDOWS = 20  # about four working weeks
TEST_SHARE = 0.3
MAX_METER_ROWS = 120_000  # a little over three years of 15-minute readings
TIME_NAMES = ("timestamp", "datetime", "date_time", "time", "start")
POWER_NAMES = ("kw", "power_kw")
ENERGY_NAMES = ("kwh", "energy_kwh")
_DATE_FORMATS = ("%d-%m-%Y %H:%M", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S")
_SLOT_COLUMNS = [f"{h:02d}:{m:02d}:00" for h in range(24) for m in (0, 15, 30, 45)]


@dataclass(frozen=True)
class LoadInfo:
    """What the building load is based on, for the dashboard and the explanations."""

    source: str  # "profile" | "bill" | "meter"
    description: str
    synthetic: bool  # False only for the site's own meter data
    n_planning: int
    n_test: int
    level: int | None = None  # GLASS level used ("profile" and "bill")
    scale: float = 1.0  # factor applied to the GLASS profile ("bill")
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class MeterData:
    """A parsed meter upload: whole days only, as (n_days, 96) kW."""

    dates: np.ndarray  # (n_days,) datetime64[D]
    values: np.ndarray  # (n_days, 96) kW
    dropped_days: int = 0  # days with missing or repeated readings
    clipped_readings: int = 0  # readings below zero (export) set to 0 kW
    warnings: tuple[str, ...] = field(default=())


# --- "bill": sector + monthly kWh ----------------------------------------------------------

def nearest_level(conditions: list[Condition], category: str, month: str, monthly_kwh: float) -> Condition:
    """The GLASS level of this sector and month whose monthly use is closest (by ratio)."""
    if not math.isfinite(monthly_kwh) or monthly_kwh <= 0:
        raise ValueError("Monthly use must be a positive number of kWh.")
    options = [c for c in conditions if c.category == category and c.month == month and c.level_value_kwh]
    if not options:
        raise FileNotFoundError(f"No prepared profile for category {category} in {month}.")
    return min(options, key=lambda c: (abs(math.log(monthly_kwh / c.level_value_kwh)), c.level))


def scale_windows(windows: Windows, factor: float) -> Windows:
    """Same shape, different size: every value times `factor`."""
    if not math.isfinite(factor) or factor <= 0:
        raise ValueError("Scale factor must be positive.")
    return replace(windows, values=windows.values * factor)


def month_name(month: str) -> str:
    """"2024-01" -> "January". The GLASS year means nothing to a user; the month sets the season."""
    return datetime.strptime(month, "%Y-%m").strftime("%B")


def bill_info(condition: Condition, monthly_kwh: float, n_planning: int, n_test: int) -> LoadInfo:
    factor = monthly_kwh / condition.level_value_kwh
    warnings = []
    if not 0.5 <= factor <= 2:
        warnings.append(
            f"Your monthly use is {factor:.1f} times the closest measured size "
            f"({condition.level_value_kwh:,.0f} kWh). The day shape may fit a business of your size less well."
        )
    description = (
        f"Estimated from similar businesses, not your own data: synthetic GLASS profiles "
        f"({sector_label(condition.category)}, {month_name(condition.month)}, "
        f"≈ {condition.level_value_kwh:,.0f} kWh/month), scaled to your {monthly_kwh:,.0f} kWh/month."
    )
    return LoadInfo("bill", description, True, n_planning, n_test, condition.level, factor, tuple(warnings))


def profile_info(condition: Condition, n_planning: int, n_test: int) -> LoadInfo:
    size = f"≈ {condition.level_value_kwh:,.0f} kWh/month" if condition.level_value_kwh else f"level {condition.level}"
    description = (f"Synthetic GLASS profiles ({sector_label(condition.category)}, "
                   f"{month_name(condition.month)}, {size}).")
    return LoadInfo("profile", description, True, n_planning, n_test, condition.level)


# --- "meter": the site's own readings ------------------------------------------------------

def _parse_time(text: str) -> datetime:
    text = text.strip()
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        for fmt in _DATE_FORMATS:
            try:
                moment = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        else:
            raise ValueError(f"Cannot read the time {text!r}. Use for example 2024-01-15 13:45.") from None
    # The clock time as written is the local time of the reading; an offset is ignored.
    return moment.replace(tzinfo=None)


def _number(text: str, decimal_comma: bool) -> float:
    text = text.strip()
    if decimal_comma:
        text = text.replace(".", "").replace(",", ".") if "," in text else text
    value = float(text)
    if not math.isfinite(value):
        raise ValueError
    return value


def parse_meter_csv(text: str) -> MeterData:
    """Read 15-minute meter readings: a time column and a kW (or kWh per 15 minutes) column.

    Each row is one reading; the time is when the 15 minutes start, in local clock time.
    Semicolon-separated files with decimal commas (common in Dutch exports) also work.
    Days with a missing or repeated reading (also the clock-change days) are left out.
    """
    text = text.lstrip("﻿")
    first_line = text.split("\n", 1)[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    if "\t" in first_line and delimiter not in first_line:
        delimiter = "\t"
    reader = csv.reader(StringIO(text, newline=""), delimiter=delimiter)
    header = [name.strip().lower() for name in next(reader, [])]
    time_col = next((header.index(n) for n in TIME_NAMES if n in header), None)
    power_col = next((header.index(n) for n in POWER_NAMES if n in header), None)
    energy_col = next((header.index(n) for n in ENERGY_NAMES if n in header), None)
    if time_col is None or (power_col is None) == (energy_col is None):
        raise ValueError(
            "The meter CSV needs a time column (timestamp) and exactly one reading column: "
            "kw (average power) or kwh (energy per 15 minutes)."
        )
    value_col = power_col if power_col is not None else energy_col
    to_kw = 1.0 if power_col is not None else 4.0

    days: dict[date, np.ndarray] = {}
    bad_days: set[date] = set()
    clipped = 0
    for line, row in enumerate(reader, start=2):
        if not any(cell.strip() for cell in row):
            continue
        if line - 1 > MAX_METER_ROWS:
            raise ValueError(f"The meter CSV has more than {MAX_METER_ROWS:,} readings. Upload up to three years.")
        try:
            moment = _parse_time(row[time_col])
            value = _number(row[value_col], delimiter == ";") * to_kw
        except (IndexError, ValueError) as exc:
            detail = str(exc) if str(exc) else "Cannot read the reading."
            raise ValueError(f"Meter CSV line {line}: {detail}") from None
        if moment.minute % 15 or moment.second or moment.microsecond:
            raise ValueError(f"Meter CSV line {line}: readings must start on the quarter hour (15-minute data).")
        if value < 0:
            clipped += 1
            value = 0.0
        day = moment.date()
        slots = days.setdefault(day, np.full(N_SLOTS, np.nan))
        slot = moment.hour * 4 + moment.minute // 15
        if not np.isnan(slots[slot]):
            bad_days.add(day)
        slots[slot] = value

    complete = sorted(d for d, v in days.items() if d not in bad_days and not np.isnan(v).any())
    if not complete:
        raise ValueError("The meter CSV has no complete day of 96 quarter-hour readings.")
    warnings = []
    dropped = len(days) - len(complete)
    if dropped:
        warnings.append(f"{dropped} day(s) with missing or repeated readings were left out (clock changes count).")
    if clipped:
        warnings.append(f"{clipped} reading(s) below zero (power sent back to the grid) were counted as 0 kW.")
    return MeterData(
        np.array(complete, dtype="datetime64[D]"),
        np.stack([days[d] for d in complete]),
        dropped, clipped, tuple(warnings),
    )


def meter_windows(meter: MeterData, start_hour: int = 12) -> Windows:
    """Working-day windows of the meter data, allowed to run across a month boundary."""
    df = pl.DataFrame({"date": meter.dates, "sample_id": np.zeros(len(meter.dates), dtype=np.int64)})
    df = pl.concat([df, pl.DataFrame(meter.values, schema=_SLOT_COLUMNS, orient="row")], how="horizontal")
    return build_windows(df, start_hour, across_months=True)


def split_by_date(windows: Windows, test_share: float = TEST_SHARE) -> tuple[Windows, Windows]:
    """Plan on the earlier days, test on the later ones.

    One site has one sample, so GLASS's split by sample cannot apply. Testing on later
    days is what using the plan would look like: it was made before those days happened.
    """
    if not 0 < test_share < 1:
        raise ValueError("test_share must be between 0 and 1")
    if len(windows) < MIN_METER_WINDOWS:
        raise ValueError(
            f"The meter data gives {len(windows)} working days; at least {MIN_METER_WINDOWS} "
            "(about four weeks) are needed to plan on some days and test on others."
        )
    order = np.argsort(windows.dates, kind="stable")
    n_test = max(round(test_share * len(windows)), 1)
    is_test = np.zeros(len(windows), dtype=bool)
    is_test[order[-n_test:]] = True
    return windows.select(~is_test), windows.select(is_test)


def meter_info(meter: MeterData, planning: Windows, test: Windows) -> LoadInfo:
    first, last = meter.dates.min(), meter.dates.max()
    description = (
        f"Your own meter data: {len(meter.dates)} complete days from {first} to {last}. "
        f"The plan uses the {len(planning)} earliest working days; the {len(test)} latest are held out to test it."
    )
    warnings = list(meter.warnings)
    if len(test) < 20:
        warnings.append(
            f"Only {len(test)} test days: each one changes the share of days over the limit by "
            f"{100 / len(test):.0f} percentage points. More history gives a steadier answer."
        )
    span = (last - first).astype(int)
    if span > 120:
        warnings.append("The data covers several seasons; the test days are the most recent ones, "
                        "so the result describes that season best.")
    return LoadInfo("meter", description, False, len(planning), len(test), warnings=tuple(warnings))


def meter_summary(meter: MeterData) -> dict:
    """Plain numbers about an upload, shown before the user runs Optimize."""
    days = len(meter.dates)
    daily_kwh = meter.values.sum(axis=1) / 4
    return {
        "days": days,
        "first_date": str(meter.dates.min()),
        "last_date": str(meter.dates.max()),
        "dropped_days": meter.dropped_days,
        "monthly_kwh": float(daily_kwh.mean() * 30.4),
        "peak_kw": float(meter.values.max()),
        "warnings": list(meter.warnings),
    }
