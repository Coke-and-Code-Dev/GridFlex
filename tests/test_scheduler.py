import math
import numpy as np
import pytest
from gridflex.fleet import Van, generate_fleet
from gridflex.naive import naive_schedule
from gridflex.scheduler import NoScheduleError, limit_profile, optimize


def test_seeded_fleet_prefix_and_noon_slots():
    fleet = generate_fleet(15)
    assert fleet[:10] == generate_fleet(10)
    assert all(20 <= v.arrival_slot <= 28 and 72 <= v.departure_slot <= 76 for v in fleet)


def test_immediate_schedule_respects_presence_and_energy():
    v = Van('van', 20, 24, 5.1, 11)
    p = naive_schedule([v])[0]
    assert p.tolist()[20:24] == [11, 10, 0, 0]
    assert p.sum() / 4 == 5.25
    assert not p[:20].any() and not p[24:].any()


def test_scheduler_easy_presence_and_energy():
    vans = generate_fleet(10)
    b = np.full(96, 55.0)
    limit = np.full(96, 100.0)
    r = optimize(b, limit, vans)
    assert r.status == 'OPTIMAL'
    assert r.power.shape == (10, 96)
    assert not r.unmet_kwh.any()
    assert np.all(b + r.power.sum(axis=0) <= limit)
    for i, v in enumerate(vans):
        assert not r.power[i, :v.arrival_slot].any() and not r.power[i, v.departure_slot:].any()
        assert r.power[i].max() <= v.charger_kw
        assert r.power[i].sum() / 4 + r.unmet_kwh[i] == math.ceil(4*v.energy_kwh)/4


def test_shortfall_and_baseline_above_limit():
    v = Van('v', 0, 4, 10, 11)
    b = np.full(96, 100.0)
    r = optimize(b, np.full(96, 100.0), [v])
    assert r.unmet_kwh.tolist() == [10]
    assert not r.power.any() and r.blocked_slots == []
    r = optimize(b + 1, np.full(96, 100.0), [v])
    assert r.unmet_kwh.tolist() == [10]
    assert not r.power.any() and len(r.blocked_slots) == 96


def test_partial_energy_and_fractional_limit_conservatism():
    v = Van('v', 0, 4, 8, 11)
    r = optimize(np.full(96, 95.1), np.full(96, 100.9), [v])
    assert r.power[0].sum() == 16
    assert r.unmet_kwh.tolist() == [4]
    assert np.all(95.1 + r.power.sum(axis=0) <= 100.9)


def test_limit_profile_crosses_midnight():
    c = limit_profile(100, 50, ('22:00', '06:00'))
    assert np.all(c[40:72] == 150)
    assert np.all(c[:40] == 100) and np.all(c[72:] == 100)


def test_zero_vans_and_invalid_inputs():
    r = optimize(np.full(96, 40.), np.full(96, 100.), [])
    assert r.power.shape == (0, 96) and r.unmet_kwh.size == 0
    with pytest.raises(ValueError): Van('bad', 50, 40, 5)
    with pytest.raises(ValueError): optimize(np.zeros(95), np.zeros(96), [])
    with pytest.raises(ValueError): limit_profile(100, 5, ('00:00','00:00'))


def test_no_solution_is_not_reported_as_a_valid_schedule():
    with pytest.raises(NoScheduleError) as exc:
        optimize(np.full(96, 40.), np.full(96, 100.), generate_fleet(10), time_limit_s=1e-9)
    assert exc.value.status == 'UNKNOWN'


def test_battery_energy_balance_and_can_help_charging():
    from gridflex.scheduler import Battery
    van = Van('van', 0, 4, 11, 11)
    baseline = np.full(96, 90.0)
    limit = np.full(96, 100.0)
    without = optimize(baseline, limit, [van])
    battery = Battery(capacity_kwh=20, power_kw=5, efficiency=0.9, start_soc=0.5)
    with_battery = optimize(baseline, limit, [van], battery)
    assert without.unmet_kwh.sum() == 1
    assert with_battery.unmet_kwh.sum() == 0
    assert not np.any((with_battery.battery_charge > 0) & (with_battery.battery_discharge > 0))
    assert np.max(with_battery.battery_charge) <= 5 and np.max(with_battery.battery_discharge) <= 5
    assert np.all(with_battery.battery_soc_kwh >= 0) and np.all(with_battery.battery_soc_kwh <= 20)
    expected = with_battery.battery_soc_kwh[:-1] + 0.25 * 0.9 * with_battery.battery_charge - 0.25 * with_battery.battery_discharge
    assert np.allclose(with_battery.battery_soc_kwh[1:], expected)
    assert with_battery.battery_soc_kwh[-1] >= with_battery.battery_soc_kwh[0]
    assert np.all(with_battery.battery_discharge <= baseline + with_battery.power.sum(axis=0))
    assert np.all(baseline + with_battery.power.sum(axis=0) + with_battery.battery_charge - with_battery.battery_discharge <= limit)


def test_battery_invalid_parameters():
    from gridflex.scheduler import Battery
    with pytest.raises(ValueError):
        optimize(np.full(96,40.), np.full(96,100.), [], Battery(10, 2, efficiency=1.5))


def test_real_development_scenario_integrates_with_replay():
    from gridflex.profiles import load_condition, build_windows, split_by_sample, cautious_baseline
    from gridflex.replay import replay
    windows = build_windows(load_condition('009', '2023-01', 1))
    planning, test = split_by_sample(windows)
    vans = generate_fleet(10)
    limit = limit_profile(100)
    r = optimize(cautious_baseline(planning), limit, vans)
    report = replay(test, r, limit, [v.name for v in vans], immediate_power=naive_schedule(vans))
    assert report.n_windows == 945
    assert r.unmet_kwh.sum() == 0 and report.immediate.days_over_pct == 100
    assert report.days_over_pct < report.immediate.days_over_pct
    assert report.baseline_alone_over_pct == pytest.approx(100 * 7 / 945)


def test_scheduler_matches_brute_force_for_a_small_case():
    import itertools
    baseline = np.full(96, 50.0)
    limit = np.full(96, 100.0)
    baseline[:3] = [99, 97, 98]
    van = Van('v', 0, 3, 1.0, 3)
    result = optimize(baseline, limit, [van])
    candidates = []
    for p in itertools.product(range(4), repeat=3):
        if sum(p) > 4 or any(baseline[t] + p[t] > limit[t] for t in range(3)):
            continue
        candidates.append((4 - sum(p), max(50, *(int(baseline[t]) + p[t] for t in range(3)))))
    assert (round(result.unmet_kwh[0]*4), result.peak_kw) == min(candidates)


def test_oversized_battery_remains_within_limits():
    from gridflex.scheduler import Battery
    r = optimize(np.full(96, 40.), np.full(96, 100.), [], Battery(1000, 10))
    assert np.all((0 <= r.battery_soc_kwh) & (r.battery_soc_kwh <= 1000))
    assert not r.battery_charge.any() and not r.battery_discharge.any()
