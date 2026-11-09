"""Constraint-based EV scheduling for a 96-slot, noon-to-noon window."""
from __future__ import annotations

from dataclasses import dataclass
import math
import time
import numpy as np
from ortools.sat.python import cp_model
from gridflex.fleet import Van, _clock_slot


@dataclass(frozen=True)
class Battery:
    capacity_kwh: float
    power_kw: int
    efficiency: float = 0.90
    start_soc: float = 0.5


@dataclass
class ScheduleResult:
    power: np.ndarray
    battery_charge: np.ndarray
    battery_discharge: np.ndarray
    battery_soc_kwh: np.ndarray
    unmet_kwh: np.ndarray
    peak_kw: float
    status: str
    blocked_slots: list[int]
    solve_seconds: float


class NoScheduleError(RuntimeError):
    """No usable schedule found; status is UNKNOWN, INFEASIBLE, or MODEL_INVALID."""
    def __init__(self, status: str):
        self.status = status
        super().__init__(f'No schedule returned by solver: {status}')


def limit_profile(firm_kw: float, extra_kw: float = 0, extra_window=('22:00', '06:00'),
                  start_hour: int = 12) -> np.ndarray:
    if not all(math.isfinite(x) and x >= 0 for x in (firm_kw, extra_kw)):
        raise ValueError('connection limits must be finite and nonnegative')
    if not isinstance(start_hour, int) or not 0 <= start_hour < 24:
        raise ValueError('start_hour must be 0-23')
    a, b = (_clock_slot(t, start_hour) for t in extra_window)
    if a == b and extra_kw:
        raise ValueError('extra window must have different start and end times')
    result = np.full(96, firm_kw, dtype=float)
    if a < b:
        result[a:b] += extra_kw
    elif a > b:
        result[a:] += extra_kw
        result[:b] += extra_kw
    return result


def optimize(baseline: np.ndarray, limit: np.ndarray, vans: list[Van],
             battery: Battery | None = None, time_limit_s: float = 10.0) -> ScheduleResult:
    started = time.monotonic()
    base = np.asarray(baseline, dtype=float)
    limits = np.asarray(limit, dtype=float)
    if base.shape != (96,) or limits.shape != (96,):
        raise ValueError('baseline and limit must have shape (96,)')
    if not np.isfinite(base).all() or not np.isfinite(limits).all() or (base < 0).any() or (limits < 0).any():
        raise ValueError('baseline and limit must be finite and nonnegative')
    if not math.isfinite(time_limit_s) or time_limit_s <= 0:
        raise ValueError('time_limit_s must be positive and finite')
    if battery is not None:
        if (not math.isfinite(battery.capacity_kwh) or battery.capacity_kwh < 0
                or not isinstance(battery.power_kw, int) or battery.power_kw < 0
                or not math.isfinite(battery.efficiency) or not 0 < battery.efficiency <= 1
                or not math.isfinite(battery.start_soc) or not 0 <= battery.start_soc <= 1):
            raise ValueError('invalid battery capacity, power, efficiency or initial state')
    base_int = np.ceil(base).astype(np.int64)
    limit_int = np.floor(limits).astype(np.int64)
    model = cp_model.CpModel()
    power = [[model.new_int_var(0, v.charger_kw if v.arrival_slot <= t < v.departure_slot else 0,
                                f'p_{i}_{t}') for t in range(96)] for i, v in enumerate(vans)]
    unmet = []
    for i, van in enumerate(vans):
        need = math.ceil(4 * van.energy_kwh)
        u = model.new_int_var(0, need, f'unmet_{i}')
        model.add(sum(power[i]) + u == need)
        unmet.append(u)
    battery_power = battery.power_kw if battery is not None else 0
    charge = [model.new_int_var(0, battery_power, f'charge_{t}') for t in range(96)]
    discharge = [model.new_int_var(0, battery_power, f'discharge_{t}') for t in range(96)]
    soc = []
    if battery is not None:
        capacity = round(battery.capacity_kwh * 10000)
        initial = round(capacity * battery.start_soc)
        soc = [model.new_int_var(0, capacity, f'soc_{t}') for t in range(97)]
        model.add(soc[0] == initial)
        model.add(soc[96] >= initial)
        for t in range(96):
            mode = model.new_bool_var(f'battery_charge_mode_{t}')
            model.add(charge[t] <= battery_power * mode)
            model.add(discharge[t] <= battery_power * (1 - mode))
            model.add(soc[t+1] == soc[t] + round(2500 * battery.efficiency) * charge[t] - 2500 * discharge[t])
            model.add(discharge[t] <= int(math.floor(base[t])) + sum(row[t] for row in power))
    max_grid = int(base_int.max()) + sum(v.charger_kw for v in vans) + battery_power
    overshoot = []
    peak = model.new_int_var(0, max_grid, 'peak')
    for t in range(96):
        total = int(base_int[t]) + sum(row[t] for row in power) + charge[t] - discharge[t]
        o = model.new_int_var(0, max(0, int(base_int[t] - limit_int[t])), f'overshoot_{t}')
        model.add(total <= int(limit_int[t]) + o)
        model.add(peak >= total)
        overshoot.append(o)
    stages = [sum(overshoot), sum(unmet), peak]
    if battery is not None:
        stages.append(sum(charge) + sum(discharge))
    last_solver = None
    all_optimal = True
    for objective in stages:
        model.minimize(objective)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit_s
        # One worker keeps the search order fixed, so the same inputs give the same
        # plan on every run and laptop; with parallel workers, equally optimal plans
        # (and their replay risk) changed with timing and core count.
        solver.parameters.num_workers = 1
        status = solver.solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if last_solver is None:
                raise NoScheduleError(solver.status_name(status))
            all_optimal = False
            break
        last_solver = solver
        if status != cp_model.OPTIMAL:
            all_optimal = False
            break
        model.add(objective == solver.value(objective))
    assert last_solver is not None
    values = np.array([[last_solver.value(x) for x in row] for row in power], dtype=np.int64).reshape(len(vans), 96)
    short = np.array([last_solver.value(x) / 4 for x in unmet], dtype=float)
    charge_values = np.array([last_solver.value(x) for x in charge], dtype=np.int64)
    discharge_values = np.array([last_solver.value(x) for x in discharge], dtype=np.int64)
    soc_values = np.array([last_solver.value(x) / 10000 for x in soc], dtype=float) if soc else np.zeros(97)
    total = base_int + values.sum(axis=0) + charge_values - discharge_values
    return ScheduleResult(values, charge_values, discharge_values, soc_values, short,
                          float(total.max()), 'OPTIMAL' if all_optimal else 'FEASIBLE',
                          np.flatnonzero(total > limit_int).tolist(), time.monotonic() - started)
