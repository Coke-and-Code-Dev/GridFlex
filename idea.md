# GridFlex AI: three-person hackathon architecture and build plan

> **Proposal and companion to [README.md](README.md).** The README is the repository's source of truth for scope and module interfaces. This document captures the broader idea from the earlier planning conversation; forecasting, renewable generation, battery scheduling, Gemini and Streamlit are proposed extensions, not claims about existing implementation or agreed changes to the current MVP. Agree changes with the team and update the README before implementation. All scenarios and results are simulations.

## 1. The idea

**Can a business add EV chargers under its existing grid connection?** GridFlex uses Dutch GLASS synthetic electricity profiles and simulated fleet requests to propose a charging schedule, then replays that fixed schedule across many alternative demand windows. It shows grid-limit violations and unmet charging needs, compares immediate charging with optimization, and helps a human understand the trade-offs. The app recommends; it does not control equipment or grant grid-operator approval.

The broader vision is **predict, optimize, explain**: use forecasting to anticipate demand, constrained optimization to schedule charging and optional storage, and grounded language-model explanations to communicate computed results. Deliver a credible replay-based MVP before extending it.

## 2. Architecture and flow

```text
GLASS Parquet -> filtered monthly samples -> 96-slot noon-to-noon windows
                         |                          |
                         v                          v
                cautious baseline          held-out replay windows
                         |                          ^
EV requests + limits ---> OR-Tools scheduler -> fixed schedule
                                                    |
                                       independent validation + replay
                                                    |
                                    metrics + baseline comparison
                                                    |
                          Streamlit / Plotly dashboard (proposed)
                                                    |
                                Gemini explanation or local fallback
```

The current README specifies the existing intended architecture, including a per-slot cautious percentile baseline, charger sweep and replay, and leaves the UI framework open. Streamlit is a recommendation for team agreement, not a settled repository decision. Keep the core library independent of the UI. Assign a run ID and invalidate old results when inputs change. No LLM can override constraints or declare a schedule feasible.

### Shared contracts

Agree interfaces before splitting work; preserve the signatures in README §5.2. Profiles and schedules use NumPy arrays of shape `(n, 96)`, power in kW, energy in kWh, 15-minute slots and a noon-to-noon default window. A scenario identifies the GLASS condition, start hour, connection limit, EV arrival/departure slots, required kWh and charger power. Optional inputs include a tariff, solar/wind profiles and battery settings. Validate dimensions, nonnegative values, windows, units and battery initial state. A result must identify its scenario and solver status, schedule, grid profile, unmet energy, runtime, independent validation, replay metrics and warnings; if storage is enabled include its charge, discharge and 97 state-of-charge values. Distinguish illustrative input values from measured results.

## 3. Data and forecasting

GLASS v1.1 contains synthetic 15-minute daily profiles derived from a generative model trained on Liander data. See [data/README.md](data/README.md) for schema, license and attribution. Use Polars lazy scanning and filters; never load or commit the full raw Parquet file. Start with `consumption_only`, category `009` (transportation and storage), a selected month and level. Inspect profile distribution, variation and connection-limit fit before choosing a demo condition. Calculate monthly energy from readings, not the target `level_value`.

Rows form a continuous sequence only when scenario, category, year-month, level ID and sample ID match. Create noon-to-noon windows from adjacent days within that same monthly sample; never stitch across months or samples. Split training, validation and replay samples before deriving aggregate baselines to avoid leakage. Clearly label the number of samples and windows and do not interpret correlated windows as independent sites or real-world probabilities.

For optional renewable scenarios, `generation_zon` and `generation_wopl` are negative generation readings: convert them to positive available-generation magnitudes. Wind is available only October–February, with category `WIND`. Do not add separate solar to `hybrid_net_consumption`, which already includes it. Independently sampled demand and generation do not represent a known shared facility; label their combination simulated. EV arrivals, energy requirements, battery and connection capacity are configurable assumptions, not GLASS measurements.

### Forecasting extension: LightGBM

The replay-based MVP can work without a trained forecast. Once it works, train LightGBM on continuous historical sequences with lag features (15 minutes, 1 hour, 24 hours and, when available, 7 days), calendar features and past-only rolling statistics. Predict 96 slots ahead using recursive one-step predictions or direct horizon models. For recursive forecasts, feed back predictions rather than future actual readings. Split chronologically and by held-out sample as appropriate; never randomly split adjacent rows. Compare MAE, RMSE and peak error against same-time-yesterday persistence on the identical held-out windows. Use persistence for solar/wind initially. If data, compute or time are insufficient, retain the cautious percentile baseline and report that forecasting was not evaluated.

Optionally use validation residual quantiles to form a conservative demand band; this is not a guarantee of grid safety. PatchTST is a stretch only after the baseline, evaluation and end-to-end demo work; keep it only if held-out results justify complexity.

## 4. Scheduling and validation

Use OR-Tools CP-SAT with scaled integer units and explicit rounding checks. For each EV and interval, define charging power bounded by charger capacity and availability. Require delivered energy plus nonnegative unmet energy to equal requested energy; expose shortfalls. Model grid import as baseline plus EV charging plus battery charging minus generation used and battery discharge. Enforce the configured grid limit, and define export and renewable curtailment explicitly if included. Treat hard physical limits as hard constraints; if unavoidable baseline demand exceeds capacity and available storage cannot cover it, report infeasibility rather than claiming success.

If battery storage is added, enforce power and capacity bounds, initial state and the transition `SOC[t+1] = SOC[t] + 0.25 * (eta_charge * charge[t] - discharge[t] / eta_discharge)`. A binary mode prevents simultaneous charge and discharge. Check integer scaling and independently recompute energy balances and SOC.

Use sequential objectives: first minimize unmet EV energy, then fix the optimum and minimize peak import, then minimize tariff cost and optionally cycling. Under a time limit, only fix an objective as proven optimal when the solver actually proves it; otherwise disclose the incumbent and incomplete priority guarantees. Report `OPTIMAL`, `FEASIBLE`, `INFEASIBLE` or `UNKNOWN` faithfully and use a short interactive time limit. Immediate charging is the comparison baseline; apply identical fleet and site assumptions.

Replay the **same** planned schedule over held-out GLASS windows and calculate violation frequency, worst overshoot and timing. Forecast feasibility and replay feasibility are separate. State how any shortfall is calculated during replay, including whether charging is curtailed to respect the limit; do not claim both an unmodified schedule and curtailment without modeling the difference.

## 5. Explainability and dashboard

A proposed Streamlit/Plotly interface offers business/month/level selection, connection limit and fleet controls, immediate-versus-optimized curves, EV charging heatmap, solver/validation status, unmet kWh, and the charger-count versus replay-violation chart. Add optional renewable and storage controls only after the core workflow works. Label data, scenarios and all approvals as simulated; recompute metrics from the active run.

Gemini Flash, if an account and key are available, receives only validated scenario details, solver status, computed metrics and warnings. It explains observed outcomes without inventing measurements, solver reasoning, savings or certainty. For a what-if question, validate structured parameter changes and rerun the deterministic engine before explaining results. Provide a deterministic text fallback when the API is unavailable; store keys in an ignored `.env`, never in the repository. Natural-language scenario parsing is a stretch goal.

## 6. Three-person ownership

| Owner | Responsibility | Integration deliverable |
|---|---|---|
| Member 1: data and forecasting | GLASS extraction, sample/window construction, data checks, cautious baseline; optional LightGBM and evaluation | Validated 96-slot profiles and held-out replay windows; documented data provenance |
| Member 2: optimization and validation | Fleet requests, immediate charging, CP-SAT, independent checks and replay metrics | Schedule and result matching the agreed README interfaces; tests and honest solver statuses |
| Member 3: dashboard and explanations | Agree UI choice with team; build controls, comparison and risk charts, explanation fallback, optional Gemini, demo | Runnable interface consuming real results and clear simulated labels |

All three agree contracts and a seeded demo scenario first, integrate early, review each other's outputs, and use separate `name-change` branches and pull requests as required by [AGENTS.md](AGENTS.md).

## 7. Four-hour execution plan

| Time | Milestone | Acceptance criterion |
|---|---|---|
| 0:00–0:20 | Inspect repository/data, agree contracts, units, sample split and seeded scenario | Everyone can load the same small extract and understands inputs/outputs |
| 0:20–1:00 | Parallel: extract windows; build naive charging and scheduler skeleton; build UI shell | One 96-slot scenario passes between modules |
| 1:00–2:00 | Finish basic EV constraints and independent validation; compute cautious baseline and replay | Real solver output, shortfall and replay metrics appear end to end |
| 2:00–3:00 | Integrate UI, charger sweep and comparison; test infeasible and constrained cases | Changing a scenario recomputes a visible, validated result |
| 3:00–3:40 | Add highest-value extension only: forecasting, Gemini or renewables if core is stable | Extension has an evaluated or deterministic fallback; no fabricated numbers |
| 3:40–4:00 | Freeze, test, rehearse and prepare offline fallback | One reliable demo runs from documented setup and shows an honest limitation |

If behind, cut optional models, battery, wind and conversational controls first. A working core replay and honest metrics outrank model count.

## 8. Validation and evidence

- Check data signs, 96 slots, units, month/sample continuity and variation; keep held-out samples out of model and cautious-baseline construction.
- Test no charging outside EV windows, charger power, energy delivered and unmet energy, grid balances and limit, battery SOC and no simultaneous charge/discharge when applicable. Independently recompute every slot rather than trusting solver metrics.
- Exercise impossible baseline, insufficient charging capacity, zero generation, empty/full battery, solver timeout and missing Gemini key. Show actual status and warnings.
- Compare naive and optimized schedules using the same scenario: peak kW, overload intervals and worst overload, EV completion and unmet kWh, and optionally tariff cost and renewable curtailment. Compare held-out forecast errors to persistence separately.
- Report replay window counts, sample counts and observed proportion with violations. These are synthetic scenario results, not a guarantee of real-world reliability or a prediction of actual connection approval.

## 9. Demo and handoff

1. Member 1 introduces the congestion and fleet question, GLASS synthetic data and the selected month and site assumptions.
2. Member 2 shows immediate charging versus the optimized schedule, EV deadlines and independent constraint checks. Explain any unmet energy or infeasibility.
3. Member 3 changes fleet size or the connection limit, reruns, and shows replay violations and the charger sweep. If enabled, ask Gemini to explain only the verified result.
4. Show a difficult scenario, such as more vans or reduced solar, and explain the residual risk. Finish with the human decision: this is a simulation, not equipment control.

Prepare a seeded scenario and precomputed screenshots or a recorded fallback if data extraction, solver, internet or API access fails; label saved results and do not present them as live. Document setup, dataset provenance, assumptions, validation and known limits in the README as the team implements the agreed plan.
