import json
import pytest
from fastapi.testclient import TestClient
from api.main import app, inputs, run
from api.schemas import Scenario
from gridflex.explain import explain_with_source


@pytest.fixture(scope='module')
def scenario_result():
    scenario = Scenario()
    plan, report, *_ = run(scenario.model_dump_json())
    return scenario, plan, report


def test_groq_can_only_select_computed_evidence(monkeypatch, scenario_result):
    scenario, plan, report = scenario_result
    monkeypatch.setattr('gridflex.explain.call_llm', lambda system, user: json.dumps({'fact_ids': ['charging', 'replay']}))
    text, source = explain_with_source(scenario.model_dump(), plan, report, None)
    assert source == 'groq'
    assert f'{report.days_over_pct:.2f}%' in text
    assert f'{float(plan.unmet_kwh.sum()):.2f} kWh' in text


def test_fabricated_fact_id_falls_back(monkeypatch, scenario_result):
    scenario, plan, report = scenario_result
    monkeypatch.setattr('gridflex.explain.call_llm', lambda system, user: json.dumps({'fact_ids': ['made_up']}))
    text, source = explain_with_source(scenario.model_dump(), plan, report, None)
    assert source == 'template'
    assert 'made_up' not in text and f'{report.days_over_pct:.2f}%' in text


def test_provider_failure_keeps_useful_fallback(monkeypatch, scenario_result):
    scenario, plan, report = scenario_result
    def fail(*args):
        raise ConnectionError('no network')
    monkeypatch.setattr('gridflex.explain.call_llm', fail)
    text, source = explain_with_source(scenario.model_dump(), plan, report, None)
    assert source == 'template' and 'synthetic' in text


def test_empty_selection_does_not_make_up_answer(monkeypatch, scenario_result):
    scenario, plan, report = scenario_result
    monkeypatch.setattr('gridflex.explain.call_llm', lambda system, user: '{"fact_ids":[]}')
    text, source = explain_with_source(scenario.model_dump(), plan, report, None, question='Who is the mayor?')
    assert source == 'groq' and 'does not answer' in text


def test_capacity_whatif_changes_only_limit_and_returns_real_results():
    client = TestClient(app)
    s = Scenario(vans=3)
    response = client.post('/what-if', json={'scenario': s.model_dump(), 'action': 'extra_capacity'})
    assert response.status_code == 200
    data = response.json()
    assert data['scenario']['limit_kw'] == 110
    for key in ('seed', 'vans', 'category', 'month', 'level', 'arrival', 'departure', 'energy_kwh'):
        assert data['scenario'][key] == json.loads(s.model_dump_json())[key]
    assert data['current']['vans_total'] == data['changed']['vans_total'] == 3
    assert data['current']['status'] in ('OPTIMAL', 'FEASIBLE')


def test_later_departure_keeps_original_vans_and_shifts_exactly_one_hour():
    client = TestClient(app)
    scenario = Scenario(vans=3, overrides={0: {'arrival_slot': 22, 'departure_slot': 71, 'energy_kwh': 30, 'charger_kw': 8}})
    before = inputs(scenario)[3]
    response = client.post('/what-if', json={'scenario': scenario.model_dump(), 'action': 'later_departure'})
    assert response.status_code == 200
    after = inputs(Scenario.model_validate(response.json()['scenario']))[3]
    for old, new in zip(before, after):
        assert new.arrival_slot == old.arrival_slot
        assert new.departure_slot == old.departure_slot + 4
        assert (new.energy_kwh, new.charger_kw) == (old.energy_kwh, old.charger_kw)


def test_whatif_limits_and_battery_are_explicit():
    client = TestClient(app)
    response = client.post('/what-if', json={'scenario': Scenario(limit_kw=160).model_dump(), 'action': 'extra_capacity'})
    assert response.status_code == 422
    response = client.post('/what-if', json={'scenario': Scenario(vans=1).model_dump(), 'action': 'battery'})
    assert response.status_code == 200
    assert response.json()['scenario']['battery_kwh'] == 60
    assert response.json()['scenario']['battery_kw'] == 20
