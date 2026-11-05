"""Immediate charging comparison, rounded like the optimizer."""
from __future__ import annotations
import math
import numpy as np
from gridflex.fleet import Van


def naive_schedule(vans: list[Van], n_slots: int = 96) -> np.ndarray:
    if n_slots != 96:
        raise ValueError('the scheduling window must contain 96 slots')
    power = np.zeros((len(vans), n_slots), dtype=np.int64)
    for i, van in enumerate(vans):
        remaining = math.ceil(4 * van.energy_kwh)
        for t in range(van.arrival_slot, van.departure_slot):
            amount = min(van.charger_kw, remaining)
            power[i, t] = amount
            remaining -= amount
            if remaining == 0:
                break
    return power
