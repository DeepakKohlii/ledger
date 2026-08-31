import { useRef, useState } from 'react'
import { ApiError, api } from '@/lib/api'
import type { UploadRecord, UploadResult } from '@/lib/types'

interface Props {
  kind: 'orders' | 'payments'
  loaded: UploadRecord | undefined
  onLoaded: () => void
  variant?: 'panel' | 'compact' | 'inline'
}

const COPY = {
  orders: {
    title: 'Order export',
    hint: 'What the store believes it sold',
    columns: [
      'order_id',
      'order_date',
      'customer_email',
      'currency',
      'gross_amount',
      'discount',
      'net_amount',
      'status',
    ],
  },
  payments: {
    title: 'Payment export',
    hint: 'What was actually charged, refunded or settled',
    columns: [
      'transaction_ref',
      'processed_at',
      'order_reference',
      'currency',
      'amount',
      'fee',
      'net_settled',
      'type',
      'status',
    ],
  },
}

export function Intake({ kind, loaded, onLoaded, variant = 'compact' }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const copy = COPY[kind]
  const panel = variant === 'panel'

  async function send(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      setResult(await api.upload<UploadResult>(`/uploads/${kind}`, file))
      onLoaded()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Upload failed. Try again.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const status = loaded ? (
    <p className="code text-[0.72rem] leading-relaxed text-ink-70">
      {loaded.filename} · <span className="num text-ink">{loaded.row_count}</span> rows
      {loaded.skipped_count > 0 && <span className="text-stamp"> · {loaded.skipped_count} skipped</span>}
    </p>
  ) : (
    <p className="code text-[0.72rem] text-ink-45">Nothing loaded</p>
  )

  const picker = (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => send(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={`w-full border border-ink bg-transparent font-semibold uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-45 ${
          panel ? 'px-4 py-4 text-[0.78rem]' : 'px-3 py-2 text-[0.72rem]'
        }`}
      >
        {busy ? 'Reading' : loaded ? 'Replace file' : 'Choose CSV'}
      </button>
    </>
  )

  const problems = (
    <>
      {error && (
        <p role="alert" className="mt-3 border-l-2 border-stamp pl-3 text-[0.78rem] text-stamp">
          {error}
        </p>
      )}
      {result && result.errors.length > 0 && (
        <details className="mt-3 border-t border-rule pt-3">
          <summary className="code cursor-pointer text-[0.68rem] uppercase tracking-[0.14em] text-disputed">
            {result.errors.length} rows rejected
          </summary>
          <ul className="code mt-2 max-h-32 overflow-y-auto text-[0.68rem] leading-relaxed text-ink-70">
            {result.errors.slice(0, 40).map((e) => (
              <li key={e.source_row}>
                row {e.source_row}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="code text-[0.6rem] uppercase tracking-[0.14em] text-ink-45">
          {kind === 'orders' ? 'Orders' : 'Payments'}
        </span>
        {loaded ? (
          <span className="code text-[0.7rem] text-ink-70">
            {loaded.filename} · <span className="num text-ink">{loaded.row_count}</span> rows
            {loaded.skipped_count > 0 && (
              <span className="text-stamp"> · {loaded.skipped_count} skipped</span>
            )}
          </span>
        ) : (
          <span className="code text-[0.7rem] text-ink-45">not loaded</span>
        )}
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => send(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="code text-[0.6rem] uppercase tracking-[0.14em] text-ink-70 underline underline-offset-4 transition-colors hover:text-stamp disabled:text-ink-45"
        >
          {busy ? 'Reading' : 'Replace'}
        </button>
        {error && (
          <span role="alert" className="text-[0.7rem] text-stamp">
            {error}
          </span>
        )}
      </div>
    )
  }

  if (!panel) {
    return (
      <div className="border border-rule bg-paper-raised p-4">
        <h3 className="font-display text-[0.95rem] font-semibold">{copy.title}</h3>
        <div className="mt-3 border-t border-rule pt-3">{status}</div>
        <div className="mt-3">{picker}</div>
        {problems}
      </div>
    )
  }

  return (
    <div>
      <div className="border border-rule bg-paper-raised p-6 sm:p-8">
        <h3 className="font-display text-[1.5rem] font-semibold tracking-[-0.01em]">{copy.title}</h3>
        <p className="mt-1 text-[0.88rem] text-ink-70">{copy.hint}</p>
        <div className="mt-6">{status}</div>
        <div className="mt-3">{picker}</div>
        <p className="mt-6 border-t border-rule pt-4 text-[0.78rem] leading-relaxed text-ink-45">
          Headers must match exactly. A file missing a column is refused whole; individual rows
          that fail to parse are listed back to you rather than dropped in silence.
        </p>
        {problems}
      </div>

      <dl className="mt-4">
        <dt className="code text-[0.62rem] font-bold uppercase tracking-[0.16em] text-ink">
          Required columns
        </dt>
        <dd className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5">
          {copy.columns.map((column) => (
            <span
              key={column}
              className="code border border-rule bg-paper px-1.5 py-0.5 text-[0.68rem] text-ink-70"
            >
              {column}
            </span>
          ))}
        </dd>
      </dl>
    </div>
  )
}
