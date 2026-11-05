import json
import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app, run
from api.schemas import Scenario
from gridflex.assistant import answer_question, build_facts, render_answer


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
    assert calls[1]['recent_conversation'][0]['question'] == 'Which vans are short?'
    assert 'project' in calls[1]['facts'] and 'completion' in calls[1]['facts']


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
    assert data['source'] == 'groq'
    assert 'Van 1, Van 2 departure 30 minutes earlier' in data['text']
    assert 'same' not in data['text'].lower() or 'synthetic' in data['text'].lower()
