# GridFlex AI: Predict. Optimize. Explain.

> A short, easy-to-follow plan for a team of three. This is a proposal alongside [README.md](README.md), the source of truth for the current project. Agree changes with the team before changing that plan.

## The idea

A warehouse has a limited electricity supply. If every electric van charges at once, the warehouse may need more power than its connection allows. **GridFlex helps answer: can we charge the vans on time without exceeding that limit?**

It uses synthetic Dutch energy data to make a plan, tests that plan on many possible days, and explains the result. A person makes the final decision. This is a simulation, not a system that controls equipment or approves a grid connection.

## How it works

```text
GLASS data + van requests
          ↓
LightGBM predicts demand (when ready)
          ↓
OR-Tools plans charging and optional battery use
          ↓
A separate checker tests the plan and replays it on other days
          ↓
Streamlit shows the results; Gemini explains checked numbers
```

Think of the connection limit as the size of a pipe. The building and vans share that pipe. GridFlex tries to move charging to times when more space is available.

## What each tool does

| Tool | Job | When |
|---|---|---|
| **GLASS** | Supplies synthetic 15-minute electricity profiles | Start here |
| **OR-Tools CP-SAT** | Finds a charging schedule that follows the rules | Core |
| **Streamlit + Plotly** | Shows controls, charts and results | Core; team must agree on UI choice |
| **LightGBM** | Predicts future demand using past patterns | Add after the core works |
| **Gemini Flash** | Explains results already calculated and checked | Add after the core works; include a non-AI fallback |
| **PatchTST / Isolation Forest** | Optional forecasting experiment / unusual-pattern detection | Only if time remains |

Use Python, Polars and NumPy for data, Pydantic or dataclasses for shared inputs, and pytest for checks. Add transformer packages only if testing PatchTST. Keep API keys in an ignored `.env` file.

## Data: start small

1. Use `consumption_only`, category `009` (transport and storage), from [GLASS](data/README.md). Read a small filtered extract with Polars; do not load or commit the full dataset.
2. Each day has **96 readings**, one every 15 minutes. Power is in **kW**; energy is in **kWh**. The current project uses a noon-to-noon window, joining adjacent days only within the same scenario, category, month, level and sample.
3. Split samples before building the cautious baseline or testing. Use held-out windows to see how the same charging plan performs on different synthetic days. These are not real facility measurements or a guarantee of real-world safety.
4. Later, add `generation_zon` for solar and `generation_wopl` for wind (October–February). Convert negative generation readings to positive generation amounts. Separately sampled profiles do not necessarily describe the same site; label the combined scenario simulated. Do not add solar twice to `hybrid_net_consumption`.

## Divide the work

| Person | Owns | Delivers |
|---|---|---|
| **1: Data + forecasts** | Extract GLASS, prepare windows, check data and train/evaluate LightGBM if time permits | Clean profiles and, later, a 96-slot forecast |
| **2: Optimization + checking** | Create van requests, build the scheduler, compare immediate charging and check results | A schedule, unmet energy and validation results |
| **3: Dashboard + explanations** | Build the agreed UI, charts, scenario controls and Gemini/fallback explanation | A working interactive demo |

First agree on shared inputs and outputs using the interfaces in the README: 96 time slots, site limit, van arrival/departure, charging rate and energy needed. Results should include the schedule, solver status, unmet energy, checks and warnings. Use the repository's named-branch and pull-request workflow.

## Build it step by step

| Time | Goal | Done when… |
|---|---|---|
| **0–30 min** | Set up, agree interfaces and choose one fixed demo scenario | Everyone can use the same inputs |
| **30–60 min** | Extract data, create immediate-charging baseline and dashboard shell | One 96-slot scenario flows between modules |
| **1–2 hours** | Build EV scheduling and the independent checker | The app produces a real schedule and reports any shortfall |
| **2–3 hours** | Connect charts and replay the same schedule on held-out windows | A change in van count reruns and updates the results |
| **3–4 hours** | Test, polish and rehearse; add one extension if stable | The demo works, including an honest difficult case |

If time is tight, finish **GLASS → scheduler → checker → dashboard** first. Add Gemini, LightGBM, solar, battery and natural-language controls after that. The longer forecasting and AI integration work in the original plan can continue beyond the first four hours.

## Forecasting: teach it from the past

Train LightGBM on complete, continuous historical sequences. Give it past demand, time of day, weekday and recent averages; predict the next 96 intervals. Test on later, held-out data, not randomly mixed neighboring readings. When predicting step by step, use earlier predictions—not future answers—as inputs.

Compare its average error (MAE), larger-error-sensitive score (RMSE) and peak error against a simple **same time yesterday** forecast. A higher-demand estimate can provide a cautious mode, but cannot promise the limit will never be exceeded. If there is not enough time or data, use the README's cautious per-slot baseline and say no forecast model was evaluated.

## Scheduling: follow the rules

OR-Tools chooses when each van charges. It must respect arrival and departure times, charger power and the site limit. Show any energy a van still needs. First minimize unmet charging, then peak power, then cost if tariffs are available. Report whether the solver found an optimal, feasible, infeasible or unknown result; a time limit does not prove an answer is optimal.

If adding a battery, track its stored energy, capacity, charge/discharge limits and efficiency; never charge and discharge at the same time. Include solar and wind only as available generation. If the building alone exceeds its limit and the battery cannot cover it, say the scenario is infeasible. CP-SAT uses scaled integers, so check rounding and energy balance.

## Explain and test

Gemini can answer “Why was this van scheduled later?” or summarize what changed after a solar drop. Give it the actual scenario, checked schedule and computed metrics; do not let it invent numbers or make decisions for the solver. For a what-if request, validate the proposed changes and rerun the calculation first. If Gemini is unavailable, show a clear text summary generated from the results.

Check that vans charge only while present, deadlines and charger limits are respected, grid power balances, and battery levels stay valid. Test an impossible scenario and a solver timeout. Compare **immediate charging** with the optimized plan using peak power, overloads, vans ready on time and unmet kWh; show costs only if a tariff is supplied. Separately replay the fixed plan on held-out synthetic days and show how often and by how much it exceeds the limit. A forecast that looks safe and a replay that stays safe are different results.

## Four-minute demo

1. **0:00–1:00 — Person 1:** Explain the warehouse problem, GLASS and the forecast or cautious baseline.
2. **1:00–2:00 — Person 2:** Compare immediate and optimized charging; show the rules and any unmet energy.
3. **2:00–3:20 — Person 3:** Increase the fleet from 10 to 15 vans, rerun, and explain the result using Gemini or the fallback.
4. **3:20–4:00 — Team:** Show replay risk, limitations and the human decision.

Also prepare a busy charging period and a solar-drop scenario. Use a fixed demo seed and a clearly labeled saved fallback in case the live demo or API fails. Never promise an improvement before the calculation shows it.
