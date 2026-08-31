import type { Evidence } from '@/lib/types'
import { money, stamp } from '@/lib/format'

function Field({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 py-1 last:border-b-0">
      <span className="code text-[0.58rem] uppercase tracking-[0.12em] text-ink-45">{label}</span>
      <span className={`num text-[0.75rem] ${accent ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

export function EvidenceRows({ evidence }: { evidence: Evidence }) {
  const nothing = evidence.orders.length === 0 && evidence.payments.length === 0

  if (nothing) {
    return (
      <p className="py-3 text-[0.78rem] leading-snug text-ink-70">
        No underlying row exists on either side. That absence is the finding.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="code border-b border-ink pb-1 text-[0.58rem] uppercase tracking-[0.16em]">
          Order export · {evidence.orders.length} row{evidence.orders.length === 1 ? '' : 's'}
        </p>
        {evidence.orders.length === 0 ? (
          <p className="py-2 text-[0.75rem] text-stamp">No matching order row.</p>
        ) : (
          evidence.orders.map((o) => (
            <div key={`${o.order_id}-${o.source_row}`} className="border-b border-rule py-2 last:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="code text-[0.72rem] font-bold">{o.order_id}</span>
                <span className="code text-[0.58rem] uppercase tracking-[0.12em] text-ink-45">
                  csv row {o.source_row}
                </span>
              </div>
              <div className="mt-1">
                <Field label="Placed" value={stamp(o.order_date)} />
                <Field label="Customer" value={o.customer_email || '— missing —'} />
                <Field label="Gross" value={o.gross_amount ? money(o.gross_amount, o.currency) : '—'} />
                <Field label="Discount" value={o.discount ? money(o.discount, o.currency) : '— missing —'} />
                <Field label="Net" value={o.net_amount ? money(o.net_amount, o.currency) : '—'} accent />
                <Field label="Status" value={o.status || '—'} />
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <p className="code border-b border-ink pb-1 text-[0.58rem] uppercase tracking-[0.16em]">
          Payment export · {evidence.payments.length} row{evidence.payments.length === 1 ? '' : 's'}
        </p>
        {evidence.payments.length === 0 ? (
          <p className="py-2 text-[0.75rem] text-stamp">No matching payment row.</p>
        ) : (
          evidence.payments.map((p) => (
            <div key={p.transaction_ref} className="border-b border-rule py-2 last:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="code text-[0.72rem] font-bold">{p.transaction_ref}</span>
                <span className="code text-[0.58rem] uppercase tracking-[0.12em] text-ink-45">
                  csv row {p.source_row}
                </span>
              </div>
              <div className="mt-1">
                <Field label="Processed" value={stamp(p.processed_at)} />
                <Field label="Amount" value={p.amount ? money(p.amount, p.currency) : '—'} accent />
                <Field label="Fee" value={p.fee ? money(p.fee, p.currency) : '—'} />
                <Field label="Net settled" value={p.net_settled ? money(p.net_settled, p.currency) : '—'} />
                <Field label="Type" value={p.type || '—'} />
                <Field label="Status" value={p.status || '—'} />
                {p.raw_order_reference !== p.order_reference && (
                  <Field label="Reference as written" value={`"${p.raw_order_reference ?? ''}"`} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
