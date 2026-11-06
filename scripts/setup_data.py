"""Set up the GLASS extracts in data/processed/ (they are not in git: 211 MB).

The dashboard needs 480 small files, glass_{category}_{yyyy-mm}_L{level}.parquet: 10 categories
x the 12 months of 2024 x levels 0-3, 40 samples each (idea.md section 4.5). Two ways to get them:

    python scripts/setup_data.py unpack glass_2024_extract.zip   # from a zip a teammate shares (211 MB)
    python scripts/setup_data.py build                           # from the 13 GB raw GLASS file

The person who has the files makes the zip for the others:

    python scripts/setup_data.py pack                            # writes data/glass_2024_extract.zip

And to see whether everything is in place:

    python scripts/setup_data.py status

Everything else the app needs (grid map, Liander profiles) is small and already in git.
Standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PROCESSED = REPO_ROOT / "data" / "processed"
RAW = REPO_ROOT / "data" / "raw" / "GLASS_v1.1.parquet"
DEFAULT_ZIP = REPO_ROOT / "data" / "glass_2024_extract.zip"
MANIFEST = "MANIFEST.sha256"

# Fleet-depot sectors plus the operating-hours classes (a generic fallback), see idea.md section 4.5.
CATEGORIES = ["009", "008", "006", "007", "015", "004", "E3A", "E3B", "E3C", "E3D"]
MONTHS = [f"2024-{month:02d}" for month in range(1, 13)]
LEVELS = [0, 1, 2, 3]
SAMPLES = 40

FILE_RE = re.compile(r"^glass_[0-9A-Z]{3}_\d{4}-(0[1-9]|1[0-2])_L[0-3]\.parquet$")


def expected_names() -> set[str]:
    return {f"glass_{c}_{m}_L{level}.parquet" for c in CATEGORIES for m in MONTHS for level in LEVELS}


def present_names() -> set[str]:
    return {p.name for p in PROCESSED.glob("glass_*.parquet")}


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def status() -> int:
    expected, present = expected_names(), present_names()
    missing = sorted(expected - present)
    print(f"GLASS extracts in {PROCESSED}: {len(expected & present)} of {len(expected)}")
    if not missing:
        print("Complete. Nothing to do.")
        return 0
    print(f"Missing {len(missing)} file(s), for example {missing[0]}.")
    print("Get them with one of:")
    print("  python scripts/setup_data.py unpack <zip from a teammate>")
    print("  python scripts/setup_data.py build   (needs the 13 GB raw file, see idea.md section 13)")
    return 1


def build() -> int:
    if not RAW.exists():
        print(f"{RAW} not found.\nDownload the raw GLASS file first (idea.md section 13), "
              "or ask a teammate for the zip and use: python scripts/setup_data.py unpack <zip>")
        return 1
    command = [
        sys.executable, str(REPO_ROOT / "scripts" / "extract_glass.py"),
        "--categories", *CATEGORIES, "--months", *MONTHS, "--levels", *map(str, LEVELS),
        "--samples", str(SAMPLES), "--quiet",
    ]
    print("Running:", " ".join(command))
    if subprocess.run(command, cwd=REPO_ROOT).returncode:
        return 1
    return status()


def pack(target: Path) -> int:
    names = sorted(expected_names() & present_names())
    if len(names) != len(expected_names()):
        print("The extract is incomplete; fix that before sharing it.")
        status()
        return 1
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
    with zipfile.ZipFile(source) as z:
        if MANIFEST not in z.namelist():
            print(f"{source.name} has no {MANIFEST}; it was not made with `setup_data.py pack`.")
            return 1
        hashes = {}
        for line in z.read(MANIFEST).decode().splitlines():
            digest, _, name = line.partition("  ")
            hashes[name] = digest
        names = [n for n in z.namelist() if n != MANIFEST]
        bad = [n for n in names if not FILE_RE.match(n) or n not in hashes]
        if bad:  # also rejects any path with a folder in it, so nothing can be written outside data/processed
            print(f"Unexpected entries in the zip, nothing was extracted: {bad[:3]}")
            return 1
        for name in names:
            data = z.read(name)
            if hashlib.sha256(data).hexdigest() != hashes[name]:
                print(f"{name} is damaged (checksum mismatch). Download the zip again; nothing more was extracted.")
                return 1
            (PROCESSED / name).write_bytes(data)
    print(f"Unpacked {len(names)} file(s) into {PROCESSED}.")
    return status()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="count the extracts and say what is missing")
    sub.add_parser("build", help="extract them from the raw GLASS file")
    p = sub.add_parser("pack", help="zip the extracts to share")
    p.add_argument("--out", type=Path, default=DEFAULT_ZIP)
    u = sub.add_parser("unpack", help="restore the extracts from a zip")
    u.add_argument("zip", type=Path)
    args = parser.parse_args()
    return {"status": status, "build": build, "pack": lambda: pack(args.out),
            "unpack": lambda: unpack(args.zip)}[args.command]()


if __name__ == "__main__":
    sys.exit(main())
