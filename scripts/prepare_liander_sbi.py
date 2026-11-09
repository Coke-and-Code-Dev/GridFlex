"""Extract Liander's real 2023 profiles for the reality check.

Usage:
    python scripts/prepare_liander_sbi.py --sbi 49 52 KO_LOGISTIEK --months 2023-01

Reads, without extracting them, the zips in data/raw/liander_sbi/:
  - "Geaggregeerde SBI-profielen.zip": one CSV per SBI code with, for every quarter-hour of
    2023, the min/p10/median/mean/p90/max across customers (each scaled to its own peak).
  - "KO profielen.zip": Liander's standard K&O profiles (a single curve, no band).
and the overview spreadsheet with the recommended profile and a warning column per SBI code.

Writes data/processed/liander_sbi_{code}_{yyyy-mm}.parquet (timestamp, median, p10, p90, mean;
for a K&O profile only `mean` is filled) and liander_sbi_meta.json. Values are relative, not kW.
Attribution required: "Liander" plus the publication year (2023).
"""
from __future__ import annotations

import argparse
import calendar
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = REPO_ROOT / "data" / "raw" / "liander_sbi"
DEFAULT_OUT = REPO_ROOT / "data" / "processed"
SBI_ZIP = "Geaggregeerde SBI-profielen.zip"
KO_ZIP = "KO profielen.zip"
OVERVIEW = "overzicht-per-sbi-code-aanbevolen-profiel.xlsx"
SOURCE = "Liander, Verbruiksprofielen grootverbruikaansluitingen elektriciteit 2023 (https://www.liander.nl/over-ons/open-data)"
CODE_RE = re.compile(r"^(\d{2,6}|KO_[A-Z_]+)$")
SLOTS_PER_DAY = 96


def is_standard_profile(code: str) -> bool:
    return code.startswith("KO_")


# --- overview spreadsheet (read with the standard library: no extra dependency) -------------

_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
_T = "{%s}t" % _NS["m"]


def _column_index(cell_ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", cell_ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_overview(path: Path) -> dict[str, dict]:
    """SBI code -> {description, warning, series, recommended_profile} from the overview xlsx."""
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", _NS):
                shared.append("".join(t.text or "" for t in si.iter(_T)))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    rows: list[list[str | None]] = []
    for r in sheet.find("m:sheetData", _NS):
        cells: dict[int, str] = {}
        for c in r:
            v = c.find("m:v", _NS)
            kind = c.get("t")
            if kind == "inlineStr":
                cells[_column_index(c.get("r"))] = "".join(t.text or "" for t in c.iter(_T))
            elif v is not None:
                cells[_column_index(c.get("r"))] = shared[int(v.text)] if kind == "s" else v.text
        rows.append([cells.get(i) for i in range(max(cells) + 1)] if cells else [])

    header = rows[0]
    col = {name: i for i, name in enumerate(header)}
    need = ["code", "description", "Warning", "Tijdseries in deze SBI", "Profiel hoogste correlatie"]
    missing = [n for n in need if n not in col]
    if missing:
        sys.exit(f"Unexpected overview layout, missing columns: {missing}")

    def cell(row: list, name: str) -> str | None:
        i = col[name]
        return row[i].strip() if i < len(row) and row[i] and row[i].strip() else None

    out: dict[str, dict] = {}
    for row in rows[1:]:
        code = cell(row, "code") if row else None
        if code:
            out[code] = {
                "description": cell(row, "description"),
                "warning": cell(row, "Warning"),
                "series": int(float(cell(row, "Tijdseries in deze SBI") or 0)),
                "recommended_profile": cell(row, "Profiel hoogste correlatie"),
            }
    return out


# --- profile series -------------------------------------------------------------------------


def read_series(raw_dir: Path, code: str) -> pl.DataFrame:
    """Every quarter-hour of 2023 as timestamp, median, p10, p90, mean (relative values)."""
    if not CODE_RE.match(code):
        sys.exit(f"Not a valid SBI code or K&O profile name: {code!r}")
    if is_standard_profile(code):
        zip_path, member, sep, fmt = raw_dir / KO_ZIP, f"KO Profielen/{code}_clean_2023_semicolon.csv", ";", "%Y-%m-%d %H:%M"
    else:
        zip_path, member, sep, fmt = raw_dir / SBI_ZIP, f"{code}.csv", ",", "%Y-%m-%d %H:%M:%S"
    with zipfile.ZipFile(zip_path) as z:
        if member not in z.namelist():
            hint = " Use the logistics K&O profile (KO_LOGISTIEK) as the fallback." if not is_standard_profile(code) else ""
            sys.exit(f"{member} is not in {zip_path.name}.{hint}")
        raw = z.read(member)
    df = pl.read_csv(io.BytesIO(raw), separator=sep, infer_schema=False)
    if is_standard_profile(code):
        return df.select(
            pl.col("DATUM_TIJDSTIP").str.to_datetime(fmt).alias("timestamp"),
            pl.lit(None, dtype=pl.Float64).alias("median"),
            pl.lit(None, dtype=pl.Float64).alias("p10"),
            pl.lit(None, dtype=pl.Float64).alias("p90"),
            pl.col("WAARDE").cast(pl.Float64).alias("mean"),
        )
    first = df.columns[0]  # the unnamed timestamp column
    return df.select(
        pl.col(first).str.to_datetime(fmt).alias("timestamp"),
        *[pl.col(c).cast(pl.Float64) for c in ("median", "p10", "p90", "mean")],
    )


def month_rows(series: pl.DataFrame, month: str) -> pl.DataFrame:
    """The rows of one year-month; complete days only (96 quarter-hours each)."""
    year, mon = (int(x) for x in month.split("-"))
    out = series.filter((pl.col("timestamp").dt.year() == year) & (pl.col("timestamp").dt.month() == mon)).sort("timestamp")
    expected = calendar.monthrange(year, mon)[1] * SLOTS_PER_DAY
    if out.height != expected:
        sys.exit(f"{month}: expected {expected} quarter-hours, found {out.height}")
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sbi", nargs="+", default=["49", "52", "KO_LOGISTIEK"], help="SBI codes and/or K&O names")
    p.add_argument("--months", nargs="+", default=["2023-01"], help="2023 year-months")
    p.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--allow-warning", action="store_true", help="Use SBI codes the overview warns about")
    args = p.parse_args()
    if hasattr(sys.stdout, "reconfigure"):  # Liander's Dutch descriptions: never crash on a print
        sys.stdout.reconfigure(errors="replace")

    for name in (SBI_ZIP, KO_ZIP, OVERVIEW):
        if not (args.raw / name).exists():
            sys.exit(f"Missing {args.raw / name}. Download it with: python scripts/download_data.py liander")
    for month in args.months:
        if not re.match(r"^2023-(0[1-9]|1[0-2])$", month):
            sys.exit(f"{month}: Liander's profiles cover 2023 only")

    overview = read_overview(args.raw / OVERVIEW)
    args.out.mkdir(parents=True, exist_ok=True)
    meta_path = args.out / "liander_sbi_meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    meta.update({"source": SOURCE, "attribution": "Liander (2023)", "values": "relative, not kW"})
    profiles = meta.setdefault("profiles", {})

    for code in args.sbi:
        info: dict = {"kind": "standard_profile" if is_standard_profile(code) else "sbi_aggregate"}
        if not is_standard_profile(code):
            row = overview.get(code)
            if row is None:
                print(f"\n-- SBI {code}: not in the overview, skipped")
                continue
            print(f"\n== SBI {code} ({row['description']}): {row['series']} time series, recommended profile {row['recommended_profile']}")
            if row["warning"]:
                print(f"   WARNING from Liander: {row['warning']}")
                if not args.allow_warning:
                    print("   Skipped. Use the logistics K&O profile (KO_LOGISTIEK) instead, or pass --allow-warning.")
                    continue
            info |= {k: row[k] for k in ("description", "series", "recommended_profile", "warning")}
        else:
            print(f"\n== K&O profile {code} (single standard curve, no p10-p90 band)")
            info["description"] = "Liander standard K&O profile"

        series = read_series(args.raw, code)
        for month in args.months:
            part = month_rows(series, month)
            path = args.out / f"liander_sbi_{code}_{month}.parquet"
            part.write_parquet(path, compression="zstd")
            working = part.filter(pl.col("timestamp").dt.weekday() <= 5).select(pl.col("timestamp").dt.date().n_unique()).item()
            level = part["median"] if part["median"].null_count() < part.height else part["mean"]
            print(f"   {path.name}: {part.height} rows, {working} working days, mean {level.mean():.3f} (relative), {path.stat().st_size / 1e3:.0f} kB")
            info["months"] = sorted(set(info.get("months", profiles.get(code, {}).get("months", []))) | {month})
        profiles[code] = info

    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {meta_path.name}")


if __name__ == "__main__":
    main()
