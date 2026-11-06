"""Uploaded meter data, kept in memory only.

A site's meter readings are its own business data, so they are never written to disk.
Uploads are lost when the API restarts; the dashboard then asks for the file again.
"""
import hashlib
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock

from gridflex.load_sources import LoadInfo, MeterData, meter_info, meter_windows, parse_meter_csv, split_by_date
from gridflex.profiles import Windows

MAX_UPLOADS = 20


@dataclass(frozen=True)
class StoredMeter:
    meter: MeterData
    planning: Windows
    test: Windows
    info: LoadInfo


_uploads: "OrderedDict[str, StoredMeter]" = OrderedDict()
_lock = Lock()


def add(text: str) -> tuple[str, StoredMeter]:
    meter = parse_meter_csv(text)
    planning, test = split_by_date(meter_windows(meter))
    digest = hashlib.sha256(meter.dates.tobytes() + meter.values.tobytes()).hexdigest()[:16]
    stored = StoredMeter(meter, planning, test, meter_info(meter, planning, test))
    with _lock:
        _uploads[digest] = stored
        _uploads.move_to_end(digest)
        while len(_uploads) > MAX_UPLOADS:
            _uploads.popitem(last=False)
    return digest, stored


def get(meter_id: str) -> StoredMeter:
    with _lock:
        if meter_id not in _uploads:
            raise KeyError("Meter data not found. Uploads are kept only until the API restarts; upload the file again.")
        return _uploads[meter_id]
