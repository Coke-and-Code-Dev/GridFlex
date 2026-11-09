"""A bounded query language over saved portfolio summaries."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

METRICS = {
    "unmet_kwh": ("unmet energy", " kWh"),
    "breach_pct": ("breach rate", "%"),
    "worst_kw": ("worst overshoot", " kW"),
    "vans": ("vans", ""),
    "full": ("vans fully charged", ""),
}


class PortfolioQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["rank", "group", "count"]
    metric: Literal["unmet_kwh", "breach_pct", "worst_kw", "vans", "full"] = "unmet_kwh"
    order: Literal["asc", "desc"] = "desc"
    aggregation: Literal["sum", "mean", "max"] = "sum"
    min_vans: int = Field(default=0, ge=0)
    province: str = Field(default="", max_length=100)
    verdict: Literal["", "fits", "fits_with_risk", "does_not_fit"] = ""
    limit: int = Field(default=1, ge=1, le=20)


def execute_query(plan: PortfolioQuery, sites: list[dict]) -> str:
    rows = [
        site for site in sites
        if "error" not in site
        and site["vans"] >= plan.min_vans
        and (not plan.province or (site.get("province") or "").casefold() == plan.province.casefold())
        and (not plan.verdict or site.get("verdict") == plan.verdict)
    ]
    scope = []
    if plan.min_vans:
        scope.append(f"at least {plan.min_vans} vans")
    if plan.province:
        scope.append(f"province: {plan.province}")
    if plan.verdict:
        scope.append(f"verdict: {plan.verdict.replace('_', ' ')}")
    coverage = f"Scope: {len(rows):,} successful depot simulations matched"
    coverage += f" ({'; '.join(scope)})." if scope else "."
    if plan.operation == "count":
        return coverage
    metric, unit = METRICS[plan.metric]
    if plan.operation == "group":
        groups: dict[str, list[float]] = {}
        for site in rows:
            if site.get("province") and site.get(plan.metric) is not None:
                groups.setdefault(site["province"], []).append(site[plan.metric])
        aggregate = {"sum": sum, "mean": lambda values: sum(values) / len(values), "max": max}[plan.aggregation]
        values = [(province, aggregate(samples)) for province, samples in groups.items()]
        title = f"Provinces by {plan.aggregation} of {metric}"
        if any(not site.get("province") for site in rows):
            coverage += " Depots without a mapped province were excluded from the provincial ranking."
    else:
        values = [(f"{site['site']} ({site['postcode']})", site[plan.metric])
                  for site in rows if site.get(plan.metric) is not None]
        title = f"Depots by {metric}"
    if not values:
        return f"No matching results for {title.lower()}. {coverage}"
    ordered = sorted(values, key=lambda item: (item[1] if plan.order == "asc" else -item[1], item[0].casefold()))
    direction = "lowest first" if plan.order == "asc" else "highest first"
    lines = [f"{title} ({direction}):"]
    lines.extend(f"{name}: {value:,.2f}{unit}" for name, value in ordered[:plan.limit])
    return "\n".join([*lines, "", coverage])
