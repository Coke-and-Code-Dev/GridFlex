from typing import Literal

from pydantic import BaseModel, Field, model_validator


class VanOverride(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    arrival_slot: int = Field(ge=0, lt=96)
    departure_slot: int = Field(gt=0, le=96)
    energy_kwh: float = Field(ge=0, le=120)
    charger_kw: int = Field(ge=1, le=50)


class Scenario(BaseModel):
    # Building load (idea.md 5.2a): "meter" = the site's own upload, "bill" = the sector's
    # GLASS profile scaled to monthly_kwh, "profile" = a GLASS profile as-is (demo default).
    load_source: Literal["profile", "bill", "meter"] = "profile"
    category: str = Field(default="009", pattern=r"^(\d{3}|E3[A-D])$")
    month: str = Field(default="2024-01", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    level: int = Field(default=1, ge=0, le=3)
    monthly_kwh: float | None = Field(default=None, ge=100, le=200_000)
    meter_id: str | None = Field(default=None, pattern=r"^[0-9a-f]{16}$")
    postcode: str = Field(default="1181KJ", max_length=12)
    vans: int = Field(default=10, ge=1, le=40)
    limit_kw: float = Field(default=100, ge=60, le=160)
    extra_kw: float = Field(default=0, ge=0, le=160)
    off_peak: tuple[str, str] = ("22:00", "06:00")
    arrival: tuple[str, str] = ("17:00", "19:00")
    departure: tuple[str, str] = ("06:00", "07:00")
    energy_kwh: tuple[float, float] = (30, 40)
    charger_kw: int = Field(default=11, ge=1, le=50)
    battery_kwh: float = Field(default=0, ge=0, le=800)
    battery_kw: int = Field(default=0, ge=0, le=250)
    q: float = Field(default=.9, ge=.5, le=.99)
    tolerance: float = Field(default=.05, ge=0, le=1)
    seed: int = Field(default=42, ge=0)
    overrides: dict[int, VanOverride] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _load_source_inputs(self):
        if self.load_source == "bill" and self.monthly_kwh is None:
            raise ValueError("Enter the monthly kWh from the energy bill.")
        if self.load_source == "meter" and self.meter_id is None:
            raise ValueError("Upload meter data first.")
        return self


class CsvUpload(BaseModel):
    csv: str = Field(min_length=1)


class MeterUploadResponse(BaseModel):
    meter_id: str
    days: int
    first_date: str
    last_date: str
    dropped_days: int
    monthly_kwh: float
    peak_kw: float
    planning_days: int
    test_days: int
    description: str
    warnings: list[str]


class SweepRequest(BaseModel):
    scenario: Scenario
    kind: Literal["chargers", "battery"]


class ConversationTurn(BaseModel):
    question: str = Field(max_length=500)
    text: str = Field(max_length=3000)


class ExplanationRequest(BaseModel):
    scenario: Scenario
    previous: Scenario | None = None
    question: str | None = Field(default=None, max_length=500)
    history: list[ConversationTurn] = Field(default_factory=list, max_length=6)
    provider: Literal["groq", "ollama"] = "groq"


class WhatIfRequest(BaseModel):
    scenario: Scenario
    action: Literal["extra_capacity", "later_departure", "battery"]


class Evidence(BaseModel):
    id: str
    text: str


class ExplanationResponse(BaseModel):
    text: str
    source: Literal["groq", "ollama", "template"]
    evidence: list[Evidence] = Field(default_factory=list)


class ComparisonMetrics(BaseModel):
    vans_full: int
    vans_total: int
    unmet_kwh: float
    days_over_pct: float
    worst_overshoot_kw: float
    status: str


class WhatIfResponse(BaseModel):
    description: str
    current: ComparisonMetrics
    changed: ComparisonMetrics
    scenario: Scenario


class PortfolioQuestion(BaseModel):
    current_depot: str | None = Field(default=None, max_length=200)
    run_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    question: str = Field(min_length=1, max_length=500)
    history: list[ConversationTurn] = Field(default_factory=list, max_length=6)
    provider: Literal["groq", "ollama"] = "groq"
