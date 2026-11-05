# GridFlex AI: Plan. Stress-test. Explain.

**Can my business add EV chargers without a bigger grid connection?**

EY AI Week Hackathon · 5–6 November 2026 · Amsterdam · Team of 3 · 18 hours of building

GridFlex takes a business's postcode, sector, month and fleet, and:

1. **Shows the local grid situation:** is the area congested, how long is the queue for more capacity, and when is it expected to be fixed?
2. **Plans** a charging timetable for every van, plus an optional on-site battery, that stays under the site's connection limit.
3. **Stress-tests** that plan on realistic days it has never seen, and flags how often, when and by how much the site would still go over the limit, and which vans would end up short of charge.
4. **Explains** the result in plain language. A person approves or rejects it; nothing is switched automatically.

> Pitch line: *"We don't test your plan on one made-up day. We test it on every realistic day."*

Original concept: GridFlex AI by Smriti Sridhar (Leiden University).

---

## Contents

1. [The problem](#1-the-problem)
2. [The idea, explained simply](#2-the-idea-explained-simply)
3. [What the app does](#3-what-the-app-does)
4. [Data](#4-data)
5. [How it works](#5-how-it-works)
6. [Where the AI is](#6-where-the-ai-is)
7. [Implementation](#7-implementation)
8. [Dashboard](#8-dashboard)
9. [Team and build plan](#9-team-and-build-plan)
10. [Four-minute demo](#10-four-minute-demo)
11. [Stretch goals](#11-stretch-goals)
12. [Honesty and limitations](#12-honesty-and-limitations)
13. [Setup](#13-setup)
14. [References and attribution](#14-references-and-attribution)

The task list per person is in [TODO.md](TODO.md).

---

## 1. The problem

The Dutch electricity grid is full. In the grid operators' own capacity map (export downloaded 5 November 2026), **56% of all 6-digit postcodes in the Netherlands, and 79% in Liander's area, are marked red for new demand**: there is a shortage of transport capacity and a waiting list. Businesses there can't get a bigger connection, often for years. Many local areas list an expected fix date between 2029 and 2034.

At the same time, businesses are under pressure to electrify, for example by replacing diesel delivery vans with EVs.

A fixed connection limit (say 100 kW) is shared between the building's normal electricity use and any new EV chargers. If every van starts charging as soon as it arrives, the site goes over the limit. The question a facility manager actually has is:

> *"We can't get a bigger connection before 2032. We use about X MWh a month. Can we add 10 chargers under our 100 kW connection? With what schedule? Would a battery help? And how confident can we be?"*

Our angle comes from EY's June 2026 report *AI and energy: the two-way dependency*: the energy transition also depends on using existing capacity more intelligently, not just on building more grid.

## 2. The idea, explained simply

Imagine your house has **one power socket with a fuse**. Plug in too many things at once and the fuse blows.

A company's building works the same way. It has a **power limit** (say 100 kW), and the building's normal stuff (lights, computers, fridges) already uses part of it. In most of the Netherlands, you can't get a bigger fuse right now: there's a waiting list.

**The problem:** the company buys 10 electric vans. When the vans come back in the evening, everyone plugs in at the same time and the fuse blows (they go over the limit).

**What our app does:**

1. **"Where are you?"** You type your postcode. The app shows whether your area's grid is full, how many businesses are waiting, and when it might be fixed.
2. **"Tell me about your building."** You say what kind of business you are and which month. We have 100 pretend versions of a business like yours, made by an AI, so we know what normal days and busy days look like. We also check them against real measurements, so we know they're realistic.
3. **"Let me make a plan."** The app works out a charging timetable: van 1 charges 18:00–21:00, van 2 charges 21:00–23:00, and so on. It's like taking turns on the swings, so everything stays under the limit and all vans are full by morning.
4. **"Want a battery?"** A battery is like a water tank. It fills up when the building is quiet and helps out when it's busy, so more vans can charge without going over the limit.
5. **"Let me test the plan."** We try the timetable on pretend days the planner has never seen, like a fire drill on 100 different days. Then we tell you:
   - ✅ "It worked on 97 out of 100 days."
   - ⚠️ "On 3 days it went a bit over the limit, around 6 pm."
   - ❌ "Van 7 didn't get fully charged."
6. **"Want more vans, or a bigger battery?"** Move a slider and see when the plan starts breaking, or how big a battery you'd need.
7. **A person decides.** The app only gives advice. The manager says yes or no.

**In one sentence:** the app finds a charging timetable for your vans (with an optional battery) and tells you how often it might still blow the fuse.

## 3. What the app does

| Step | User does | GridFlex does |
|---|---|---|
| 1. Locate the site | Types a postcode | Looks up the area's congestion status, waiting list, expected fix year and planned grid projects (grid capacity map) |
| 2. Describe the site | Picks sector, month, consumption level, connection limit | Loads ~100 realistic monthly electricity profiles for that kind of business (GLASS) and shows how they compare with real measured profiles for that sector (Liander) |
| 3. Describe the fleet | Picks number of vans, arrival/departure times, energy needed, charger power | Generates editable charging requests |
| 4. Add options | Optionally adds a battery (size, power) and extra off-peak capacity (e.g. +50 kW from 22:00 to 06:00) | Includes them in the plan |
| 5. Get a plan | Clicks **Optimize** | Builds one charging and battery timetable that stays under the limit for a cautious busy day |
| 6. See the risk | Reads the verdict | Replays the plan on held-out realistic days and flags days over the limit, worst overshoot, when it happens, vans left short |
| 7. Explore | Drags the charger or battery slider | Shows where adding chargers stops being safe, and the smallest battery that makes it safe again |
| 8. Understand | Reads or asks about the result | The explanation agent explains the computed numbers in plain language |
| 9. Decide | Approves or rejects the plan | Records the decision; exports the schedule as CSV |

**Example output:**

> 📍 **Your area (Amstelveen) is red:** 29 requests are waiting for 5.8 MW, and the grid operator expects to resolve it in 2032.
> ✅ **10 chargers work in January.** Here is the schedule.
> ⚠️ It goes over the 100 kW limit on **3% of days** (worst: 107 kW at 18:15). Most overshoots happen between 17:30 and 19:00.
> 🔋 A **60 kWh battery** brings that down to **0.5% of days**.

The headline chart: **number of chargers (x) vs. chance of going over the limit (y)**, with and without the battery.

## 4. Data

### 4.1 GLASS: synthetic business electricity use (main dataset)

**GLASS** (Generative-AI Large-customer Smart-meter Samples), see [data/README.md](data/README.md). It's synthetic electricity use from Dutch large business customers with grid connections of 60–160 kW, so a 100 kW limit is realistic. It was generated by a flow-matching model (SmartMeterFM) trained on Liander smart-meter data.

- 43M rows (≈13 GB). Each row is **one day** of **one synthetic customer**: 96 values (one per 15 minutes) in kW.
- Each sample belongs to a **condition**: `scenario` × `category` × year-month × `level`.
- **≥100 samples per condition.** This is the key feature we use.
- **Rows with the same `scenario`, `category`, year-month, `level_id` and `sample_id` form one continuous month** for the same synthetic customer. Days within a month can be joined; days across months cannot (sample 0 in January is not the same customer as sample 0 in February).

| Field | Our use |
|---|---|
| `scenario` | `consumption_only`. `hybrid_net_consumption` (with rooftop solar) is a stretch goal. |
| `category` | Business sector. A warehouse or depot is `009` (transport and storage, ISIC H) or `008` (wholesale and retail, ISIC G). Offices `014`, hospitality `010`, etc. |
| `date` | Year-month selects the condition; day of the week lets us keep working days only. |
| `level_id` / `level_value` | Consumption size: 4 levels per month; `level_value` is the target kWh for the month. Shown to the user as "your monthly use". |
| `sample_id` | The ~100 alternative customers; also the unit we split on (§5.3). |
| `00:00:00` … `23:45:00` | 15-minute power in kW. |

### 4.2 Grid capacity map: is the local grid full?

The **capaciteitskaart** from Netbeheer Nederland (all Dutch grid operators). It's the official, public map of available transport capacity for large connections (above 3×80 A, which covers 60–160 kW sites). It's published as semicolon-separated CSVs with comma decimals:

| File | Size | What we use |
|---|---|---|
| `congestie_pc6.csv` | ~47 MB, 462,940 rows | Per 6-digit postcode: `afname` (offtake colour code: −1 unknown, 0 transparent, 1 yellow, 2 orange, 3 red), `voedingsgebied_id` / `voedingsgebied_naam` (supply area), `RNB_postcode` (grid operator), municipality, province |
| `voedingsgebieden.csv` | ~90 kB, ~600 rows | Per supply area: available vs. needed capacity for offtake (MW), number of waiting requests and waiting-list MW (`unieke_verzoeken_afname`, `wachtrij_afname`), expected year the offtake shortage is resolved (`jaartal_opgelost_afname`), link to the operator's congestion page (`congestie_url`) |
| `projecten.csv` | ~125 kB, ~930 rows | Planned grid reinforcements per area (`gebied_id`): name, expected delivery year/quarter, phase |
| `brondata_documentatie.txt` | 4 kB | Field definitions |

Join keys: postcode → `voedingsgebied_id` → `voedingsgebieden.voedingsgebied_id` and `projecten.gebied_id` (~83% of projects match an area). Downloads come from `https://capaciteitskaart.netbeheernederland.nl/api/download/<file>`; use `curl -L` because they redirect.

How it fits in: the postcode card at the top of the dashboard (§8) explains *why* the business has to work within its current connection, and the off-peak capacity option (§5.5) reflects the map's own wording that in red areas "alternative transport rights" or off-peak flexible contracts may still be possible.

What `scripts/prepare_grid_map.py` found and decided (export of 5 November 2026):

- 36 rows have no postcode (supply-area rows only): dropped. 462,687 postcodes remain; **56.0% are red nationally, 78.7% in Liander's area**.
- **217 postcodes appear twice** because they straddle two supply areas, usually of two operators, and 116 of those disagree on the colour. We keep the **most severe** row (the cautious choice) and set `ambiguous` so the card can say the postcode spans more than one area.
- One area (HMZ) gives 2099 as the year its shortage is resolved. That is a placeholder, so it is treated as "no date" (`jaartal_opgelost_afname` above 2050 is ignored). The other fix years run 2026–2038, and 320 of 602 areas have none.
- Missing or negative values (`-1`) in the area table become `None`. A transparent (green) postcode can still sit in an area with a waiting list: the colour is per postcode and the queue is per supply area, so the card shows both. 159 of 933 projects belong to TenneT congestion areas that are not in `voedingsgebieden.csv` and never match.
- Only offtake (`afname`) is kept, not feed-in.

Rules:
- The map is **indicative and a snapshot**. It shows the area a business is in, not a decision about a specific connection. Always say "check with your grid operator".
- Record the download date and show it in the app. The map is updated at least quarterly.
- Some areas have missing values (empty or −1). Show "no information" rather than guessing.

### 4.3 Liander SBI profiles: reality check for GLASS

Liander's open dataset **"Verbruiksprofielen grootverbruikaansluitingen elektriciteit 2023"**: **real** measured 15-minute profiles of Liander's large customers in 2023, aggregated per SBI code (the Dutch version of ISIC/NACE; 203 electricity profiles). Each customer's year is first scaled to its own peak (0–1). One CSV per SBI code then gives, for every quarter-hour of 2023, the `min`, `p10`, `median`, `mean`, `p90` and `max` across those scaled customers, plus `*_renorm` versions rescaled so the profile's own peak is 1. Values are relative, not kW.

An SBI code only gets a file if it has at least 10 customers and its profile predicts noticeably better than Liander's standard profile. Otherwise use Liander's **standard K&O profiles** (in the same dataset) for broad categories: agrarian, datacenter, industry, office/education, **logistics**, other and greenhouse horticulture.

How we use it: GLASS is synthetic, so we show that it looks like reality. For the chosen sector and month, compare the **shape** of GLASS's typical day (median and p10–p90 band) with Liander's real 2023 profile for the matching SBI codes:

| GLASS category | Matching SBI codes | Fallback K&O profile |
|---|---|---|
| `009` transport and storage (H) | `49` land transport, `52` warehousing and support activities | logistics |
| `008` wholesale and retail (G) | `46` wholesale | logistics |

Rules:
- Compare **shapes only**: rescale both to the same monthly mean before comparing. Liander's values are relative to each customer's yearly peak, GLASS samples are monthly kW, and Liander doesn't say which connection sizes are included.
- Customers with any feed-in (e.g. solar) are excluded from Liander's profiles, which matches GLASS `consumption_only`.
- Use the overview file to pick the recommended profile per SBI code, and respect its warning column.
- Attribution required: "Liander" plus the publication year.

**Checked in the overview file (5 November 2026):**

| SBI | Time series | Warning | Recommended profile | What we use |
|---|---|---|---|---|
| `49` land transport | 141 | none | `KO_LOGISTIEK` | the SBI 49 aggregate (it has a p10–p90 band) |
| `52` warehousing and support | 100 | none | `KO_LOGISTIEK` | the SBI 52 aggregate (it has a p10–p90 band) |
| `46` wholesale | 0 | "fewer than 10 time series, less reliable" | none | no file in the zip: use the logistics K&O profile |

Liander's overview recommends the standard logistics profile for SBI 49 and 52 (it lists no correlation for the SBI aggregate; we read that as the aggregate not beating the standard profile at predicting individual customers, which the overview does not spell out). We want to compare the *distribution* of customers, so for `009` we show the SBI aggregates (with their p10–p90 band) and keep the logistics K&O profile as a third reference. The K&O profile is a single curve with no band. For `008` the logistics K&O profile is the only comparator. `prepare_liander_sbi.py` reads the warning column and skips a code that has one.

### 4.4 Fleet requests: transparent assumptions

We found no open dataset of van depot charging sessions at 15-minute resolution, so van requests are generated from clear, editable assumptions:

| Field | Default | Why |
|---|---|---|
| Arrival | 17:00–19:00 | Delivery vans return at the end of the working day |
| Departure | 06:00–07:00 | And leave early morning |
| Energy needed | 30–40 kWh per van | A day's urban delivery route |
| Charger power | 11 kW | Standard AC depot charger |

All values are sliders or editable in the van table, and the app labels them as assumptions. Generation uses a fixed seed, so the first N vans are always the same (needed for the charger sweep).

### 4.5 Things to check early

- **Spread across GLASS samples.** Some conditions have very low variance. If the samples are almost identical, the stress test says little; pick another level or category.
- **kW range.** Check that the chosen level's typical use fits a 60–160 kW connection, and set the default limit from the data.
- **Monthly totals** may differ from `level_value`. If we display totals, compute them from the 15-minute values.
- **Liander profile availability** for SBI 49, 52 and 46 (does a file exist; warning column). If not, switch the reality check to the logistics K&O profile.

**Checked for the development scenario (category `009`, January 2023, run on 5 November 2026):**

- Each condition has **150 samples × 31 days**, not ~100. A working-day window count is 21 per sample (3,150 windows); the 70/30 split gives 105 planning and 45 test samples (945 test windows).
- Every sample's monthly energy equals `level_value` (ratio 1.00), so samples differ in **peaks and daily shape, not in monthly total**. Spread is therefore measured on daily peaks (CV 0.32 at level 1); the CV of mean power is ~0 by construction.
- **Level 1 fits a 100 kW limit:** mean 10.8 kW, mean daily peak 26 kW, cautious baseline (p90) never above 26 kW, and the baseline alone exceeds 100 kW on 0.7% of test windows. Level 2 also fits (cautious baseline up to 49 kW). Level 3 does not: its baseline alone is over 100 kW on 21.5% of test windows, so it would need a higher limit. The development level stays at 1.

## 5. How it works

### 5.1 Pipeline

```text
Postcode ──► Grid capacity map ──► "Your area" card
                                    (congestion, queue, fix year, projects)

GLASS extract (~100 samples × ~30 days)
       │
       ▼
Noon-to-noon windows ──► Split by customer: 70% planning / 30% test
       │                          │                     │
       │                          ▼                     │
       │                 Cautious baseline              │
       │                 (90th percentile per slot)     │
       │                          │                     │
       │   Van requests ─────────►│                     │
       │   Battery + limit ──────►▼                     │
       │                 CP-SAT scheduler               │
       │                 (vans + battery)               │
       │                          │                     │
       │                          ▼                     ▼
       │                 Fixed plan ──────────► Replay on test windows
       │                                                │
       ▼                                                ▼
Reality check vs Liander                Flags + verdict + sweeps
                                                        │
                                                        ▼
                                        Dashboard ──► Explanation agent
                                                        │
                                                        ▼
                                              Person approves / rejects
```

### 5.2 The scheduling window (noon to noon)

Vans return in the evening and leave early in the morning, so charging crosses midnight. The scheduling window is **24 hours from 12:00 to 12:00 the next day** (96 slots of 15 minutes). The start hour is configurable.

A **baseline window** is the second half of day *d* (slots 48–95) joined to the first half of day *d+1* (slots 0–47), **within the same monthly sample**. That's allowed because a sample is one continuous month. Each sample gives ~29–30 windows. By default we keep only windows that start on a working day (Mon–Fri).

### 5.3 Planning and test split

Split **by customer (`sample_id`)**, never by day, because days from the same customer are too alike:

- **Planning group (70% of samples):** used to build the cautious baseline.
- **Test group (30% of samples):** used only to replay the finished plan.

This way the risk numbers describe days the planner has never seen. With ~100 samples × ~21 working days, the test group still holds **~600 realistic days**. Use a fixed random seed for the split.

### 5.4 Cautious baseline

For each of the 96 slots, take the q-th percentile (default **q = 0.90**) across all planning windows. The scheduler plans against this curve, so it already leaves room for most busy days. q is a slider: higher is safer but fits fewer chargers.

### 5.5 Connection limit over the day

The limit `C[t]` can change during the day:

- **Firm limit** (default 100 kW) in every slot.
- **Optional extra off-peak capacity:** e.g. +50 kW between 22:00 and 06:00. This represents the off-peak or time-bound contracts grid operators may offer in congested areas. The exact terms always come from the grid operator; GridFlex lets the user test "would that be enough?".

Every step (scheduler, replay, charts) uses `C[t]`, never a single number.

### 5.6 The scheduler (Google OR-Tools CP-SAT)

**Inputs**

- `B[t]`: cautious baseline in kW, t = 0…95
- `C[t]`: connection limit in kW per slot
- Per van v: arrival slot `a_v`, departure slot `d_v`, energy needed `E_v` kWh, charger max `P_v` kW
- Optional battery: capacity `E_bat` kWh, max power `P_bat` kW, round-trip efficiency `η` (default 0.90), starting charge `s0` (default 50%)

**Variables** (integers)

- `p[v,t]` ∈ [0, P_v] kW if `a_v ≤ t < d_v`, otherwise fixed to 0
- `u[v]` ≥ 0: unmet energy, in kW·slot units (1 unit = 0.25 kWh)
- `ch[t]`, `dis[t]` ∈ [0, P_bat] kW: battery charging and discharging
- `mode[t]` ∈ {0, 1}: 1 = battery may charge, 0 = battery may discharge
- `soc[t]` ∈ [0, 10,000 · E_bat]: stored energy, in units of 0.0001 kWh, so 1 kW for one slot = 2,500 units
- `o[t]` ≥ 0 kW: unavoidable overshoot. Only non-zero when the building alone is above the limit and the battery can't cover it.

**Constraints**

- **Grid limit:** `ceil(B[t]) + Σ_v p[v,t] + ch[t] − dis[t] ≤ C[t] + o[t]` for every t. Slots with `o[t] > 0` are flagged as "baseline alone exceeds the limit". The overshoot variable keeps the model solvable in those cases, instead of returning "infeasible" with no plan.
- **Van energy:** `need_v = ceil(4 · E_v)`, `Σ_t p[v,t] + u[v] ≥ need_v`, `Σ_t p[v,t] ≤ need_v`.
- **Battery never charges and discharges at once:** `ch[t] ≤ P_bat · mode[t]`, `dis[t] ≤ P_bat · (1 − mode[t])`.
- **Battery energy balance:** `soc[t+1] = soc[t] + round(2500 · η) · ch[t] − 2500 · dis[t]`, with `soc[0] = s0`. Efficiency losses are applied when charging.
- **No export:** `dis[t] ≤ floor(B[t]) + Σ_v p[v,t]`. The battery only powers the site, never the grid.
- **No borrowing from tomorrow:** `soc[96] ≥ soc[0]`.

**Objective (lexicographic, solved in stages)**

1. Minimize total overshoot `Σ_t o[t]`. The plan never goes over the limit just to charge vans.
2. Fix that, then minimize total unmet energy `Σ_v u[v]`.
3. Fix that, then minimize the peak grid use `max_t (ceil(B[t]) + Σ_v p[v,t] + ch[t] − dis[t])`.
4. Fix that, then minimize battery throughput `Σ_t (ch[t] + dis[t])`, so the battery doesn't cycle for no reason.

Time limit: 10 s per stage. Report the solver status (optimal, feasible, infeasible, unknown); a time limit doesn't prove optimality.

**Rounding convention:** integer kW per 15-minute slot; energy needs rounded *up* to the nearest 0.25 kWh. State this in the UI.

### 5.7 Immediate charging (for comparison)

Each van charges at full power from arrival until full or departed, with no battery. This is what happens without GridFlex, and it should visibly go over the limit in the demo.

### 5.8 Replay and flags

Take the fixed plan (van charging `S[t] = Σ_v p[v,t]`, battery `ch[t]`, `dis[t]`) and add it to **every test window** `W_i[t]`:

`grid_i[t] = max(0, W_i[t] + S[t] + ch[t] − dis[t])`

| Flag | Definition |
|---|---|
| **Days over limit** | Share of test windows where any slot has `grid_i[t] > C[t]` |
| **Worst overshoot** | `max_i,t (grid_i[t] − C[t])` in kW, with its time |
| **When** | Count of over-limit days per time slot |
| **Overshoot energy** | Mean kWh above the limit per affected day |
| **Baseline alone over limit** | Share of test windows where `W_i[t] > C[t]` even with no vans. Reported separately: it's not the chargers' fault. |
| **Vans short** | Per van: `u[v] / 4` kWh short at departure (from the schedule) |
| **Immediate-charging comparison** | The same "days over limit" and "worst overshoot" for §5.7 |

**Verdict** (risk tolerance is a setting, default 5%):

- ✅ **Fits:** no van is short and days over limit ≤ tolerance
- ⚠️ **Fits with risk:** no van is short but days over limit > tolerance
- ❌ **Doesn't fit:** at least one van is short

The plan is replayed as a fixed timetable. A real charging controller could react on the day, so these risk numbers are on the cautious side.

### 5.9 Sweeps

- **Charger sweep:** for N = 1 … N_max, take the first N vans of the seeded fleet, solve, replay, and record days over limit and kWh short. Run it with and without the battery.
- **Battery sweep:** for battery sizes 0, 20, 40, … kWh, solve and replay, and report the **smallest battery that brings the risk under the tolerance**.

Cache results per input set. The scheduler is small (≤ 30 vans × 96 slots), so each solve should take well under a second.

### 5.10 Reality check

For the chosen category and month, compare GLASS (all samples) with Liander's 2023 profile for the same month (§4.3), using working days only on both sides:

- Rescale both to the same monthly mean.
- Compare the typical-day median shape (correlation and mean absolute difference), and overlay the p10–p90 bands.
- Show it as a small chart with one sentence. Real result for the development scenario (category `009`, January 2023, level 1, 22 working days, 150 GLASS samples): *"GLASS's synthetic transport and storage sites follow the real 2023 Liander profile for SBI 52 (warehousing and support activities) closely (correlation 0.97, mean difference 0.07 of the average load)."* Against SBI 49 (land transport) the correlation is 0.93 (mean difference 0.20); against the standard logistics profile 0.97 (0.10). Other levels give 0.97–0.99 against SBI 52. `reality.summary()` builds the sentence from the computed numbers.
- GLASS's percentiles are taken across samples at each quarter-hour of each working day and averaged over the days, which is how Liander's p10/median/p90 are built (across customers). The typical day runs midnight to midnight.
- This is **not an independent validation**: GLASS was generated by a model trained on Liander smart-meter data, so a good match shows it reproduces that data. Say so when showing the chart.

### 5.11 Explanation agent

An LLM-based agent gets the scenario, the checked plan and the computed flags, and writes a short plain-language explanation: why charging moved later, how the battery helped, where the risk is. The user can ask follow-up questions about the current result ("why is van 7 short?"). When the user changes an input (slider or van table), the app reruns the scheduler and replay first, and the agent then explains what changed compared with the previous plan. The agent never calculates or invents numbers. If the API is unavailable, a template-based summary of the same numbers is shown instead.

**LLM provider: to be decided** before work on the explanation agent starts. Smriti (dashboard and explanation) proposes one and the team agrees. Whatever we pick has to:

- Answer within a few seconds, so the demo doesn't stall.
- Support structured input and output (JSON in, text or JSON out), and tool or function calling if we build the what-if assistant (§11).
- Have an API key the team can get today, with enough free or paid quota for development and the demo.

To keep the choice open, `explain.py` hides the provider behind one small function, so switching means changing one file and one key in `.env`.

## 6. Where the AI is

| Layer | What it does |
|---|---|
| **Generative AI (GLASS / SmartMeterFM)** | A flow-matching model trained on real Dutch smart-meter data generates the 100+ realistic futures for each business. We verify them against real measurements (§5.10). |
| **AI planning (OR-Tools CP-SAT)** | Constraint programming finds the best charging and battery timetable under hard rules. |
| **Explanation agent (LLM, provider to be decided)** | Explains the computed results and what changed between plans to a non-expert, and answers follow-up questions, grounded only in our numbers. |
| **Human in control** | The facility manager reviews the flags and approves or rejects. |

In one line: *generative AI imagines the futures, an AI planner finds a plan that fits them, and an AI agent explains it, while a person decides.*

## 7. Implementation

### 7.1 Stack

- **Backend:** Python 3.11 · Polars · NumPy · OR-Tools (CP-SAT) · pytest · Pydantic for shared inputs and API models · FastAPI for the JSON API (suggested; it reuses the Pydantic models)
- **Frontend:** React + TypeScript (§8.1)
- **Explanation agent:** LLM provider **to be decided** (§5.11)

### 7.2 Repository layout

```
ey_hackathon/
├── idea.md                ← this document
├── TODO.md                ← tasks per person
├── AGENTS.md              ← rules for humans and AI agents
├── requirements.txt       ← Python dependencies, filled in as we build
├── data/
│   ├── README.md          ← GLASS dataset card
│   ├── raw/               ← downloads: GLASS parquet, capacity-map CSVs, Liander zips (git-ignored)
│   └── processed/         ← small extracts (committed, so the demo works offline)
├── scripts/
│   ├── extract_glass.py       ← GLASS → per-condition extracts
│   ├── prepare_grid_map.py    ← capacity-map CSVs → compact parquet
│   └── prepare_liander_sbi.py ← Liander SBI CSVs → per-SBI, per-month extracts
├── gridflex/
│   ├── __init__.py
│   ├── profiles.py        ← load extracts, noon-to-noon windows, split, percentiles
│   ├── grid_area.py       ← postcode lookup in the capacity map
│   ├── fleet.py           ← van requests + seeded generator
│   ├── naive.py           ← immediate-charging comparison
│   ├── scheduler.py       ← CP-SAT model (vans + battery + limit over the day)
│   ├── replay.py          ← stress test, flags, verdict, sweeps
│   ├── reality.py         ← GLASS vs Liander comparison
│   └── explain.py         ← explanation agent (LLM provider to be decided) + template fallback
├── api/
│   ├── main.py            ← JSON endpoints (§8.1), calls gridflex/
│   └── schemas.py         ← request/response models
├── ui/                    ← React + TypeScript dashboard (§8.1)
│   ├── package.json       ← frontend dependencies, filled in as we build
│   └── src/
└── tests/
    ├── test_profiles.py
    ├── test_grid_area.py
    ├── test_scheduler.py
    └── test_replay.py
```

### 7.3 Modules and interfaces

**`scripts/extract_glass.py`**

- CLI: `python scripts/extract_glass.py --categories 009 008 --months 2023-01 2023-07 --levels 0 1 2 3`
- Uses `pl.scan_parquet(...)` with filters on `scenario`, `category`, `date` and `level_id`, so it never loads the full 43M rows.
- Writes `data/processed/glass_{category}_{yyyy-mm}_L{level}.parquet`.
- Prints per condition: number of samples, mean/p10/p90 of daily peak kW, and spread across samples.
- Verifies the raw file's SHA-256 against [data/README.md](data/README.md).
- Prefer 2023 months, so the reality check (§5.10) compares like with like.

**`scripts/prepare_grid_map.py`**

- Reads the four capacity-map files from `data/raw/capaciteitskaart/` (semicolon-separated, comma decimals).
- Writes `data/processed/grid_pc6.parquet` (postcode, offtake colour, area id, area name, operator, municipality), `grid_areas.parquet` and `grid_projects.parquet`, plus a `grid_map_meta.json` with the download date.

**`scripts/prepare_liander_sbi.py`**

- CLI: `python scripts/prepare_liander_sbi.py --sbi 49 52 KO_LOGISTIEK --months 2023-01`. Codes are SBI codes or K&O profile names (`KO_…`).
- Reads the chosen CSVs straight from the two Liander zips (no extraction needed) and the overview xlsx. A code the overview warns about, or that has no file (e.g. `46`), is skipped with the reason; use `KO_LOGISTIEK` instead.
- Writes `data/processed/liander_sbi_{code}_{yyyy-mm}.parquet` with `timestamp` and the quarter-hour `median`, `p10`, `p90`, `mean` for that month (a K&O profile fills only `mean`), and `liander_sbi_meta.json` with the source, attribution and the overview's findings. Values are relative, not kW.

**`gridflex/profiles.py`**

```python
@dataclass(frozen=True)
class Condition:
    category: str
    month: str                          # "YYYY-MM"
    level: int                          # level_id 0-3
    level_value_kwh: float | None = None  # target kWh for the month, for "≈ X MWh/month"

@dataclass
class Windows:
    values: np.ndarray                  # (n_windows, 96) kW; slot 0 = start_hour:00
    sample_ids: np.ndarray              # (n_windows,)
    dates: np.ndarray                   # (n_windows,) datetime64[D], the date each window starts on
    start_hour: int = 12                # has __len__ and select(mask)

def load_condition(category: str, month: str, level: int) -> pl.DataFrame
def build_windows(df, start_hour: int = 12, working_days_only: bool = True) -> Windows
    # A window needs day d+1 of the same sample and month; days missing from the data drop the windows spanning them.
def split_by_sample(windows: Windows, test_share: float = 0.3, seed: int = 42) -> tuple[Windows, Windows]
def cautious_baseline(planning: Windows, q: float = 0.90) -> np.ndarray  # (96,)
def available_conditions() -> list[Condition]
```

**`gridflex/grid_area.py`**

```python
@dataclass
class AreaInfo:
    postcode: str
    status: Literal["unknown", "available", "limited", "under_study", "shortage"]  # colour −1/0/1/2/3
    area_name: str | None
    operator: str | None
    capacity_mw: float | None        # aanwezige_transportcapaciteit_afname
    needed_mw: float | None          # benodigde_transportcapaciteit_afname
    queue_requests: int | None
    queue_mw: float | None
    expected_fix_year: int | None    # jaartal_opgelost_afname
    projects: list[Project]          # Project(name, expected: "2032 - Q4", phase)
    info_url: str | None
    data_date: str                   # download date of the map
    municipality: str | None = None
    province: str | None = None
    ambiguous: bool = False          # postcode lies in more than one supply area; the most severe is shown
    note: str | None = None          # extra remark from the grid operator ("info"), if any

def lookup(postcode: str) -> AreaInfo | None   # normalises "1234 ab" → "1234AB"
```

**`gridflex/fleet.py`**

```python
@dataclass
class Van:
    name: str
    arrival_slot: int      # relative to window start
    departure_slot: int
    energy_kwh: float
    charger_kw: int = 11

def generate_fleet(n: int, seed: int = 42,
                   arrival=("17:00", "19:00"), departure=("06:00", "07:00"),
                   energy=(30, 40), charger_kw=11, start_hour=12) -> list[Van]
```

**`gridflex/scheduler.py`**

```python
@dataclass
class Battery:
    capacity_kwh: float
    power_kw: int
    efficiency: float = 0.90
    start_soc: float = 0.5        # share of capacity

@dataclass
class ScheduleResult:
    power: np.ndarray             # (n_vans, 96) integer kW
    battery_charge: np.ndarray    # (96,) kW, zeros without battery
    battery_discharge: np.ndarray # (96,) kW
    battery_soc_kwh: np.ndarray   # (97,)
    unmet_kwh: np.ndarray         # (n_vans,)
    peak_kw: float
    status: str                   # "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN"
    blocked_slots: list[int]      # slots with o[t] > 0: baseline alone exceeds the limit
    solve_seconds: float

def limit_profile(firm_kw: float, extra_kw: float = 0, extra_window=("22:00", "06:00"),
                  start_hour: int = 12) -> np.ndarray  # (96,)
def optimize(baseline: np.ndarray, limit: np.ndarray, vans: list[Van],
             battery: Battery | None = None, time_limit_s: float = 10.0) -> ScheduleResult
```

**`gridflex/naive.py`**

```python
def naive_schedule(vans, n_slots=96) -> np.ndarray  # (n_vans, 96) kW
```

**`gridflex/replay.py`**

```python
@dataclass
class ReplayReport:
    days_over_pct: float
    worst_overshoot_kw: float
    worst_overshoot_time: str
    over_by_slot: np.ndarray          # (96,) count of over-limit days per slot
    mean_overshoot_kwh: float
    baseline_alone_over_pct: float
    vans_short: list[tuple[str, float]]   # one entry per van: (name, kWh short; 0.0 if fully charged)
    verdict: Literal["fits", "fits_with_risk", "does_not_fit"]
    n_windows: int = 0                    # test windows replayed
    immediate: ImmediateReplay | None = None  # §5.7 comparison, set when immediate_power is passed

@dataclass
class ImmediateReplay:
    days_over_pct: float
    worst_overshoot_kw: float
    worst_overshoot_time: str

# days_over_pct and baseline_alone_over_pct are percentages (0-100); tolerance is a fraction (0.05 = 5%).
# worst_overshoot_time is "HH:MM" on the clock (from Windows.start_hour), "" if the limit is never exceeded.
# A slot exactly at the limit is not over it. replay() reads only power, battery_charge, battery_discharge
# and unmet_kwh from the result (structural SchedulePlan in replay.py), so ScheduleResult satisfies it as is.
def replay(test: Windows, result: ScheduleResult, limit: np.ndarray,
           van_names: list[str], tolerance: float = 0.05,
           immediate_power: np.ndarray | None = None) -> ReplayReport
def replay_immediate(test: Windows, immediate_power: np.ndarray, limit: np.ndarray) -> ImmediateReplay
def charger_sweep(planning, test, limit, fleet, n_max, battery=None) -> pl.DataFrame
def battery_sweep(planning, test, limit, vans, sizes_kwh, power_kw) -> pl.DataFrame
```

**`gridflex/reality.py`**

```python
@dataclass
class RealityCheck:
    sbi_code: str                 # "49", "52" or a K&O name such as "KO_LOGISTIEK"
    correlation: float            # of the two typical-day median shapes
    mean_abs_diff: float          # on mean-rescaled profiles (both have mean 1.0)
    glass_band: np.ndarray        # (3, 96): p10, median, p90 of a typical working day, midnight to midnight
    liander_band: np.ndarray      # (3, 96); p10 and p90 rows are NaN when liander_has_band is False
    liander_has_band: bool = True # False for a K&O profile (one curve); the API should send null, not NaN
    category: str = ""; month: str = ""; level: int = 1
    n_glass_samples: int = 0; n_glass_days: int = 0; n_liander_days: int = 0

def compare(category: str, month: str, sbi_code: str, level: int = 1) -> RealityCheck
def compare_all(category: str, month: str, level: int = 1) -> list[RealityCheck]  # every configured source with an extract
def summary(check: RealityCheck) -> str   # one plain sentence from the computed numbers (no LLM)
```

**`gridflex/explain.py`**

```python
def explain(scenario: dict, result: ScheduleResult, report: ReplayReport,
            area: AreaInfo | None, previous: ReplayReport | None = None,
            question: str | None = None) -> str
    # Explains the result, what changed vs. `previous`, or answers `question`.
    # Falls back to template_summary() on any error.
def call_llm(system: str, user: str) -> str   # the only provider-specific code
def template_summary(...) -> str
```

### 7.4 Tests (must pass before the demo)

| Test | Expectation |
|---|---|
| Easy case: high limit, few vans | Every van fully charged, 0 kWh short |
| Impossible case: limit below baseline everywhere | Doesn't crash; returns a plan; every van fully short; all slots blocked |
| Partial case: tight limit | Some vans short; overshoot is zero; grid use never exceeds `C[t]` against the cautious baseline |
| Presence | `p[v,t] = 0` outside `[arrival, departure)` |
| Charger max | `p[v,t] ≤ charger_kw` |
| Energy accounting | `Σ_t p[v,t]/4 + unmet = ceil(4E)/4` |
| Battery: never both | `ch[t] > 0` implies `dis[t] = 0` |
| Battery: limits and balance | `0 ≤ soc ≤ capacity`; `soc[96] ≥ soc[0]`; balance holds every slot |
| Battery: no export | `dis[t] ≤ baseline + van charging` |
| Battery helps | Same tight case: a battery reduces unmet energy or peak, never increases them |
| Limit over the day | Extra off-peak capacity is only used inside its window |
| Immediate charging breaks the limit | Naive schedule on the development scenario goes over `C[t]` |
| Windows | Noon-to-noon windows never cross a month or sample boundary; count ≈ samples × (days − 1) |
| Split | No `sample_id` appears in both planning and test |
| Replay | A hand-built window set with a known overshoot gives the right `days_over_pct` and worst overshoot |
| Postcode lookup | Known postcode returns its area; lower-case and spaces work; unknown postcode returns `None` |
| Solver timeout | A very short time limit returns status `UNKNOWN` or `FEASIBLE` and the app says so |

## 8. Dashboard

A single page.

**Inputs (side panel)**

- **Postcode** → "Your area" card
- Business sector (shown by name), month, consumption level (shown as "≈ X MWh/month")
- Connection limit (kW), 60–160; optional extra off-peak capacity (kW + time window)
- Number of vans; arrival window; departure window; kWh per van; charger kW
- Battery on/off; capacity (kWh); power (kW)
- Caution level q (0.5–0.99) and risk tolerance (%)
- Editable van table (advanced; collapsed by default)
- **Optimize** button

**Main area**

1. **Your area card:** congestion status in the map's colours, waiting list (requests, MW), expected fix year, planned projects, link to the operator's page, map date. "Indicative; check with your grid operator."
2. **Verdict banner:** ✅ / ⚠️ / ❌, plus a one-line summary.
3. **KPI row:** days over limit · worst overshoot · vans fully charged · kWh short · immediate-charging days over limit.
4. **Demand chart (noon → noon):** p10–p90 band of normal use, cautious baseline, baseline + optimised charging (stacked), battery charge/discharge, immediate-charging total (dashed), connection limit `C[t]` (red line).
5. **Battery chart:** stored energy over the window (only if the battery is on).
6. **Flags table:** every flag from §5.8 in plain language.
7. **Van schedule:** heatmap of vans × time slots (kW), with kWh needed, delivered and short per van.
8. **Sweeps:** chargers vs. days over limit (with and without battery); battery size vs. days over limit, marking the smallest safe battery.
9. **When it breaks:** over-limit days by time of day.
10. **Reality check:** GLASS vs. Liander typical day for this sector and month, with the one-line result.
11. **Explanation:** agent text (or template fallback), a "what changed" note after each rerun, and a box for follow-up questions about the result.
12. **Decision:** Approve / Reject and **Download schedule (CSV)**. Footer: "Synthetic data and simulation. Not a grid-operator approval."

### 8.1 Frontend and API: React + TypeScript

The dashboard is a **React + TypeScript** single-page app in `ui/`. It talks to a small Python JSON API in `api/`, which calls `gridflex/`.

```
React + TypeScript (ui/)  ──JSON──►  Python API (api/)  ──►  gridflex/ library
```

**Endpoints**

| Endpoint | Input | Output |
|---|---|---|
| `GET /conditions` | — | Available sectors, months and levels (with "≈ X MWh/month") |
| `GET /area/{postcode}` | Postcode | `AreaInfo` |
| `POST /optimize` | Scenario: condition, limit settings, vans, battery, q, tolerance | Schedule, `ReplayReport`, immediate-charging comparison, chart data (bands, baseline, `C[t]`) |
| `POST /sweep` | Scenario + sweep type (chargers or battery) | Sweep table |
| `GET /reality` | Category, month | `RealityCheck` |
| `POST /explain` | Scenario, result, previous result, optional question | Explanation text |

**Rules**

- `gridflex/` stays a plain Python library: no web or UI code.
- The API returns plain JSON (lists, not NumPy arrays). TypeScript types in `ui/src/types.ts` mirror the API models in `api/schemas.py`; change both in the same PR.
- Sliders feel instant: send a request only when a slider stops moving (debounce ~300 ms), and show a loading state while the solver runs.
- Charts need shaded bands, stacked areas, a heatmap and a limit line that changes over the day. The charting library is Smriti's choice.
- The API allows requests from the local dev server (CORS) during development.

## 9. Team and build plan

| Person | Owns |
|---|---|
| **Joshua: Data + checking** | GLASS extract, windows, split, cautious baseline, replay and flags, capacity map, reality check |
| **Sunil: Optimisation** | Fleet, immediate charging, CP-SAT scheduler, battery, limit over the day, sweeps, scheduler tests |
| **Smriti: Dashboard + explanation** | React + TypeScript dashboard, API layer, all dashboard panels, LLM provider proposal, explanation agent and fallback, demo assets |

Everyone works on `<name>-<change>` branches with PRs ([AGENTS.md](AGENTS.md)).

| Time | Joshua | Sunil | Smriti | Done when… |
|---|---|---|---|---|
| **0–1 h** | Empty package layout (first PR); verify GLASS; download capacity map and Liander files | Agree interfaces (§7.3) | Scaffold React + TypeScript app and API skeleton | Everyone uses the same inputs and outputs |
| **1–4 h** | `extract_glass.py`, windows, split, baseline | Fleet, immediate charging, van scheduler | Dashboard shell, inputs, dummy chart, `/optimize` returning dummy data | One 96-slot scenario flows between modules |
| **4–6 h** | Replay, flags, verdict | Scheduler tests, charger sweep | Demand chart, KPIs, verdict banner | **Checkpoint:** real schedule, replayed, shown in the app |
| **6–10 h** | Capacity map prep + `grid_area.py` | Battery + limit over the day | Battery/contract inputs, van heatmap, flags table, area card | A battery and an off-peak window change the plan and results |
| **10–13 h** | Reality check | Battery sweep, performance | Agree LLM provider; explanation agent + fallback, sweeps charts, approve/reject, CSV | "How big a battery do I need?" answered on screen |
| **13–16 h** | Data edge cases, tests | Edge cases (impossible, timeout) | Polish, reality-check chart, fallback video | All tests pass; difficult cases handled honestly |
| **16–18 h** | Rehearse | Rehearse | Rehearse | The demo runs smoothly twice in a row |

If time gets tight, protect this order: **GLASS → scheduler → replay → dashboard → battery → postcode card → explanation agent → reality check**.

While building, everyone uses one shared **development scenario**: category `009`, January 2023, level 1, 100 kW, 10 vans with the §4.4 defaults. The **demo scenario** (sector, month, level, limit, vans, postcode) is chosen once the app works, from what the sweeps show.

**Demo postcode candidates** (map of 5 November 2026; all in a single supply area, none ambiguous):

| Postcode | Place | Colour | Operator | Waiting list | Fix year | Projects |
|---|---|---|---|---|---|---|
| `1181KJ` | Amstelveen | red | Liander | 29 requests, 5.8 MW (capacity 56 MW, needed 53 MW) | 2032 | 2 (both 2032 Q4) |
| `1021EG` | Amsterdam Noord | red | Liander | 87 requests, 27.2 MW | 2027 | 1 (2027 Q2, in progress) |
| `2311BD` | Leiden | red | Liander | 34 requests, 13.9 MW | 2035 | 1 (2035 Q4) |
| `2291AA` | Westland | green (transparent) | Westland | 0 requests (capacity 378 MW) | none | none |

`1181KJ` is the main demo and matches the example in §3. Every green postcode in Liander's own area still sits in an area with a waiting list (the tidiest is `1086VA`, Amsterdam IJburg: 6 requests, 3.0 MW against 88 MW), so the clean contrast comes from Westland. Note the card shows the colour and the queue side by side.

## 10. Four-minute demo

1. **0:00–0:50, Joshua:** "In 56% of Dutch postcodes, the grid operators report a shortage of capacity for new business demand." Type a postcode → red card: 29 requests waiting, grid reinforcement planned for late 2032. Show the band of 100 realistic days for a logistics depot, and the reality check against Liander's real data.
2. **0:50–2:10, Sunil:** 10 vans charging on arrival → over the limit on most days. Click **Optimize** → every van full by morning, over the limit on 2% of days. Drag to 15 vans → ❌. Turn on a battery, or add off-peak capacity → ✅ again. Show the battery sweep: "the smallest safe battery is 60 kWh."
3. **2:10–3:20, Smriti:** The explanation agent explains the plan. In the van table, move two vans' return to 20:00 → rerun → the agent explains what changed. Ask "why is the risk highest at 18:00?". Show when the risk happens.
4. **3:20–4:00, Team:** The manager approves; nothing is switched automatically. Limitations in one breath. Close: "We don't test your plan on one made-up day. We test it on every realistic day."

All numbers above are placeholders: the demo scenario is chosen after the app is built (§9). Use a fixed demo seed and keep a recorded fallback video in case the live demo or the API fails. Never promise an improvement before the calculation shows it.

## 11. Stretch goals

Only after the full flow works end to end:

1. **What-if assistant:** the user types a change instead of using the controls, e.g. "add 5 vans that return at 18:00". The agent turns that into inputs through tool calls, the app validates them and reruns, and the agent explains the change.
2. **Rooftop solar:** use `hybrid_net_consumption` and show the battery charging from midday sun. Don't add solar to these profiles a second time.
3. **Weekday-specific plans:** separate timetables for Monday–Thursday and Friday.

## 12. Honesty and limitations

Say these out loud in the pitch and show them in the app:

- **Business electricity use is synthetic** (GLASS) and **fleet requests are assumptions**. No real site is modelled.
- **The capacity map is indicative** and per area, not per connection. Always say "check with your grid operator".
- **Extra off-peak capacity is a what-if.** Real contract terms come from the grid operator.
- **A feasible plan is not a grid-operator approval**, contract compliance or a guarantee.
- **One fixed timetable** is replayed on all test days. A real controller could react on the day, so our risk numbers are on the cautious side.
- **Rounding:** integer kW per 15-minute slot; energy needs rounded up to 0.25 kWh.
- **GLASS conditions on month and consumption level**, not on specific weather. "Realistic days" are realistic for that month in general.
- **The reality check compares shapes**, not absolute kW, because the two datasets are normalised differently.
- **The reality check is not independent**: GLASS was trained on Liander smart-meter data, so agreement shows it reproduces that data. Public holidays are not removed from the working days.

## 13. Setup

Install Python and Node.js if needed (Windows):

```bash
winget install --id Python.Python.3.11 -e
```

```bash
winget install --id OpenJS.NodeJS.LTS -e
```

**Backend:**

```bash
python -m venv .venv
```

```bash
.venv\Scripts\activate
```

```bash
pip install -r requirements.txt
```

`requirements.txt` is filled in as we build (see AGENTS.md). Expected: `polars`, `pyarrow`, `numpy`, `ortools`, `pydantic`, `fastapi`, `uvicorn`, `pytest`, plus the SDK of the chosen LLM provider.

**Frontend:**

```bash
cd ui
```

```bash
npm install
```

**Data downloads** (into `data/raw/`, which is git-ignored):

- GLASS: `GLASS_v1.1.parquet` (see [data/README.md](data/README.md)).
- Capacity map: `brondata_documentatie.txt`, `congestie_pc6.csv`, `voedingsgebieden.csv`, `projecten.csv` into `data/raw/capaciteitskaart/`, e.g.

  ```bash
  curl -L --create-dirs -o data/raw/capaciteitskaart/congestie_pc6.csv https://capaciteitskaart.netbeheernederland.nl/api/download/congestie_pc6.csv
  ```

- Liander profiles: "Overzicht met per SBI-code een aanbevolen profiel" (xlsx), "Geaggregeerde SBI-profielen" (zip) and "K&O profielen" (zip) from https://www.liander.nl/over-ons/open-data into `data/raw/liander_sbi/`.

Then:

```bash
python scripts/extract_glass.py --categories 009 --months 2023-01 --levels 0 1 2 3
```

```bash
python scripts/prepare_grid_map.py
```

```bash
python scripts/prepare_liander_sbi.py --sbi 49 52 KO_LOGISTIEK --months 2023-01
```

```bash
pytest
```

**Run the app** (two terminals):

```bash
uvicorn api.main:app --reload
```

```bash
cd ui && npm run dev
```

API keys go in `.env`.

## 14. References and attribution

- **GLASS dataset:** DOI `10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991`, licence CDLA-Permissive-2.0. Part of LF Energy OpenSynth. See [data/README.md](data/README.md).
- **SmartMeterFM model:** N. Lin, Y. Wang, J. Heres, P. Palensky, P. P. Vergara, *SmartMeterFM: Unifying Smart Meter Data Generative Tasks Using Flow Matching Models*, arXiv:2601.21706.
- **Capaciteitskaart:** Netbeheer Nederland, https://capaciteitskaart.netbeheernederland.nl. Indicative; use at own risk; no licence stated. Credit "Netbeheer Nederland, capaciteitskaart" and show the download date.
- **Liander open data:** "Verbruiksprofielen grootverbruikaansluitingen elektriciteit 2023", https://www.liander.nl/over-ons/open-data. Reuse allowed with attribution "Liander" plus publication year.
- **EY:** *AI and energy: the two-way dependency* (30 June 2026), https://www.ey.com/en_nl/ai-and-energy-the-two-way-dependency
- **Google OR-Tools CP-SAT:** https://developers.google.com/optimization
- **Original concept:** *GridFlex AI*, Smriti Sridhar.
