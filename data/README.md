---
license: cdla-permissive-2.0
tags:
- energy
- smartmeter
- synthetic
pretty_name: GLASS
---
# GLASS — Generative-AI Large-customer Smart-meter Samples

## Overview

This dataset contains synthetic daily load profiles for large-customer smart meters, produced by a flow-matching generative model. Each row represents a single day of a single synthetic sample: 96 power values at 15-minute resolution (in kW), conditioned on customer category, generation type, scenario, and consumption/generation level.

This dataset is published as part of [OpenSynth](https://lfenergy.org/projects/opensynth/), an [LF Energy](https://lfenergy.org/) project that democratizes synthetic energy data to accelerate the decarbonization of global energy systems. [HuggingFace](https://huggingface.co/OpenSynth) and the [SURF 4TU Data Repository](https://data.4tu.nl/) are its distribution channels. The dataset was generated using the [SmartMeterFM](https://github.com/sentient-codebot/SmartMeterFM) model trained on [Liander N.V.](https://www.liander.nl/) smart meter data of large customers. These are "grootverbruikers" according to the Dutch Energy law that have a grid connection with capacity between 60 and 160 kW.

The references of this dataset can be found at the end of this file.  

- **File:** `GLASS_v1.1.parquet`
- **Rows:** 43,184,437
- **Columns:** 104 (8 metadata + 96 power values)
- **SHA-256:** `815ac9fc98cf2a2823492a894ac81b132c88d6637a9e1642beb280b38d112343`

### Quick start

```python
import polars as pl
import matplotlib.pyplot as plt

df = pl.read_parquet("GLASS_v1.1.parquet")

# Pick one sample: consumption_only, category 001, 2023-01-15, level 0, sample 0
sample = df.filter(
    (pl.col("scenario") == "consumption_only")
    & (pl.col("category") == "001")
    & (pl.col("date") == "2023-01-15")
    & (pl.col("level_id") == 0)
    & (pl.col("sample_id") == 0)
)

# Plot the 96 power values for that day
power = sample.select(
    pl.exclude(
        "scenario",
        "generation_type",
        "category",
        "date",
        "level_name",
        "level_id",
        "level_value",
        "sample_id",
    )
).row(0)
plt.plot(power)
plt.xlabel("15-min interval")
plt.ylabel("Power (kW)")
plt.title("Daily load profile")
plt.show()
```


## Schema

### Metadata columns

| Column | Type | Description |
|---|---|---|
| `scenario` | String | One of 4 scenarios (see below) |
| `generation_type` | String | `none`, `solar`, or `wind_on_land` |
| `category` | String | Customer category. 26 distinct values. |
| `date` | String | Calendar date (YYYY-MM-DD), ranging 2022-01-01 to 2024-12-31 |
| `level_name` | String | Human-readable level: `low`, `mid_low`, `mid_high`, `high` |
| `level_id` | Int64 | Level index: 0 = low, 1 = mid_low, 2 = mid_high, 3 = high |
| `level_value` | Float64 | Target total energy for the month (kWh/month) |
| `sample_id` | Int64 | Index of the sample within its condition group, starting from 0, with at least 100 per condition |

### Power columns (96)

Columns `00:00:00` through `23:45:00` (Float32) — average power in kW for each 15-minute interval of the day.

- **Consumption** scenarios: values are non-negative (power drawn from grid)
- **Generation** scenarios: values are non-positive (power exported to grid)
- **Hybrid** scenario: values can be positive or negative


## Samples and conditions

### Condition structure

Each sample is generated from a specific **condition**: a combination of scenario, category, year, month, and level. The dataset covers a controlled product of these dimensions.

### Scenarios

| Scenario | Generation type | Sign convention | Description |
|---|---|---|---|
| `consumption_only` | `none` | non-negative | Pure consumption, no local generation |
| `generation_zon` | `solar` | non-positive | Solar PV generation only |
| `generation_wopl` | `wind_on_land` | non-positive | Onshore wind generation only |
| `hybrid_net_consumption` | `solar` | mixed | Net consumption (consumption minus generation) |

### Customer Categories (26 categories)

Consumption Categories: E3D, E3A, E3B, E3C, 001-020

Generation Categories: PV, WIND

Which profiles appear in each scenario:
- `consumption_only`: 24 profiles (all except PV and WIND)
- `generation_zon`: 25 profiles (all except WIND)
- `generation_wopl`: 1 profile (WIND only)
- `hybrid_net_consumption`: 25 profiles (all except WIND)

The consumption profile categories come from the coupling of the Dutch Chamber of Commerce registration of the companies that are registered at the address of the grid connection. Only their main segment is used, which mainly coincides with their main ISIC segments. If no or multiple branches are found, the fallback option are the [NEDU/EDSN load profile categories]( https://energiedatawijzer.nl/wp-content/uploads/Documenten/Topics_MFF/IC063-Profielcategorisering-E-aansluitingen-v1.0.pdf) which depend on the utility time, the amount of time that a customer is active/has a relatively high load. The generation categories are determined by the registered type of generation.

The meaning of the consumption categories is as follows:
| Category       |Description        | ISIC category |
|---|---|---|
| 001    | Standard Branches  | ? |
| 002    | Agriculture, forestry and fishing | A|
| 003    | Mining and quarrying | B |
| 004   | Manufacturing | C|
| 005    | Electricity, gas, steam and air conditioning supply | D |
| 006    | Water supply; sewerage, waste management and remediation activities | E |
| 007    | Construction | F |
| 008    | Wholesale and retail trade; repair of motor vehicles and motorcycles | G |
| 009    | Transportation and storage | H |
| 010   | Accommodation and food service activities | I |
| 011    | Information and communication | J |
| 012    | Financial and insurance activities | K |
| 013    | Real estate activities | L |
| 014    | Professional, scientific and technical activities | M |
| 015    | Administrative and support service activities, renting and leasing of tangible goods | N |
| 016    | Public administration and defence; compulsory social security | O |
| 017    | Education | P |
| 018    | Human health and social work activities | Q |
| 019    | Arts, entertainment and recreation | R |
| 020  | Other service activities | S |
| E3A | Utility time ≤ 2000 hours | n/a |
| E3B | Utility time > 2000 hours and ≤ 3000 hours | n/a |
| E3C | Utility time > 3000 hours and ≤ 5000 hours | n/a |
| E3D | Utility time ≥ 5000 hours | n/a |

### Years and months

3 years (2022-2024) x 12 months, with one exception: wind generation data (`generation_wopl`) is limited to winter months (October-February) — see notes below.

### Levels

4 levels per month (`low`, `mid_low`, `mid_high`, `high`), with target values (`level_value`) that vary by month. For example, solar generation levels are higher in summer. The `level_value` represents the net consumption (consumption minus generation) for the `hybrid_net_consumption` scenario. 

### Samples per condition

Each condition has at least 100 valid samples. After quality filtering,
conditions with fewer than 100 valid samples are discarded; surviving
conditions retain all valid samples.

### How rows relate to samples

Rows with the same `scenario`, `category`, year-month (from `date`), `level_id`, and `sample_id` belong to the **same sample** — a month-long profile decomposed into daily rows. These rows are consecutive with contiguous dates covering a full calendar month.


## Level values

The `level_value` column gives the target total energy for the month in kWh.
The actual monthly total computed from the power values may deviate from
`level_value`; applications that require exact totals should calculate them
from the 15-minute power values.

For consumption and generation-only scenarios, `level_value` is a positive absolute value. The sign convention of the power columns indicates the direction:
- `consumption_only`: positive `level_value`, positive power values
- `generation_zon` / `generation_wopl`: positive `level_value`, negative power values
- `hybrid_net_consumption`: `level_value` can be negative (net export), power values are mixed-sign


## Important notes

1. **Wind data coverage is limited.** The `generation_wopl` scenario only contains data for October-February (winter months). There is not enough training data to support generating good quality March-September wind data. 

2. **Low variance within some conditions.** For certain conditions, the generated samples may have low diversity. Theoretically, the conditional distribution p(x|y) can have very low variance for specific conditioning values y. This is a property of the generative model inherited from training data, not a data error.

3. **Energy-preserving sign correction.** Profiles in the constrained
   scenarios are minimally adjusted to the intended sign domain while
   preserving each monthly sample's realized accumulated energy within
   numerical tolerance. Consumption is non-negative, generation is
   non-positive, and `hybrid_net_consumption` remains unchanged by this
   correction.


## License

This dataset is licensed under the [Community Data License Agreement – Permissive – Version 2.0 (CDLA-Permissive-2.0)](https://cdla.dev/permissive-2-0/) license.


## Reference

This dataset was generated by a flow-matching generative model trained on smart meter data from [Liander N.V.](https://www.liander.nl/). 

Please cite us using:

**Dataset DOI:** `10.4121/b18de4df-0f67-4a6f-aa84-6634cdd63991`

**Dataset description paper DOI:** `TBD`

**Model paper:**

- Nan Lin, Yanbo Wang, Jacco Heres, Peter Palensky, and Pedro P. Vergara.
 _**SmartMeterFM: Unifying Smart Meter Data Generative Tasks Using Flow Matching Models.**_ arXiv preprint, 2025. [arXiv:2601.21706](https://arxiv.org/abs/2601.21706)
 
- DOI: `10.48550/arXiv.2601.21706`

## Acknowledgements

This dataset is part of the project ALIGN4energy (with project number NWA.1389.20.251) of the research programme NWA ORC 2020 which is (partly) financed by the Dutch Research Council (NWO). TU Delft and Alliander are partners of the ALIGN4energy project.
