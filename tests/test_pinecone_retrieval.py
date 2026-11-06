import json
from io import BytesIO
import pytest
from gridflex.pinecone_retrieval import search_uploaded_report


def test_search_uses_document_api_and_returns_provenance(monkeypatch):
    monkeypatch.setenv('PINECONE_API_KEY', 'test-key')
    monkeypatch.setenv('PINECONE_HOST', 'https://example.svc.pinecone.io')
    monkeypatch.setenv('PINECONE_NAMESPACE', 'portfolio reports')
    def open_request(request, timeout):
        assert request.full_url == 'https://example.svc.pinecone.io/namespaces/portfolio%20reports/documents/search'
        assert json.loads(request.data)['score_by'][0] == {'type': 'embed', 'fields': ['text'], 'query': 'risk'}
        return BytesIO(json.dumps({'matches': [{'_id': 'report-1', 'text': 'Example passage'}]}).encode())
    monkeypatch.setattr('urllib.request.urlopen', open_request)
    assert search_uploaded_report('risk') == [{'source': 'Pinecone uploaded report, chunk report-1', 'text': 'Example passage'}]


def test_rejects_untrusted_host_before_sending_key(monkeypatch):
    monkeypatch.setenv('PINECONE_API_KEY', 'test-key')
    monkeypatch.setenv('PINECONE_HOST', 'https://example.pinecone.io.attacker.test')
    with pytest.raises(ValueError, match='Invalid Pinecone host'):
        search_uploaded_report('risk')
