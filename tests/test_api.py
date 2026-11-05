import numpy as np

from api.main import optimize_route
from api.schemas import Scenario
from gridflex.fleet import generate_fleet
from gridflex.naive import naive_schedule


def test_optimize_returns_total_immediate_power_per_slot():
    scenario = Scenario(vans=2)
    payload = optimize_route(scenario)
    vans = generate_fleet(
        scenario.vans, scenario.seed, scenario.arrival, scenario.departure,
        scenario.energy_kwh, scenario.charger_kw,
    )
    expected = naive_schedule(vans).sum(axis=0)
    np.testing.assert_array_equal(payload["immediate_power_kw"], expected)
