from pydantic import BaseModel


class ExplanationBody(BaseModel):
    what_happened: str
    likely_cause: str
    recommended_action: str
    priority: str


class SummaryBody(BaseModel):
    headline: str
    biggest_risk: str
    where_to_start: str
    watch_outs: list[str]


class ExplanationOut(BaseModel):
    cache_key: str
    cached: bool
    model: str
    explanation: ExplanationBody


class SummaryExplanationOut(BaseModel):
    cache_key: str
    cached: bool
    model: str
    explanation: SummaryBody
