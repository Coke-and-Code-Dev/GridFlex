"""Shared test setup."""
import pytest

from gridflex.profiles import DEFAULT_DATA_DIR

# The GLASS extracts are not in git (scripts/setup_data.py sets them up). Tests that load them
# carry `pytestmark = pytest.mark.needs_glass` and are skipped, with the reason, when they are missing.
GLASS_READY = (DEFAULT_DATA_DIR / "glass_009_2024-01_L1.parquet").exists()


def pytest_configure(config):
    config.addinivalue_line("markers", "needs_glass: needs the GLASS extracts (python scripts/setup_data.py status)")


def pytest_collection_modifyitems(config, items):
    if GLASS_READY:
        return
    skip = pytest.mark.skip(reason="GLASS extracts not set up: python scripts/setup_data.py status")
    for item in items:
        if "needs_glass" in item.keywords:
            item.add_marker(skip)
