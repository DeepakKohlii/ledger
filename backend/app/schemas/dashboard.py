from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from app.schemas.ingestion import UploadOut


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


class OrderRow(BaseModel):
    source_row: int
    order_id: str
    order_date: str | None
    customer_email: str | None
    currency: str | None
    gross_amount: Decimal | None
    discount: Decimal | None
    net_amount: Decimal | None
    status: str | None


class PaymentRow(BaseModel):
    source_row: int
    transaction_ref: str
    processed_at: str | None
    order_reference: str | None
    raw_order_reference: str | None
    currency: str | None
    amount: Decimal | None
    fee: Decimal | None
    net_settled: Decimal | None
    type: str | None
    status: str | None


class Evidence(BaseModel):
    cache_key: str
    orders: list[OrderRow]
    payments: list[PaymentRow]


class Overview(BaseModel):
    """Everything the dashboard needs for its first paint, in one round trip."""

    summary: SummaryOut
    uploads: list[UploadOut]
    discrepancies: DiscrepancyPage
