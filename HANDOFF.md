# Handoff notes from Joshua

Joshua's data and checking work is merged into `main`. This file tells Sunil and Smriti what exists, how to call it, and what to watch out for. The plan stays in [idea.md](idea.md) (section numbers refer to it) and the task lists in [TODO.md](TODO.md). Facts below were measured on the real data on 5 November 2026.

## Both: set up in two minutes

```bash
git checkout main
git pull
uv venv --python 3.11
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv\Scripts\python.exe -m pytest
```

You should see **65 passed**. Branch names are `<name>-<change>`; every change goes through a PR (AGENTS.md). Use the venv's Python (`.venv\Scripts\python.exe`), not a bare `python`.

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

**`replay` has only ever been run with a stand-in object, never with a real `ScheduleResult`.** Your first real integration run is the checkpoint. If anything does not line up (shapes, units), tell Joshua or fix the side that is wrong and update idea.md §7.3.

### 3. The checkpoint (please do this as soon as `optimize()` works)

TODO.md asks Joshua to hand Smriti a real `ReplayReport` for the development scenario. You can do it yourself in a few lines:

```python
import dataclasses, json
d = dataclasses.asdict(report)
d["over_by_slot"] = report.over_by_slot.tolist()
json.dump(d, open("replay_report_dev.json", "w"), indent=2)
```

Send Smriti the file (or the path). The development scenario is 10 vans with the §4.4 defaults, 100 kW, level 1.

### 4. Numbers that help you plan the demo (measured, not scheduler results)

- **Immediate charging breaks the limit.** With a throwaway fleet of 10 vans (11 kW, 30–40 kWh, arriving 17:00–19:00), the fleet alone peaks at 110 kW and goes over 100 kW on **100%** of test days. 5 vans did that on 1.8% of days. Your `generate_fleet` will differ in the details; check that your own immediate-charging run breaks the limit too (a test in idea.md §7.4).
- **There is a floor under "days over limit".** The building alone is above 100 kW on **0.74%** of test windows (rare spikes in GLASS), so `days_over_pct` can never reach 0 for any plan. This is reported separately as `baseline_alone_over_pct`; the 5% default tolerance leaves room for it. Do not read this floor as a scheduler bug.
- **Level 1 at 100 kW has a lot of room.** Rough upper bound on energy between 19:00 and 06:00: about 918 kWh, i.e. at most ~26 vans of 35 kWh before energy runs out (ignoring the 11 kW charger limit and arrival times). So "drag to 15 vans → ❌" will probably **not** happen at level 1 and 100 kW. To make the break appear at a believable fleet size, consider a tighter limit (about 60 kW gives a bound of ~14 vans) or another level (level 2 at 100 kW: ~23 vans; level 3 at 100 kW: ~15 vans but its baseline alone is over the limit on 21.5% of test windows, so it needs a higher limit). This is a hint for choosing the demo scenario; your sweeps decide.
- Every level exists for January 2023 only. Other months need an extract from Joshua (one command, separate PR).

### 5. Sweeps (`charger_sweep`, `battery_sweep` in `replay.py`)

These are on your list "with Joshua". Rules for them: compute `planning`, `test`, `B` and `limit` **once** and reuse them for every point of the sweep (so points are comparable), take the first N vans of the seeded fleet, and cache results per input set. Joshua reviews the replay side.

### 6. Reminders

- AGENTS.md requires tests in `tests/` for any change to `scheduler.py`. The test list is in idea.md §7.4.
- `gridflex/` must not import web code.
- If you change an interface in idea.md §7.3, update idea.md in the same PR and tell Smriti.

---

## For Smriti: dashboard and explanation

### 1. What you can call today

All of this is in `gridflex/`, merged, and tested. Import it from the API; do not copy it.

| Endpoint (idea.md §8.1) | Call | Returns |
|---|---|---|
| `GET /conditions` | `available_conditions()` | `list[Condition]`: `category`, `month`, `level`, `level_value_kwh` |
| `GET /area/{postcode}` | `lookup(postcode)` | `AreaInfo` or `None` (answer 404 or "no match" for `None`) |
| `GET /reality` | `compare_all(category, month, level)` → list of `RealityCheck`; `summary(check)` for the sentence | see §4 below |
| `POST /optimize` | `build_windows` / `split_by_sample` / `cautious_baseline`, then Sunil's `optimize()`, then `replay()` | `ReplayReport` (**scheduler not in `main` yet**) |
| `POST /sweep`, `POST /explain` | Sunil's sweeps; your `explain.py` | not available yet |

Imports: `gridflex.profiles`, `gridflex.grid_area` (`lookup`, `map_date`), `gridflex.reality`, `gridflex.replay`.

### 2. Field lists for `api/schemas.py` and `ui/src/types.ts` (mirror them in the same PR)

- `Condition`: `category: str`, `month: str` ("YYYY-MM"), `level: int`, `level_value_kwh: float | None`
- `Project`: `name`, `expected` ("2032 - Q4" or "2032"), `phase`, all `str | None`
- `AreaInfo`: `postcode`, `status` (`"unknown" | "available" | "limited" | "under_study" | "shortage"`), `area_name`, `operator`, `capacity_mw`, `needed_mw`, `queue_requests`, `queue_mw`, `expected_fix_year`, `projects: list[Project]`, `info_url`, `data_date`, `municipality`, `province`, `ambiguous: bool`, `note`; everything except `postcode`, `status`, `projects`, `data_date`, `ambiguous` can be `None`
- `ReplayReport`: `days_over_pct`, `worst_overshoot_kw`, `worst_overshoot_time` (`"HH:MM"`, or `""` if the limit is never exceeded), `over_by_slot` (96 ints), `mean_overshoot_kwh`, `baseline_alone_over_pct`, `vans_short: list[(name, kWh)]`, `verdict` (`"fits" | "fits_with_risk" | "does_not_fit"`), `n_windows`, `immediate: ImmediateReplay | None` (`days_over_pct`, `worst_overshoot_kw`, `worst_overshoot_time`)
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

`available_conditions()` returns only four conditions today: category `009`, `2023-01`, levels 0–3, with `level_value_kwh` 3,450 / 8,000 / 13,700 / 29,100 (show "≈ 3.5 / 8.0 / 13.7 / 29.1 MWh/month"). Level names: low, mid_low, mid_high, high. Sector names are not in the code (only a sentence label in `reality.py`): use `009` = Transport and storage, `008` = Wholesale and retail trade (data/README.md has all of them). More months or sectors need an extract from Joshua; keep the dropdowns driven by `available_conditions()` so they grow by themselves.

### 8. Reality check panel

`compare_all("009", "2023-01", 1)` returns three checks (SBI 52, SBI 49, the standard logistics profile `KO_LOGISTIEK`). Real numbers: correlation 0.97, 0.93 and 0.97. `summary(check)` gives the one sentence. Attribution text: "Liander (2023)". Add the footnote that GLASS was trained on Liander data, so the match is **not an independent test** (idea.md §5.10 and §12).

### 9. Housekeeping

- The wireframe landed in `wireframe/`, while AGENTS.md and idea.md say the app lives in `ui/`. Not Joshua's call: please settle it (and update AGENTS.md) so nobody scaffolds a second app.
- `requirements.txt` already has `fastapi`, `uvicorn`, `pydantic` and `pyarrow`.
- The explanation agent may only describe numbers the code computed. `explain.py` needs a non-LLM fallback and the provider stays in `call_llm()` (AGENTS.md).
- Attributions to show in the app: GLASS (CDLA-Permissive-2.0), "Netbeheer Nederland, capaciteitskaart" with the map date, "Liander (2023)". Footer: "Synthetic data and simulation. Not a grid-operator approval."

---

## Questions

Ask Joshua for: more GLASS conditions, a band helper, JSON helpers, anything in `profiles.py`, `replay.py`, `grid_area.py` or `reality.py` that does not behave as written here.
