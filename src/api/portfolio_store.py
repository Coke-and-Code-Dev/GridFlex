"""Local, run-scoped portfolio results; simulation data remains authoritative."""
import json
import sqlite3
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / '.gridflex-local'
DB = ROOT / 'portfolio.sqlite3'


def connect():
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=30)
    db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, total INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0)')
    db.execute('CREATE TABLE IF NOT EXISTS sites (run_id TEXT NOT NULL, site TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (run_id, site))')
    db.execute('CREATE TABLE IF NOT EXISTS manifests (run_id TEXT PRIMARY KEY, data TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS summaries (run_id TEXT NOT NULL, site TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (run_id, site))')
    return db


def create_run(total, manifest=None):
    run_id = uuid.uuid4().hex
    with connect() as db:
        db.execute('INSERT INTO runs(id,total) VALUES (?,?)', (run_id, total))
        if manifest is not None:
            db.execute('INSERT INTO manifests(run_id,data) VALUES (?,?)', (run_id, json.dumps(manifest)))
    return run_id


def save_site(run_id, site):
    with connect() as db:
        db.execute('INSERT INTO sites(run_id,site,data) VALUES (?,?,?)',
                   (run_id, site['site'], json.dumps(site, allow_nan=False)))
        summary = {key: value for key, value in site.items() if key not in ('scenario', 'detail', 'area')}
        db.execute('INSERT INTO summaries(run_id,site,data) VALUES (?,?,?)',
                   (run_id, site['site'], json.dumps(summary, allow_nan=False)))


def complete_run(run_id):
    with connect() as db:
        db.execute('UPDATE runs SET complete=1 WHERE id=?', (run_id,))


def get_run(run_id, summaries_only=False):
    with connect() as db:
        run = db.execute('SELECT total,complete FROM runs WHERE id=?', (run_id,)).fetchone()
        if run is None:
            raise KeyError('Portfolio run not found. Run the portfolio again.')
        rows = db.execute(
            "SELECT COALESCE(summary.data, json_remove(full.data, '$.detail', '$.scenario', '$.area')) "
            "FROM sites AS full LEFT JOIN summaries AS summary ON summary.run_id=full.run_id AND summary.site=full.site "
            "WHERE full.run_id=? ORDER BY full.site" if summaries_only else
            "SELECT data FROM sites WHERE run_id=? ORDER BY site", (run_id,)
        )
        sites = [json.loads(row[0]) for row in rows]
        manifest = db.execute('SELECT data FROM manifests WHERE run_id=?', (run_id,)).fetchone()
    return {'total': run[0], 'complete': bool(run[1]), 'sites': sites,
            'manifest': json.loads(manifest[0]) if manifest else None}


def get_site(run_id, site):
    with connect() as db:
        row = db.execute('SELECT data FROM sites WHERE run_id=? AND site=?', (run_id, site)).fetchone()
    return json.loads(row[0]) if row else None
