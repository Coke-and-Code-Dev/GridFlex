# TODO

Tasks for the 18-hour build, split across three people. Section numbers (§) refer to [idea.md](idea.md). Tick items off in the PR that completes them.

**Checkpoint at hour 6:** a real schedule is built from GLASS, replayed on test days, and shown in the app.
**If time gets tight, protect this order:** GLASS → scheduler → replay → dashboard → battery → postcode card → explanation agent → reality check.

---

## Everyone (hour 0–1)

- [ ] Install Python 3.11, create `.venv`, install requirements (§13)
- [ ] Read idea.md §3, §5 and §7.3 together; agree the shared inputs and outputs
- [ ] Pick the demo scenario: category, month (2023), consumption level, connection limit, number of vans, postcode
- [ ] Agree the UI framework and the LLM provider (Person 3 proposes both)
- [ ] Create `requirements.txt` and the empty package layout (`gridflex/`, `scripts/`, `tests/`, `ui/`) in one PR

---

## Person 1: Data + checking

**Hour 0–1: downloads**
- [ ] Put `GLASS_v1.1.parquet` in `data/raw/` and verify the SHA-256
- [ ] Download the four capacity-map files into `data/raw/capaciteitskaart/` with `curl -L` (§13); note the date
- [ ] Download Liander's SBI overview (xlsx), "Geaggregeerde SBI-profielen" (zip) and "K&O profielen" (zip) into `data/raw/liander_sbi/`

**Hour 1–4: GLASS profiles**
- [ ] `scripts/extract_glass.py`: lazy filtered read, one parquet per condition, summary printout (§7.3)
- [ ] Extract the demo conditions; check spread across samples and the kW range (§4.5); adjust the demo level if needed
- [ ] `profiles.py`: `load_condition`, `build_windows` (noon to noon, within one sample, working days only)
- [ ] `profiles.py`: `split_by_sample` (70/30 by `sample_id`, fixed seed) and `cautious_baseline`
- [ ] `tests/test_profiles.py`: windows never cross a month or sample; window count; no `sample_id` in both groups

**Hour 4–6: replay**
- [ ] `replay.py`: `replay()` with every flag from §5.8 and the verdict rule
- [ ] `tests/test_replay.py`: hand-built windows with a known overshoot give the right numbers
- [ ] Hand Person 3 a real `ReplayReport` for the demo scenario (**checkpoint**)

**Hour 6–10: capacity map**
- [ ] `scripts/prepare_grid_map.py`: CSVs (semicolon, comma decimals) → `grid_pc6.parquet`, `grid_areas.parquet`, `grid_projects.parquet`, `grid_map_meta.json`
- [ ] `grid_area.py`: `lookup(postcode) → AreaInfo`, including projects and the download date
- [ ] `tests/test_grid_area.py`: known postcode, lower-case with a space, unknown postcode, area with missing values
- [ ] Find 2–3 good demo postcodes: one red area in Liander's region with a waiting list and a fix year, one green area for contrast

**Hour 10–13: reality check**
- [ ] Check Liander's overview for SBI 49, 52 and 46: does a file exist, recommended profile, warning column. If not, use the logistics K&O profile (§4.3)
- [ ] `scripts/prepare_liander_sbi.py`: per-SBI (or K&O), per-month extracts of `median`, `p10`, `p90`, `mean`
- [ ] `reality.py`: `compare()`, rescaling both to the same monthly mean; correlation and mean absolute difference
- [ ] Write the one-line result for the demo, using the real number

**Hour 13–18**
- [ ] Data edge cases: missing days in a month, conditions with fewer windows, postcodes with no information
- [ ] Prepare and rehearse demo part 1 (problem, postcode card, GLASS band, reality check)

---

## Person 2: Optimisation

**Hour 1–4: vans**
- [ ] `fleet.py`: `Van` dataclass and `generate_fleet` (seeded; the first N vans are always the same)
- [ ] `naive.py`: immediate charging
- [ ] `scheduler.py`: `limit_profile()` and `optimize()` for vans only: overshoot, unmet and peak stages (§5.6)
- [ ] Test on a flat fake baseline until Person 1's real baseline is ready

**Hour 4–6: tests + charger sweep**
- [ ] `tests/test_scheduler.py`: easy, impossible, partial, presence, charger max, energy accounting, immediate charging breaks the limit
- [ ] `replay.py`: `charger_sweep()` (with Person 1)
- [ ] Run the demo scenario end to end with Person 1's baseline (**checkpoint**)

**Hour 6–10: battery + limit over the day**
- [ ] Add `Battery` to `optimize()`: charge/discharge, mode, energy balance, no export, end ≥ start (§5.6)
- [ ] Add the battery-throughput stage to the objective
- [ ] Extra off-peak capacity through `limit_profile()`; check it's only used inside its window
- [ ] Battery tests: never both at once, limits and balance, no export, battery never makes things worse
- [ ] Make sure replay uses the battery schedule and `C[t]` (with Person 1)

**Hour 10–13: battery sweep + speed**
- [ ] `replay.py`: `battery_sweep()` returning the smallest battery that brings risk under the tolerance
- [ ] Time a full solve, replay and sweep; cache results per input set; aim for under 1 s per solve
- [ ] Solver timeout: very short time limit → status `UNKNOWN`/`FEASIBLE`, reported honestly

**Hour 13–18**
- [ ] Edge cases: zero vans, a van that arrives after it leaves, a battery larger than needed, limit below baseline all day
- [ ] Pick the final demo numbers: the van count where it breaks, and the battery size that fixes it
- [ ] Prepare and rehearse demo part 2 (immediate vs. optimised, more vans, battery and off-peak capacity, sweep)

---

## Person 3: Dashboard + explanation

**Hour 0–1**
- [ ] Propose the UI framework against the criteria in §8.1; agree it with the team
- [ ] Propose the LLM provider against the criteria in §5.11; get an API key into `.env`

**Hour 1–4: shell**
- [ ] Dashboard shell with all inputs from §8 and a dummy demand chart
- [ ] If the UI is a separate frontend: API layer with the endpoints from §8.1, returning JSON
- [ ] Shared colours and labels: limit line, status colours, "synthetic data and simulation" footer

**Hour 4–6: first real results**
- [ ] Demand chart: p10–p90 band, cautious baseline, optimised charging, immediate charging, limit line `C[t]`
- [ ] Verdict banner and KPI row from the `ReplayReport` (**checkpoint**)

**Hour 6–10: full dashboard**
- [ ] Battery and off-peak capacity inputs; battery charge/discharge in the demand chart; stored-energy chart
- [ ] Van schedule heatmap with kWh needed, delivered and short
- [ ] Flags table in plain language
- [ ] "Your area" card from `AreaInfo`: colour, waiting list, fix year, projects, operator link, map date

**Hour 10–13: explanation + decision**
- [ ] `explain.py`: explanation agent with scenario, plan, flags and area as input; provider code only in `call_llm()`; `template_summary()` fallback on any error
- [ ] "What changed" explanation after each rerun (pass the previous `ReplayReport`)
- [ ] Follow-up question box about the current result
- [ ] Charger and battery sweep charts; "when it breaks" chart
- [ ] Approve/Reject and **Download schedule (CSV)**

**Hour 13–18**
- [ ] Reality-check chart (GLASS vs. Liander band) with its one-line result
- [ ] Loading states and error messages (no postcode match, solver timeout, API down)
- [ ] Record a fallback video of the full demo
- [ ] Prepare and rehearse demo part 3 (agent explanation, change two vans and explain what changed, follow-up question, risk timing)

---

## Before the demo (everyone, hour 16–18)

- [ ] All tests pass on `main`
- [ ] Every number in the demo script (§10) is replaced with the real output
- [ ] Attributions visible in the app (GLASS, Netbeheer Nederland, Liander)
- [ ] Full 4-minute run-through twice in a row without problems
- [ ] Fallback video ready on a laptop that isn't running the demo
