"""Repeatable fleet requests in quarter-hour slots."""
from __future__ import annotations

from dataclasses import dataclass
import math
import numpy as np


@dataclass(frozen=True)
class Van:
    name: str
    arrival_slot: int
    departure_slot: int
    energy_kwh: float
    charger_kw: int = 11

    def __post_init__(self) -> None:
        if not isinstance(self.name, str) or not self.name:
            raise ValueError('van name must not be empty')
        if not isinstance(self.arrival_slot, int) or not isinstance(self.departure_slot, int) or not 0 <= self.arrival_slot < self.departure_slot <= 96:
            raise ValueError('arrival and departure must satisfy 0 <= arrival < departure <= 96')
        if not math.isfinite(self.energy_kwh) or self.energy_kwh < 0:
            raise ValueError('energy_kwh must be finite and nonnegative')
        if not isinstance(self.charger_kw, int) or self.charger_kw < 0:
            raise ValueError('charger_kw must be a nonnegative integer')


def _clock_slot(value: str, start_hour: int) -> int:
    try:
        hour, minute = map(int, value.split(':'))
    except (ValueError, AttributeError):
        raise ValueError('time must be HH:MM on a 15-minute boundary') from None
    if not 0 <= hour < 24 or minute not in (0, 15, 30, 45):
        raise ValueError('time must be HH:MM on a 15-minute boundary')
    return ((hour * 60 + minute - start_hour * 60) % 1440) // 15


def generate_fleet(n: int, seed: int = 42, arrival=('17:00', '19:00'),
                   departure=('06:00', '07:00'), energy=(30, 40),
                   charger_kw: int = 11, start_hour: int = 12) -> list[Van]:
    """Generate repeatable vans; the first N are independent of requested fleet size."""
    if not isinstance(n, int) or n < 0 or not isinstance(start_hour, int) or not 0 <= start_hour < 24:
        raise ValueError('n must be nonnegative and start_hour must be 0-23')
    a0, a1 = (_clock_slot(t, start_hour) for t in arrival)
    d0, d1 = (_clock_slot(t, start_hour) for t in departure)
    if a0 > a1 or d0 > d1 or a1 >= d0:
        raise ValueError('arrival and departure ranges must be ordered within the scheduling window')
    low, high = energy
    if not math.isfinite(low) or not math.isfinite(high) or low < 0 or high < low:
        raise ValueError('invalid energy range')
    rng = np.random.default_rng(seed)
    vans = []
    for i in range(n):
        a = int(rng.integers(a0, a1 + 1))
        d = int(rng.integers(d0, d1 + 1))
        e = float(rng.uniform(low, high)) if high > low else float(low)
        vans.append(Van(f'Van {i + 1}', a, d, e, charger_kw))
    return vans
