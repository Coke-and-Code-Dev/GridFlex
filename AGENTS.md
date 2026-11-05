# AGENTS.md

Rules for everyone working in this repository: teammates and AI coding agents alike.

## Project

**GridFlex** checks whether a business can add EV chargers under its existing grid connection limit for a given month. It proposes a charging schedule and flags how often that schedule would still go over the limit on realistic days.

**Read [README.md](README.md) first.** It is the source of truth for the idea, architecture, module interfaces, scope and build plan. If you change the plan, update README.md in the same PR.

The dataset is described in [data/README.md](data/README.md).

## Mandatory workflow: every change goes through a pull request

**Nobody pushes directly to `main`. No exceptions, including AI agents.**

1. Update `main`: `git checkout main && git pull`
2. Create a branch named **`<name>-<change>`**:
   - `<name>`: the first name of the person the change is for, lowercase (an AI agent uses the name of the human it's working for)
   - `<change>`: a short description in lowercase kebab-case
   - Examples: `smriti-cpsat-scheduler`, `joshua-glass-extract`, `alex-sweep-chart`
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
README.md            idea + implementation plan (source of truth)
AGENTS.md            this file
data/README.md       GLASS dataset card
data/raw/            full GLASS parquet: git-ignored, never commit
data/processed/      small per-condition extracts: committed
scripts/             one-off data scripts (extract_glass.py)
gridflex/            library code: profiles, fleet, naive, scheduler, replay, explain
ui/                  dashboard (framework to be decided: README.md §6.1)
tests/               pytest tests
```

## Setup and commands

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python scripts/extract_glass.py --categories 009 --months 2024-01 --levels 0 1 2 3
pytest
```

The command to run the dashboard will be added once the UI framework is chosen (README.md §6.1).

## Code conventions

- Python 3.11. Use type hints and dataclasses for anything passed between modules.
- Use **Polars** (not pandas) for data loading and **NumPy** arrays of shape `(n, 96)` for profiles and schedules.
- Keep the interfaces in README.md §5.2 stable. If you need to change one, update README.md and tell the people using it.
- Time is always in 15-minute slots (96 per window). Power is in **kW**, energy in **kWh**. Windows run noon to noon unless `start_hour` says otherwise.
- `gridflex/` must not contain any UI code. All UI code lives in `ui/`. The UI framework is still an open question (README.md §6.1). Don't pick one in passing; agree it with the team first.
- Add or update tests in `tests/` for any change to `scheduler.py`, `profiles.py` or `replay.py`.

## Data rules

- **Never commit the raw GLASS parquet** or anything in `data/raw/`. Only small extracts in `data/processed/` (aim for < 5 MB each).
- Never load the full 43M-row file into memory. Use `pl.scan_parquet` with filters.
- Rows join into a continuous series **only within the same `scenario`, `category`, year-month, `level_id` and `sample_id`**. Never join days across months or across samples.
- GLASS is licensed CDLA-Permissive-2.0. Keep the attribution in README.md.

## Honesty rules (product)

- Label everything in the app as **synthetic data / simulation**.
- Never hide infeasibility: always show kWh short and days over the limit, even when they are bad.
- The app only recommends. It never claims to control equipment or to be a grid-operator approval.
- If an LLM explanation is added, it may only describe numbers already computed by the code. It must not calculate or invent figures, and there must be a non-LLM fallback.

## Secrets

- API keys go in `.env` (git-ignored). Never commit them or paste them into code.
