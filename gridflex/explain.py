"""Grounded explanation fallback for the current schedule and replay."""
import re

from gridflex.grid_area import AreaInfo
from gridflex.replay import ReplayReport
from gridflex.scheduler import ScheduleResult


def template_summary(result: ScheduleResult, report: ReplayReport,
                     previous: ReplayReport | None = None, question: str | None = None) -> str:
    shortfall = float(result.unmet_kwh.sum())
    timing = f" at {report.worst_overshoot_time}" if report.worst_overshoot_time else ""
    risk = (f"The plan exceeded the limit in {report.days_over_pct:.2f}% of "
            f"{report.n_windows} held-out synthetic windows. Worst overshoot: "
            f"{report.worst_overshoot_kw:.2f} kW{timing}.")
    charging = f"The planned schedule leaves {shortfall:.2f} kWh of fleet demand unmet."
    if question:
        query = question.casefold()
        for name, short in report.vans_short:
            if re.search(rf"\b{re.escape(name.casefold())}\b", query):
                return f"{name} has a {short:.2f} kWh shortfall in this plan."
        if "battery" in query:
            return f"The plan discharges {result.battery_discharge.sum() / 4:.2f} kWh. Compare battery sizes in the exploratory sweep."
        if any(word in query for word in ("risk", "when", "over", "limit")):
            return risk
        if "which" in query and "van" in query:
            short_vans = [f"{name}: {short:.2f} kWh" for name, short in report.vans_short if short > 0]
            return "Vans with shortfalls: " + ", ".join(short_vans) if short_vans else "Every van meets its planned charging demand."
        if any(word in query for word in ("short", "fleet", "charge")):
            return charging
        return "I can explain limit breaches, timing, charging shortfalls, or battery use for this result."
    comparison = (f" Immediate charging exceeded the limit in {report.immediate.days_over_pct:.2f}% of windows."
                  if report.immediate else "")
    change = (f" Previous run: {previous.days_over_pct:.2f}% over the limit and "
              f"{sum(short for _, short in previous.vans_short):.2f} kWh short." if previous else "")
    battery = float(result.battery_discharge.sum() / 4)
    battery_note = f" The planned battery discharge is {battery:.2f} kWh." if battery else ""
    return risk + comparison + " " + charging + battery_note + change


def call_llm(system: str, user: str) -> str:
    raise NotImplementedError("The team has not selected an explanation provider.")


def explain(scenario: dict, result: ScheduleResult, report: ReplayReport,
            area: AreaInfo | None, previous: ReplayReport | None = None,
            question: str | None = None) -> str:
    return template_summary(result, report, previous, question)
