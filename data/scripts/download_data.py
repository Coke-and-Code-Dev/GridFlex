"""Download the raw datasets into data/raw/ (git-ignored). Standard library only.

    python data/scripts/download_data.py            # everything below (about 13.6 GB)
    python data/scripts/download_data.py glass      # only GLASS (13.2 GB): all you need to build the dashboard data
    python data/scripts/download_data.py capacity liander

What each one is, and why:
  glass     GLASS_v1.1.parquet, synthetic large-customer smart-meter data (4TU.ResearchData, CDLA-Permissive-2.0).
  capacity  The grid operators' capacity map (Netbeheer Nederland): 4 small files, 47 MB.
  liander   Liander's real 2023 consumption profiles (3 files, 397 MB).

Nothing in data/processed/ is in git: after downloading, `python data/scripts/setup_data.py build` makes it
all (the 480 GLASS files, the grid map and Liander's profiles) from these three.

Downloads resume where they stopped (run the command again after a dropped connection), files that
are already complete are skipped, and GLASS is checked against its published SHA-256.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DEST = REPO_ROOT / "data" / "raw"
USER_AGENT = "gridflex-setup/1.0 (hackathon project; data/scripts/download_data.py)"

GLASS_NAME = "GLASS_v1.1.parquet"
GLASS_SIZE = 13_214_162_600
GLASS_SHA256 = "815ac9fc98cf2a2823492a894ac81b132c88d6637a9e1642beb280b38d112343"  # published with the dataset on 4TU.ResearchData
GLASS_URL = ("https://data.4tu.nl/file/b18de4df-0f67-4a6f-aa84-6634cdd63991/"
             "f5b15352-901e-4db5-afdb-2ff7b8c958db")  # https://doi.org/10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991

CAPACITY_BASE = "https://capaciteitskaart.netbeheernederland.nl/api/download/"  # redirects to a temporary link
LIANDER_BLOBS = "https://alldxpprdstor.blob.core.windows.net/large-content-media/"
LIANDER_DOCS = "https://www.liander.nl/-/media/files/open-data/verbruiksprofielen-gv-elektriciteit-2023/"


@dataclass(frozen=True)
class Item:
    url: str
    folder: str  # inside the destination folder ("" for the folder itself)
    name: str  # file name on disk (what the prepare scripts expect)
    size: int | None = None  # known size, when it never changes


GROUPS: dict[str, list[Item]] = {
    "glass": [Item(GLASS_URL, "", GLASS_NAME, GLASS_SIZE)],
    "capacity": [Item(CAPACITY_BASE + n, "capaciteitskaart", n) for n in (
        "congestie_pc6.csv", "voedingsgebieden.csv", "projecten.csv", "brondata_documentatie.txt")],
    "liander": [
        Item(LIANDER_BLOBS + "Geaggregeerde%20SBI-profielen.zip", "liander_sbi", "Geaggregeerde SBI-profielen.zip"),
        Item(LIANDER_BLOBS + "KO%20profielen.zip", "liander_sbi", "KO profielen.zip"),
        Item(LIANDER_DOCS + "overzicht-met-per-sbi-code-een-aanbevolen-profiel.xlsx", "liander_sbi",
             "overzicht-per-sbi-code-aanbevolen-profiel.xlsx"),
    ],
}


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1000 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1000
    return f"{n:.1f} GB"


def _open(url: str, start: int):
    headers = {"User-Agent": USER_AGENT}
    if start:
        headers["Range"] = f"bytes={start}-"
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)


def _total_size(response, start: int) -> int | None:
    content_range = response.headers.get("Content-Range")  # "bytes 100-999/1000"
    if content_range and "/" in content_range:
        tail = content_range.rsplit("/", 1)[1]
        return int(tail) if tail.isdigit() else None
    length = response.headers.get("Content-Length")
    return int(length) + (start if response.status == 206 else 0) if length else None


def fetch(item: Item, folder: Path, force: bool = False, attempts: int = 6) -> Path:
    """Download one file, resuming a partial download. Returns the final path."""
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / item.name
    part = dest.with_name(dest.name + ".part")
    if dest.exists() and not force:
        if item.size is None or dest.stat().st_size == item.size:
            print(f"  {item.name}: already there ({human(dest.stat().st_size)}), skipped")
            return dest
        print(f"  {item.name}: {human(dest.stat().st_size)} is not the expected {human(item.size)}; downloading again")
        dest.unlink()
    if force:
        part.unlink(missing_ok=True)

    for attempt in range(1, attempts + 1):
        start = part.stat().st_size if part.exists() else 0
        try:
            with _open(item.url, start) as response:
                if start and response.status != 206:  # the server ignored the resume request
                    start = 0
                total = _total_size(response, start) or item.size
                print(f"  {item.name}: {'resuming at ' + human(start) + ' of ' if start else ''}"
                      f"{human(total) if total else 'unknown size'}")
                with part.open("ab" if start else "wb") as out:
                    done, last = start, time.monotonic()
                    while chunk := response.read(1 << 20):
                        out.write(chunk)
                        done += len(chunk)
                        if time.monotonic() - last >= 2:
                            last = time.monotonic()
                            share = f"{100 * done / total:5.1f}%" if total else ""
                            print(f"\r    {share} {human(done)}   ", end="", flush=True)
                    if total and done != total:
                        raise http.client.IncompleteRead(b"", total - done)
            print(f"\r    done, {human(part.stat().st_size)}          ")
            break
        except urllib.error.HTTPError as exc:
            if exc.code == 416 and item.size and start == item.size:  # the .part file was already complete
                break
            if exc.code in (400, 401, 403, 404, 410):
                sys.exit(f"\n  {item.name}: the server answered {exc.code} for {item.url}\n"
                         "  The link may have moved; see https://doi.org/10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991 for the source page.")
            problem = f"HTTP {exc.code}"
        except (urllib.error.URLError, OSError, http.client.HTTPException) as exc:
            problem = str(getattr(exc, "reason", exc)) or type(exc).__name__
        if attempt == attempts:
            sys.exit(f"\n  {item.name}: still failing after {attempts} tries ({problem}). "
                     "Run the same command again later: it resumes.")
        wait = min(5 * attempt, 30)
        print(f"\n  {problem}; retrying in {wait} s ({attempt}/{attempts})")
        time.sleep(wait)

    if item.size and part.stat().st_size != item.size:
        sys.exit(f"  {item.name}: downloaded {part.stat().st_size:,} bytes, expected {item.size:,}. "
                 "Delete the .part file and try again.")
    part.replace(dest)
    return dest


def expected_sha256() -> str:
    return GLASS_SHA256


def verify_glass(path: Path) -> None:
    """Check GLASS against its published SHA-256. The marker file has the same format as extract_glass.py's,
    so the extract step does not hash the 13 GB again."""
    marker = path.with_name(path.name + ".sha256-verified")
    stat, expected = path.stat(), expected_sha256()
    stamp = f"{expected} {stat.st_size} {stat.st_mtime_ns}"
    if marker.exists() and marker.read_text().strip() == stamp:
        print(f"  {path.name}: checksum already verified")
        return
    print(f"  {path.name}: checking the SHA-256 (a few minutes)...")
    digest, done, last = hashlib.sha256(), 0, time.monotonic()
    with path.open("rb") as f:
        while chunk := f.read(16 << 20):
            digest.update(chunk)
            done += len(chunk)
            if time.monotonic() - last >= 5:
                last = time.monotonic()
                print(f"\r    {100 * done / stat.st_size:5.1f}%", end="", flush=True)
    if digest.hexdigest() != expected:
        sys.exit(f"\n  SHA-256 mismatch for {path.name}:\n    expected {expected}\n    actual   {digest.hexdigest()}\n"
                 "  The file is damaged or a different version. Delete it and download again.")
    marker.write_text(stamp)
    print("\r    SHA-256 OK      ")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("groups", nargs="*", choices=list(GROUPS),
                        help="which datasets (default: all)")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="default: data/raw")
    parser.add_argument("--force", action="store_true", help="download again even if the file is there")
    parser.add_argument("--skip-hash", action="store_true", help="do not check GLASS's SHA-256")
    args = parser.parse_args()
    groups = args.groups or list(GROUPS)

    if "glass" in groups:
        args.dest.mkdir(parents=True, exist_ok=True)
        have = (args.dest / GLASS_NAME).stat().st_size if (args.dest / GLASS_NAME).exists() else 0
        part = args.dest / (GLASS_NAME + ".part")
        have = max(have, part.stat().st_size if part.exists() else 0)
        need = GLASS_SIZE - have + 1_000_000_000  # and a little room for the extracts
        free = shutil.disk_usage(args.dest).free
        if free < need:
            sys.exit(f"Not enough disk space in {args.dest}: GLASS needs about {human(need)} more, {human(free)} is free.")

    for group in groups:
        print(f"\n{group}:")
        for item in GROUPS[group]:
            path = fetch(item, args.dest / item.folder, args.force)
            if group == "glass" and not args.skip_hash:
                verify_glass(path)

    print("\nDone. Next:")
    if "glass" in groups:
        print("  python data/scripts/setup_data.py build    # makes the 480 dashboard files from GLASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
