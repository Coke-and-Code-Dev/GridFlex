"""Local document retrieval using Ollama embeddings and Chroma."""
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = 'qwen3-embedding:0.6b'


def embed(texts):
    req = urllib.request.Request('http://127.0.0.1:11434/api/embed',
        data=json.dumps({'model': MODEL, 'input': texts}).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)['embeddings']


def chunks():
    result = []
    for filename in ('idea.md', 'HANDOFF.md', 'data/README.md'):
        text = (ROOT / filename).read_text(encoding='utf-8')
        sections = re.split(r'(?=^#{1,3} )', text, flags=re.M)
        for section in sections:
            for start in range(0, len(section), 1800):
                part = section[start:start + 1800].strip()
                if len(part) > 80:
                    result.append((filename, part))
    return result


def retrieve(question):
    import chromadb
    client = chromadb.PersistentClient(path=str(ROOT / '.gridflex-local' / 'chroma'))
    collection = client.get_or_create_collection('gridflex_knowledge_v1', metadata={'hnsw:space': 'cosine'})
    docs = chunks()
    ids = [hashlib.sha256((name + '\n' + body).encode()).hexdigest() for name, body in docs]
    existing = set(collection.get(include=[])['ids'])
    missing = [i for i, identifier in enumerate(ids) if identifier not in existing]
    for offset in range(0, len(missing), 16):
        group = missing[offset:offset + 16]
        collection.upsert(ids=[ids[i] for i in group], documents=[docs[i][1] for i in group],
                          metadatas=[{'source': docs[i][0]} for i in group],
                          embeddings=embed([docs[i][1] for i in group]))
    stale = existing - set(ids)
    if stale:
        collection.delete(ids=list(stale))
    found = collection.query(query_embeddings=embed([question]), n_results=min(3, len(ids)),
                             include=['documents', 'metadatas'])
    return [{'source': meta['source'], 'text': doc} for doc, meta in zip(found['documents'][0], found['metadatas'][0])]
