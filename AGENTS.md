# AGENTS.md

Rules for everyone working in this repository: teammates and AI coding agents alike.

## Project

**GridFlex** checks whether a business can add EV chargers under its existing grid connection limit for a given month. It shows the local grid congestion for the business's postcode, proposes a charging and battery schedule, and flags how often that schedule would still go over the limit on realistic days.

**Read [idea.md](idea.md) first.** It is the source of truth for the idea, architecture, module interfaces, scope and build plan. If you change the plan, update idea.md in the same PR. Tasks per person are in [TODO.md](TODO.md); tick items off in the PR that completes them.

The GLASS dataset is described in [data/README.md](data/README.md); the other data sources in idea.md §4.

## Mandatory workflow: every change goes through a pull request

**Nobody pushes directly to `main`. No exceptions, including AI agents.**

1. Update `main`: `git checkout main && git pull`
2. Create a branch named **`<name>-<change>`**:
   - `<name>`: the first name of the person the change is for, lowercase (an AI agent uses the name of the human it's working for)
   - `<change>`: a short description in lowercase kebab-case
   - Examples: `sunil-cpsat-scheduler`, `joshua-glass-extract`, `smriti-dashboard-shell`
3. Make the change and commit it on that branch.
4. Push the branch and open a pull request into `main`.
5. Merge only through the PR. Delete the branch after merging.

**Every PR needs a good title and description**

- **Title:** says what changed, in plain words.
- **Description:** what changed, why, and how it was tested (e.g. `pytest` output, a screenshot of the app).

**For AI agents specifically**

- Never commit to `main`, force-push, or merge a PR unless the human explicitly asks you to merge.
- If you are on `main` when asked to make a change, create a `<name>-<change>` branch first. If you don't know the human's name, ask.
- Never rewrite history on a branch someone else is working on.

## Repository layout

```
idea.md              idea + implementation plan (source of truth)
TODO.md              tasks per person
HANDOFF.md           handoff notes between teammates (what exists, how to call it, gotchas)
AGENTS.md            this file
data/README.md       GLASS dataset card
data/raw/            downloads (GLASS, capacity map, Liander): git-ignored, never commit
data/processed/      small extracts: committed
scripts/             one-off data scripts (extract_glass, prepare_grid_map, prepare_liander_sbi)
gridflex/            library code: profiles, grid_area, fleet, naive, scheduler, replay, reality, explain
api/                 Python JSON API that calls gridflex/ (idea.md §8.1)
ui/                  React + TypeScript dashboard (idea.md §8.1)
tests/               pytest tests
requirements.txt     Python dependencies (filled in as we build)
```

## Setup and commands

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python scripts/extract_glass.py --categories 009 --months 2023-01 --levels 0 1 2 3
python scripts/prepare_grid_map.py
python scripts/prepare_liander_sbi.py --sbi 49 52 KO_LOGISTIEK --months 2023-01
pytest
uvicorn api.main:app --reload   # API
cd ui && npm install && npm run dev   # dashboard, in a second terminal
```

Data download steps are in idea.md §13.

## Dependencies: fill them in as you build

There is no fixed dependency list up front. Whoever adds a new package records it **in the same PR**:

- **Python:** after `pip install <package>`, add it to `requirements.txt` with the installed version (`<package>==<version>`; `pip show <package>` gives the version). One package per line, sorted alphabetically. Only list packages the code imports directly.
- **Frontend:** always use `npm install <package>` (or `npm install -D <package>` for build and test tools) inside `ui/`, so `package.json` and `package-lock.json` are updated. Commit both files.
- Never commit `.venv/` or `node_modules/`.
- If `pip install -r requirements.txt` or `npm install` fails after pulling `main`, fix the list in a PR rather than installing things by hand.

## Code conventions

- Python 3.11. Use type hints and dataclasses for anything passed between modules.
- Use **Polars** (not pandas) for data loading and **NumPy** arrays of shape `(n, 96)` for profiles and schedules.
- Keep the interfaces in idea.md §7.3 stable. If you need to change one, update idea.md and tell the people using it.
- The connection limit is always a `(96,)` array `C[t]`, never a single number, because it can change during the day.
- Time is always in 15-minute slots (96 per window). Power is in **kW**, energy in **kWh**. Windows run noon to noon unless `start_hour` says otherwise.
- `gridflex/` must not contain any web or UI code. The API lives in `api/`, the dashboard in `ui/` (React + TypeScript).
- The frontend is TypeScript, not plain JavaScript. `ui/src/types.ts` mirrors the API models in `api/schemas.py`; change both in the same PR.
- The LLM provider for the explanation agent (idea.md §5.11) is still open. Don't pick one in passing; agree it with the team first. Provider-specific code lives only in `call_llm()` in `explain.py`.
- Add or update tests in `tests/` for any change to `scheduler.py`, `profiles.py`, `replay.py` or `grid_area.py`.

## Data rules

- **Never commit anything in `data/raw/`** (GLASS parquet, capacity-map CSVs, Liander zips). Only small extracts in `data/processed/` (aim for < 5 MB each).
- Never load the full 43M-row GLASS file into memory. Use `pl.scan_parquet` with filters.
- GLASS rows join into a continuous series **only within the same `scenario`, `category`, year-month, `level_id` and `sample_id`**. Never join days across months or across samples.
- Split GLASS into planning and test groups **by `sample_id`**, never by day. Test windows are only used for replay.
- Capacity-map CSVs are semicolon-separated with comma decimals. Treat the map as indicative and always show its download date.
- Keep the attributions in idea.md §14: GLASS (CDLA-Permissive-2.0), Netbeheer Nederland capaciteitskaart, Liander open data.

## Honesty rules (product)

- Label everything in the app as **synthetic data / simulation**, and fleet values as assumptions.
- Never hide infeasibility: always show kWh short and days over the limit, even when they are bad.
- The app only recommends. It never claims to control equipment or to be a grid-operator approval.
- The explanation agent may only describe numbers already computed by the code. It must not calculate or invent figures, and there must be a non-LLM fallback.

## Secrets

- API keys go in `.env` (git-ignored). Never commit them or paste them into code.
