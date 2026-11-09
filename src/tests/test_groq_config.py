from types import SimpleNamespace

import pytest

from gridflex.explain import call_llm


def test_groq_request_keeps_schema_and_increases_reasoning_budget(monkeypatch):
    calls = []
    class FakeGroq:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{}'))])
    monkeypatch.setenv('GROQ_API_KEY', 'test-only-key')
    monkeypatch.setattr('gridflex.explain.Groq', FakeGroq)
    assert call_llm('system', 'user') == '{}'
    request = calls[0]
    assert request['max_completion_tokens'] == 1024
    assert request['reasoning_effort'] == 'low'
    assert request['temperature'] == 0.4
    assert request['response_format']['json_schema']['strict'] is True


def test_provider_failure_log_excludes_sensitive_content(monkeypatch, caplog):
    class ProviderError(Exception):
        status_code = 400
        body = {'error': {'code': 'json_validate_failed', 'message': 'secret prompt'}}
    class FakeGroq:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))
        def create(self, **kwargs):
            raise ProviderError('secret provider response')
    monkeypatch.setenv('GROQ_API_KEY', 'test-only-secret')
    monkeypatch.setattr('gridflex.explain.Groq', FakeGroq)
    with pytest.raises(ProviderError):
        call_llm('secret system prompt', 'secret user prompt')
    assert 'json_validate_failed' in caplog.text and '400' in caplog.text
    assert 'secret' not in caplog.text
