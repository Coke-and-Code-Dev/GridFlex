import io
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from api.main import app
from api.schemas import Scenario
from gridflex.explain import call_llm


def test_ollama_uses_local_model_and_structured_output(monkeypatch):
    calls = []
    class FakeResponse(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *args): self.close()
    def open_request(request, timeout):
        calls.append((request, timeout))
        return FakeResponse(json.dumps({'done': True, 'done_reason': 'stop',
                                        'message': {'content': '{"answer":"ok"}'}}).encode())
    monkeypatch.setattr('gridflex.explain.urllib.request.urlopen', open_request)
    schema = {'type': 'object', 'properties': {'answer': {'type': 'string'}}}
    assert call_llm('system', 'user', schema=schema, provider='ollama') == '{"answer":"ok"}'
    request, timeout = calls[0]
    payload = json.loads(request.data)
    assert request.full_url == 'http://127.0.0.1:11434/api/chat'
    assert timeout == 120 and payload['model'] == 'qwen3.5:9b'
    assert payload['format'] == schema and payload['stream'] is False


def test_api_routes_selected_provider_and_exposes_source(monkeypatch):
    calls = []
    def fake(system, user, schema, provider='groq'):
        calls.append(provider)
        if 'action' in schema['properties']:
            return '{"action":"none","van_numbers":[],"minutes":0}'
        return '{"answer":"{{short_vans}}","fact_ids":["short_vans"]}'
    monkeypatch.setattr('gridflex.assistant.call_llm', fake)
    response = TestClient(app).post('/explain', json={'scenario': Scenario(vans=1).model_dump(),
                                                        'provider': 'ollama', 'question': 'Explain the project'})
    assert response.status_code == 200
    assert response.json()['source'] == 'ollama'
    assert calls == ['ollama', 'ollama', 'ollama']
    assert response.json()['evidence'][0]['id'] == 'short_vans'


def test_ollama_unavailable_uses_existing_fallback(monkeypatch):
    def unavailable(*args, **kwargs):
        raise ConnectionError('unavailable')
    monkeypatch.setattr('gridflex.assistant.call_llm', unavailable)
    response = TestClient(app).post('/explain', json={'scenario': Scenario(vans=1).model_dump(),
                                                        'provider': 'ollama', 'question': 'Which vans are short?'})
    assert response.status_code == 200
    assert response.json()['source'] == 'template'
    assert 'van' in response.json()['text'].lower()


def test_unknown_provider_is_rejected():
    response = TestClient(app).post('/explain', json={'scenario': Scenario(vans=1).model_dump(), 'provider': 'invalid'})
    assert response.status_code == 422
