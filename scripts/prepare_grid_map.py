"""Turn the Netbeheer Nederland capacity-map CSVs into compact parquet files.

Usage:
    python scripts/prepare_grid_map.py

Reads data/raw/capaciteitskaart/{congestie_pc6,voedingsgebieden,projecten}.csv
(semicolon-separated, comma decimals) and writes to data/processed/:

    grid_pc6.parquet       one row per postcode: offtake colour, supply area, operator, municipality
    grid_areas.parquet     one row per supply area: capacity, queue, fix year, link
    grid_projects.parquet  planned grid reinforcements per area
    grid_map_meta.json     download date, source, counts (shown in the app)

Only the offtake side ("afname") is kept: GridFlex is about new demand (idea.md 4.2).
The map is indicative and a snapshot; always show the download date.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = REPO_ROOT / "data" / "raw" / "capaciteitskaart"
DEFAULT_OUT = REPO_ROOT / "data" / "processed"
FILES = ["congestie_pc6.csv", "voedingsgebieden.csv", "projecten.csv", "brondata_documentatie.txt"]
POSTCODE_RE = r"^[0-9]{4}[A-Z]{2}$"
MAX_PLAUSIBLE_FIX_YEAR = 2050


def read_csv(path: Path) -> pl.DataFrame:
    # Read everything as text: decimals use a comma ("10,844") and ids like "1735,0" are floats.
    return pl.read_csv(path, separator=";", infer_schema=False, encoding="utf8")


def num(col: str) -> pl.Expr:
    """Text with a decimal comma -> Float64. Empty or negative (the map's -1 'no information') -> null."""
    x = pl.col(col).str.strip_chars().str.replace(",", ".").cast(pl.Float64, strict=False)
    return pl.when(x >= 0).then(x).otherwise(None)


def whole(col: str) -> pl.Expr:
    return num(col).round(0).cast(pl.Int32)


def text(col: str) -> pl.Expr:
    s = pl.col(col).str.strip_chars()
    return pl.when(s == "").then(None).otherwise(s)


def prepare_pc6(raw: pl.DataFrame) -> tuple[pl.DataFrame, dict]:
    stats = {"rows_in_file": raw.height}
    df = raw.with_columns(pl.col("postcode").str.strip_chars().str.replace_all(r"\s+", "").str.to_uppercase())
    no_postcode = df.filter(pl.col("postcode").is_null() | (pl.col("postcode") == "")).height
    bad = df.filter(pl.col("postcode").is_not_null() & ~pl.col("postcode").str.contains(POSTCODE_RE)).height
    stats["rows_without_postcode"] = no_postcode
    stats["rows_with_invalid_postcode"] = bad
    df = df.filter(pl.col("postcode").str.contains(POSTCODE_RE))

    df = df.select(
        "postcode",
        pl.col("afname").cast(pl.Int8, strict=False).fill_null(-1).alias("offtake_code"),
        text("voedingsgebied_id").alias("area_id"),
        text("voedingsgebied_naam").alias("area_name"),
        text("RNB_postcode").alias("operator"),
        text("Gemeentenaam").alias("municipality"),
        text("provincie").alias("province"),
    )
    # A few postcodes straddle two supply areas (often two operators) and appear twice,
    # sometimes with different colours. Keep the most severe row (the cautious choice) and
    # flag the postcode so the app can say it spans more than one area.
    df = df.with_columns((pl.col("area_id").n_unique().over("postcode") > 1).alias("multiple_areas"))
    stats["postcodes_in_more_than_one_area"] = df.filter(pl.col("multiple_areas")).select("postcode").n_unique()
    before = df.height
    df = df.sort(["postcode", "offtake_code"], descending=[False, True]).unique(
        subset="postcode", keep="first", maintain_order=True
    )
    stats["duplicate_rows_dropped"] = before - df.height
    stats["postcodes"] = df.height
    return df.sort("postcode"), stats


def prepare_areas(raw: pl.DataFrame) -> pl.DataFrame:
    df = _prepare_areas(raw)
    # One area lists 2099 as the year its shortage is resolved. That is a placeholder, not a
    # forecast, so treat it as "no date given" rather than telling a user it is fixed in 2099.
    return df.with_columns(
        pl.when(pl.col("expected_fix_year") > MAX_PLAUSIBLE_FIX_YEAR)
        .then(None)
        .otherwise(pl.col("expected_fix_year"))
        .alias("expected_fix_year")
    )


def _prepare_areas(raw: pl.DataFrame) -> pl.DataFrame:
    return raw.select(
        pl.col("voedingsgebied_id").str.strip_chars().alias("area_id"),
        text("RNB").alias("operator"),
        text("provincie").alias("province"),
        num("aanwezige_transportcapaciteit_afname").alias("capacity_mw"),
        num("benodigde_transportcapaciteit_afname").alias("needed_mw"),
        whole("unieke_verzoeken_afname").alias("queue_requests"),
        num("wachtrij_afname").alias("queue_mw"),
        whole("jaartal_opgelost_afname").alias("expected_fix_year"),
        text("congestie_url").alias("info_url"),
        text("info").alias("note"),
    ).sort("area_id")


def prepare_projects(raw: pl.DataFrame) -> pl.DataFrame:
    year = whole("jaar")
    quarter = whole("kwartaal")
    df = raw.select(
        text("projectnaam").alias("name"),
        pl.col("gebied_id").str.strip_chars().alias("area_id"),
        year.alias("year"),
        quarter.alias("quarter"),
        text("project_fase").alias("phase"),
        text("netbeheerder").alias("operator"),
        text("project_url").alias("url"),
    )
    return df.with_columns(
        pl.when(pl.col("year").is_null())
        .then(None)
        .when(pl.col("quarter").is_not_null())
        .then(pl.format("{} - Q{}", pl.col("year"), pl.col("quarter")))
        .otherwise(pl.col("year").cast(pl.Utf8))
        .alias("expected")
    ).sort(["area_id", "year", "quarter"], nulls_last=True)


def download_date(raw_dir: Path) -> str:
    newest = max((raw_dir / f).stat().st_mtime for f in FILES if (raw_dir / f).exists())
    return datetime.fromtimestamp(newest).date().isoformat()


def documentation_version(raw_dir: Path) -> str | None:
    doc = raw_dir / "brondata_documentatie.txt"
    if not doc.exists():
        return None
    lines = [ln.strip() for ln in doc.read_text(encoding="utf-8", errors="replace").splitlines() if ln.strip()]
    return " ".join(lines[:2]) if lines else None


def pct(x: float) -> float:
    return round(100 * x, 1)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--download-date", help="YYYY-MM-DD; default: modification date of the downloaded files")
    args = p.parse_args()

    missing = [f for f in FILES[:3] if not (args.raw / f).exists()]
    if missing:
        sys.exit(f"Missing in {args.raw}: {', '.join(missing)}. See idea.md section 13 for the download.")
    if args.download_date:
        date.fromisoformat(args.download_date)  # validate

    pc6, stats = prepare_pc6(read_csv(args.raw / "congestie_pc6.csv"))
    areas = prepare_areas(read_csv(args.raw / "voedingsgebieden.csv"))
    projects = prepare_projects(read_csv(args.raw / "projecten.csv"))

    args.out.mkdir(parents=True, exist_ok=True)
    pc6.write_parquet(args.out / "grid_pc6.parquet", compression="zstd")
    areas.write_parquet(args.out / "grid_areas.parquet", compression="zstd")
    projects.write_parquet(args.out / "grid_projects.parquet", compression="zstd")

    red = pc6["offtake_code"] == 3
    liander = pc6["operator"] == "Liander"
    area_ids = set(areas["area_id"])
    raw_fix = whole("jaartal_opgelost_afname")
    placeholder_years = int(read_csv(args.raw / "voedingsgebieden.csv").select((raw_fix > MAX_PLAUSIBLE_FIX_YEAR).sum()).item())
    meta = {
        "source": "Netbeheer Nederland, capaciteitskaart (https://capaciteitskaart.netbeheernederland.nl)",
        "download_date": args.download_date or download_date(args.raw),
        "documentation_version": documentation_version(args.raw),
        "note": "Indicative snapshot per area, not a decision about a specific connection. Offtake (afname) only.",
        **stats,
        "areas": areas.height,
        "areas_with_placeholder_fix_year_ignored": placeholder_years,
        "projects": projects.height,
        "projects_matching_an_area": int(projects["area_id"].is_in(list(area_ids)).sum()),
        "red_share_pct": pct(red.mean()),
        "red_share_liander_pct": pct((red & liander).sum() / liander.sum()),
    }
    (args.out / "grid_map_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print("\nOfftake colour (0 transparent, 1 yellow, 2 orange, 3 red):")
    print(pc6["offtake_code"].value_counts().sort("offtake_code"))
    print("\nOperators:", dict(pc6["operator"].value_counts().iter_rows()))
    print("\nArea columns with missing values:", {c: areas[c].null_count() for c in areas.columns if areas[c].null_count()})
    fix = areas["expected_fix_year"].drop_nulls()
    print(f"Fix years: {fix.min()}-{fix.max()} ({fix.len()} of {areas.height} areas have one)")
    print(f"Postcodes whose area is missing from grid_areas: {pc6.filter(~pl.col('area_id').is_in(list(area_ids))).height}")
    for name in ("grid_pc6", "grid_areas", "grid_projects"):
        path = args.out / f"{name}.parquet"
        print(f"{path.name}: {path.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
