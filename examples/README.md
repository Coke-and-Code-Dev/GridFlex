# Development replay example

`replay_report_dev.json` is produced by the real optimizer and `gridflex.replay.replay` on the synthetic development scenario: category 009, January 2023, level 1, a 100 kW limit and 10 vans generated with seed 42. It contains 945 held-out test windows, with `days_over_pct` in percent and energy shortfalls in kWh. The `immediate` field reports the same metrics for charging on arrival.

These are example simulation results, not measurements of a real site. The solver runs with one worker, so the same inputs and OR-Tools version give the same schedule and replay result on every run; the API should still compute results for its current inputs rather than hard-code these values. See `HANDOFF.md` for the JSON field definitions.

If `optimize()` cannot find a valid plan before it stops, it raises `NoScheduleError`; inspect its `status` and do not call replay or present a zero-filled plan as a solution. `FEASIBLE` means a valid plan was found without proving every stage optimal.
