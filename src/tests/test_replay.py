from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pytest

from gridflex.profiles import Windows
from gridflex.replay import replay, replay_immediate, slot_time


@dataclass
class FakePlan:
    """Stand-in for scheduler.ScheduleResult with the fields replay() reads."""

    power: np.ndarray
    unmet_kwh: np.ndarray
    battery_charge: np.ndarray = field(default_factory=lambda: np.zeros(96))
    battery_discharge: np.ndarray = field(default_factory=lambda: np.zeros(96))


def windows(rows: np.ndarray, start_hour: int = 12) -> Windows:
    n = rows.shape[0]
    return Windows(rows.astype(float), np.arange(n), np.zeros(n, dtype="datetime64[D]"), start_hour)


def van_plan(kw: float = 40, slots=range(10, 14), unmet=(0.0,)) -> FakePlan:
    """One 'van' charging `kw` in `slots`."""
    power = np.zeros((len(unmet), 96))
    power[0, list(slots)] = kw
    return FakePlan(power=power, unmet_kwh=np.array(unmet, dtype=float))


@pytest.fixture
def sample_windows() -> Windows:
    """Four windows around a 50 kW building, with a 40 kW plan in slots 10-13 and a 100 kW limit.

    W0: grid max 90 -> fine
    W1: slot 10 at 70 -> 110 -> 10 kW over
    W2: slot 11 at 80 -> 120 (20 over), slot 12 at 65 -> 105 (5 over)
    W3: slot 90 at 110 (baseline alone, no plan there) -> 10 over
    """
    rows = np.full((4, 96), 50.0)
    rows[1, 10] = 70
    rows[2, 11] = 80
    rows[2, 12] = 65
    rows[3, 90] = 110
    return windows(rows)


LIMIT = np.full(96, 100.0)


def test_known_overshoot_gives_the_right_flags(sample_windows):
    r = replay(sample_windows, van_plan(), LIMIT, ["van 1"], tolerance=0.05)

    assert r.n_windows == 4
    assert r.days_over_pct == pytest.approx(75.0)  # W1, W2, W3
    assert r.worst_overshoot_kw == pytest.approx(20.0)  # W2, slot 11
    assert r.worst_overshoot_time == "14:45"  # slot 11 from a 12:00 start
    assert r.over_by_slot.shape == (96,)
    assert r.over_by_slot[10] == 1 and r.over_by_slot[11] == 1 and r.over_by_slot[12] == 1
    assert r.over_by_slot[90] == 1
    assert r.over_by_slot.sum() == 4
    # kWh above the limit per affected window: W1 10 kW, W2 20+5 kW, W3 10 kW, each x 0.25 h
    assert r.mean_overshoot_kwh == pytest.approx((2.5 + 6.25 + 2.5) / 3)
    assert r.baseline_alone_over_pct == pytest.approx(25.0)  # only W3
    assert r.verdict == "fits_with_risk"


def test_exactly_at_the_limit_is_not_over():
    rows = np.full((3, 96), 60.0)  # 60 + 40 = 100 = limit
    r = replay(windows(rows), van_plan(40, range(0, 96)), LIMIT, ["v"])
    assert r.days_over_pct == 0
    assert r.worst_overshoot_kw == 0
    assert r.worst_overshoot_time == ""
    assert r.mean_overshoot_kwh == 0
    assert r.over_by_slot.sum() == 0
    assert r.verdict == "fits"


def test_verdict_rules(sample_windows):
    ok = van_plan()
    # 75% of days over: above 5% tolerance -> risk, within a 80% tolerance -> fits
    assert replay(sample_windows, ok, LIMIT, ["v"], tolerance=0.05).verdict == "fits_with_risk"
    assert replay(sample_windows, ok, LIMIT, ["v"], tolerance=0.80).verdict == "fits"
    # exactly at the tolerance counts as within it
    assert replay(sample_windows, ok, LIMIT, ["v"], tolerance=0.75).verdict == "fits"
    # a van left short always means it doesn't fit, whatever the tolerance
    short = van_plan(unmet=(2.5,))
    assert replay(sample_windows, short, LIMIT, ["v"], tolerance=1.0).verdict == "does_not_fit"


def test_vans_short_lists_every_van_with_its_shortfall():
    plan = FakePlan(power=np.zeros((3, 96)), unmet_kwh=np.array([0.0, 7.5, 0.0]))
    r = replay(windows(np.full((2, 96), 10.0)), plan, LIMIT, ["a", "b", "c"])
    assert r.vans_short == [("a", 0.0), ("b", 7.5), ("c", 0.0)]
    assert r.verdict == "does_not_fit"


def test_battery_discharge_removes_overshoot_and_charge_adds_it(sample_windows):
    discharge = np.zeros(96)
    discharge[10] = 10  # exactly cancels W1's 10 kW overshoot in slot 10
    plan = van_plan()
    plan.battery_discharge = discharge
    r = replay(sample_windows, plan, LIMIT, ["v"])
    assert r.over_by_slot[10] == 0
    assert r.days_over_pct == pytest.approx(50.0)  # W2 and W3 remain

    charge = np.zeros(96)
    charge[0] = 60  # 50 + 60 = 110 in slot 0 for every window
    plan2 = van_plan()
    plan2.battery_charge = charge
    r2 = replay(sample_windows, plan2, LIMIT, ["v"])
    assert r2.over_by_slot[0] == 4
    assert r2.days_over_pct == pytest.approx(100.0)


def test_grid_use_never_goes_negative():
    # discharge larger than the building load must not count as export or as a negative number
    rows = np.full((1, 96), 5.0)
    plan = FakePlan(power=np.zeros((0, 96)), unmet_kwh=np.zeros(0), battery_discharge=np.full(96, 30.0))
    r = replay(windows(rows), plan, np.full(96, 1.0), [])
    assert r.days_over_pct == 0 and r.worst_overshoot_kw == 0


def test_limit_can_change_over_the_day():
    rows = np.full((2, 96), 50.0)
    limit = np.full(96, 100.0)
    limit[20:30] = 80.0  # tighter in the evening
    r = replay(windows(rows), van_plan(40, range(20, 30), unmet=(0.0,)), limit, ["v"])
    assert r.days_over_pct == 100.0  # 90 > 80 in slots 20-29
    assert r.worst_overshoot_kw == pytest.approx(10.0)
    assert r.over_by_slot[20:30].tolist() == [2] * 10
    assert r.over_by_slot.sum() == 20


def test_zero_vans_is_just_the_baseline(sample_windows):
    plan = FakePlan(power=np.zeros((0, 96)), unmet_kwh=np.zeros(0))
    r = replay(sample_windows, plan, LIMIT, [])
    assert r.vans_short == []
    assert r.days_over_pct == pytest.approx(25.0)  # W3 only
    assert r.baseline_alone_over_pct == pytest.approx(25.0)


def test_window_start_hour_sets_the_clock_time():
    rows = np.full((1, 96), 50.0)
    rows[0, 11] = 90
    plan = van_plan(40, [11])
    assert replay(windows(rows, start_hour=0), plan, LIMIT, ["v"]).worst_overshoot_time == "02:45"
    assert replay(windows(rows, start_hour=12), plan, LIMIT, ["v"]).worst_overshoot_time == "14:45"
    assert slot_time(0, 12) == "12:00" and slot_time(48, 12) == "00:00" and slot_time(95, 12) == "11:45"


def test_immediate_charging_comparison(sample_windows):
    # three vans all charging 40 kW at slot 10 on top of a 50 kW building: 170 kW
    naive = np.zeros((3, 96))
    naive[:, 10] = 40
    imm = replay_immediate(sample_windows, naive, LIMIT)
    assert imm.days_over_pct == pytest.approx(100.0)  # slot 10 over in all four, W3 anyway
    assert imm.worst_overshoot_kw == pytest.approx(90.0)  # W1: 70 + 120 - 100
    assert imm.worst_overshoot_time == "14:30"

    r = replay(sample_windows, van_plan(), LIMIT, ["v"], immediate_power=naive)
    assert r.immediate == imm
    assert replay(sample_windows, van_plan(), LIMIT, ["v"]).immediate is None


def test_bad_inputs_are_rejected(sample_windows):
    with pytest.raises(ValueError, match="limit"):
        replay(sample_windows, van_plan(), np.full(95, 100.0), ["v"])
    with pytest.raises(ValueError, match="van names"):
        replay(sample_windows, van_plan(), LIMIT, ["a", "b"])
    with pytest.raises(ValueError, match="No test windows"):
        replay(windows(np.empty((0, 96))), van_plan(), LIMIT, ["v"])
