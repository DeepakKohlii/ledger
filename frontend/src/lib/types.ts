export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface User {
  id: string
  email: string
  created_at: string
}

export interface TypeBucket {
  count: number
  value_at_risk: string
  severity: Severity
}

export interface Summary {
  order_rows: number
  order_count: number
  payment_count: number
  order_value: string
  settled_charge_value: string
  refund_value: string
  fee_value: string
  reconciled_order_count: number
  reconciled_value: string
  disputed_order_count: number
  disputed_value: string
  discrepancy_count: number
  value_at_risk: string
  by_type: Record<string, TypeBucket>
  by_severity: Partial<Record<Severity, number>>
  has_orders: boolean
  has_payments: boolean
}

export interface Discrepancy {
  key: string
  type: string
  severity: Severity
  summary: string
  amount_at_risk: string
  currency: string | null
  order_id: string | null
  transaction_ref: string | null
  details: Record<string, unknown>
}

export interface DiscrepancyPage {
  items: Discrepancy[]
  total: number
  limit: number
  offset: number
}

export interface UploadRecord {
  id: string
  kind: 'orders' | 'payments'
  filename: string
  row_count: number
  skipped_count: number
  created_at: string
}

export interface UploadResult extends UploadRecord {
  errors: { source_row: number; message: string }[]
}

export interface Explanation {
  cache_key: string
  cached: boolean
  model: string
  explanation: {
    what_happened: string
    likely_cause: string
    recommended_action: string
    priority: string
  }
}

export interface PortfolioExplanation {
  cache_key: string
  cached: boolean
  model: string
  explanation: {
    headline: string
    biggest_risk: string
    where_to_start: string
    watch_outs: string[]
  }
}

export interface OrderRow {
  source_row: number
  order_id: string
  order_date: string | null
  customer_email: string | null
  currency: string | null
  gross_amount: string | null
  discount: string | null
  net_amount: string | null
  status: string | null
}

export interface PaymentRow {
  source_row: number
  transaction_ref: string
  processed_at: string | null
  order_reference: string | null
  raw_order_reference: string | null
  currency: string | null
  amount: string | null
  fee: string | null
  net_settled: string | null
  type: string | null
  status: string | null
}

export interface Evidence {
  cache_key: string
  orders: OrderRow[]
  payments: PaymentRow[]
}

export interface Overview {
  summary: Summary
  uploads: UploadRecord[]
  discrepancies: DiscrepancyPage
}
