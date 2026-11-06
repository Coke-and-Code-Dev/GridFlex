"""Load GLASS extracts, build noon-to-noon windows, split by customer, cautious baseline.

See idea.md sections 5.2-5.4 and 7.3. Rules that matter (AGENTS.md):
- GLASS rows only join into a continuous series within the same scenario, category,
  year-month, level_id and sample_id. Windows never cross a month or a sample.
- The planning/test split is by `sample_id`, never by day.
- Time is 15-minute slots (96 per window); power is kW.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import polars as pl

N_SLOTS = 96
SLOTS_PER_HOUR = 4
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"

_TIME_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")
_FILE_RE = re.compile(r"^glass_(?P<category>[A-Za-z0-9]+)_(?P<month>\d{4}-\d{2})_L(?P<level>\d)\.parquet$")


# GLASS consumption categories (data/README.md): the business sector of the connection.
SECTOR_LABELS = {
    "001": "Standard branches",
    "002": "Agriculture, forestry and fishing",
    "003": "Mining and quarrying",
    "004": "Manufacturing",
    "005": "Electricity, gas and steam supply",
    "006": "Water supply and waste management",
    "007": "Construction",
    "008": "Wholesale and retail",
    "009": "Transport and storage",
    "010": "Accommodation and food service",
    "011": "Information and communication",
    "012": "Financial and insurance",
    "013": "Real estate",
    "014": "Professional, scientific and technical",
    "015": "Administrative and support services",
    "016": "Public administration",
    "017": "Education",
    "018": "Health and social work",
    "019": "Arts, entertainment and recreation",
    "020": "Other services",
    "E3A": "Active up to 2,000 hours a year",
    "E3B": "Active 2,000-3,000 hours a year",
    "E3C": "Active 3,000-5,000 hours a year",
    "E3D": "Active 5,000+ hours a year",
}


def sector_label(category: str) -> str:
    return SECTOR_LABELS.get(category, f"Category {category}")


@dataclass(frozen=True)
class Condition:
    category: str
    month: str  # "YYYY-MM"
    level: int  # level_id 0-3
    level_value_kwh: float | None = None  # target kWh for the month ("≈ X MWh/month")
    label: str = field(default="", compare=False)  # readable sector name


@dataclass
class Windows:
    """Scheduling windows: slot 0 is `start_hour:00`, slot 95 is 15 minutes before it next day."""

    values: np.ndarray  # (n_windows, 96) kW
    sample_ids: np.ndarray  # (n_windows,)
    dates: np.ndarray  # (n_windows,) datetime64[D]: the date each window starts on
    start_hour: int = 12

    def __len__(self) -> int:
        return int(self.values.shape[0])

    def select(self, mask: np.ndarray) -> "Windows":
        return Windows(self.values[mask], self.sample_ids[mask], self.dates[mask], self.start_hour)


def _time_columns(df: pl.DataFrame) -> list[str]:
    cols = sorted(c for c in df.columns if _TIME_RE.match(c))
    if len(cols) != N_SLOTS:
        raise ValueError(f"Expected {N_SLOTS} time columns, found {len(cols)}")
    return cols


def condition_path(category: str, month: str, level: int, data_dir: Path | None = None) -> Path:
    return (data_dir or DEFAULT_DATA_DIR) / f"glass_{category}_{month}_L{level}.parquet"


def load_condition(category: str, month: str, level: int, data_dir: Path | None = None) -> pl.DataFrame:
    """Load one extracted condition (one row per sample per day)."""
    path = condition_path(category, month, level, data_dir)
    if not path.exists():
        raise FileNotFoundError(
            f"{path.name} not found in {path.parent}. "
            f"Run: python scripts/extract_glass.py --categories {category} --months {month} --levels {level}"
        )
    return pl.read_parquet(path)


def available_conditions(data_dir: Path | None = None) -> list[Condition]:
    """Conditions that have an extract in data/processed/."""
    folder = data_dir or DEFAULT_DATA_DIR
    found: list[Condition] = []
    for path in sorted(folder.glob("glass_*.parquet")):
        m = _FILE_RE.match(path.name)
        if not m:
            continue
        try:
            value = pl.scan_parquet(path).select("level_value").head(1).collect()["level_value"][0]
            level_value = float(value)
        except Exception:
            level_value = None
        found.append(Condition(m["category"], m["month"], int(m["level"]), level_value,
                               sector_label(m["category"])))
    return found


def build_windows(df: pl.DataFrame, start_hour: int = 12, working_days_only: bool = True,
                  across_months: bool = False) -> Windows:
    """Cut a condition into 24-hour windows starting at `start_hour`.

    A window joins day d (from `start_hour`) to day d+1 (up to `start_hour`) of the SAME
    sample and month, so it needs day d+1 to exist. Days missing from the data drop the
    windows that would span the gap. With `working_days_only`, windows are kept when the
    day they START on is Monday-Friday.

    GLASS samples are one month long, so its windows never cross a month. A site's own meter
    data is one continuous series; `across_months=True` lets its windows run from the last
    day of a month into the next.
    """
    if not 0 <= start_hour < 24:
        raise ValueError("start_hour must be 0-23")
    cols = _time_columns(df)

    date = pl.col("date")
    if df.schema["date"] == pl.Utf8:
        date = date.str.to_date("%Y-%m-%d")
    df = df.with_columns(date.alias("_date"))
    df = df.with_columns(pl.col("_date").dt.strftime("%Y-%m").alias("_month"))

    keys = [c for c in ("scenario", "category", "level_id", "sample_id") if c in df.columns]
    if not across_months:
        keys.append("_month")
    df = df.sort(keys + ["_date"])
    n = df.height
    if n == 0:
        return Windows(np.empty((0, N_SLOTS)), np.empty(0, dtype=np.int64), np.empty(0, dtype="datetime64[D]"), start_hour)

    x = df.select(cols).to_numpy().astype(np.float64)  # (n, 96)
    dates = df["_date"].to_numpy().astype("datetime64[D]")
    sample_ids = df["sample_id"].to_numpy() if "sample_id" in df.columns else np.zeros(n, dtype=np.int64)

    if start_hour == 0:
        idx = np.arange(n)
        values = x
    else:
        # Row i can be joined to row i+1 only if both are the same sample/month and consecutive days.
        same_group = np.ones(max(n - 1, 0), dtype=bool)
        for key in keys:
            col = df[key].to_numpy()
            same_group &= col[:-1] == col[1:]
        consecutive = (dates[1:] - dates[:-1]) == np.timedelta64(1, "D")
        has_next = np.append(same_group & consecutive, False)
        idx = np.nonzero(has_next)[0]
        s = start_hour * SLOTS_PER_HOUR
        values = np.concatenate([x[idx, s:], x[idx + 1, :s]], axis=1)

    start_dates = dates[idx]
    keep = np.ones(len(idx), dtype=bool)
    if working_days_only:
        # 1970-01-01 was a Thursday, so (days + 3) % 7 gives Monday=0 ... Sunday=6.
        weekday = (start_dates.astype(np.int64) + 3) % 7
        keep = weekday < 5

    return Windows(values[keep], sample_ids[idx][keep], start_dates[keep], start_hour)


def split_by_sample(windows: Windows, test_share: float = 0.3, seed: int = 42) -> tuple[Windows, Windows]:
    """Split into (planning, test) by `sample_id`, never by day (idea.md 5.3)."""
    if not 0 < test_share < 1:
        raise ValueError("test_share must be between 0 and 1")
    ids = np.unique(windows.sample_ids)
    if len(ids) < 2:
        raise ValueError("Need at least 2 samples to split by sample_id")
    rng = np.random.default_rng(seed)
    shuffled = rng.permutation(ids)
    n_test = min(max(round(test_share * len(ids)), 1), len(ids) - 1)
    test_ids = shuffled[:n_test]
    is_test = np.isin(windows.sample_ids, test_ids)
    return windows.select(~is_test), windows.select(is_test)


def cautious_baseline(planning: Windows, q: float = 0.90) -> np.ndarray:
    """q-th percentile of each slot across all planning windows, shape (96,)."""
    if not 0 < q <= 1:
        raise ValueError("q must be in (0, 1]")
    if len(planning) == 0:
        raise ValueError("No planning windows")
    return np.quantile(planning.values, q, axis=0)
