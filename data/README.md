# Data pipeline

GridFlex reads three small datasets from `data/processed/`. They are not in Git: you rebuild them from three public sources with the scripts in [`scripts/`](scripts/). Run every command from the repository root (not from this folder), in the activated virtual environment, as shown below.

```text
data/raw/                          data/scripts/                 data/processed/
  GLASS_v1.1.parquet (13.2 GB) ──► extract_glass.py ──────────► glass_*.parquet          (480 files, 211 MB)
  capaciteitskaart/*.csv (47 MB) ► prepare_grid_map.py ───────► grid_*.parquet + meta    (4 files)
  liander_sbi/*.zip (397 MB) ────► prepare_liander_sbi.py ────► liander_sbi_*.parquet    (37 files)
        ▲                                   ▲
 download_data.py                   setup_data.py build (runs the three above)
```

## Sources

| Dataset | Used for | Source and licence |
| --- | --- | --- |
| **GLASS v1.1** | Synthetic daily load profiles of large customers (96 quarter-hours per day) that stand in for a depot's building demand | [4TU.ResearchData](https://doi.org/10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991), CDLA-Permissive-2.0. The dataset page describes every field. |
| **Capacity map** | Congestion colour, queue and expected relief per postcode | [Netbeheer Nederland capaciteitskaart](https://capaciteitskaart.netbeheernederland.nl). An indicative, dated snapshot. |
| **Liander profiles 2023** | Real demand shapes that the reality check compares GLASS against | [Liander open data](https://www.liander.nl/over-ons/open-data). Attribution required. |

## Step by step

**1. Download** the raw files into `data/raw/` (git-ignored). The download resumes after a dropped connection, skips files that are already complete and checks GLASS against its published SHA-256.

```bash
python data/scripts/download_data.py                  # everything, about 13.6 GB
python data/scripts/download_data.py glass            # or only GLASS (13.2 GB); add capacity and liander as needed
```

**2. Build** `data/processed/` from the raw files. The processing itself takes about a minute. The first GLASS run also spends a few minutes verifying the 13 GB file's checksum.

```bash
python data/scripts/setup_data.py build               # builds only what is missing; --force rebuilds all
python data/scripts/setup_data.py status              # counts the files and says what is missing
```

`build` runs the three preparation scripts below with the settings GridFlex ships with. You can also run them yourself to build something different; each prints a summary of what it wrote.

| Script | What it keeps | What it cleans or drops |
| --- | --- | --- |
| `extract_glass.py` | Scenario `consumption_only`, 10 categories (sectors 009, 008, 006, 007, 015, 004 and operating-hours classes E3A to E3D), every month of 2024, all 4 levels, and the first 40 samples of each combination. One file per category, month and level. | Reads the 43M-row file lazily with filters, never fully in memory. Keeps only the metadata and the 96 time columns. Each sample stays inside its own month, so days are never joined across months or samples. Prints peak, spread and monthly-energy checks per file. |
| `prepare_grid_map.py` | Offtake (`afname`) only, because GridFlex is about new demand: one row per postcode, one per supply area, the planned reinforcement projects, and a `grid_map_meta.json` with the download date. | Reads the semicolon-separated CSVs with comma decimals as text, then converts. Normalises postcodes and drops invalid ones. Where a postcode lies in two supply areas, keeps the most severe colour and flags it. Turns the map's `-1` ("no information") into missing. Ignores the placeholder fix year 2099. |
| `prepare_liander_sbi.py` | The aggregated profiles for SBI codes 49 and 52 and Liander's standard logistics profile (`KO_LOGISTIEK`), every month of 2023, as median, p10, p90 and mean. Values are relative, not kW. | Reads the zips without unpacking them. Keeps complete months only and stops if a month does not have every quarter-hour. Skips SBI codes that Liander's overview marks with a warning, unless you pass `--allow-warning`. |

Run any of them directly for a custom selection, for example:

```bash
python data/scripts/extract_glass.py --categories 009 008 --months 2024-01 2024-02 --levels 0 1 2 3 --samples 40 --quiet
python data/scripts/prepare_grid_map.py
python data/scripts/prepare_liander_sbi.py --sbi 49 52 KO_LOGISTIEK --months 2023-01 2023-02
```

To change what `build` makes by default, edit the constants at the top of [`setup_data.py`](scripts/setup_data.py) (`CATEGORIES`, `MONTHS`, `LEVELS`, `SAMPLES`, `LIANDER_CODES`).

**3. Share or restore** a finished folder instead of rebuilding it (around 215 MB). `pack` writes `data/processed_data.zip` with a checksum for each file, and `unpack` refuses anything that does not match.

```bash
python data/scripts/setup_data.py pack                                # on the machine that has the data
python data/scripts/setup_data.py unpack path/to/processed_data.zip   # on the new machine
```

## Reproducibility notes

- GLASS and the Liander profiles are fixed releases, so your processed files match ours. The capacity map is a live snapshot, so a fresh download can differ from ours; the download date is saved in `data/processed/grid_map_meta.json` and shown in the app.
- Keep the planning and test data apart. Split GLASS by `sample_id`, never by day, and join days only within the same scenario, category, month, level and sample.
- Tests that need the processed data are marked `needs_glass` and skip themselves when it is missing, so `python -m pytest src` runs either way.
- Only this README and `scripts/` are committed under `data/`. Never commit `data/raw/`, `data/processed/` or a ZIP. If you add a processed file, add it to `setup_data.py` so `status`, `build` and `pack` know about it.
