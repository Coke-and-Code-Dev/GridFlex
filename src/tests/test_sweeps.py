import numpy as np
import pytest
from gridflex.fleet import Van
from gridflex.profiles import Windows
from gridflex.replay import charger_sweep, battery_sweep


def sample_windows():
    return Windows(np.full((2, 96), 90.0), np.array([0, 1]),
                   np.zeros(2, dtype='datetime64[D]'))


def test_charger_sweep_uses_same_fleet_and_exposes_shortfall():
    w = sample_windows()
    vans = [Van('one', 0, 4, 10, 10), Van('two', 0, 4, 10, 10)]
    table = charger_sweep(w, w, np.full(96, 100.0), vans, 2)
    assert table['n'].to_list() == [1, 2]
    assert table['kwh_short'].to_list() == [0.0, 10.0]
    assert table['days_over_pct'].to_list() == [0.0, 0.0]


def test_battery_sweep_requires_energy_and_risk_to_fit():
    w = sample_windows()
    van = Van('one', 0, 4, 11, 11)
    table = battery_sweep(w, w, np.full(96, 100.0), [van], [0, 20], power_kw=5)
    assert table['fits'].to_list() == [False, True]
    assert table['smallest_fit'].to_list() == [False, True]
    assert table['kwh_short'].to_list() == [1.0, 0.0]


def test_sweep_reports_unknown_without_inventing_results():
    w = sample_windows()
    table = charger_sweep(w, w, np.full(96, 100.0), [Van('one', 0, 4, 10, 10)], 1, time_limit_s=1e-9)
    assert table['status'].to_list() == ['UNKNOWN']
    assert table['days_over_pct'].to_list() == [None]


def test_reject_bad_sweep_inputs():
    w = sample_windows()
    with pytest.raises(ValueError): charger_sweep(w, w, np.full(96, 100), [], 1)
    with pytest.raises(ValueError): battery_sweep(w, w, np.full(96, 100), [], [0], 5, tolerance=2)


def test_sweep_cache_respects_changed_inputs():
    w = sample_windows()
    vans = [Van('one', 0, 4, 10, 10)]
    limit = np.full(96, 100.0)
    first = charger_sweep(w, w, limit, vans, 1)
    again = charger_sweep(w, w, limit, vans, 1)
    assert first.equals(again)
    limit[:] = 95.0
    changed = charger_sweep(w, w, limit, vans, 1)
    assert changed['kwh_short'][0] > first['kwh_short'][0]
