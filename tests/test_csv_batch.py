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
    assert scenario["postcode"] == "1181KJ"
    result = client.post("/optimize", json=scenario)
    assert result.status_code == 200
    assert result.json()["vans"][1] == {
        "name": "Van 2, cold storage", "arrival_slot": 24,
        "departure_slot": 76, "energy_kwh": 40.0, "charger_kw": 11,
    }


def test_setup_rejects_inconsistent_depot_settings():
    source = (PUBLIC / "gridflex-setup-example.csv").read_text(encoding="utf-8-sig")
    with pytest.raises(ValueError, match="Site settings differ"):
        read_scenarios(source.replace("1181KJ", "2311BD", 1))


def test_portfolio_simulates_all_sample_sites():
    source = (PUBLIC / "gridflex-portfolio-example.csv").read_text(encoding="utf-8")
    assert [site.vans for site in read_scenarios(source).values()] == [3, 4, 5]
    client = TestClient(app)
    assert client.post("/import-setup", json={"csv": source}).status_code == 422
    report = client.post("/batch-report", json={"csv": source})
    assert report.status_code == 200
    assert report.headers["content-type"] == "application/pdf"
    assert report.content.startswith(b"%PDF-")
