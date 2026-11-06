"""Read uploaded reference documents from a Pinecone document index."""
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def search_uploaded_report(question: str) -> list[dict[str, str]]:
    settings = dotenv_values(ROOT / '.env')
    key = os.environ.get('PINECONE_API_KEY') or settings.get('PINECONE_API_KEY')
    host = os.environ.get('PINECONE_HOST') or settings.get('PINECONE_HOST')
    namespace = os.environ.get('PINECONE_NAMESPACE') or settings.get('PINECONE_NAMESPACE') or '__default__'
    if not key or not host:
        raise ValueError('Pinecone configuration missing')
    parsed = urllib.parse.urlparse(host)
    if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.pinecone.io') or parsed.username or parsed.password or parsed.port or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Invalid Pinecone host')
    payload = {'top_k': 3, 'include_fields': ['text'],
               'score_by': [{'type': 'embed', 'fields': ['text'], 'query': question}]}
    request = urllib.request.Request(
        host.rstrip('/') + '/namespaces/' + urllib.parse.quote(namespace, safe='') + '/documents/search',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Api-Key': key, 'Content-Type': 'application/json', 'X-Pinecone-Api-Version': '2026-07'},
        method='POST')
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.load(response)
    if not isinstance(data.get('matches'), list):
        raise ValueError('Invalid Pinecone response')
    return [{'source': 'Pinecone uploaded report, chunk ' + str(hit.get('_id', 'unknown'))[:200],
             'text': hit['text'][:6000]}
            for hit in data['matches'] if isinstance(hit, dict) and isinstance(hit.get('text'), str) and hit['text'].strip()]
