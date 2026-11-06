# GridFlex handoff notes for Smriti and Sunil

Everything described here is on `main`: Joshua's data and checking work, Sunil's optimizer, sweeps and grounded assistant, and Smriti's API and dashboard (including CSV import and multi-depot runs). Joshua QC'd `main` on 6 November 2026: all Python and UI tests pass, every API endpoint works, and Optimize runs end to end in the browser. This file describes how the parts fit together and what to watch out for. The plan stays in [idea.md](idea.md) (section numbers refer to it) and the task lists in [TODO.md](TODO.md). Facts below were measured on the real data on 5 November 2026.

## Both: set up in two minutes

```bash
git checkout main
git pull
uv venv --python 3.11
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv\Scripts\python.exe -m pytest
```

On `main`, the suite reports **130 passed** (re-run the `uv pip install` line after every pull: `requirements.txt` grows, for example `ortools`, `groq`, `chromadb`, `reportlab`). For the dashboard, `cd ui`, `npm ci`, then `npm run dev`; `npx vitest run` runs the UI tests. Branch names are `<name>-<change>`; every change goes through a PR (AGENTS.md). Use the venv's Python (`.venv\Scripts\python.exe`), not a bare `python`.

Conventions that everything shares (AGENTS.md and idea.md §7.3):

- **96 slots of 15 minutes per window**, power in **kW**, energy in **kWh**. Windows run **noon to noon**: slot 0 is 12:00, slot 95 is 11:45 the next day.
- The connection limit is always a `(96,)` array `C[t]`, never one number.
- Every profile or schedule is a NumPy array of shape `(n, 96)`; Polars (not pandas) for tables.
- Data in `data/processed/` is committed, so you do not need the 13 GB raw file. Only the development scenario is extracted: **category `009`, January 2023, levels 0–3** (level 1 is the development level).

### Slot arithmetic (noon start)

| Clock time | Slot |
|---|---|
| 12:00 | 0 |
| 17:00 (earliest arrival) | 20 |
| 19:00 (latest arrival) | 28 |
| 00:00 | 48 |
| 06:00 (earliest departure) | 72 |
| 07:00 (latest departure) | 76 |

`gridflex.replay.slot_time(slot, start_hour=12)` turns a slot back into "HH:MM".

---

## For Sunil: optimisation

### 1. Your real baseline (replaces the flat fake one)

```python
from gridflex.profiles import load_condition, build_windows, split_by_sample, cautious_baseline

windows = build_windows(load_condition("009", "2023-01", 1))   # noon-to-noon, working days only
planning, test = split_by_sample(windows)                      # 70/30 by sample_id, seed 42
B = cautious_baseline(planning, q=0.90)                        # (96,) kW, plan against this
```

What you get for level 1: 3,150 windows; `planning` = 2,205 windows from 105 samples; `test` = 945 windows from 45 samples. `B` runs from 13.4 kW to 26.2 kW (its maximum is at 08:45, after the vans leave); it averages 18.7 kW between 18:00 and 24:00 and 14.4 kW between 00:00 and 06:00. `B` is a float array; your model rounds it (`ceil(B[t])`, idea.md §5.6).

Plan on `planning` only. Never plan on `test`; the test windows exist only for replay.

### 2. How `replay()` reads your `ScheduleResult`

```python
from gridflex.replay import replay

report = replay(test, result, limit, [v.name for v in vans],
                tolerance=0.05, immediate_power=naive_schedule(vans))
```

`replay` reads only these four fields, so your `ScheduleResult` works as is:

| Field | Shape | Notes |
|---|---|---|
| `result.power` | `(n_vans, 96)` | integer kW. Zero vans is fine: shape `(0, 96)`. |
| `result.battery_charge` | `(96,)` | zeros without a battery; `None` is also accepted. |
| `result.battery_discharge` | `(96,)` | same. |
| `result.unmet_kwh` | `(n_vans,)` | **already in kWh** (not in 0.25 kWh units). Do not divide by 4 again. |

Also: `limit` must have shape `(96,)` (a clear `ValueError` otherwise), and `van_names` must be in the same order as the rows of `power`. `tolerance` is a **fraction** (0.05 = 5%), while `days_over_pct` and `baseline_alone_over_pct` in the report are **percentages** (0–100). The verdict is `does_not_fit` if any van has `unmet_kwh > 0`, otherwise `fits_with_risk` if the share of days over the limit is above the tolerance, otherwise `fits`. A slot exactly at the limit does not count as over it. `report.vans_short` has one `(name, kWh short)` entry per van, including 0.0 for full vans.

**The real integration checkpoint now passes:** `replay()` has been tested with the implemented `ScheduleResult` and the 945 held-out development windows. Joshua reviewed the shared replay and sweep logic (5 November 2026).

### 3. The completed checkpoint

A real development replay is available at `examples/replay_report_dev.json`. You can regenerate the report with:

```python
import dataclasses, json
d = dataclasses.asdict(report)
d["over_by_slot"] = report.over_by_slot.tolist()
json.dump(d, open("replay_report_dev.json", "w"), indent=2)
```

The development scenario uses 10 vans with the §4.4 defaults, 100 kW and level 1. It is an example only; calculate results for the user’s current inputs.

### 4. Numbers that help you plan the demo (measured, not scheduler results)

- **Immediate charging breaks the limit.** With a throwaway fleet of 10 vans (11 kW, 30–40 kWh, arriving 17:00–19:00), the fleet alone peaks at 110 kW and goes over 100 kW on **100%** of test days. 5 vans did that on 1.8% of days. Your `generate_fleet` will differ in the details; check that your own immediate-charging run breaks the limit too (a test in idea.md §7.4).
- **There is a floor under "days over limit".** The building alone is above 100 kW on **0.74%** of test windows (rare spikes in GLASS), so a plan without battery support cannot reduce baseline-only violations to zero. This is reported separately as `baseline_alone_over_pct`; the 5% default tolerance leaves room for it. Do not read this floor as a scheduler bug.
- **Level 1 at 100 kW has a lot of room.** Rough upper bound on energy between 19:00 and 06:00: about 918 kWh, i.e. at most ~26 vans of 35 kWh before energy runs out (ignoring the 11 kW charger limit and arrival times). So "drag to 15 vans → ❌" will probably **not** happen at level 1 and 100 kW. To make the break appear at a believable fleet size, consider a tighter limit (about 60 kW gives a bound of ~14 vans) or another level (level 2 at 100 kW: ~23 vans; level 3 at 100 kW: ~15 vans but its baseline alone is over the limit on 21.5% of test windows, so it needs a higher limit). This is a hint for choosing the demo scenario; your sweeps decide.
- Every level exists for January 2023 only. Other months need an extract from Joshua (one command, separate PR).

### 5. Sweeps (`charger_sweep`, `battery_sweep` in `replay.py`)

Rules for them: compute `planning`, `test`, `B` and `limit` **once** and reuse them for every point of the sweep (so points are comparable), take the first N vans of the seeded fleet, and cache results per input set. Joshua reviewed the replay side: the implementation follows these rules.

### 6. Reminders

- AGENTS.md requires tests in `tests/` for any change to `scheduler.py`. The test list is in idea.md §7.4.
- `gridflex/` must not import web code.
- If you change an interface in idea.md §7.3, update idea.md in the same PR and tell Smriti.

---

## For Smriti: dashboard and explanation

### 1. What you can call today

All endpoints below are implemented in `api/main.py` on `main` and call the library; they do not copy it.

| Endpoint (idea.md §8.1) | Call | Returns |
|---|---|---|
| `GET /conditions` | `available_conditions()` | `list[Condition]`: `category`, `month`, `level`, `level_value_kwh` |
| `GET /area/{postcode}` | `lookup(postcode)` | `AreaInfo`, or 404 for an unknown or malformed postcode |
| `GET /reality` | `compare_all(category, month, level)` → list of `RealityCheck`; `summary(check)` for the sentence | see §4 below |
| `POST /meter-data` | `parse_meter_csv()` / `meter_windows()` / `split_by_date()` in `gridflex/load_sources.py`, kept by `api/meter_store.py` | `meter_id`, days, date range, ≈ kWh/month, peak, planning/test days, warnings; 422 with a line number for a bad file |
| `POST /optimize` | `load_for()` (meter, bill or profile windows), `cautious_baseline`, then `optimize()`, then `replay()` | schedule, report, baseline, limit, immediate power, p10–p90 band, vans, `load` (source, description, warnings, level, scale) |
| `POST /sweep` | `charger_sweep()` or `battery_sweep()` | sweep tables; see integration example below |
| `POST /explain` | `answer_question()` in `gridflex/assistant.py` | grounded answer from Groq or local Qwen (`provider`), with cited evidence; template fallback |
| `POST /what-if` | one-change optimization + replay | exploratory comparison of current vs. changed scenario |
| `POST /import-setup` | `read_scenarios()` in `api/csv_setup.py` | one `Scenario` from a single-site CSV |
| `POST /batch-report`, `/batch-report/progress` | one `/optimize` per CSV site, `render_portfolio()` | portfolio PDF; the progress variant streams NDJSON per site and saves the run locally |
| `POST /portfolio/ask` | `ask_portfolio()` in `gridflex/portfolio_assistant.py` | grounded answer about a saved portfolio run |

Imports: `gridflex.profiles`, `gridflex.grid_area` (`lookup`, `map_date`), `gridflex.reality`, `gridflex.replay`.

### Optimizer integration example

Run from the repository root with the project virtual environment. This uses the development scenario; replace the values with validated API inputs. Use `planning` to build the baseline and `test` for replay, never mix customer samples. The optional sweep lines are examples; a production endpoint can return each table with `.to_dicts()`.

```python
import dataclasses
import json
import numpy as np
from gridflex.profiles import load_condition, build_windows, split_by_sample, cautious_baseline
from gridflex.fleet import generate_fleet
from gridflex.naive import naive_schedule
from gridflex.scheduler import NoScheduleError, limit_profile, optimize
from gridflex.replay import replay, charger_sweep, battery_sweep

windows = build_windows(load_condition('009', '2023-01', 1))
planning, test = split_by_sample(windows)
baseline = cautious_baseline(planning, q=0.90)
limit = limit_profile(100.0)
vans = generate_fleet(10, seed=42)
try:
    result = optimize(baseline, limit, vans)
except NoScheduleError as exc:
    raise RuntimeError(f'No usable charging plan: {exc.status}') from exc
report = replay(test, result, limit, [van.name for van in vans], tolerance=0.05, immediate_power=naive_schedule(vans))
payload = {
    'schedule': {**dataclasses.asdict(result), 'power': result.power.tolist(),
                 'battery_charge': result.battery_charge.tolist(),
                 'battery_discharge': result.battery_discharge.tolist(),
                 'battery_soc_kwh': result.battery_soc_kwh.tolist(),
                 'unmet_kwh': result.unmet_kwh.tolist()},
    'report': {**dataclasses.asdict(report), 'over_by_slot': report.over_by_slot.tolist()},
    'baseline_kw': baseline.tolist(), 'limit_kw': limit.tolist(),
    'immediate_power_kw': naive_schedule(vans).tolist(),
}
json.dumps(payload, allow_nan=False)
print('status:', result.status, 'vans:',len(vans),'test windows:', report.n_windows,'over %:',round(report.days_over_pct,3))
# Optional comparisons; pass real API inputs rather than hard-coding these settings.
assert charger_sweep(planning, test, limit, vans, n_max=2).height == 2
assert battery_sweep(planning, test, limit, vans, [0, 20], power_kw=10).height == 2
```

`ScheduleResult` fields for the API:

| Field | Shape / meaning |
|---|---|
| `power` | `(n_vans, 96)`, integer kW; rows are in the same order as `vans` |
| `battery_charge`, `battery_discharge` | `(96,)`, kW; all zero with no battery |
| `battery_soc_kwh` | `(97,)`, stored energy at each boundary; all zero with no battery |
| `unmet_kwh` | `(n_vans,)`, **already kWh**; never divide by four again |
| `peak_kw` | peak on the conservative, rounded planning baseline, including battery |
| `blocked_slots` | indices where the returned plan is above the rounded modeled cap |
| `status`, `solve_seconds` | solver outcome and total run time |

Create a battery with `Battery(capacity_kwh=20, power_kw=10, efficiency=0.90, start_soc=0.5)` and pass it to `optimize(..., battery=battery)`. Use `limit_profile(100, 50, ("22:00", "06:00"))` to test 50 kW of extra off-peak capacity. That is a contract assumption, not a real-world approval.

**Failure handling:** `OPTIMAL` means all objective stages were proven optimal. `FEASIBLE` is a valid plan without that full proof; display its status. If there is no valid solution, `optimize` raises `NoScheduleError` with `exc.status` (`UNKNOWN`, `INFEASIBLE`, or `MODEL_INVALID`). Return a clear error or no-result state; do not call `replay()` on an invented schedule. Inputs outside the supported shape or range raise `ValueError`. Convert NumPy arrays to lists, and mirror API model changes in `ui/src/types.ts`.

**Sweep outputs:** `charger_sweep` returns `n`, `days_over_pct`, `kwh_short`, `status`. `battery_sweep` returns `capacity_kwh`, `days_over_pct`, `kwh_short`, `fits`, `status`, `smallest_fit`. `fits` requires the risk tolerance **and** no energy shortfall; `smallest_fit` marks the smallest tested fitting size, not an untested global minimum. If no solution was found for a point, its metrics are `None` and its solver status is shown. Results are cached by inputs when optimal. If the same replay windows are used to choose the demo or battery size, describe these comparisons as exploratory.

**Rounding:** charging uses integer kW per 15-minute slot; energy demand rounds up to 0.25 kWh. The optimizer rounds the baseline up and the connection limit down to integer kW. Battery state is represented to 0.0001 kWh. Show these assumptions in the UI.

**Battery replay limitation:** replay currently clips negative net demand to zero when a fixed battery-discharge plan is applied to a lower-load test window. It does not resimulate the battery state after clipping. Clipping can only raise grid use, so it never hides an overshoot (Joshua's review); still, do not claim that every battery replay is a physically validated control trajectory.

**Development run:** the example has 10 vans, 945 held-out synthetic windows, no unmet energy, 1.16% of windows over the limit, and 100% for immediate charging. Baseline alone exceeds the limit on 0.74% of windows. The solver runs with one worker (`num_workers = 1`), so the same inputs give the same plan on every run and laptop; before that fix, parallel workers gave 1.06% or 1.16% for the same inputs. Use actual results and report worst overshoot too. At the heaviest settings (a 40-van sweep with a battery and a 1 s limit per stage) a few points return `FEASIBLE` instead of `OPTIMAL`; show the status as it comes. These are synthetic scenario outcomes, not real-site probabilities.

### 2. Field lists for `api/schemas.py` and `ui/src/types.ts` (mirror them in the same PR)

- `Condition`: `category: str`, `month: str` ("YYYY-MM"), `level: int`, `level_value_kwh: float | None`, `label: str` (sector name)
- `Scenario` load fields: `load_source` (`"profile" | "bill" | "meter"`, default `"profile"`), `monthly_kwh` (required for `bill`), `meter_id` (required for `meter`; a 404 means the API restarted and the file must be uploaded again)
- `Project`: `name`, `expected` ("2032 - Q4" or "2032"), `phase`, all `str | None`
- `AreaInfo`: `postcode`, `status` (`"unknown" | "available" | "limited" | "under_study" | "shortage"`), `area_name`, `operator`, `capacity_mw`, `needed_mw`, `queue_requests`, `queue_mw`, `expected_fix_year`, `projects: list[Project]`, `info_url`, `data_date`, `municipality`, `province`, `ambiguous: bool`, `note`; everything except `postcode`, `status`, `projects`, `data_date`, `ambiguous` can be `None`
- `ReplayReport`: `days_over_pct`, `worst_overshoot_kw`, `worst_overshoot_time` (`"HH:MM"`, or `""` if the limit is never exceeded), `over_by_slot` (96 ints), `mean_overshoot_kwh`, `baseline_alone_over_pct`, `vans_short: list[(name, kWh)]`, `verdict` (`"fits" | "fits_with_risk" | "does_not_fit"`), `n_windows`, `immediate: ImmediateReplay | None` (`days_over_pct`, `worst_overshoot_kw`, `worst_overshoot_time`), `synthetic` (False only for the site's own meter data)
- `RealityCheck`: `sbi_code`, `correlation`, `mean_abs_diff`, `glass_band` and `liander_band` (each 3 rows × 96: p10, median, p90), `liander_has_band`, `category`, `month`, `level`, `n_glass_samples`, `n_glass_days`, `n_liander_days`

### 3. JSON gotchas

- The dataclasses hold NumPy arrays. Convert with `.tolist()` (for `over_by_slot` and the two bands). `dataclasses.asdict` handles the rest.
- **`liander_band` has NaN in its p10 and p90 rows when `liander_has_band` is `False`** (a standard K&O profile is a single curve). JSON cannot hold NaN: send `null` and draw one line, no band.
- **Units:** `days_over_pct` and `baseline_alone_over_pct` are 0–100. The risk tolerance in the request is a fraction (0.05 = 5%): the UI shows percent, the API takes a fraction.
- `vans_short` lists **every** van with its shortfall (0.0 for fully charged vans), so the heatmap and the KPI row can use it directly: "vans fully charged" = the number of entries with 0.0.

### 4. Time axes

- The **demand chart is noon to noon** (slot 0 = 12:00). Use `slot_time(slot, 12)` for labels.
- The **reality chart is midnight to midnight** (slot 0 = 00:00), a calendar day. Label it differently.
- The demand chart's p10–p90 band of normal use has **no helper function yet**: `np.percentile(windows.values, [10, 90], axis=0)` on the `Windows` from `build_windows` (use the same windows for the band and the baseline, and say which ones). Joshua can add a function if you prefer.

### 5. A real `AreaInfo` to build the card against (`lookup("1181 kj")`)

```json
{
  "postcode": "1181KJ", "status": "shortage", "area_name": "Amstelveen", "operator": "Liander",
  "capacity_mw": 56.0, "needed_mw": 53.0, "queue_requests": 29, "queue_mw": 5.82194,
  "expected_fix_year": 2032,
  "projects": [
    {"name": "Extra capaciteit op knooppunt OS AMSTELVEEN 10-1i", "expected": "2032 - Q4", "phase": null},
    {"name": "Extra capaciteit op knooppunt OS AMSTELVEEN 10-2i", "expected": "2032 - Q4", "phase": null}
  ],
  "info_url": "https://www.liander.nl/grootzakelijk/capaciteit-op-het-net/congestieonderzoeken",
  "data_date": "2026-11-05", "municipality": "Amstelveen", "province": "Noord-Holland",
  "ambiguous": false, "note": null
}
```

Demo postcodes (idea.md §9): `1181KJ` Amstelveen (red, 29 requests, 5.8 MW, fix 2032, 2 projects), `1021EG` Amsterdam Noord (red, 87 requests, 27.2 MW, fix 2027), `2311BD` Leiden (red, 34 requests, 13.9 MW, fix 2035), and for contrast `2291AA` Westland (green, 0 requests, 378 MW capacity, no fix year). A postcode that is valid but not in the map gives `None`; a malformed one (wrong length, letters in the digits) also gives `None`. `lookup` accepts `"1181 kj"`, `"1181KJ"`, `" 1181kj "`.

### 6. Card rules (idea.md §4.2 and AGENTS.md honesty rules)

- Status colours: `shortage` = red, `under_study` = orange, `limited` = yellow, `available` = transparent/green, `unknown` = grey ("no information").
- **A green postcode can still sit in an area with a waiting list**: the colour is per postcode, the queue per supply area. Show both and do not call green "no waiting list".
- Show "no information" for every `None`; never print 0 or a guess. Some areas have no fix year (321 of 602) or no capacity figure.
- If `ambiguous` is true, say the postcode lies in more than one supply area and the most severe is shown.
- Always show the map date (`data_date`, or `map_date()`) and "Indicative; check with your grid operator."
- Show `note` and `info_url` when present.

### 7. Dropdowns and labels

`available_conditions()` returns only four conditions today: category `009`, `2023-01`, levels 0–3, with `level_value_kwh` 3,450 / 8,000 / 13,700 / 29,100 (show "≈ 3.5 / 8.0 / 13.7 / 29.1 MWh/month"). Level names: low, mid_low, mid_high, high. Sector names come from `SECTOR_LABELS` in `gridflex/profiles.py` and arrive as `Condition.label`. More months or sectors need an extract from Joshua; keep the dropdowns driven by `available_conditions()` so they grow by themselves.

### 8. Reality check panel

`compare_all("009", "2023-01", 1)` returns three checks (SBI 52, SBI 49, the standard logistics profile `KO_LOGISTIEK`). Real numbers: correlation 0.97, 0.93 and 0.97. `summary(check)` gives the one sentence. Attribution text: "Liander (2023)". Add the footnote that GLASS was trained on Liander data, so the match is **not an independent test** (idea.md §5.10 and §12).

### 9. Housekeeping

- The wireframe landed in `wireframe/`, while AGENTS.md and idea.md say the app lives in `ui/`. Not Joshua's call: please settle it (and update AGENTS.md) so nobody scaffolds a second app.
- After pulling, re-install `requirements.txt` (see the set-up section); a missing package such as `ortools` makes the API fail on import.
- The assistant describes only computed facts. Groq or local Qwen (Ollama, `qwen3.5:9b`) writes answers that must cite fact IDs; the server checks every number against the cited facts, and templates are the fallback. Provider code lives in `call_llm()` in `gridflex/explain.py`. The Groq key is stored in the ignored local `.env` and must not be committed. Without a key or Ollama, the single-run assistant falls back to templates; the portfolio chat currently only says the model is unavailable (open in TODO.md).
- With Groq selected, the portfolio chat sends uploaded site names, postcodes and grid-area details to Groq, not only synthetic facts. Local Qwen keeps them on the machine.
- The API takes about 20 seconds to start (library imports); wait for "Application startup complete" before loading the dashboard.
- Attributions to show in the app: GLASS (CDLA-Permissive-2.0), "Netbeheer Nederland, capaciteitskaart" with the map date, "Liander (2023)". Footer: "Synthetic data and simulation. Not a grid-operator approval."

---

## Questions

Ask Joshua for: more GLASS conditions, a band helper, JSON helpers, anything in `profiles.py`, `replay.py`, `grid_area.py` or `reality.py` that does not behave as written here.
