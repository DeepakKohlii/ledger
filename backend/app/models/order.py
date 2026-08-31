import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_user_order_id", "user_id", "order_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    upload_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False
    )
    source_row: Mapped[int] = mapped_column(Integer, nullable=False)

    order_id: Mapped[str] = mapped_column(String(64), nullable=False)
    order_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=False))
    customer_email: Mapped[str | None] = mapped_column(String(320))
    currency: Mapped[str | None] = mapped_column(String(8))
    gross_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    discount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    net_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    status: Mapped[str | None] = mapped_column(String(32))
