"""Replay a fixed charging plan on held-out test windows and flag the risk.

See idea.md section 5.8. For every test window W_i[t]:

    grid_i[t] = max(0, W_i[t] + S[t] + ch[t] - dis[t])

where S[t] is the vans' total charging power and ch/dis are the battery's. A slot is
over the limit when grid_i[t] > C[t] (exactly at the limit is fine).

Units: kW, 15-minute slots, 96 per window. `days_over_pct` and `baseline_alone_over_pct`
are percentages (0-100); `tolerance` is a fraction (0.05 = 5%), as in idea.md 7.3.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

import numpy as np

from gridflex.profiles import N_SLOTS, SLOTS_PER_HOUR, Windows

SLOT_HOURS = 1 / SLOTS_PER_HOUR
_EPS = 1e-9  # float noise: a window is only over the limit by more than this

Verdict = Literal["fits", "fits_with_risk", "does_not_fit"]


class SchedulePlan(Protocol):
    """The parts of scheduler.ScheduleResult that replay needs (idea.md 7.3)."""

    power: np.ndarray  # (n_vans, 96) kW
    battery_charge: np.ndarray  # (96,) kW
    battery_discharge: np.ndarray  # (96,) kW
    unmet_kwh: np.ndarray  # (n_vans,) kWh short at departure


@dataclass
class ImmediateReplay:
    """Immediate-charging comparison (idea.md 5.7): the same flags, without a plan."""

    days_over_pct: float
    worst_overshoot_kw: float
    worst_overshoot_time: str


@dataclass
class ReplayReport:
    days_over_pct: float  # share of test windows with any slot over the limit, 0-100
    worst_overshoot_kw: float  # max over windows and slots of grid - limit (0 if never over)
    worst_overshoot_time: str  # "HH:MM" of that slot; "" if never over
    over_by_slot: np.ndarray  # (96,) number of over-limit windows per slot
    mean_overshoot_kwh: float  # mean kWh above the limit per over-limit window (0 if none)
    baseline_alone_over_pct: float  # share of windows where W alone exceeds C, 0-100
    vans_short: list[tuple[str, float]]  # (van name, kWh short at departure), one entry per van
    verdict: Verdict
    n_windows: int = 0  # number of test windows replayed
    immediate: ImmediateReplay | None = None  # set when immediate_power is given


def slot_time(slot: int, start_hour: int = 12) -> str:
    """Clock time of a slot index in a window that starts at `start_hour`."""
    minutes = (start_hour * 60 + slot * 15) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _check_limit(limit: np.ndarray) -> np.ndarray:
    limit = np.asarray(limit, dtype=np.float64)
    if limit.shape != (N_SLOTS,):
        raise ValueError(f"limit must have shape ({N_SLOTS},), got {limit.shape}")
    return limit


def _grid(test: Windows, added_kw: np.ndarray) -> np.ndarray:
    """(n_windows, 96) grid use: test windows plus the plan's net load, never below 0."""
    return np.maximum(0.0, test.values + added_kw)


def _overshoot(test: Windows, added_kw: np.ndarray, limit: np.ndarray):
    """Core flags for one plan: (excess, over_window, worst_kw, worst_time)."""
    excess = np.maximum(0.0, _grid(test, added_kw) - limit)  # kW above the limit, (n, 96)
    over_slot = excess > _EPS
    over_window = over_slot.any(axis=1)
    if over_window.any():
        i, t = np.unravel_index(np.argmax(excess), excess.shape)
        worst_kw, worst_time = float(excess[i, t]), slot_time(int(t), test.start_hour)
    else:
        worst_kw, worst_time = 0.0, ""
    return excess, over_slot, over_window, worst_kw, worst_time


def _pct(mask: np.ndarray) -> float:
    return float(mask.mean() * 100) if mask.size else 0.0


def replay_immediate(test: Windows, immediate_power: np.ndarray, limit: np.ndarray) -> ImmediateReplay:
    """Days over the limit if every van simply charges on arrival (naive.naive_schedule output)."""
    limit = _check_limit(limit)
    added = np.atleast_2d(immediate_power).sum(axis=0) if np.size(immediate_power) else np.zeros(N_SLOTS)
    _, _, over_window, worst_kw, worst_time = _overshoot(test, added, limit)
    return ImmediateReplay(_pct(over_window), worst_kw, worst_time)


def replay(
    test: Windows,
    result: SchedulePlan,
    limit: np.ndarray,
    van_names: list[str],
    tolerance: float = 0.05,
    immediate_power: np.ndarray | None = None,
) -> ReplayReport:
    """Stress-test a fixed plan on the test windows and return the flags and verdict.

    Verdict (idea.md 5.8): does_not_fit if any van is short; otherwise fits_with_risk if the
    share of days over the limit is above `tolerance`; otherwise fits.
    """
    if len(test) == 0:
        raise ValueError("No test windows to replay")
    limit = _check_limit(limit)

    power = np.asarray(result.power, dtype=np.float64).reshape(-1, N_SLOTS)
    unmet = np.asarray(result.unmet_kwh, dtype=np.float64).reshape(-1)
    if not (power.shape[0] == unmet.shape[0] == len(van_names)):
        raise ValueError(
            f"{power.shape[0]} power rows, {unmet.shape[0]} unmet values and {len(van_names)} van names must match"
        )
    charge = np.zeros(N_SLOTS) if result.battery_charge is None else np.asarray(result.battery_charge, dtype=np.float64)
    discharge = (
        np.zeros(N_SLOTS) if result.battery_discharge is None else np.asarray(result.battery_discharge, dtype=np.float64)
    )

    added = power.sum(axis=0) + charge - discharge  # S[t] + ch[t] - dis[t]
    excess, over_slot, over_window, worst_kw, worst_time = _overshoot(test, added, limit)

    n_over = int(over_window.sum())
    mean_kwh = float(excess[over_window].sum(axis=1).mean() * SLOT_HOURS) if n_over else 0.0
    baseline_over = (test.values > limit + _EPS).any(axis=1)

    vans_short = [(name, float(u)) for name, u in zip(van_names, unmet)]
    if any(u > _EPS for _, u in vans_short):
        verdict: Verdict = "does_not_fit"
    elif n_over / len(test) > tolerance + _EPS:
        verdict = "fits_with_risk"
    else:
        verdict = "fits"

    return ReplayReport(
        days_over_pct=_pct(over_window),
        worst_overshoot_kw=worst_kw,
        worst_overshoot_time=worst_time,
        over_by_slot=over_slot.sum(axis=0).astype(int),
        mean_overshoot_kwh=mean_kwh,
        baseline_alone_over_pct=_pct(baseline_over),
        vans_short=vans_short,
        verdict=verdict,
        n_windows=len(test),
        immediate=None if immediate_power is None else replay_immediate(test, immediate_power, limit),
    )
