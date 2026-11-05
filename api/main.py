"""Local API for the GridFlex dashboard."""
from dataclasses import asdict, replace
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from api.batch_report import SiteResult, render_portfolio
from api.csv_setup import read_scenarios
from api.schemas import (ComparisonMetrics, CsvUpload, ExplanationRequest, ExplanationResponse, Scenario,
                         SweepRequest, WhatIfRequest, WhatIfResponse)
from gridflex.assistant import answer_question
from gridflex.fleet import generate_fleet
from gridflex.grid_area import lookup
from gridflex.naive import naive_schedule
from gridflex.profiles import available_conditions, build_windows, cautious_baseline, load_condition, split_by_sample
from gridflex.reality import compare_all, summary
from gridflex.replay import battery_sweep, charger_sweep, replay
from gridflex.scheduler import Battery, NoScheduleError, limit_profile, optimize

app = FastAPI(title="GridFlex")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(ValueError)
async def invalid_scenario(request, exc):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(FileNotFoundError)
async def missing_data(request, exc):
    return JSONResponse(status_code=404, content={"detail": "No prepared data for this selection."})


@lru_cache(maxsize=8)
def profiles(category, month, level):
    return split_by_sample(build_windows(load_condition(category, month, level)))


def inputs(s):
    planning, test = profiles(s.category, s.month, s.level)
    limit = limit_profile(s.limit_kw, s.extra_kw, s.off_peak)
    vans = generate_fleet(s.vans, s.seed, s.arrival, s.departure, s.energy_kwh, s.charger_kw)
    for index, override in s.overrides.items():
        if not 0 <= index < len(vans):
            raise ValueError('A van override is outside the current fleet.')
        vans[index] = replace(vans[index], **override.model_dump(exclude_none=True))
    if bool(s.battery_kwh) != bool(s.battery_kw):
        raise ValueError("Set both battery capacity and power, or set both to zero.")
    battery = Battery(s.battery_kwh, s.battery_kw) if s.battery_kwh else None
    return planning, test, limit, vans, battery


@lru_cache(maxsize=16)
def run(scenario_json):
    s = Scenario.model_validate_json(scenario_json)
    planning, test, limit, vans, battery = inputs(s)
    baseline = cautious_baseline(planning, s.q)
    immediate = naive_schedule(vans)
    try:
        plan = optimize(baseline, limit, vans, battery)
    except NoScheduleError as exc:
        raise HTTPException(409, f"No usable schedule ({exc.status}).") from exc
    report = replay(test, plan, limit, [v.name for v in vans], s.tolerance, immediate)
    return plan, report, baseline, limit, immediate, vans, planning


def json_fields(record):
    return {key: value.tolist() if isinstance(value, np.ndarray) else value
            for key, value in asdict(record).items()}


@app.get("/conditions")
def conditions():
    return available_conditions()


@app.get("/area/{postcode}")
def area(postcode: str):
    match = lookup(postcode)
    if match is None:
        raise HTTPException(404, "No matching postcode in the capacity map.")
    return match


@app.get("/reality")
def reality(category: str, month: str, level: int = 1):
    selected = next((c for c in available_conditions()
                     if (c.category, c.month, c.level) == (category, month, level)), None)
    if selected is None:
        raise HTTPException(404, "No prepared data for this selection.")
    checks = []
    for check in compare_all(category, month, level):
        payload = json_fields(check)
        if not check.liander_has_band:
            for row in (0, 2):
                payload["liander_band"][row] = [None] * 96
        checks.append({**payload, "summary": summary(check)})
    return checks


@app.post("/import-setup", response_model=Scenario)
def import_setup(upload: CsvUpload):
    sites = read_scenarios(upload.csv)
    if len(sites) != 1:
        raise ValueError("Setup expects one site_id. Use the multi-site simulation for multiple sites.")
    return next(iter(sites.values()))


@app.post("/optimize")
def optimize_route(scenario: Scenario):
    plan, report, baseline, limit, immediate, vans, planning = run(scenario.model_dump_json())
    return {
        "schedule": json_fields(plan),
        "report": json_fields(report),
        "baseline_kw": baseline.tolist(),
        "limit_kw": limit.tolist(),
        "immediate_power_kw": immediate.sum(axis=0).tolist(),
        "normal_band_kw": np.percentile(planning.values, [10, 90], axis=0).tolist(),
        "vans": [asdict(van) for van in vans],
    }


@app.post("/batch-report", response_class=Response)
def batch_report(upload: CsvUpload):
    results = []
    for name, scenario in read_scenarios(upload.csv).items():
        try:
            area_info = lookup(scenario.postcode)
        except FileNotFoundError:
            area_info = None
        site = SiteResult(name, scenario, area_info)
        try:
            site.payload = optimize_route(scenario)
        except HTTPException as exc:
            site.error = str(exc.detail)
        except (ValueError, FileNotFoundError) as exc:
            site.error = str(exc)
        results.append(site)
    return Response(
        render_portfolio(results), media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="gridflex-portfolio.pdf"'},
    )


@app.post("/sweep")
def sweep(request: SweepRequest):
    s = request.scenario
    planning, test, limit, vans, battery = inputs(s)
    if request.kind == "chargers":
        return {
            "without_battery": charger_sweep(planning, test, limit, vans, len(vans), tolerance=s.tolerance, q=s.q, time_limit_s=1).to_dicts(),
            "with_battery": charger_sweep(planning, test, limit, vans, len(vans), battery, s.tolerance, s.q, 1).to_dicts() if battery else [],
        }
    return battery_sweep(planning, test, limit, vans, [0, 20, 40, 60, 80], s.battery_kw or 10, s.tolerance, s.q, 2).to_dicts()


@app.post("/explain", response_model=ExplanationResponse)
def explain_route(request: ExplanationRequest):
    plan, report, baseline, limit, _, vans, _ = run(request.scenario.model_dump_json())
    previous = run(request.previous.model_dump_json())[1] if request.previous else None

    def compare(action, van_numbers=None, minutes=0):
        if action == 'custom_earlier':
            scenario = request.scenario
            values = scenario.model_dump()
            changed_vans = set(van_numbers or [])
            if not changed_vans or any(i < 1 or i > len(vans) for i in changed_vans):
                raise ValueError('A requested van does not exist in this fleet.')
            shift = minutes // 15
            if any(v.departure_slot - shift <= v.arrival_slot for i, v in enumerate(vans, 1) if i in changed_vans):
                raise ValueError('An earlier departure would not be after its arrival.')
            values['overrides'] = {i: {'name': v.name, 'arrival_slot': v.arrival_slot,
                                        'departure_slot': v.departure_slot - (shift if i + 1 in changed_vans else 0),
                                        'energy_kwh': v.energy_kwh, 'charger_kw': v.charger_kw}
                                   for i, v in enumerate(vans)}
            altered = Scenario.model_validate(values)
            result = WhatIfResponse(description=f"Move {', '.join(f'Van {i}' for i in sorted(changed_vans))} departure {minutes} minutes earlier, preserving other requests.",
                                    current=comparison_metrics(scenario), changed=comparison_metrics(altered), scenario=altered)
        else:
            try:
                result = what_if(WhatIfRequest(scenario=request.scenario, action=action))
            except HTTPException as exc:
                raise ValueError(str(exc.detail)) from None
        a, b = result.current, result.changed
        if action == 'battery' and request.scenario.battery_kwh:
            return (f"Exploratory comparison on the same held-out synthetic windows: with the battery, "
                    f"{a.days_over_pct:.2f}% of windows exceeded the limit and {a.unmet_kwh:.2f} kWh was unmet; "
                    f"without the battery, {b.days_over_pct:.2f}% exceeded the limit and {b.unmet_kwh:.2f} kWh was unmet. "
                    f"Worst overshoot: {a.worst_overshoot_kw:.2f} kW with versus {b.worst_overshoot_kw:.2f} kW without. "
                    f"Solver status: {a.status} with versus {b.status} without. Removing the battery re-optimizes the schedule, "
                    "so the comparison reflects both battery use and the changed plan. It is not independent validation. "
                    "Battery replay clips negative net demand without updating battery state per window.")
        return (f"Exploratory comparison: {result.description} Current versus changed: "
                f"{a.vans_full}/{a.vans_total} versus {b.vans_full}/{b.vans_total} vans fully served; "
                f"{a.unmet_kwh:.2f} versus {b.unmet_kwh:.2f} kWh unmet; "
                f"{a.days_over_pct:.2f}% versus {b.days_over_pct:.2f}% of held-out synthetic windows over limit; "
                f"worst overshoot {a.worst_overshoot_kw:.2f} versus {b.worst_overshoot_kw:.2f} kW; "
                f"solver status {a.status} versus {b.status}. Equally optimal plans can differ; "
                "the comparison is not independent validation. Battery replay clips negative net demand without updating battery state per window.")

    return answer_question(request.scenario, plan, report, baseline, limit, vans,
                           request.question, [item.model_dump() for item in request.history], previous, compare, request.provider)


def comparison_metrics(scenario: Scenario) -> ComparisonMetrics:
    plan, report, *_ = run(scenario.model_dump_json())
    return ComparisonMetrics(vans_full=sum(short <= 1e-9 for _, short in report.vans_short),
                             vans_total=len(report.vans_short), unmet_kwh=float(plan.unmet_kwh.sum()),
                             days_over_pct=report.days_over_pct, worst_overshoot_kw=report.worst_overshoot_kw,
                             status=plan.status)


@app.post("/what-if", response_model=WhatIfResponse)
def what_if(request: WhatIfRequest):
    s = request.scenario
    values = s.model_dump()
    if request.action == "extra_capacity":
        if s.limit_kw + 10 > 160:
            raise HTTPException(422, "Adding 10 kW exceeds the supported 160 kW limit.")
        values["limit_kw"] = s.limit_kw + 10
        description = "Increase the connection limit by 10 kW throughout the day."
    elif request.action == "later_departure":
        _, _, _, vans, _ = inputs(s)
        if any(v.departure_slot + 4 > 96 for v in vans):
            raise HTTPException(422, "A departure would fall outside the 24-hour scheduling window.")
        values["overrides"] = {i: {"name": v.name, "arrival_slot": v.arrival_slot, "departure_slot": v.departure_slot + 4,
                                  "energy_kwh": v.energy_kwh, "charger_kw": v.charger_kw}
                               for i, v in enumerate(vans)}
        description = "Move each van's departure 1 hour later; arrivals and energy needs stay the same."
    else:
        if s.battery_kwh:
            values["battery_kwh"], values["battery_kw"] = 0, 0
            description = "Remove the configured battery."
        else:
            values["battery_kwh"], values["battery_kw"] = 60, 20
            description = "Add an illustrative 60 kWh, 20 kW battery."
    changed = Scenario.model_validate(values)
    return WhatIfResponse(description=description, current=comparison_metrics(s),
                          changed=comparison_metrics(changed), scenario=changed)
