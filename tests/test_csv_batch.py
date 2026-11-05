from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.csv_setup import read_scenarios
from api.main import app

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
    assert start == {"type": "start", "total": 3}
    assert first["result"]["postcode"] == "1181KJ"
    assert first["result"]["scenario"]["postcode"] == "1181KJ"
    assert first["result"]["area"]["postcode"] == "1181KJ"
    assert len(first["result"]["detail"]["schedule"]["power"]) == 3
    assert len(first["result"]["detail"]["limit_kw"]) == 96
    assert failed["result"]["error"] == "Solver unavailable for this site"
    assert last["result"]["postcode"] == "1315RA"
    assert report["type"] == "pdf"
    assert base64.b64decode(report["content"]).startswith(b"%PDF-")
