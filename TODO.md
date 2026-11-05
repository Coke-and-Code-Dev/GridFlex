# TODO

Tasks for the 18-hour build, split across three people. Section numbers (§) refer to [idea.md](idea.md). Tick items off in the PR that completes them.

**Checkpoint at hour 6:** a real schedule is built from GLASS, replayed on test days, and shown in the app.
**If time gets tight, protect this order:** GLASS → scheduler → replay → dashboard → battery → postcode card → explanation agent → reality check.
**While building,** everyone uses the shared development scenario (§9); the demo scenario is picked once the app works.

---

## Joshua: Data + checking

*Everything below is done. What is left for Joshua is at the end of this file, under "Joshua: remaining todo".*

**Hour 0–1: skeleton + downloads**
- [x] First PR: empty package layout (`gridflex/`, `api/`, `scripts/`, `tests/`) and an empty `requirements.txt`, so nobody else creates them
- [x] Put `GLASS_v1.1.parquet` in `data/raw/` and verify the SHA-256 (matches the value in `data/README.md`)
- [x] Download the four capacity-map files into `data/raw/capaciteitskaart/` with `curl -L` (§13); note the date (downloaded 2026-11-05)
- [x] Download Liander's SBI overview (xlsx), "Geaggregeerde SBI-profielen" (zip) and "K&O profielen" (zip) into `data/raw/liander_sbi/` (downloaded 2026-11-05, not yet extracted)

**Hour 1–4: GLASS profiles**
- [x] `scripts/extract_glass.py`: lazy filtered read, one parquet per condition, summary printout (§7.3)
- [x] Extract the development conditions; check spread across samples and the kW range (§4.5); adjust the development level if needed (level 1 kept: see §4.5)
- [x] `profiles.py`: `load_condition`, `build_windows` (noon to noon, within one sample, working days only)
- [x] `profiles.py`: `split_by_sample` (70/30 by `sample_id`, fixed seed) and `cautious_baseline`
- [x] `tests/test_profiles.py`: windows never cross a month or sample; window count; no `sample_id` in both groups

**Hour 4–6: replay**
- [x] `replay.py`: `replay()` with every flag from §5.8 and the verdict rule
- [x] `tests/test_replay.py`: hand-built windows with a known overshoot give the right numbers

**Hour 6–10: capacity map**
- [x] `scripts/prepare_grid_map.py`: CSVs (semicolon, comma decimals) → `grid_pc6.parquet`, `grid_areas.parquet`, `grid_projects.parquet`, `grid_map_meta.json`
- [x] `grid_area.py`: `lookup(postcode) → AreaInfo`, including projects and the download date
- [x] `tests/test_grid_area.py`: known postcode, lower-case with a space, unknown postcode, area with missing values
- [x] Find 2–3 good demo postcodes: one red area in Liander's region with a waiting list and a fix year, one green area for contrast (§9: `1181KJ` red; green contrast is `2291AA` in Westland, because every green postcode in Liander's area still has a waiting list)

**Hour 10–13: reality check**
- [x] Check Liander's overview for SBI 49, 52 and 46: does a file exist, recommended profile, warning column. If not, use the logistics K&O profile (§4.3) (49 and 52 have files and no warning; 46 has none and a warning, so logistics K&O)
- [x] `scripts/prepare_liander_sbi.py`: per-SBI (or K&O), per-month extracts of `median`, `p10`, `p90`, `mean`
- [x] `reality.py`: `compare()`, rescaling both to the same monthly mean; correlation and mean absolute difference
- [x] Write the one-line result for the demo, using the real number (§5.10: correlation 0.97 against SBI 52)

**Hour 13–18**
- [x] Data edge cases: missing days in a month, conditions with fewer windows, postcodes with no information (scan of all 96 conditions for 009 and 008 in §4.5: the real data has no gaps and at least 145 samples; tiny-condition and no-information cases are covered by tests)

### What Joshua's part does, explained simply (ELI10)

**The problem in one picture.** A business building is like a house with one fuse. Electric vans plug in every evening, and if too many charge at once the fuse "blows" (the site goes over its power limit). We want a charging timetable that stays under the fuse, and we want to know how often it could still go wrong. My job was the data: *what does the building normally use?* and *what is the local grid like?*

1. **Pretend days (GLASS).** We downloaded a huge file (13 GB) of computer-made electricity use: 150 pretend versions of each kind of business, for every day of the month. Nobody needs all of it at once, so `extract_glass.py` cuts out the small piece we use: transport and storage firms, January 2023, four size levels (about 1.5 MB each). It also checks the file's fingerprint (SHA-256), so we know the download isn't damaged.
2. **Evening-to-morning slices.** Vans charge overnight, so `profiles.py` cuts every month into slices that run noon to noon. A slice never mixes two customers or two months. That gives 3,150 slices per size level.
3. **Study set and exam set.** Like a teacher who keeps some exam questions secret, we plan with 70% of the pretend customers (105) and keep 30% (45 customers, 945 days) hidden for testing. We split by customer, not by day, because days of the same customer look too alike.
4. **The busy-day curve.** For every quarter of an hour we take the level that 9 out of 10 study days stay under. The charging plan must fit under that curve, so it leaves room for most busy days. (At size level 1 the building is quiet, at most 26 kW, so there is a lot of room under a 100 kW limit.)
5. **The fire drill.** `replay.py` takes a finished charging timetable and runs it on the hidden days. It counts how many days go over the limit, by how much and when, and which vans end up short of charge. Then it gives a verdict: fits, fits with risk, or doesn't fit. It can also show what happens if every van just plugs in at once; in my quick check, 10 vans did that and went over the limit on every hidden day.
6. **The grid card.** Type a postcode and `grid_area.py` looks it up in the grid operators' official map: red, orange, yellow or green, how many companies are waiting for more power, and when the operator expects a fix. 56% of Dutch postcodes are red. Careful details: postcodes on the border of two areas are flagged, and a made-up "fixed in 2099" date is ignored. Demo postcodes: `1181KJ` (Amstelveen: red, 29 waiting, fix 2032) and, for contrast, `2291AA` (Westland: green, nobody waiting).
7. **Is the pretend data believable?** We compare the pretend January working day with real measurements of Liander's real customers. The two curves rise and fall together: a similarity of 0.97 out of 1.00 against warehouses (SBI 52). Honest footnote: the pretend data was learned from Liander's data, so this shows the copy is good, not that it is an independent test.
8. **Safety net.** 65 automatic tests pass, and re-running my three data scripts gives identical files, so anyone can rebuild them.

**Not finished yet:** `replay()` has only run with a stand-in timetable, because Sunil's scheduler is not in `main` yet, and only January 2023 is extracted. Both are in the remaining todo below.

---

## Sunil: Optimisation

> Handoff from Joshua: read [HANDOFF.md](HANDOFF.md#for-sunil-optimisation) first.

**Hour 1–4: vans**
- [x] `fleet.py`: `Van` dataclass and `generate_fleet` (seeded; the first N vans are always the same)
- [x] `naive.py`: immediate charging
- [x] `scheduler.py`: `limit_profile()` and `optimize()` for vans only: overshoot, unmet and peak stages (§5.6)
- [x] Test on a flat fake baseline until Joshua's real baseline is ready

**Hour 4–6: tests + charger sweep**
- [x] `tests/test_scheduler.py`: easy, impossible, partial, presence, charger max, energy accounting, immediate charging breaks the limit
- [ ] `replay.py`: `charger_sweep()` (implemented; Joshua review pending)
- [x] Run the development scenario end to end with Joshua's baseline (**checkpoint**)

**Hour 6–10: battery + limit over the day**
- [x] Add `Battery` to `optimize()`: charge/discharge, mode, energy balance, no export, end ≥ start (§5.6)
- [x] Add the battery-throughput stage to the objective
- [x] Extra off-peak capacity through `limit_profile()`; check it's only used inside its window
- [x] Battery tests: never both at once, limits and balance, no export, battery never makes things worse
- [ ] Make sure replay uses the battery schedule and `C[t]` (implemented and tested; Joshua review pending)

**Hour 10–13: battery sweep + speed**
- [x] `replay.py`: `battery_sweep()` returning the smallest battery that brings risk under the tolerance
- [x] Time a full solve, replay and sweep; cache results per input set; aim for under 1 s per solve
- [x] Solver timeout: very short time limit → status `UNKNOWN`/`FEASIBLE`, reported honestly

**Hour 13–18**
- [ ] Edge cases: zero vans, a van that arrives after it leaves, a battery larger than needed, limit below baseline all day
- [ ] Pick the final demo numbers: the van count where it breaks, and the battery size that fixes it
- [ ] Prepare and rehearse demo part 2 (immediate vs. optimised, more vans, battery and off-peak capacity, sweep)

---

## Smriti: Dashboard + explanation

> Handoff from Joshua: read [HANDOFF.md](HANDOFF.md#for-smriti-dashboard-and-explanation) first.

**Hour 0–1**
- [x] Scaffold the React + TypeScript app in `ui/` and the API skeleton in `api/` (§8.1); both run locally
- [x] Pick the charting library (needs bands, stacked areas, heatmap, a limit line that changes over the day)

**Hour 1–4: shell**
- [ ] Dashboard shell with all inputs from §8 and a dummy demand chart
- [x] Implement the §8.1 API endpoints using the project library and type their frontend payloads.
- [ ] Debounced requests from sliders, loading state while the solver runs
- [x] Shared colours and labels: limit line, status colours, "synthetic data and simulation" footer

**Hour 4–6: first real results**
- [x] Demand chart: p10–p90 band, cautious baseline, optimised charging, immediate charging, limit line `C[t]`
- [x] Verdict banner and KPI row from the `ReplayReport` (**checkpoint**)

**Hour 6–10: full dashboard**
- [x] Battery and off-peak capacity inputs; battery charge/discharge in the demand chart; stored-energy chart
- [x] Van schedule heatmap with kWh needed, delivered and short
- [x] Flags table in plain language
- [x] "Your area" card from `AreaInfo`: colour, waiting list, fix year, projects, operator link, map date

**Hour 10–13: explanation + decision**
- [ ] Propose the LLM provider against the criteria in §5.11; agree it with the team; API key into `.env`
- [x] Grounded template summaries and follow-up answers from real replay results.
- [ ] `explain.py`: explanation agent with scenario, plan, flags and area as input; provider code only in `call_llm()`; `template_summary()` fallback on any error
- [x] "What changed" explanation after each rerun (pass the previous `ReplayReport`)
- [x] Follow-up question box about the current result
- [x] Charger and battery sweep charts; "when it breaks" chart
- [x] Approve/Reject and **Download schedule (CSV)**

**Hour 13–18**
- [x] Reality-check chart (GLASS vs. Liander band) with its one-line result
- [x] Loading states and error messages (no postcode match, solver timeout, API down)
- [ ] Record a fallback video of the full demo
- [ ] Prepare and rehearse demo part 3 (agent explanation, change two vans and explain what changed, follow-up question, risk timing)

---

- [x] Import a depot and its exact van requests from CSV, then optimize automatically.
- [x] Run multiple CSV sites independently and export a portfolio PDF with per-site charts.

## Before the demo (everyone, hour 13–18)

- [ ] Pick the demo scenario from the working app: sector, month, level, limit, number of vans, postcode (Joshua's demo postcodes, Sunil's break point and battery size)
- [ ] All tests pass on `main`
- [ ] Every number in the demo script (§10) is replaced with the real output
- [ ] Attributions visible in the app (GLASS, Netbeheer Nederland, Liander)
- [ ] Full 4-minute run-through twice in a row without problems
- [ ] Fallback video ready on a laptop that isn't running the demo

---

## Joshua: remaining todo

Moved here from Joshua's section above. Nothing else of Joshua's is open.

- [ ] Hand Smriti a real `ReplayReport` for the development scenario (**checkpoint**). Blocked until Sunil's `scheduler.py`, `fleet.py` and `naive.py` are in `main`. Then: run `replay(test, result, limit, van_names, immediate_power=naive_schedule(vans))` (snippet in [HANDOFF.md](HANDOFF.md)), save the report as JSON, and give it to Smriti. Sunil can also run it himself.
- [ ] Prepare and rehearse demo part 1 (problem, postcode card, GLASS band, reality check). Real numbers to use: 56% of postcodes red (78.7% in Liander's area); postcode `1181KJ` (29 requests, 5.8 MW, fix year 2032); reality check correlation 0.97 against SBI 52, with the "not independent" footnote.
- [ ] With Sunil: `charger_sweep()` and `battery_sweep()` in `replay.py` are listed as Sunil's items "with Joshua". Joshua's part is the replay side (same planning/test split and baseline for every point of the sweep) and reviewing the PR.
- [ ] Smriti, on request: helpers to serialise `ReplayReport` and `RealityCheck` for the API (NumPy to lists, NaN to null) and a p10–p90 band function for the demand chart. Not needed unless she asks.
- [ ] After the demo scenario is picked (see "Before the demo"): extract that condition and a few contrast conditions from GLASS in one separate PR. Only January 2023 is extracted now; the demo sector, month and level must come from what the sweeps show.
- [ ] The shared "Before the demo" items above are everyone's, including Joshua's: the demo postcode list is done (idea.md §9), the rest waits for the working app.
