import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_user_order_ref", "user_id", "order_reference"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    upload_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False
    )
    source_row: Mapped[int] = mapped_column(Integer, nullable=False)

    transaction_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    order_reference: Mapped[str | None] = mapped_column(String(64))
    raw_order_reference: Mapped[str | None] = mapped_column(String(64))
    currency: Mapped[str | None] = mapped_column(String(8))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    fee: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    net_settled: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    type: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str | None] = mapped_column(String(32))
