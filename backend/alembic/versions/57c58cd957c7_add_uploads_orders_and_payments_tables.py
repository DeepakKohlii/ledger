from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '57c58cd957c7'
down_revision: Union[str, Sequence[str], None] = '0cfa1cd6018c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('uploads',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=False),
    sa.Column('row_count', sa.Integer(), nullable=False),
    sa.Column('skipped_count', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_uploads_user_id'), 'uploads', ['user_id'], unique=False)
    op.create_table('orders',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('upload_id', sa.UUID(), nullable=False),
    sa.Column('source_row', sa.Integer(), nullable=False),
    sa.Column('order_id', sa.String(length=64), nullable=False),
    sa.Column('order_date', sa.DateTime(), nullable=True),
    sa.Column('customer_email', sa.String(length=320), nullable=True),
    sa.Column('currency', sa.String(length=8), nullable=True),
    sa.Column('gross_amount', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('discount', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('net_amount', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('status', sa.String(length=32), nullable=True),
    sa.ForeignKeyConstraint(['upload_id'], ['uploads.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orders_user_id'), 'orders', ['user_id'], unique=False)
    op.create_index('ix_orders_user_order_id', 'orders', ['user_id', 'order_id'], unique=False)
    op.create_table('payments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('upload_id', sa.UUID(), nullable=False),
    sa.Column('source_row', sa.Integer(), nullable=False),
    sa.Column('transaction_ref', sa.String(length=64), nullable=False),
    sa.Column('processed_at', sa.DateTime(), nullable=True),
    sa.Column('order_reference', sa.String(length=64), nullable=True),
    sa.Column('raw_order_reference', sa.String(length=64), nullable=True),
    sa.Column('currency', sa.String(length=8), nullable=True),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('fee', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('net_settled', sa.Numeric(precision=14, scale=2), nullable=True),
    sa.Column('type', sa.String(length=32), nullable=True),
    sa.Column('status', sa.String(length=32), nullable=True),
    sa.ForeignKeyConstraint(['upload_id'], ['uploads.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payments_user_id'), 'payments', ['user_id'], unique=False)
    op.create_index('ix_payments_user_order_ref', 'payments', ['user_id', 'order_reference'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_payments_user_order_ref', table_name='payments')
    op.drop_index(op.f('ix_payments_user_id'), table_name='payments')
    op.drop_table('payments')
    op.drop_index('ix_orders_user_order_id', table_name='orders')
    op.drop_index(op.f('ix_orders_user_id'), table_name='orders')
    op.drop_table('orders')
    op.drop_index(op.f('ix_uploads_user_id'), table_name='uploads')
    op.drop_table('uploads')
