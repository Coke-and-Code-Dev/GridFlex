"""Local, run-scoped portfolio results; simulation data remains authoritative."""
import json
import sqlite3
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / '.gridflex-local'
DB = ROOT / 'portfolio.sqlite3'


def connect():
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=30)
    db.execute('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, total INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0)')
    db.execute('CREATE TABLE IF NOT EXISTS sites (run_id TEXT NOT NULL, site TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (run_id, site))')
    return db


def create_run(total):
    run_id = uuid.uuid4().hex
    with connect() as db:
        db.execute('INSERT INTO runs(id,total) VALUES (?,?)', (run_id, total))
    return run_id


def save_site(run_id, site):
    with connect() as db:
        db.execute('INSERT INTO sites(run_id,site,data) VALUES (?,?,?)',
                   (run_id, site['site'], json.dumps(site, allow_nan=False)))


def complete_run(run_id):
    with connect() as db:
        db.execute('UPDATE runs SET complete=1 WHERE id=?', (run_id,))


def get_run(run_id):
    with connect() as db:
        run = db.execute('SELECT total,complete FROM runs WHERE id=?', (run_id,)).fetchone()
        if run is None:
            raise KeyError('Portfolio run not found. Run the portfolio again.')
        sites = [json.loads(row[0]) for row in db.execute('SELECT data FROM sites WHERE run_id=? ORDER BY site', (run_id,))]
    return {'total': run[0], 'complete': bool(run[1]), 'sites': sites}
