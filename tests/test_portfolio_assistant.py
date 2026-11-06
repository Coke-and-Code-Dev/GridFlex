import json
import pytest
from api import portfolio_store
from gridflex.portfolio_assistant import ask_portfolio


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(portfolio_store, 'ROOT', tmp_path)
    monkeypatch.setattr(portfolio_store, 'DB', tmp_path / 'test.sqlite')
    return portfolio_store


def site(name, postcode, rate):
    return {'site': name, 'postcode': postcode, 'vans': 1, 'full': 1,
            'breach_pct': rate, 'worst_kw': 10, 'unmet_kwh': 0, 'status': 'OPTIMAL',
            'scenario': {'limit_kw': 100, 'battery_kwh': 0, 'battery_kw': 0},
            'detail': {'report': {'worst_overshoot_time': '06:00'},
                       'schedule': {'power': [[0, 1]], 'unmet_kwh': [0]},
                       'vans': [{'name': 'Van A', 'energy_kwh': 4}]}}


def test_runs_are_isolated_and_failed_sites_are_retained(store):
    a = store.create_run(2); b = store.create_run(1)
    store.save_site(a, site('Depot A', '1181KJ', 3.0))
    store.save_site(a, {'site': 'Failed', 'postcode': '1181KJ', 'vans': 1, 'error': 'solver failed'})
    store.save_site(b, site('Depot B', '1181KJ', 20.0))
    store.complete_run(a)
    assert store.get_run(a)['complete']
    assert {s['site'] for s in store.get_run(a)['sites']} == {'Depot A', 'Failed'}
    assert store.get_run(b)['sites'][0]['site'] == 'Depot B'
    assert not store.get_run(b)['complete']
    with pytest.raises(KeyError): store.get_run('missing')


def test_model_receives_complete_rank_and_project_context(monkeypatch):
    calls = []
    def llm(system, user, schema, provider):
        payload = json.loads(user); calls.append(payload)
        if 'site_ids' in schema['properties']:
            return json.dumps({'site_ids': [], 'compare_battery': False})
        return json.dumps({'answer': 'Depot B has a 20.00% breach rate.', 'fact_ids': ['portfolio']})
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', llm)
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', lambda q: [{'source': 'idea.md', 'text': 'Synthetic held-out windows.'}])
    result = ask_portfolio({'total': 2, 'complete': True, 'sites': [site('Depot A','1181KJ',3), site('Depot B','2311BD',20)]},
                           'Which depot has the highest risk?', [], 'ollama')
    assert result['source'] == 'ollama' and 'Depot B' in result['text']
    evidence = calls[-1]['facts']['portfolio']
    assert evidence.index('Depot B') < evidence.index('Depot A')
    assert calls[-1]['facts']['document_0'].startswith('idea.md:')


def test_duplicate_postcode_keeps_both_sites_and_never_runs_comparison(monkeypatch):
    calls = []; comparisons = []
    def llm(system, user, schema, provider):
        payload = json.loads(user); calls.append(payload)
        if 'site_ids' in schema['properties']:
            return json.dumps({'site_ids': ['Depot A'], 'compare_battery': True})
        return json.dumps({'answer': 'Both depots match the postcode.', 'fact_ids': ['site_0', 'site_1']})
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', llm)
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', lambda q: [])
    run = {'total': 2, 'complete': True, 'sites': [site('Depot A','1181KJ',3), site('Depot B','1181KJ',20)]}
    result = ask_portfolio(run, 'Would a battery help at 1181 KJ?', [], 'groq', lambda x: comparisons.append(x))
    assert result['source'] == 'groq'
    assert 'Depot A' in calls[-1]['facts']['site_0'] and 'Depot B' in calls[-1]['facts']['site_1']
    assert not comparisons


def test_retrieval_failure_is_visible_and_does_not_block_data(monkeypatch):
    def llm(system, user, schema, provider):
        return json.dumps({'site_ids': [], 'compare_battery': False}) if 'site_ids' in schema['properties'] else json.dumps({'answer': 'Depot A has 3.00% risk.', 'fact_ids': ['portfolio']})
    def unavailable(q): raise OSError('offline')
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', llm)
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', unavailable)
    result = ask_portfolio({'total': 1, 'complete': True, 'sites': [site('Depot A','1181KJ',3)]}, 'What is the risk?', [], 'groq')
    assert result['source'] == 'groq' and result['warnings']


def test_endpoint_returns_404_for_unknown_run(store):
    from fastapi.testclient import TestClient
    from api.main import app
    response = TestClient(app).post('/portfolio/ask', json={'run_id': 'a' * 32, 'question': 'Which depot?'})
    assert response.status_code == 404


def test_incomplete_run_is_not_answered(store):
    from fastapi.testclient import TestClient
    from api.main import app
    run_id = store.create_run(1)
    response = TestClient(app).post('/portfolio/ask', json={'run_id': run_id, 'question': 'Which depot?'})
    assert response.status_code == 422


def test_custom_battery_request_never_uses_fixed_toggle(monkeypatch):
    calls = []
    def llm(system, user, schema, provider):
        if 'site_ids' in schema['properties']:
            return json.dumps({'site_ids': ['Depot A'], 'compare_battery': True})
        return json.dumps({'answer': 'I cannot determine the impact of a bigger battery from the available evidence.', 'fact_ids': []})
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', llm)
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', lambda _: [])
    result = ask_portfolio({'total': 1, 'complete': True, 'sites': [site('Depot A','1181KJ',3)]},
                           'Would a bigger battery help Depot A?', [], 'ollama', lambda x: calls.append(x))
    assert not calls and result['warnings']

@pytest.mark.parametrize('provider', ['groq', 'ollama'])
def test_verdict_lists_use_stored_results_even_when_risk_order_disagrees(monkeypatch, provider):
    def unexpected(*args, **kwargs):
        raise AssertionError('Verdict selection must not depend on the model')
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', unexpected)
    a = {**site('Depot A', '1181KJ', 90), 'verdict': 'does_not_fit'}
    b = {**site('Depot B', '2311BD', 20), 'verdict': 'fits_with_risk'}
    c = {**site('Depot C', '1011AA', 1), 'verdict': 'fits'}
    failed = {'site': 'Depot D', 'postcode': '1000AA', 'vans': 1, 'error': 'failed'}
    run = {'complete': True, 'sites': [a, b, c, failed]}
    result = ask_portfolio(run, 'Which depots fit with risk?', [], provider)
    assert 'Depot B' in result['text'] and 'Depot A' not in result['text']
    assert 'failed' in result['text']
    result = ask_portfolio(run, 'Which depots do not fit?', [], provider)
    assert 'Depot A' in result['text'] and 'Depot B' not in result['text']


def test_selected_depot_and_verdict_are_in_model_context(monkeypatch):
    calls = []
    def llm(system, user, schema, provider):
        data = json.loads(user); calls.append(data)
        if 'site_ids' in schema['properties']:
            return json.dumps({'site_ids': [], 'compare_battery': False})
        return json.dumps({'answer': 'The selected depot has a fits with risk verdict.', 'fact_ids': ['site_0']})
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', llm)
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', lambda _: [])
    selected = {**site('Depot A', '1181KJ', 3), 'verdict': 'fits_with_risk'}
    result = ask_portfolio({'complete': True, 'sites': [selected]}, 'What is the verdict for this depot?', [], 'ollama', current_depot='Depot A')
    assert calls[0]['current_depot'] == 'Depot A'
    assert 'verdict fits_with_risk' in calls[-1]['facts']['site_0']
    assert result['source'] == 'ollama'


def test_uploaded_report_is_separate_and_cited(monkeypatch):
    calls = []
    def llm(system, user, schema, provider):
        payload = json.loads(user); calls.append(payload)
        if 'site_ids' in schema['properties']:
            return json.dumps({'site_ids': [], 'compare_battery': False})
        return json.dumps({'answer': 'The uploaded report describes depot charging.', 'fact_ids': ['uploaded_report_0']})
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', llm)
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', lambda _: [])
    monkeypatch.setattr('gridflex.portfolio_assistant.search_uploaded_report', lambda _: [{'source': 'Pinecone report chunk', 'text': 'Depot charging.'}])
    run = {'complete': True, 'sites': [site('Depot A', '1181KJ', 3)]}
    result = ask_portfolio(run, 'What does the uploaded report say?', [], 'ollama')
    assert result['source'] == 'ollama'
    assert result['evidence'][0]['id'] == 'uploaded_report_0'
    assert 'not been matched' in result['warnings'][0]
    assert 'not verified as the current run' in calls[-1]['facts']['uploaded_report_0']


def test_pinecone_failure_does_not_claim_report_answer(monkeypatch):
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', lambda *a, **k: json.dumps({'site_ids': [], 'compare_battery': False}))
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', lambda _: [])
    def unavailable(_): raise OSError('offline')
    monkeypatch.setattr('gridflex.portfolio_assistant.search_uploaded_report', unavailable)
    result = ask_portfolio({'complete': True, 'sites': [site('Depot A', '1181KJ', 3)]}, 'What does the uploaded report say?', [], 'groq')
    assert result['source'] == 'template' and 'could not be retrieved' in result['text']


def test_current_run_question_does_not_search_unmatched_report(monkeypatch):
    def llm(system, user, schema, provider):
        if 'site_ids' in schema['properties']:
            return json.dumps({'site_ids': [], 'compare_battery': False})
        return json.dumps({'answer': 'Depot A has 3.00% risk.', 'fact_ids': ['portfolio']})
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', llm)
    monkeypatch.setattr('gridflex.portfolio_assistant.retrieve', lambda _: [])
    def should_not_search(_): raise AssertionError('must not search unmatched report')
    monkeypatch.setattr('gridflex.portfolio_assistant.search_uploaded_report', should_not_search)
    result = ask_portfolio({'complete': True, 'sites': [site('Depot A', '1181KJ', 3)]}, 'What is the risk?', [], 'groq')
    assert result['source'] == 'groq'


def test_report_passages_remain_accessible_if_model_fails(monkeypatch):
    monkeypatch.setattr('gridflex.portfolio_assistant.search_uploaded_report', lambda _: [{'source': 'Pinecone report', 'text': 'A source passage.'}])
    def unavailable(*args, **kwargs): raise OSError('offline')
    monkeypatch.setattr('gridflex.portfolio_assistant.call_llm', unavailable)
    result = ask_portfolio({'complete': True, 'sites': [site('Depot A', '1181KJ', 3)]}, 'Summarize the uploaded report', [], 'ollama')
    assert result['source'] == 'template'
    assert result['evidence'][0]['id'] == 'uploaded_report_0'
    assert 'open the retrieved report passages' in result['text']
