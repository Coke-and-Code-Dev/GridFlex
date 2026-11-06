from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.csv_setup import read_scenarios
from api.main import app

pytestmark = pytest.mark.needs_glass  # loads the GLASS extracts

PUBLIC = Path(__file__).resolve().parents[1] / "ui" / "public"


def test_setup_csv_uses_exact_van_requests():
    source = (PUBLIC / "gridflex-setup-example.csv").read_text(encoding="utf-8-sig")
    source = source.replace("Van 2", '"Van 2, cold storage"')
    client = TestClient(app)
    imported = client.post("/import-setup", json={"csv": source})
    assert imported.status_code == 200
    scenario = imported.json()
    assert scenario["postcode"] == "2311BD"
    result = client.post("/optimize", json=scenario)
    assert result.status_code == 200
    assert result.json()["vans"][1] == {
        "name": "Van 2, cold storage", "arrival_slot": 24,
        "departure_slot": 76, "energy_kwh": 40.0, "charger_kw": 11,
    }


def test_setup_rejects_inconsistent_depot_settings():
    source = (PUBLIC / "gridflex-setup-example.csv").read_text(encoding="utf-8-sig")
    with pytest.raises(ValueError, match="Site settings differ"):
        read_scenarios(source.replace("2311BD", "1315RA", 1))


def test_portfolio_simulates_all_sample_sites():
    source = (PUBLIC / "gridflex-portfolio-example.csv").read_text(encoding="utf-8")
    assert [site.vans for site in read_scenarios(source).values()] == [3, 4, 5]
    client = TestClient(app)
    assert client.post("/import-setup", json={"csv": source}).status_code == 422
    report = client.post("/batch-report", json={"csv": source})
    assert report.status_code == 200
    assert report.headers["content-type"] == "application/pdf"
    assert report.content.startswith(b"%PDF-")


def test_portfolio_progress_reports_failed_sites_and_delivers_pdf(monkeypatch):
    import base64
    import json

    import api.main as backend

    source = (PUBLIC / "gridflex-portfolio-example.csv").read_text(encoding="utf-8")
    optimize = backend.optimize_route

    def fail_one_site(scenario):
        if scenario.postcode == "2311BD":
            raise ValueError("Solver unavailable for this site")
        return optimize(scenario)

    monkeypatch.setattr(backend, "optimize_route", fail_one_site)
    response = TestClient(app).post("/batch-report/progress", json={"csv": source})
    assert response.status_code == 200
    start, first, failed, last, report = map(json.loads, response.text.splitlines())
    assert start["type"] == "start" and start["total"] == 3
    assert len(start["run_id"]) == 32
    assert first["result"]["postcode"] == "1181KJ"
    assert first["result"]["scenario"]["postcode"] == "1181KJ"
    assert first["result"]["area"]["postcode"] == "1181KJ"
    assert len(first["result"]["detail"]["schedule"]["power"]) == 3
    assert len(first["result"]["detail"]["limit_kw"]) == 96
    assert failed["result"]["error"] == "Solver unavailable for this site"
    assert last["result"]["postcode"] == "1315RA"
    assert report["type"] == "pdf"
    assert base64.b64decode(report["content"]).startswith(b"%PDF-")


def test_setup_accepts_csv_larger_than_two_megabytes():
    source = (PUBLIC / "gridflex-setup-example.csv").read_text(encoding="utf-8-sig")
    large_source = source.rstrip() + "\n" * 2_000_001
    response = TestClient(app).post("/import-setup", json={"csv": large_source})
    assert response.status_code == 200
    assert response.json()["vans"] == 3


def test_setup_csv_monthly_kwh_column_uses_the_bill_source():
    source = (PUBLIC / "gridflex-setup-example.csv").read_text(encoding="utf-8-sig")
    lines = source.strip().split("\n")
    lines[0] += ",monthly_kwh"
    lines[1:] = [line + ",12000" for line in lines[1:]]
    scenario = next(iter(read_scenarios("\n".join(lines)).values()))
    assert scenario.load_source == "bill" and scenario.monthly_kwh == 12000
    assert next(iter(read_scenarios(source).values())).load_source == "profile"


EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def case_text(case: str, name: str) -> str:
    return (EXAMPLES / case / name).read_text(encoding="utf-8")


def test_case_6_thirty_depots_import_with_monthly_bills_and_report():
    source = case_text("case_6_thirty_depots", "portfolio.csv")
    sites = read_scenarios(source)
    assert len(sites) == 30 and sum(site.vans for site in sites.values()) == 420
    assert {site.load_source for site in sites.values()} == {"bill"}  # every depot gives its monthly kWh
    response = TestClient(app).post("/batch-report", json={"csv": source})
    assert response.status_code == 200 and response.content.startswith(b"%PDF-")


def test_case_5_five_depots_show_every_verdict():
    import json

    source = case_text("case_5_five_depots_all_verdicts", "portfolio.csv")
    assert len(read_scenarios(source)) == 5
    with TestClient(app).stream("POST", "/batch-report/progress", json={"csv": source}) as stream:
        events = [json.loads(line) for line in stream.iter_lines() if line.strip()]
    verdicts = {event["result"]["verdict"] for event in events if event.get("type") == "site"}
    assert verdicts == {"fits", "fits_with_risk", "does_not_fit"}


def run_case(case: str, meter: bool, **changes) -> dict:
    """Upload a case's setup (and its meter data), as the dashboard does, and optimize."""
    client = TestClient(app)
    imported = client.post("/import-setup", json={"csv": case_text(case, "depot-setup.csv")})
    assert imported.status_code == 200
    scenario = dict(imported.json(), **changes)
    if meter:
        upload = client.post("/meter-data", json={"csv": case_text(case, "meter-data.csv")})
        assert upload.status_code == 200
        scenario.update(load_source="meter", meter_id=upload.json()["meter_id"])
    result = client.post("/optimize", json=scenario)
    assert result.status_code == 200
    return result.json()["report"]


def test_case_1_depot_with_a_bill_fits():
    imported = TestClient(app).post("/import-setup", json={"csv": case_text("case_1_depot_with_bill", "depot-setup.csv")})
    assert (imported.json()["load_source"], imported.json()["monthly_kwh"], imported.json()["vans"]) == ("bill", 9500, 8)
    assert run_case("case_1_depot_with_bill", meter=False)["verdict"] == "fits"


def test_case_2_own_meter_data_fits_and_is_not_labelled_synthetic():
    assert run_case("case_2_own_meter_data", meter=False)["verdict"] == "fits"
    report = run_case("case_2_own_meter_data", meter=True)
    assert report["verdict"] == "fits" and report["synthetic"] is False and report["n_windows"] == 24


def test_case_3_the_bill_estimate_is_cautious_but_the_depots_own_data_fits():
    assert run_case("case_3_dutch_meter_export", meter=False)["verdict"] == "fits_with_risk"
    assert run_case("case_3_dutch_meter_export", meter=True)["verdict"] == "fits"


def test_case_4_does_not_fit_until_a_battery_is_added():
    assert run_case("case_4_solar_with_gaps", meter=False)["verdict"] == "does_not_fit"
    assert run_case("case_4_solar_with_gaps", meter=True)["verdict"] == "does_not_fit"
    report = run_case("case_4_solar_with_gaps", meter=True, battery_kwh=60, battery_kw=30)
    assert report["verdict"] == "fits" and report["days_over_pct"] == 0
