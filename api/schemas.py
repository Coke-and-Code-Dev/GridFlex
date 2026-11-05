from typing import Literal

from pydantic import BaseModel, Field


class VanOverride(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    arrival_slot: int = Field(ge=0, lt=96)
    departure_slot: int = Field(gt=0, le=96)
    energy_kwh: float = Field(ge=0, le=120)
    charger_kw: int = Field(ge=1, le=50)


class Scenario(BaseModel):
    category: str = Field(default="009", pattern=r"^\d{3}$")
    month: str = Field(default="2023-01", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    level: int = Field(default=1, ge=0, le=3)
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


class CsvUpload(BaseModel):
    csv: str = Field(min_length=1)


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
