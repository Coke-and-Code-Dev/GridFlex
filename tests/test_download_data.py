import importlib.util
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "download_data.py"
spec = importlib.util.spec_from_file_location("download_data", SCRIPT)
dl = importlib.util.module_from_spec(spec)
sys.modules["download_data"] = dl  # dataclasses look the module up by name
spec.loader.exec_module(dl)

PAYLOAD = bytes(range(256)) * 4000  # about 1 MB


def make_server(supports_range=True):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/missing":
                self.send_error(404)
                return
            start = 0
            header = self.headers.get("Range")
            if supports_range and header and header.startswith("bytes="):
                start = int(header[6:].split("-")[0])
            body = PAYLOAD[start:]
            self.send_response(206 if start else 200)
            if start:
                self.send_header("Content-Range", f"bytes {start}-{len(PAYLOAD) - 1}/{len(PAYLOAD)}")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"


@pytest.fixture
def server():
    srv, url = make_server()
    yield url
    srv.shutdown()


def test_downloads_a_file_into_the_folder(server, tmp_path):
    path = dl.fetch(dl.Item(f"{server}/file", "sub", "data.bin"), tmp_path / "sub")
    assert path.read_bytes() == PAYLOAD
    assert not list(tmp_path.rglob("*.part"))


def test_a_complete_file_is_skipped_unless_forced(server, tmp_path, capsys):
    item = dl.Item(f"{server}/file", "", "data.bin", size=len(PAYLOAD))
    (tmp_path / "data.bin").write_bytes(PAYLOAD)
    dl.fetch(item, tmp_path)
    assert "skipped" in capsys.readouterr().out
    (tmp_path / "data.bin").write_bytes(b"old")
    dl.fetch(dl.Item(f"{server}/file", "", "data.bin"), tmp_path, force=True)
    assert (tmp_path / "data.bin").read_bytes() == PAYLOAD


def test_a_file_of_the_wrong_size_is_downloaded_again(server, tmp_path):
    (tmp_path / "data.bin").write_bytes(b"half a file")
    dl.fetch(dl.Item(f"{server}/file", "", "data.bin", size=len(PAYLOAD)), tmp_path)
    assert (tmp_path / "data.bin").read_bytes() == PAYLOAD


def test_resumes_a_partial_download(server, tmp_path, capsys):
    (tmp_path / "data.bin.part").write_bytes(PAYLOAD[:300_000])
    dl.fetch(dl.Item(f"{server}/file", "", "data.bin", size=len(PAYLOAD)), tmp_path)
    assert (tmp_path / "data.bin").read_bytes() == PAYLOAD
    assert "resuming" in capsys.readouterr().out


def test_a_server_that_ignores_resume_requests_starts_over(tmp_path):
    srv, url = make_server(supports_range=False)
    try:
        (tmp_path / "data.bin.part").write_bytes(PAYLOAD[:300_000])
        dl.fetch(dl.Item(f"{url}/file", "", "data.bin", size=len(PAYLOAD)), tmp_path)
        assert (tmp_path / "data.bin").read_bytes() == PAYLOAD
    finally:
        srv.shutdown()


def test_a_dead_link_stops_with_a_clear_message(server, tmp_path):
    with pytest.raises(SystemExit, match="404"):
        dl.fetch(dl.Item(f"{server}/missing", "", "nope.bin"), tmp_path)
    assert not (tmp_path / "nope.bin").exists()


def test_a_download_of_the_wrong_size_is_refused(server, tmp_path):
    with pytest.raises(SystemExit, match="expected"):
        dl.fetch(dl.Item(f"{server}/file", "", "data.bin", size=len(PAYLOAD) + 5), tmp_path, attempts=1)
    assert not (tmp_path / "data.bin").exists()


def test_the_checked_in_links_match_what_the_prepare_scripts_expect():
    names = {item.name for item in dl.GROUPS["liander"]}
    assert {"Geaggregeerde SBI-profielen.zip", "KO profielen.zip",
            "overzicht-per-sbi-code-aanbevolen-profiel.xlsx"} == names  # prepare_liander_sbi.py
    assert {item.name for item in dl.GROUPS["capacity"]} == {
        "congestie_pc6.csv", "voedingsgebieden.csv", "projecten.csv", "brondata_documentatie.txt"}  # prepare_grid_map.py
    assert dl.GROUPS["glass"][0].name == "GLASS_v1.1.parquet" and dl.GROUPS["glass"][0].size == 13_214_162_600
    assert len(dl.expected_sha256()) == 64
