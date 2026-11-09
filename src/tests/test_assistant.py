import json
import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app, run
from api.schemas import Scenario
from gridflex.assistant import answer_question, build_facts, render_answer

pytestmark = pytest.mark.needs_glass  # loads the GLASS extracts


@pytest.fixture(scope='module')
def current():
    scenario = Scenario(vans=3)
    plan, report, baseline, limit, _, vans, _ = run(scenario.model_dump_json())
    return scenario, plan, report, baseline, limit, vans


def test_completion_is_end_of_last_scheduled_slot(current):
    s, p, r, base, limit, vans = current
    facts = build_facts(s, p, r, base, limit, vans)
    from gridflex.replay import slot_time
    last = max(int(np.flatnonzero(row > 0)[-1]) + 1 for row in p.power if np.any(row > 0))
    assert slot_time(last) in facts['completion']
    assert ('finish charging' in facts['completion']) == all(short <= 1e-9 for _, short in r.vans_short)


def test_unsupported_number_or_evidence_is_rejected():
    facts = {'risk': 'The calculated risk is 1.16%.'}
    assert render_answer('Risk: {{risk}}', ['risk'], facts)[0] == 'Risk: The calculated risk is 1.16%.'
    for answer, ids in [('Risk is 9%. {{risk}}', ['risk']), ('Risk is ten percent. {{risk}}', ['risk']),
                        ('{{invented}}', ['invented']), ('Everything is safe.', [])]:
        with pytest.raises(ValueError):
            render_answer(answer, ids, facts)


def test_conversation_and_evidence_are_sent_and_rendered(monkeypatch, current):
    calls = []
    def model(system, user, schema):
        calls.append(json.loads(user))
        if 'action' in schema['properties']:
            return '{"action":"none"}'
        return json.dumps({'answer': 'Here is the result: {{short_vans}}', 'fact_ids': ['short_vans']})
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    s, p, r, base, limit, vans = current
    result = answer_question(s, p, r, base, limit, vans, 'What about those vans?',
                             [{'question': 'Which vans are short?', 'text': 'Earlier answer'}], compare=lambda _: '')
    assert result['source'] == 'groq'
    assert result['evidence'][0]['id'] == 'short_vans'
    assert calls[-1]['recent_conversation'][0]['question'] == 'Which vans are short?'
    assert 'project' in calls[-1]['facts'] and 'completion' in calls[-1]['facts']


def test_tool_comparison_is_run_once_and_its_result_is_the_evidence(monkeypatch, current):
    def model(system, user, schema):
        return '{"action":"extra_capacity"}' if 'action' in schema['properties'] else '{"answer":"{{comparison}}","fact_ids":["comparison"]}'
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    actions = []
    def compare(action):
        actions.append(action)
        return 'The current risk is 2.00%; the changed risk is 1.00%.'
    result = answer_question(*current, question='What if I add capacity?', compare=compare)
    assert actions == ['extra_capacity']
    assert result['text'] == result['evidence'][0]['text']


def test_invalid_answer_falls_back_without_generic_misleading_risk(monkeypatch, current):
    monkeypatch.setattr('gridflex.assistant.call_llm', lambda *a, **k: '{"answer":"It finishes at 02:30.","fact_ids":[]}')
    result = answer_question(*current, question='When will this complete?')
    assert result['source'] == 'template'
    assert result['text'] == build_facts(*current)['completion']
    assert '02:30' not in result['text'] or '02:30' in result['evidence'][0]['text']


def test_explanation_rejects_excess_history():
    response = TestClient(app).post('/explain', json={'scenario': Scenario(vans=1).model_dump(), 'question': 'hello',
                                                      'history': [{'question': 'x', 'text': 'y'}] * 7})
    assert response.status_code == 422


def test_earlier_departure_tool_requires_explicit_vans_and_minutes(monkeypatch, current):
    def model(system, user, schema):
        if 'action' in schema['properties']:
            return '{"action":"custom_earlier","van_numbers":[1,2],"minutes":30}'
        return '{"answer":"{{comparison}}","fact_ids":["comparison"]}'
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    calls = []
    def compare(*args):
        calls.append(args)
        return 'Compared the requested departures.'
    answer_question(*current, question='Move Van 1 and Van 2 departures 30 minutes earlier', compare=compare)
    assert calls == [('custom_earlier', [1, 2], 30)]
    calls.clear()
    answer_question(*current, question='Move some vans earlier', compare=compare)
    assert calls == []


def test_chat_tool_preserves_other_van_requests(monkeypatch):
    def model(system, user, schema):
        if 'action' in schema['properties']:
            return '{"action":"custom_earlier","van_numbers":[1,2],"minutes":30}'
        return '{"answer":"{{comparison}}","fact_ids":["comparison"]}'
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    scenario = Scenario(vans=3)
    response = TestClient(app).post('/explain', json={'scenario': scenario.model_dump(),
        'question': 'Move Van 1 and Van 2 departures 30 minutes earlier'})
    assert response.status_code == 200
    data = response.json()
    assert data['source'] == 'template'
    assert 'Van 1, Van 2 departure 30 minutes earlier' in data['text']
    assert 'same' not in data['text'].lower() or 'synthetic' in data['text'].lower()


def test_natural_numbers_must_match_cited_facts_and_units():
    facts = {'risk': 'Worst replay overshoot: 39.23 kW at 08:15.',
             'battery': 'The planned battery discharge is 90.50 kWh.'}
    answer = 'The worst overshoot was 39.23 kW at 08:15.'
    assert render_answer(answer, ['risk'], facts)[0] == answer
    for bad in ('The worst overshoot was 39.23 kWh at 08:15.',
                'The worst overshoot was 90.50 kWh at 08:15.',
                'The worst overshoot was 39.23 kW at 08:30.'):
        with pytest.raises(ValueError):
            render_answer(bad, ['risk'], facts)
    with pytest.raises(ValueError):
        render_answer('The battery reduced risk by 90.50 kWh.', ['battery'], facts)


def test_validation_retry_and_no_evidence_duplication(monkeypatch, current):
    calls = []
    def model(system, user, schema, **kwargs):
        calls.append(json.loads(user))
        if 'topics' in schema['properties']:
            return json.dumps({'topics': []})
        if sum('facts' in call for call in calls) == 1:
            return json.dumps({'answer': 'Risk was 999%.', 'fact_ids': ['replay']})
        fact = calls[-1]['facts']['replay']
        return json.dumps({'answer': fact, 'fact_ids': ['replay']})
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    result = answer_question(*current, question='What is the risk?')
    assert result['source'] == 'groq'
    assert result['text'] == result['evidence'][0]['text']
    assert 'validation_feedback' in calls[-1]


def test_fallback_shows_relevant_risk_and_battery_evidence(monkeypatch, current):
    def unavailable(*args, **kwargs):
        raise ConnectionError('unavailable')
    monkeypatch.setattr('gridflex.assistant.call_llm', unavailable)
    risk = answer_question(*current, question='When is risk highest?', provider='ollama')
    assert risk['source'] == 'template' and any(x['id'] == 'worst' for x in risk['evidence'])
    battery = answer_question(*current, question='How did the battery help?', provider='ollama')
    assert 'no battery' in battery['text'].lower()


def test_battery_refusal_still_explains_available_evidence(monkeypatch, current):
    monkeypatch.setattr('gridflex.assistant.call_llm', lambda *a, **k: json.dumps({
        'answer': 'I cannot answer that from the available evidence. Please clarify your question or try a supported scenario.',
        'fact_ids': []}))
    result = answer_question(*current, question='How did the battery help?')
    assert result['source'] == 'template'
    assert 'no battery' in result['text'].lower()
    assert result['evidence'][0]['id'] == 'battery_config'


def test_screenshot_questions_use_correct_evidence(current):
    risk = answer_question(*current, question='When is risk highest?')
    assert risk['source'] == 'template'
    assert {'frequent', 'worst'} <= {item['id'] for item in risk['evidence']}
    assert 'Immediate charging' not in risk['text']
    short = answer_question(*current, question='Which vans are short?')
    assert short['text'] == build_facts(*current)['short_vans']
    combined = answer_question(*current, question='When is the highest risk and how to solve for it?')
    assert 'frequent' in {item['id'] for item in combined['evidence']}
    assert 'untested suggestions' in combined['text']
    assert 'remove the battery' not in combined['text'].lower()


def test_battery_impact_runs_comparison_and_handles_failure(current):
    s, p, r, base, limit, vans = current
    battery_scenario = s.model_copy(update={'battery_kwh': 60, 'battery_kw': 20})
    actions = []
    def compare(action):
        actions.append(action)
        return 'With battery: 1%; without battery: 2%. Exploratory simulation.'
    result = answer_question(battery_scenario, p, r, base, limit, vans,
                             question='How did the battery help?', compare=compare)
    assert actions == ['battery']
    assert 'without battery: 2%' in result['text']
    assert result['evidence'][-1]['id'] == 'battery_comparison'
    def broken(action):
        raise RuntimeError('failure')
    result = answer_question(battery_scenario, p, r, base, limit, vans,
                             question='How did the battery help?', compare=broken)
    assert 'impact is unknown' in result['text']
    assert result['evidence'][-1]['id'] == 'battery_impact'


def test_risk_advice_followup_uses_previous_question(current):
    history = [{'question': 'When is risk highest?', 'text': 'Previous answer'}]
    result = answer_question(*current, question='How can I fix that?', history=history)
    assert result['evidence'][0]['id'] == 'risk_advice'
    assert 'untested' in result['text']


def test_classifier_routes_paraphrase_for_either_provider(monkeypatch, current):
    calls = []
    def model(system, user, schema, provider='groq'):
        calls.append(provider)
        assert 'topics' in schema['properties']
        return json.dumps({'topics': ['van_shortfall']})
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    for provider in ('groq', 'ollama'):
        result = answer_question(*current, question='Does the fleet get enough energy?', provider=provider)
        assert result['text'] == build_facts(*current)['short_vans']
    assert calls == ['groq', 'ollama']


def test_zero_breaches_reports_no_risk_time(current):
    from dataclasses import replace
    s, p, r, base, limit, vans = current
    report = replace(r, over_by_slot=np.zeros_like(r.over_by_slot), days_over_pct=0.0,
                     worst_overshoot_kw=0.0, worst_overshoot_time=None)
    result = answer_question(s, p, report, base, limit, vans, question='When is risk highest?')
    assert 'No limit breaches' in result['text']
    assert result['evidence'][0]['id'] == 'replay'


def test_real_battery_comparison_uses_same_scenario_except_battery():
    scenario = Scenario(vans=3, battery_kwh=40, battery_kw=10)
    response = TestClient(app).post('/explain', json={'scenario': scenario.model_dump(),
                                                      'question': 'How did the battery help?',
                                                      'provider': 'ollama'})
    assert response.status_code == 200
    data = response.json()
    with_battery = run(scenario.model_dump_json())[1]
    no_battery = scenario.model_copy(update={'battery_kwh': 0, 'battery_kw': 0})
    without = run(no_battery.model_dump_json())[1]
    assert f'{with_battery.days_over_pct:.2f}%' in data['text']
    assert f'{without.days_over_pct:.2f}%' in data['text']
    assert 're-optimizes the schedule' in data['text']
    assert data['source'] == 'template'


def test_shortfall_answer_lists_only_vans_with_unmet_energy(current):
    from dataclasses import replace
    s, p, r, base, limit, vans = current
    report = replace(r, vans_short=[('Van 1', 2.5), ('Van 2', 0.0), ('Van 3', 4.0)])
    result = answer_question(s, p, report, base, limit, vans, question='Which vans are short?')
    assert 'Van 1: 2.50 kWh' in result['text']
    assert 'Van 3: 4.00 kWh' in result['text']
    assert 'Van 2' not in result['text']
