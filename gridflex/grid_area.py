"""Postcode lookup in the Netbeheer Nederland capacity map ("Your area" card).

Reads the compact files written by scripts/prepare_grid_map.py (data/processed/grid_*.parquet).
The map is indicative and a snapshot, per supply area and not per connection: always show
`data_date` and tell the user to check with their grid operator.

Anything the map leaves empty comes back as None, never as a guess.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Literal

import polars as pl

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"

Status = Literal["unknown", "available", "limited", "under_study", "shortage"]
# Offtake ("afname") colour code in the map: -1 no information, 0 transparent, 1 yellow, 2 orange, 3 red.
STATUS_BY_CODE: dict[int, Status] = {-1: "unknown", 0: "available", 1: "limited", 2: "under_study", 3: "shortage"}

_POSTCODE = re.compile(r"^\d{4}[A-Z]{2}$")


@dataclass
class Project:
    name: str | None
    expected: str | None  # "2032 - Q4", or just "2032" when no quarter is given
    phase: str | None  # e.g. "inProgress", "approved", "scheduled"


@dataclass
class AreaInfo:
    postcode: str  # normalised, e.g. "1181LK"
    status: Literal["unknown", "available", "limited", "under_study", "shortage"]  # colour -1/0/1/2/3
    area_name: str | None
    operator: str | None
    capacity_mw: float | None  # aanwezige_transportcapaciteit_afname
    needed_mw: float | None  # benodigde_transportcapaciteit_afname
    queue_requests: int | None
    queue_mw: float | None
    expected_fix_year: int | None  # jaartal_opgelost_afname
    projects: list[Project]  # planned reinforcements, earliest first
    info_url: str | None
    data_date: str  # download date of the map, "YYYY-MM-DD"
    municipality: str | None = None
    province: str | None = None
    ambiguous: bool = False  # the postcode lies in more than one supply area; the most severe is shown
    note: str | None = field(default=None)  # extra remark from the grid operator, if any


def normalise_postcode(postcode: str) -> str | None:
    """"1234 ab" -> "1234AB"; None if it is not a Dutch 6-character postcode."""
    cleaned = re.sub(r"\s+", "", postcode or "").upper()
    return cleaned if _POSTCODE.match(cleaned) else None


def _none(value):
    """Polars gives None for null; also treat NaN as missing."""
    if value is None or (isinstance(value, float) and value != value):
        return None
    return value


@lru_cache(maxsize=4)
def _tables(data_dir: str) -> tuple[pl.DataFrame, pl.DataFrame, dict]:
    folder = Path(data_dir)
    needed = ["grid_pc6.parquet", "grid_areas.parquet", "grid_projects.parquet", "grid_map_meta.json"]
    missing = [name for name in needed if not (folder / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"{', '.join(missing)} not found in {folder}. Run: python scripts/prepare_grid_map.py"
        )
    areas = pl.read_parquet(folder / "grid_areas.parquet")
    projects = pl.read_parquet(folder / "grid_projects.parquet")
    meta = json.loads((folder / "grid_map_meta.json").read_text(encoding="utf-8"))
    return areas, projects, meta


def map_date(data_dir: Path | None = None) -> str:
    """Download date of the capacity map, for the 'Map from ...' label."""
    return _tables(str(data_dir or DEFAULT_DATA_DIR))[2]["download_date"]


def lookup(postcode: str, data_dir: Path | None = None) -> AreaInfo | None:
    """Area information for a postcode, or None if it is not a valid or known postcode."""
    code = normalise_postcode(postcode)
    if code is None:
        return None
    folder = data_dir or DEFAULT_DATA_DIR
    areas, projects, meta = _tables(str(folder))

    # grid_pc6 is sorted by postcode, so this filter only reads the matching row group.
    row = pl.scan_parquet(folder / "grid_pc6.parquet").filter(pl.col("postcode") == code).collect()
    if row.is_empty():
        return None
    r = row.row(0, named=True)

    area = areas.filter(pl.col("area_id") == r["area_id"])
    a = area.row(0, named=True) if not area.is_empty() else {}
    area_projects = projects.filter(pl.col("area_id") == r["area_id"])

    return AreaInfo(
        postcode=code,
        status=STATUS_BY_CODE.get(r["offtake_code"], "unknown"),
        area_name=_none(r["area_name"]),
        operator=_none(r["operator"]),
        capacity_mw=_none(a.get("capacity_mw")),
        needed_mw=_none(a.get("needed_mw")),
        queue_requests=_none(a.get("queue_requests")),
        queue_mw=_none(a.get("queue_mw")),
        expected_fix_year=_none(a.get("expected_fix_year")),
        projects=[
            Project(_none(p["name"]), _none(p["expected"]), _none(p["phase"]))
            for p in area_projects.iter_rows(named=True)
        ],
        info_url=_none(a.get("info_url")),
        data_date=meta["download_date"],
        municipality=_none(r["municipality"]),
        province=_none(r["province"]),
        ambiguous=bool(r["multiple_areas"]),
        note=_none(a.get("note")),
    )
