<p align="center">
  <img src="docs/images/gridflex-fleet-banner.png" alt="GridFlex. Ten yellow electric delivery vans at a depot, with two plugged in." width="100%">
</p>

<p align="center">
  <img alt="Python 3.11" src="https://img.shields.io/badge/Python-3.11-2E2E38?logo=python&logoColor=FFE600">
  <img alt="FastAPI" src="https://img.shields.io/badge/API-FastAPI-2E2E38?logo=fastapi&logoColor=FFE600">
  <img alt="OR-Tools CP-SAT" src="https://img.shields.io/badge/Planner-OR--Tools%20CP--SAT-2E2E38">
  <img alt="React and TypeScript" src="https://img.shields.io/badge/UI-React%20%2B%20TypeScript-2E2E38?logo=react&logoColor=FFE600">
  <img alt="Synthetic data and simulation" src="https://img.shields.io/badge/data-synthetic%20%C2%B7%20simulation-FFE600?labelColor=2E2E38">
</p>

<p align="center">
  <a href="https://coke-and-code-dev.github.io/GridFlex/">Website</a> ·
  <a href="https://coke-and-code-dev.github.io/GridFlex/watch/">Watch</a> ·
  <a href="https://coke-and-code-dev.github.io/GridFlex/pipeline/">Pipeline</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#data-pipeline">Data pipeline</a> ·
  <a href="#interpreting-results">Interpreting results</a> ·
  <a href="https://coke-and-code-dev.github.io/GridFlex/docs/">Docs</a> ·
  <a href="#team">Team</a>
</p>

---

# GridFlex

**GridFlex** helps depot operators decide whether electric vans can get the energy they need before departure using the site's existing electricity connection. It looks up local congestion, proposes a charging timetable and tests that same timetable against building demand the planner never saw.

Start with one depot or upload a portfolio CSV to compare many sites. Use a site's own meter readings when available, or estimate building demand from its sector, month and electricity bill.

GridFlex is a planning prototype. A person reviews the recommendation, and the grid operator confirms available capacity.

## Watch

[Watch the GridFlex pitch video](https://coke-and-code-dev.github.io/GridFlex/watch/) to see the fleet charging problem and how GridFlex helps depots plan around their existing connection.

## How it works

| Stage | What it does | Code |
| --- | --- | --- |
| **Locate** | Looks up local congestion, the queue and expected relief from a dated postcode snapshot. | [Grid area lookup](src/gridflex/grid_area.py) |
| **Prepare** | Builds a load profile from meter readings or GLASS, then separates planning data from held-out data by date for meter readings or by customer for GLASS. | [Load sources](src/gridflex/load_sources.py) · [Profiles](src/gridflex/profiles.py) |
| **Plan** | Uses OR-Tools CP-SAT to schedule vans and an optional battery in 15-minute slots. The solver prioritises reducing unavoidable overload, unmet energy, peak demand and battery cycling, in that order. | [Scheduler](src/gridflex/scheduler.py) |
| **Stress-test** | Replays the fixed timetable on held-out demand. Compares it with charging on arrival and measures breaches and charging shortfalls. | [Replay](src/gridflex/replay.py) |
| **Review** | Shows the timetable, risk and what-if results. For portfolios, compares depots and exports a PDF. Groq or local Qwen can explain computed evidence. | [Dashboard](ui/) · [API](src/api/) |

## Quick start

### Requirements

- Python 3.11 and Node.js LTS
- Git and an internet connection
- Prepared data: approximately 215 MB for the ZIP, or about 15 GB free to download and build from raw data

### 1. Clone and install

```bash
git clone https://github.com/Coke-and-Code-Dev/GridFlex.git
cd GridFlex
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r src/requirements.txt
```

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1` instead.

### 2. Prepare the data

Processed data is not committed to Git. Build it from the public sources (about 15 GB of disk and one long download):

```bash
python data/scripts/download_data.py
python data/scripts/setup_data.py build
python data/scripts/setup_data.py status
```

or, if you have a verified ZIP created with `setup_data.py pack`, restore it in seconds:

```bash
python data/scripts/setup_data.py unpack path/to/processed_data.zip
python data/scripts/setup_data.py status
```

[Data pipeline](#data-pipeline) explains each step, what is kept or dropped, and how to change it.

### 3. Start the API and dashboard

In the activated environment, from the repository root:

```bash
python -m uvicorn api.main:app --app-dir src --reload --port 8000
```

In a second terminal:

```bash
cd ui
npm ci
npm run dev
```

Open the URL printed by Vite. The dashboard defaults to an API at `http://127.0.0.1:8000`; set `VITE_GRIDFLEX_API_URL` when the API runs elsewhere. See [ui/README.md](ui/README.md) for frontend and local-model details.

### 4. Try an example

The [examples](examples/README.md) include individual depots, meter-data uploads, a five-depot portfolio, a 30-depot portfolio and a 649-depot stress test. The examples are demonstrations, not operational recommendations.

### Optional: model-generated explanations

For Groq, add `GROQ_API_KEY` to a Git-ignored `.env` file in the repository root and restart the API. Never commit credentials. You can also use a locally running Ollama model; the portfolio assistant defaults to `qwen3:4b-instruct`, while the single-depot explanation defaults to `qwen3.5:9b`. See [ui/README.md](ui/README.md) for the model override.

When Groq is selected, questions and relevant computed context are sent to the provider. Meter uploads are held in API memory until restart; portfolio results are stored locally in `.gridflex-local/` until deleted. This prototype has no user authentication or automatic retention policy.

### 5. Run the tests

```bash
python -m pytest src
```

```bash
cd ui
npm test
```

Tests that need processed data skip when the relevant files are unavailable.

## Data pipeline

GridFlex reads three small datasets from `data/processed/`. They are not in Git: you rebuild them from three public sources with the scripts in [`data/scripts/`](data/scripts/). Run every command from the repository root, in the activated virtual environment.

```text
data/raw/                          data/scripts/                 data/processed/
  GLASS_v1.1.parquet (13.2 GB) ──► extract_glass.py ──────────► glass_*.parquet          (480 files, 211 MB)
  capaciteitskaart/*.csv (47 MB) ► prepare_grid_map.py ───────► grid_*.parquet + meta    (4 files)
  liander_sbi/*.zip (397 MB) ────► prepare_liander_sbi.py ────► liander_sbi_*.parquet    (37 files)
        ▲                                   ▲
 download_data.py                   setup_data.py build (runs the three above)
```

### Sources

| Dataset | Used for | Source and licence |
| --- | --- | --- |
| **GLASS v1.1** | Synthetic daily load profiles of large customers (96 quarter-hours per day) that stand in for a depot's building demand | [4TU.ResearchData](https://doi.org/10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991), CDLA-Permissive-2.0. The dataset page describes every field. |
| **Capacity map** | Congestion colour, queue and expected relief per postcode | [Netbeheer Nederland capaciteitskaart](https://capaciteitskaart.netbeheernederland.nl). An indicative, dated snapshot. |
| **Liander profiles 2023** | Real demand shapes that the reality check compares GLASS against | [Liander open data](https://www.liander.nl/over-ons/open-data). Attribution required. |

### Step by step

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

To change what `build` makes by default, edit the constants at the top of [`setup_data.py`](data/scripts/setup_data.py) (`CATEGORIES`, `MONTHS`, `LEVELS`, `SAMPLES`, `LIANDER_CODES`).

**3. Share or restore** a finished folder instead of rebuilding it (around 215 MB). `pack` writes `data/processed_data.zip` with a checksum for each file, and `unpack` refuses anything that does not match.

```bash
python data/scripts/setup_data.py pack                                # on the machine that has the data
python data/scripts/setup_data.py unpack path/to/processed_data.zip   # on the new machine
```

### Reproducibility notes

- GLASS and the Liander profiles are fixed releases, so your processed files match ours. The capacity map is a live snapshot, so a fresh download can differ from ours; the download date is saved in `data/processed/grid_map_meta.json` and shown in the app.
- Keep the planning and test data apart. Split GLASS by `sample_id`, never by day, and join days only within the same scenario, category, month, level and sample.
- Tests that need the processed data are marked `needs_glass` and skip themselves when it is missing, so `python -m pytest src` runs either way.
- Only `data/scripts/` is committed under `data/`. Never commit `data/raw/`, `data/processed/` or a ZIP. If you add a processed file, add it to `setup_data.py` so `status`, `build` and `pack` know about it.

## Interpreting results

| Result | What it means |
| --- | --- |
| **Fits** | All vans receive their requested energy and the share of test windows over the limit is within the chosen tolerance. |
| **Fits with risk** | All vans receive their requested energy, but the share of test windows over the limit exceeds the tolerance. |
| **Does not fit** | At least one van is short of charge in the planned timetable. |
| **Breach rate** | The share of held-out windows with at least one quarter hour over the limit. |
| **Worst overshoot** | The largest amount, in kW, by which demand exceeded the limit in any test slot. |
| **Solver status** | `OPTIMAL` means the solver proved the best result under its rules. Even an optimal plan can leave vans short. |
| **Reality check** | For supported sectors, compares the daily shape of GLASS demand with a Liander reference. |

## Documentation

| Guide | Covers |
| --- | --- |
| [Data pipeline](#data-pipeline) | Downloading the sources and building `data/processed/` |
| [Dashboard guide](ui/README.md) | Running the UI, configuring explanations and uploading CSVs |
| [Example cases](examples/README.md) | Files to upload, expected results and CSV column definitions |
| [Pitch video](video/README.md) | Remotion source and rendering instructions |

### GLASS dataset citation

Lin, Nan; Heres, Jacco; Vergara Barrios, Pedro (2026): *GLASS Dataset: Generative-AI Large-customer Smart-meter Samples*. Version 4. 4TU.ResearchData. Dataset. [doi:10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991.v4](https://doi.org/10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991.v4).

## Status and limitations

GridFlex uses [GLASS](#glass-dataset-citation) for synthetic demand, the [Dutch capacity map](https://capaciteitskaart.netbeheernederland.nl) for postcode context, and [Liander open data](https://www.liander.nl/over-ons/open-data) for the reality check.

- Results describe a simulated schedule on the selected test windows. Confirm the site's capacity with its grid operator before acting.
- The capacity map is a dated snapshot. The Liander comparison checks demand shape, and GLASS was trained on Liander data.
- Battery replay reuses the planned battery actions and clips negative grid draw without recalculating battery state for every window.
- AI answers use computed evidence. Check the supporting facts when an interpretation matters.

## Contributing

Create a descriptive branch and open a pull request to `main` with the problem, changes and validation. Avoid committing credentials, uploaded customer data, raw datasets or generated build output.

## Team

[Smriti Sridhar](https://github.com/smritis21), [Joshua Varghese Thomji](https://github.com/josh1221wa) and [Sunil Parameswaran](https://github.com/SunilParameswaran).
