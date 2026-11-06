"""Extract GLASS conditions into small per-condition parquet files.

Usage:
    python scripts/extract_glass.py --categories 009 --months 2024-01 --levels 0 1 2 3
    python scripts/extract_glass.py --categories 009 008 --months 2024-01 2024-02 --samples 40 --quiet

Writes data/processed/glass_{category}_{yyyy-mm}_L{level}.parquet (git-ignored: 211 MB for the
dashboard's set; scripts/setup_data.py builds or shares it). `--samples N` keeps only
the first N samples of each condition (GLASS has about 150): the samples are independent
synthetic customers, so a smaller set is the same kind of data, in a file a third the size.
Prints a summary per
condition: samples, daily-peak statistics, spread across samples, kW range, and
monthly energy against the target `level_value` (idea.md section 4.5).

The raw file is read lazily with filters; the full 43M rows are never loaded.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

import numpy as np
import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = REPO_ROOT / "data" / "raw" / "GLASS_v1.1.parquet"
DEFAULT_OUT = REPO_ROOT / "data" / "processed"
README = REPO_ROOT / "data" / "README.md"

META_COLUMNS = ["category", "date", "level_id", "level_value", "sample_id"]
TIME_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")

# Heuristic: if the typical daily peak barely differs between samples, the
# stress test says little about day-to-day risk (idea.md 4.5).
LOW_SPREAD_CV = 0.05


def expected_sha256() -> str:
    match = re.search(r"\*\*SHA-256:\*\*\s*`([0-9a-f]{64})`", README.read_text(encoding="utf-8"))
    if not match:
        sys.exit(f"Could not find the SHA-256 in {README}")
    return match.group(1)


def verify_sha256(raw: Path) -> None:
    """Check the raw file against data/README.md. Hashing 13 GB takes minutes,
    so a marker file remembers a successful check for the same size and mtime."""
    marker = raw.with_name(raw.name + ".sha256-verified")
    stat = raw.stat()
    expected = expected_sha256()
    stamp = f"{expected} {stat.st_size} {stat.st_mtime_ns}"
    if marker.exists() and marker.read_text().strip() == stamp:
        print(f"SHA-256 already verified ({expected[:12]}...)")
        return
    print(f"Verifying SHA-256 of {raw.name} ({stat.st_size / 1e9:.1f} GB), this takes a few minutes...")
    digest = hashlib.sha256()
    with raw.open("rb") as f:
        while chunk := f.read(16 * 1024 * 1024):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        sys.exit(f"SHA-256 mismatch:\n  expected {expected}\n  actual   {actual}")
    marker.write_text(stamp)
    print("SHA-256 OK")


def time_columns(columns: list[str]) -> list[str]:
    cols = sorted(c for c in columns if TIME_RE.match(c))
    if len(cols) != 96:
        sys.exit(f"Expected 96 time columns, found {len(cols)}")
    return cols


def summarise(df: pl.DataFrame, cols: list[str]) -> dict:
    """Numbers that tell us whether a condition is useful (idea.md 4.5)."""
    x = df.select(cols).to_numpy().astype(np.float64)  # (rows, 96) kW
    sample_ids = df["sample_id"].to_numpy()
    uniq, inverse = np.unique(sample_ids, return_inverse=True)
    n_samples = len(uniq)

    daily_peak = x.max(axis=1)
    daily_mean = x.mean(axis=1)

    # Per-sample (one synthetic customer, one month) statistics.
    sample_peak_mean = np.bincount(inverse, daily_peak) / np.bincount(inverse)
    sample_power_mean = np.bincount(inverse, daily_mean) / np.bincount(inverse)
    sample_peak_max = np.full(n_samples, -np.inf)
    np.maximum.at(sample_peak_max, inverse, daily_peak)
    sample_energy_kwh = np.bincount(inverse, x.sum(axis=1) * 0.25)  # 15-min slots

    days_per_sample = np.bincount(inverse)
    level_value = float(df["level_value"][0])

    def cv(a: np.ndarray) -> float:
        return float(a.std() / a.mean()) if a.mean() else float("nan")

    return {
        "samples": n_samples,
        "days_min": int(days_per_sample.min()),
        "days_max": int(days_per_sample.max()),
        "peak_mean": float(daily_peak.mean()),
        "peak_p10": float(np.percentile(daily_peak, 10)),
        "peak_p90": float(np.percentile(daily_peak, 90)),
        "mean_kw": float(daily_mean.mean()),
        "month_peak_p10": float(np.percentile(sample_peak_max, 10)),
        "month_peak_p90": float(np.percentile(sample_peak_max, 90)),
        "spread_cv_peak": cv(sample_peak_mean),
        "spread_cv_mean": cv(sample_power_mean),
        "energy_kwh_mean": float(sample_energy_kwh.mean()),
        "level_value": level_value,
        "energy_ratio": float(sample_energy_kwh.mean() / level_value) if level_value else float("nan"),
    }


def keep_first_samples(df: pl.DataFrame, n: int | None) -> pl.DataFrame:
    """The n lowest sample ids of one condition (all of them when n is None)."""
    if n is None:
        return df
    if n < 2:
        sys.exit("--samples must be at least 2: the planning/test split is by sample")
    keep = df["sample_id"].unique().sort().head(n)
    return df.filter(pl.col("sample_id").is_in(keep.implode()))


def print_summary(category: str, month: str, level: int, s: dict, path: Path) -> None:
    print(f"\n== category {category} | {month} | level {level} -> {path.name}")
    print(f"  samples: {s['samples']}   days per sample: {s['days_min']}-{s['days_max']}")
    print(
        f"  daily peak kW: mean {s['peak_mean']:.1f}   p10 {s['peak_p10']:.1f}   p90 {s['peak_p90']:.1f}"
        f"   (mean power {s['mean_kw']:.1f} kW)"
    )
    print(
        f"  highest peak in the month, across samples: p10 {s['month_peak_p10']:.1f}   p90 {s['month_peak_p90']:.1f} kW"
    )
    print(
        f"  spread across samples (CV): of mean daily peak {s['spread_cv_peak']:.3f}"
        f"   of mean power {s['spread_cv_mean']:.3f}"
    )
    print(
        f"  monthly energy from data: {s['energy_kwh_mean'] / 1000:.1f} MWh   level_value: "
        f"{s['level_value'] / 1000:.1f} MWh   ratio {s['energy_ratio']:.2f}"
    )
    if s["spread_cv_peak"] < LOW_SPREAD_CV:
        print(f"  WARNING: samples are very similar (CV < {LOW_SPREAD_CV}); the stress test will say little here.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--categories", nargs="+", required=True, help="GLASS categories, e.g. 009 008")
    p.add_argument("--months", nargs="+", required=True, help="Year-months, e.g. 2023-01 2023-07")
    p.add_argument("--levels", nargs="+", type=int, default=[0, 1, 2, 3], help="level_id values (0-3)")
    p.add_argument("--samples", type=int, default=None,
                   help="keep only the first N samples of each condition (slimmer files); default: all")
    p.add_argument("--quiet", action="store_true", help="one line per file instead of the full summary")
    p.add_argument("--scenario", default="consumption_only")
    p.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--skip-hash", action="store_true", help="Skip the SHA-256 check (not recommended)")
    args = p.parse_args()
    if hasattr(sys.stdout, "reconfigure"):  # a Windows console may not be UTF-8; never crash on a print
        sys.stdout.reconfigure(errors="replace")

    if not args.raw.exists():
        sys.exit(f"{args.raw} not found. Download it with: python scripts/download_data.py glass")
    if not args.skip_hash:
        verify_sha256(args.raw)

    lf = pl.scan_parquet(args.raw)
    cols = time_columns(lf.collect_schema().names())

    args.out.mkdir(parents=True, exist_ok=True)
    written = 0
    for month in args.months:  # one month at a time keeps memory small when extracting many conditions
        df = (
            lf.filter(
                (pl.col("scenario") == args.scenario)
                & pl.col("category").is_in(args.categories)
                & (pl.col("date").str.slice(0, 7) == month)
                & pl.col("level_id").is_in(args.levels)
            )
            .select(META_COLUMNS + cols)
            .collect()
        )
        for category in args.categories:
            for level in args.levels:
                part = df.filter((pl.col("category") == category) & (pl.col("level_id") == level))
                if part.is_empty():
                    print(f"-- no rows for category {category} | {month} | level {level}")
                    continue
                part = keep_first_samples(part, args.samples).sort(["sample_id", "date"])
                path = args.out / f"glass_{category}_{month}_L{level}.parquet"
                part.write_parquet(path, compression="zstd", compression_level=19)
                if args.quiet:
                    print(f"{path.name}: {part['sample_id'].n_unique()} samples, {path.stat().st_size / 1e6:.2f} MB")
                else:
                    print_summary(category, month, level, summarise(part, cols), path)
                    print(f"  file size: {path.stat().st_size / 1e6:.2f} MB")
                written += 1
    print(f"\nWrote {written} file(s) to {args.out}")


if __name__ == "__main__":
    main()
