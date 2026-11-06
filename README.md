# GridFlex AI: Plan. Stress-test. Explain.

**Can my business add EV chargers without a bigger grid connection?**

GridFlex takes a business's postcode, sector, month and fleet, and:

1. **Shows the local grid situation:** is the area congested, how long is the queue, and when is it expected to be fixed?
2. **Plans** a charging timetable for every van (plus an optional on-site battery) that stays under the site's connection limit.
3. **Stress-tests** that plan on realistic days it has never seen: how often, when and by how much the site would still go over the limit, and which vans end up short of charge.
4. **Explains** the result in plain language. A person approves or rejects it; nothing is switched automatically.

The building's own electricity use comes from the site's own **meter data** (CSV upload), or, without history, from a **sector + month + monthly bill** (an estimate from similar businesses). Everything else is simulation: the app only recommends, and is not a grid-operator approval.

> *"We don't test your plan on one made-up day. We test it on every realistic day."*

EY AI Week Hackathon, 5–6 November 2026, Amsterdam. Original concept: GridFlex AI by Smriti Sridhar (Leiden University).

The full idea, architecture and module interfaces are in [idea.md](idea.md). Rules for contributors (including AI agents) are in [AGENTS.md](AGENTS.md).

---

## Quick start

You need about **15 GB of free disk space** (13.2 GB for the raw GLASS file, which is only used once to make the 211 MB the app actually reads) and an internet connection.

### 1. Install the tools

**Windows** (PowerShell):

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.11 -e
winget install --id OpenJS.NodeJS.LTS -e
```

Open a new terminal afterwards so the tools are on your `PATH`. On macOS or Linux, install Git, Python 3.11 and Node.js (LTS) with your package manager.

### 2. Get the code and the Python packages

```bash
git clone git@github.com:josh1221wa/ey_hackathon.git
cd ey_hackathon
python -m venv .venv
```

Activate the environment (every new terminal needs this):

```powershell
.venv\Scripts\activate
```

On macOS or Linux: `source .venv/bin/activate`. Then:

```bash
pip install -r requirements.txt
```

### 3. Get the data (once)

The app needs 480 small files of synthetic business load (`data/processed/glass_*.parquet`, 211 MB). They are not in git. You build them from the raw GLASS file, which one script downloads for you:

```bash
python scripts/download_data.py glass
```

This downloads `GLASS_v1.1.parquet` (13.2 GB) into `data/raw/` and checks its SHA-256 (a few minutes after the download). It takes roughly 5 to 30 minutes, depending on your connection. **If the connection drops, run the same command again: it resumes** where it stopped. Then build the small files (about half a minute):

```bash
python scripts/setup_data.py build
```

Check that everything is in place:

```bash
python scripts/setup_data.py status
```

It should say `480 of 480. Complete.` After that you can delete `data/raw/GLASS_v1.1.parquet` if you need the space; you only need it again to rebuild.

**Shortcut:** if a teammate gives you `glass_2024_extract.zip` (211 MB), skip the download and run `python scripts/setup_data.py unpack path/to/glass_2024_extract.zip`.

### 4. Run it

Two terminals. In the first (with the virtual environment active, from the repo folder):

```bash
uvicorn api.main:app --reload
```

Wait for "Application startup complete" (about 20 seconds). In the second:

```bash
cd ui
npm ci
npm run dev
```

Open the address Vite prints. Go to **Setup**, pick your sector, month and monthly bill (or upload meter data; there is an example file on the page), and press **Optimize**.

### 5. Optional: explanations from an LLM

The explanation tab works without any key, using deterministic templates. For answers written by a model, create a file named `.env` in the repo root (it is git-ignored; never commit it):

```
GROQ_API_KEY=your-key-here
```

Restart the API afterwards. A local model through Ollama (`qwen3.5:9b`) also works; see [ui/README.md](ui/README.md).

### 6. Run the tests

```bash
pytest
```

```bash
cd ui && npm test
```

Without the GLASS files, the tests that need them skip themselves (they say why) and the rest still run.

---

## Where the data comes from

| Dataset | What it is | Where it comes from | Needed for |
|---|---|---|---|
| **GLASS v1.1** | Synthetic daily load profiles of Dutch large business customers (60–160 kW connections), 15-minute readings, 3 years. License CDLA-Permissive-2.0. | [4TU.ResearchData, doi:10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991](https://doi.org/10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991) (`GLASS_v1.1.parquet`, 13.2 GB). Dataset card: [data/README.md](data/README.md). | The building's electricity use. **The only download you need.** |
| **Capacity map** | Which postcodes have grid congestion, the queue per supply area and expected fix year. A snapshot, indicative only. | [Netbeheer Nederland capaciteitskaart](https://capaciteitskaart.netbeheernederland.nl) | The postcode card. Already processed in `data/processed/`. |
| **Liander profiles** | Real measured 2023 consumption profiles per sector (SBI code) from Liander's large customers. | [Liander open data](https://www.liander.nl/over-ons/open-data) ("Verbruiksprofielen grootverbruikaansluitingen elektriciteit 2023") | The reality check next to the synthetic data. Already processed in `data/processed/`. |

Do not use the Hugging Face copy of GLASS (`sentient-codebot/tud-glass`): it is v1.0, a different file.

The small processed results of the capacity map and the Liander profiles **are committed**, so you do not need to download those two. To refresh them anyway (for example for a newer capacity map):

```bash
python scripts/download_data.py capacity liander
```

```bash
python scripts/prepare_grid_map.py
```

```bash
python scripts/prepare_liander_sbi.py --sbi 49 52 KO_LOGISTIEK --months 2023-01 2023-02 2023-03 2023-04 2023-05 2023-06 2023-07 2023-08 2023-09 2023-10 2023-11 2023-12
```

`python scripts/download_data.py` with no name downloads all three (about 13.6 GB).

**What the 480 files are:** GLASS 2024 (the latest year in the dataset), all 12 months, 4 consumption levels, 40 samples per condition, for the fleet-depot sectors (transport and storage, wholesale and retail, water and waste, construction, administrative and support, manufacturing) plus four operating-hours classes as a generic fallback. The reasoning is in [idea.md](idea.md) section 4.5. To change the set, edit `CATEGORIES`, `MONTHS` and `SAMPLES` in `scripts/setup_data.py`.

---

## Repository layout

```
idea.md          the idea and implementation plan (source of truth)
AGENTS.md        rules for everyone working here
HANDOFF.md       what exists and how to call it, between teammates
TODO.md          tasks per person
data/README.md   the GLASS dataset card
data/raw/        downloads (git-ignored, never commit)
data/processed/  small extracts the app reads (GLASS ones are git-ignored)
scripts/         download_data, setup_data, extract_glass, prepare_grid_map, prepare_liander_sbi
gridflex/        library code: profiles, scheduler, replay, reality, explanations
api/             the Python JSON API (FastAPI)
ui/              the React + TypeScript dashboard
tests/           pytest tests
```

---

## Troubleshooting

- **The dashboard has no sectors, or the API says a `glass_...parquet` file was not found:** the data is not set up. Run `python scripts/setup_data.py status` and follow what it prints.
- **`python` is not found or opens the Microsoft Store:** install Python with the `winget` command above and open a new terminal. Use the Python from the activated `.venv`.
- **`could not reach the GridFlex API` in the browser:** start the API first (step 4) and wait for "Application startup complete".
- **The download stops or fails:** run the same command again. Finished files are skipped and partial ones resume. If it reports the link moved, the source pages are listed in the table above.
- **"SHA-256 mismatch":** the GLASS file is damaged or a different version. Delete `data/raw/GLASS_v1.1.parquet` and run the download again.
- **"Not enough disk space":** the download needs about 14 GB free where `data/raw/` lives.

---

## Contributing

Nobody pushes to `main`, including AI agents. Make a branch named `<name>-<change>` (for example `smriti-dashboard-shell`), commit there, push it and open a pull request with a title and a description of what changed, why and how it was tested. The full rules are in [AGENTS.md](AGENTS.md).

## Honesty

Everything in the app is labelled as **synthetic data and simulation**, and the fleet values are assumptions. Only results built on a site's own meter data drop "synthetic", and they are still a simulation. The app shows kWh short and days over the limit even when they are bad. The explanation agent only describes numbers the code has already computed.

## Attribution

GLASS (CDLA-Permissive-2.0, TU Delft, OpenSynth / LF Energy) · Netbeheer Nederland, capaciteitskaart (with the download date shown in the app) · Liander (2023), open data. More in [idea.md](idea.md) section 14.
