"""Read site settings and exact per-van requests from one CSV."""
import csv
from io import StringIO

from pydantic import ValidationError

from api.schemas import Scenario, VanOverride
from gridflex.fleet import _clock_slot
from gridflex.grid_area import normalise_postcode
from gridflex.profiles import available_conditions
from gridflex.scheduler import limit_profile

SITE_FIELDS = (
    "postcode", "category", "month", "level", "limit_kw", "extra_kw",
    "off_peak_start", "off_peak_end", "battery_kwh", "battery_kw", "q", "risk_tolerance_pct",
)
VAN_FIELDS = ("van_name", "arrival", "departure", "energy_kwh", "charger_kw")
CSV_FIELDS = ("site_id", *SITE_FIELDS, *VAN_FIELDS)


def read_scenarios(source: str) -> dict[str, Scenario]:
    reader = csv.DictReader(StringIO(source.lstrip("\ufeff"), newline=""), strict=True)
    sites: dict[str, tuple[dict[str, str], dict[int, VanOverride]]] = {}
    conditions = {(c.category, c.month, c.level) for c in available_conditions()}
    line = 1
    try:
        columns = reader.fieldnames or []
        missing = set(CSV_FIELDS) - set(columns)
        if missing:
            raise ValueError("Missing CSV columns: " + ", ".join(sorted(missing)))
        if len(columns) != len(set(columns)):
            raise ValueError("CSV column names must be unique.")
        for raw in reader:
            line = reader.line_num
            if None in raw or any(raw[key] is None for key in CSV_FIELDS):
                raise ValueError("Row has the wrong number of columns.")
            row = {key: raw[key].strip() for key in CSV_FIELDS}
            site = row["site_id"]
            if not site or len(site) > 80:
                raise ValueError("site_id must have 1 to 80 characters.")
            postcode = normalise_postcode(row["postcode"])
            if postcode is None:
                raise ValueError("Use a Dutch postcode such as 1181KJ.")
            row["postcode"] = postcode
            settings = {key: row[key] for key in SITE_FIELDS}
            first, fleet = sites.setdefault(site, (settings, {}))
            if first != settings:
                raise ValueError(f"Site settings differ between rows for {site}.")
            if len(fleet) >= 40:
                raise ValueError(f"{site} exceeds the 40-van limit.")
            van = VanOverride(
                name=row["van_name"], arrival_slot=_clock_slot(row["arrival"], 12),
                departure_slot=96 if row["departure"] == "12:00" else _clock_slot(row["departure"], 12),
                energy_kwh=row["energy_kwh"], charger_kw=row["charger_kw"],
            )
            if van.departure_slot <= van.arrival_slot:
                raise ValueError("Departure must follow arrival within the noon-to-noon window.")
            if any(other.name == van.name for other in fleet.values()):
                raise ValueError(f"Van names must be unique within {site}.")
            fleet[len(fleet)] = van
        if not sites:
            raise ValueError("CSV contains no vans.")
        result = {}
        for site, (settings, fleet) in sites.items():
            try:
                scenario = Scenario(
                    **{key: settings[key] for key in SITE_FIELDS
                       if key not in ("off_peak_start", "off_peak_end", "risk_tolerance_pct")},
                    off_peak=(settings["off_peak_start"], settings["off_peak_end"]),
                    tolerance=float(settings["risk_tolerance_pct"]) / 100,
                    vans=len(fleet), overrides=fleet,
                )
                if (scenario.category, scenario.month, scenario.level) not in conditions:
                    raise ValueError("No prepared business profile matches category, month and level.")
                if bool(scenario.battery_kwh) != bool(scenario.battery_kw):
                    raise ValueError("Set both battery capacity and power, or set both to zero.")
                limit_profile(scenario.limit_kw, scenario.extra_kw, scenario.off_peak)
            except ValueError as exc:
                raise ValueError(f"Site {site}: {exc}") from exc
            result[site] = scenario
        return result
    except (csv.Error, ValueError) as exc:
        if isinstance(exc, ValidationError):
            exc = ValueError("; ".join(f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in exc.errors()))
        raise ValueError(f"CSV line {line}: {exc}") from exc
