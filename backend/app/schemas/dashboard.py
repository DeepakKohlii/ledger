from decimal import Decimal
from typing import Any

from pydantic import BaseModel


class TypeBucket(BaseModel):
    count: int
    value_at_risk: Decimal
    severity: str


class SummaryOut(BaseModel):
    order_rows: int
    order_count: int
    payment_count: int
    order_value: Decimal
    settled_charge_value: Decimal
    refund_value: Decimal
    fee_value: Decimal
    reconciled_order_count: int
    reconciled_value: Decimal
    discrepancy_count: int
    value_at_risk: Decimal
    by_type: dict[str, TypeBucket]
    by_severity: dict[str, int]
    has_orders: bool
    has_payments: bool


class DiscrepancyOut(BaseModel):
    key: str
    type: str
    severity: str
    summary: str
    amount_at_risk: Decimal
    currency: str | None
    order_id: str | None
    transaction_ref: str | None
    details: dict[str, Any]


class DiscrepancyPage(BaseModel):
    items: list[DiscrepancyOut]
    total: int
    limit: int
    offset: int
