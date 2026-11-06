"""Set up everything in data/processed/ (the folder is not in git). Standard library only.

The dashboard reads three small datasets that are made from the raw downloads:

    GLASS          480 files (glass_*.parquet, 211 MB): 10 sectors x the 12 months of 2024 x 4 levels, 40 samples each
    grid map       4 files (grid_*.parquet, grid_map_meta.json): the capacity map, per postcode
    Liander        37 files (liander_sbi_*.parquet and a meta file): real 2023 profiles for the reality check

The usual way, from the repository root:

    python scripts/download_data.py        # the raw files into data/raw/ (13.6 GB, resumes if interrupted)
    python scripts/setup_data.py build     # makes everything in data/processed/ from them (about a minute)
    python scripts/setup_data.py status    # says what is missing

Or, if a teammate who has the finished folder shares a zip:

    python scripts/setup_data.py pack                              # (them) writes data/processed_data.zip
    python scripts/setup_data.py unpack path/to/processed_data.zip # (you) restores it, checksums verified
"""
from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = REPO_ROOT / "scripts"
PROCESSED = REPO_ROOT / "data" / "processed"
RAW = REPO_ROOT / "data" / "raw" / "GLASS_v1.1.parquet"
RAW_CAPACITY = REPO_ROOT / "data" / "raw" / "capaciteitskaart"
RAW_LIANDER = REPO_ROOT / "data" / "raw" / "liander_sbi"
DEFAULT_ZIP = REPO_ROOT / "data" / "processed_data.zip"
MANIFEST = "MANIFEST.sha256"

# GLASS: fleet-depot sectors plus the operating-hours classes (a generic fallback), see idea.md section 4.5.
CATEGORIES = ["009", "008", "006", "007", "015", "004", "E3A", "E3B", "E3C", "E3D"]
MONTHS = [f"2024-{month:02d}" for month in range(1, 13)]
LEVELS = [0, 1, 2, 3]
SAMPLES = 40
# Capacity map: the files prepare_grid_map.py writes.
GRID_FILES = ["grid_pc6.parquet", "grid_areas.parquet", "grid_projects.parquet", "grid_map_meta.json"]
# Liander: the SBI profiles of the logistics sectors (idea.md section 4.3), every month of 2023.
LIANDER_CODES = ["49", "52", "KO_LOGISTIEK"]
LIANDER_MONTHS = [f"2023-{month:02d}" for month in range(1, 13)]
LIANDER_META = "liander_sbi_meta.json"


def glass_names() -> set[str]:
    return {f"glass_{c}_{m}_L{level}.parquet" for c in CATEGORIES for m in MONTHS for level in LEVELS}


def grid_names() -> set[str]:
    return set(GRID_FILES)


def liander_names() -> set[str]:
    return {f"liander_sbi_{c}_{m}.parquet" for c in LIANDER_CODES for m in LIANDER_MONTHS} | {LIANDER_META}


def groups() -> dict[str, set[str]]:
    return {"GLASS": glass_names(), "grid map": grid_names(), "Liander": liander_names()}


def all_names() -> set[str]:
    return set().union(*groups().values())


def present_names() -> set[str]:
    return {p.name for p in PROCESSED.iterdir() if p.is_file()} if PROCESSED.exists() else set()


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def missing_groups() -> dict[str, list[str]]:
    present = present_names()
    return {name: sorted(names - present) for name, names in groups().items() if names - present}


def status() -> int:
    present = present_names()
    print(f"Processed data in {PROCESSED}:")
    for name, names in groups().items():
        have = len(names & present)
        print(f"  {name:9} {have:>3} of {len(names)}" + ("" if have == len(names) else "   <- incomplete"))
    if not missing_groups():
        print("Complete. Nothing to do.")
        return 0
    print("To make it:")
    print("  python scripts/download_data.py      # the raw files (skips what you already have)")
    print("  python scripts/setup_data.py build   # processes them")
    print("or: python scripts/setup_data.py unpack <zip from a teammate>")
    return 1


# --- build: raw downloads -> data/processed/ -------------------------------------------------

def _steps() -> dict[str, tuple[list[str], list[tuple[Path, str]]]]:
    """For each group: the command that makes it, and the raw files it needs (path, download command)."""
    return {
        "GLASS": (
            [sys.executable, str(SCRIPTS / "extract_glass.py"), "--categories", *CATEGORIES, "--months", *MONTHS,
             "--levels", *map(str, LEVELS), "--samples", str(SAMPLES), "--quiet"],
            [(RAW, "python scripts/download_data.py glass")],
        ),
        "grid map": (
            [sys.executable, str(SCRIPTS / "prepare_grid_map.py")],
            [(RAW_CAPACITY / "congestie_pc6.csv", "python scripts/download_data.py capacity")],
        ),
        "Liander": (
            [sys.executable, str(SCRIPTS / "prepare_liander_sbi.py"), "--sbi", *LIANDER_CODES,
             "--months", *LIANDER_MONTHS],
            [(RAW_LIANDER / "Geaggregeerde SBI-profielen.zip", "python scripts/download_data.py liander")],
        ),
    }


def build(force: bool = False) -> int:
    todo = {name: step for name, step in _steps().items() if force or name in missing_groups()}
    if not todo:
        print("Everything is already built.")
        return status()
    absent = [(path, how) for _, needs in todo.values() for path, how in needs if not path.exists()]
    if absent:
        print("Some raw files are missing, so not everything can be built yet:")
        for path, how in absent:
            print(f"  {path} is not there: {how}")
        print("Download everything with `python scripts/download_data.py`, then run build again."
              "\nOr ask a teammate for their zip and use: python scripts/setup_data.py unpack <zip>")
        return 1
    for name, (command, _) in todo.items():
        print(f"\n== {name}")
        if subprocess.run(command, cwd=REPO_ROOT).returncode:
            print(f"\nThe {name} step failed; see the messages above.")
            return 1
    print()
    return status()


# --- pack / unpack: share the finished folder ------------------------------------------------

def pack(target: Path) -> int:
    if missing_groups():
        print("The processed data is incomplete; fix that before sharing it.")
        status()
        return 1
    names = sorted(all_names())
    lines = []
    # Parquet is already compressed, so the zip only bundles the files.
    with zipfile.ZipFile(target, "w", zipfile.ZIP_STORED) as z:
        for name in names:
            lines.append(f"{sha256_of(PROCESSED / name)}  {name}")
            z.write(PROCESSED / name, name)
        z.writestr(MANIFEST, "\n".join(lines) + "\n")
    print(f"Wrote {target} ({target.stat().st_size / 1e6:.0f} MB, {len(names)} files).")
    print("Share it (cloud drive, USB stick). Teammates run: python scripts/setup_data.py unpack <that file>")
    return 0


def unpack(source: Path) -> int:
    if not source.exists():
        print(f"{source} not found.")
        return 1
    PROCESSED.mkdir(parents=True, exist_ok=True)
    allowed = all_names()
    with zipfile.ZipFile(source) as z:
        if MANIFEST not in z.namelist():
            print(f"{source.name} has no {MANIFEST}; it was not made with `setup_data.py pack`.")
            return 1
        hashes = {}
        for line in z.read(MANIFEST).decode().splitlines():
            digest, _, name = line.partition("  ")
            hashes[name] = digest
        names = [n for n in z.namelist() if n != MANIFEST]
        bad = [n for n in names if n not in allowed or n not in hashes]
        if bad:  # only the exact expected file names: nothing can be written outside data/processed
            print(f"Unexpected entries in the zip, nothing was extracted: {bad[:3]}")
            return 1
        for name in names:
            data = z.read(name)
            if hashlib.sha256(data).hexdigest() != hashes[name]:
                print(f"{name} is damaged (checksum mismatch). Get the zip again; nothing more was extracted.")
                return 1
            (PROCESSED / name).write_bytes(data)
    print(f"Unpacked {len(names)} file(s) into {PROCESSED}.")
    return status()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="count the processed files and say what is missing")
    b = sub.add_parser("build", help="make the processed data from the raw downloads")
    b.add_argument("--force", action="store_true", help="rebuild even the parts that are complete")
    p = sub.add_parser("pack", help="zip the processed data to share")
    p.add_argument("--out", type=Path, default=DEFAULT_ZIP)
    u = sub.add_parser("unpack", help="restore the processed data from a zip")
    u.add_argument("zip", type=Path)
    args = parser.parse_args()
    return {"status": status, "build": lambda: build(args.force), "pack": lambda: pack(args.out),
            "unpack": lambda: unpack(args.zip)}[args.command]()


if __name__ == "__main__":
    sys.exit(main())
