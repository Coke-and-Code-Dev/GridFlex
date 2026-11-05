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
    assert result['evidence'][0]['id'] == 'comparison'




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
        if sum('facts' in call for call in calls) == 1:
            return json.dumps({'answer': 'Risk was 999%.', 'fact_ids': ['replay']})
        fact = calls[-1]['facts']['replay']
        return json.dumps({'answer': fact, 'fact_ids': ['replay']})
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    result = answer_question(*current, question='What is the risk?')
    assert result['source'] == 'groq'
    assert result['text'] == result['evidence'][0]['text']
    assert 'validation_feedback' in calls[-1]




















@pytest.mark.parametrize('provider', ['groq', 'ollama'])
@pytest.mark.parametrize('question', ['When is risk highest?', 'Which vans are short?', 'When do vans finish charging?'])
def test_each_question_is_written_by_selected_model(monkeypatch, current, provider, question):
    calls = []
    def model(system, user, schema, provider='groq'):
        payload = json.loads(user)
        if 'action' in schema['properties']:
            return json.dumps({'action': 'none', 'van_numbers': [], 'minutes': 0})
        calls.append((provider, payload))
        return json.dumps({'answer': 'Here is the fleet result: {{short_vans}}', 'fact_ids': ['short_vans']})
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    history = [{'question': 'Earlier?', 'text': 'Earlier answer'}]
    result = answer_question(*current, question=question, history=history, provider=provider)
    assert result['source'] == provider
    assert result['text'].startswith('Here is the fleet result:')
    assert calls[0][0] == provider
    assert calls[0][1]['question'] == question
    assert calls[0][1]['recent_conversation'] == history
    assert {'project', 'settings', 'completion', 'short_vans'} <= calls[0][1]['facts'].keys()


def test_battery_comparison_is_passed_to_model(monkeypatch, current):
    s, p, r, base, limit, vans = current
    s = s.model_copy(update={'battery_kwh': 40, 'battery_kw': 10})
    calls = []
    def model(system, user, schema, **kwargs):
        payload = json.loads(user)
        calls.append(payload)
        return json.dumps({'answer': 'The result is: {{battery_comparison}}', 'fact_ids': ['battery_comparison']})
    monkeypatch.setattr('gridflex.assistant.call_llm', model)
    result = answer_question(s, p, r, base, limit, vans, question='How did the battery help?', compare=lambda _: 'Exploratory battery comparison.')
    assert result['source'] == 'groq'
    assert calls[0]['facts']['battery_comparison'] == 'Exploratory battery comparison.'
    assert result['text'].startswith('The result is:')


def test_model_failure_does_not_return_canned_topic_answer(monkeypatch, current):
    def unavailable(*args, **kwargs):
        raise ConnectionError()
    monkeypatch.setattr('gridflex.assistant.call_llm', unavailable)
    result = answer_question(*current, question='Which vans are short?')
    assert result['source'] == 'template'
    assert 'unavailable' in result['text']
    assert result['evidence'] == []
