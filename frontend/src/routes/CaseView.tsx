import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, query } from '@/lib/api'
import type { Discrepancy, DiscrepancyPage, Overview, Severity, Summary, UploadRecord } from '@/lib/types'
import { SEVERITY_ORDER, count, money } from '@/lib/format'
import { useAuth } from '@/state/auth'
import { Mark } from '@/components/Mark'
import { Intake } from '@/components/Intake'
import { Register } from '@/components/Register'
import { TypeBreakdown } from '@/components/TypeBreakdown'
import { ExhibitDetail } from '@/components/ExhibitDetail'
import { Brief } from '@/components/Brief'
import { LoadingScreen, expectsReconciliation, rememberReconciliation } from '@/components/Loading'

const PAGE = 50

export default function CaseView() {
  const { user, signOut } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [rows, setRows] = useState<Discrepancy[]>([])
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(PAGE)
  const [loading, setLoading] = useState(true)
  const [booted, setBooted] = useState(false)
  const [reconciling, setReconciling] = useState(() => expectsReconciliation())
  const [failed, setFailed] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [severities, setSeverities] = useState<Severity[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [selected, setSelected] = useState<Discrepancy | null>(null)
  const [visited, setVisited] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  // First paint is one request. Everything after it only refetches the list.
  useEffect(() => {
    let cancelled = false
    if (booted) return

    setLoading(true)
    api
      .get<Overview>(`/reconciliation/overview${query({ limit: PAGE })}`)
      .then((data) => {
        if (cancelled) return
        setSummary(data.summary)
        setUploads(data.uploads)
        setRows(data.discrepancies.items)
        setTotal(data.discrepancies.total)
        setFailed(null)
        rememberReconciliation(data.summary.has_orders && data.summary.has_payments)
      })
      .catch(() => {
        if (!cancelled) setFailed('Could not load the case file. Reload to try again.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setBooted(true)
        setReconciling(false)
      })
    return () => {
      cancelled = true
    }
  }, [booted])

  useEffect(() => {
    let cancelled = false
    if (!booted) return

    setLoading(true)
    api
      .get<DiscrepancyPage>(
        `/reconciliation/discrepancies${query({ search: debounced, severity: severities, type: types, limit })}`,
      )
      .then((page) => {
        if (cancelled) return
        setRows(page.items)
        setTotal(page.total)
      })
      .catch(() => {
        if (!cancelled) setFailed('Could not refresh the register.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [booted, debounced, severities, types, limit])

  // A new upload changes everything, so the whole overview is fetched again.
  const orders = uploads.find((u) => u.kind === 'orders')
  const payments = uploads.find((u) => u.kind === 'payments')

  const refreshQuietly = useCallback(async () => {
    try {
      const data = await api.get<Overview>(`/reconciliation/overview${query({ limit: PAGE })}`)
      setSummary(data.summary)
      setUploads(data.uploads)
      setRows(data.discrepancies.items)
      setTotal(data.discrepancies.total)
      rememberReconciliation(data.summary.has_orders && data.summary.has_payments)
    } catch {
      setFailed('Could not refresh the case file. Reload to try again.')
    }
  }, [])

  const reload = useCallback(
    (kind: 'orders' | 'payments') => {
      setSelected(null)
      setLimit(PAGE)
      // One export cannot be reconciled against nothing. The reconciliation
      // screen only makes sense once the other side is already present;
      // otherwise the page stays put and just updates what is loaded.
      const otherSideLoaded = kind === 'orders' ? Boolean(payments) : Boolean(orders)
      if (otherSideLoaded) {
        setReconciling(true)
        setBooted(false)
      } else {
        void refreshQuietly()
      }
    },
    [orders, payments, refreshQuietly],
  )

  function pick(row: Discrepancy) {
    setSelected(row)
    setVisited((prev) => new Set(prev).add(row.key))
  }

  const ready = Boolean(summary?.has_orders && summary?.has_payments)

  const severityCounts = useMemo(() => summary?.by_severity ?? {}, [summary])

  if (!booted && !failed) return <LoadingScreen variant={reconciling ? 'reconciling' : 'session'} />

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-ink">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 sm:px-10">
          <div className="flex items-center gap-3">
            <Mark className="h-4.5 w-4.5" />
            <span className="code text-[0.68rem] uppercase tracking-[0.34em]">Ledger</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="code hidden text-[0.62rem] text-ink-45 sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={signOut}
              className="code text-[0.62rem] uppercase tracking-[0.16em] text-ink-70 underline underline-offset-4 transition-colors hover:text-stamp"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {ready && (
        <div className="border-b border-rule bg-paper-raised">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-baseline gap-x-8 gap-y-2 px-6 py-2.5 sm:px-10">
            <span className="code text-[0.58rem] font-bold uppercase tracking-[0.18em] text-ink">
              Sources
            </span>
            <Intake kind="orders" loaded={orders} onLoaded={reload} variant="inline" />
            <Intake kind="payments" loaded={payments} onLoaded={reload} variant="inline" />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1800px] px-6 pb-20 sm:px-10">
        {failed && (
          <p role="alert" className="mt-6 border-l-2 border-stamp pl-3 text-[0.85rem] text-stamp">
            {failed}
          </p>
        )}

        {summary === null ? (
          <p className="code py-20 text-center text-[0.7rem] uppercase tracking-[0.2em] text-stamp">
            Case file unavailable
          </p>
        ) : !ready ? (
          <section className="py-9 lg:py-10">
            <h1 className="max-w-[22ch] font-display text-[clamp(1.9rem,3.4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em]">
              Load both exports to open the case.
            </h1>
            <p className="mt-5 max-w-[74ch] text-[0.95rem] leading-[1.65] text-ink-70">
              Nothing is reconciled until both sides are present. The order export is what the
              store believes it sold; the payment export is what the processor actually moved.
              Loading a file again replaces the previous one.
            </p>

            <div className="mt-7 grid gap-6 lg:grid-cols-2 lg:gap-8">
              <Intake kind="orders" loaded={orders} onLoaded={reload} variant="panel" />
              <Intake kind="payments" loaded={payments} onLoaded={reload} variant="panel" />
            </div>

            <dl className="mt-9 grid gap-8 border-t border-rule pt-5 sm:grid-cols-3">
              {[
                [
                  'Storage',
                  'Parsed on the server and stored against your account, so the reconciliation survives a reload.',
                ],
                [
                  'Method',
                  'Deterministic rules only. The same two files always produce the same findings, in the same order.',
                ],
                [
                  'Ranking',
                  'Every disagreement is classified and ordered by the money behind it, worst first.',
                ],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="code text-[0.62rem] font-bold uppercase tracking-[0.16em] text-ink">
                    {term}
                  </dt>
                  <dd className="mt-1.5 max-w-[40ch] text-[0.82rem] leading-relaxed text-ink-70">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          summary && (
            <>
              <section className="grid gap-x-12 gap-y-10 border-b border-rule pt-9 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div>
                  <h1 className="font-display text-[1rem] font-semibold tracking-[-0.005em]">
                    Unaccounted between the two exports
                  </h1>
                  <p className="num mt-3 text-[clamp(2.8rem,7vw,5rem)] font-bold leading-[0.85] tracking-[-0.045em] text-stamp">
                    {money(summary.value_at_risk)}
                  </p>
                  <p className="mt-4 max-w-[46ch] text-[0.85rem] leading-relaxed text-ink-70">
                    Across <span className="num text-ink">{summary.discrepancy_count}</span>{' '}
                    exhibits drawn from{' '}
                    <span className="num text-ink">{count(summary.order_count)}</span> orders and{' '}
                    <span className="num text-ink">{count(summary.payment_count)}</span> payments.
                  </p>

                  <div className="mt-7 flex flex-wrap gap-x-7 gap-y-2">
                    {SEVERITY_ORDER.map((s) => {
                      const n = severityCounts[s] ?? 0
                      const on = severities.includes(s)
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={n === 0}
                          onClick={() =>
                            setSeverities((prev) =>
                              prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s],
                            )
                          }
                          className={`text-left transition-colors disabled:opacity-40 ${
                            on ? 'text-stamp' : 'text-ink hover:text-stamp'
                          }`}
                        >
                          <span className="num block text-[1.15rem] font-bold leading-none">
                            {n}
                          </span>
                          <span className="code mt-1 block text-[0.58rem] uppercase tracking-[0.14em] text-ink-45">
                            {s}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ['Order value', money(summary.order_value), `${count(summary.order_count)} orders`],
                    [
                      'Settled charges',
                      money(summary.settled_charge_value),
                      `${count(summary.payment_count)} payments`,
                    ],
                    [
                      'Reconciled clean',
                      money(summary.reconciled_value),
                      `${count(summary.reconciled_order_count)} of ${count(summary.order_count)} orders`,
                    ],
                    ['Refunded', money(summary.refund_value), 'returned to customers'],
                    ['Processor fees', money(summary.fee_value), 'on settled charges'],
                    [
                      'Exhibits',
                      count(summary.discrepancy_count),
                      `${count(summary.order_count - summary.reconciled_order_count)} orders affected`,
                    ],
                  ].map(([term, value, note]) => (
                    <div key={term} className="rounded-md border border-rule bg-paper-raised px-4 py-3.5">
                      <dt className="text-[0.82rem] font-medium text-ink">{term}</dt>
                      <dd className="code mt-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-ink-45">
                        {note}
                      </dd>
                      <dd className="num mt-2.5 text-[1.4rem] font-bold leading-none tracking-[-0.025em]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <div className="grid gap-x-12 gap-y-10 py-8 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
                <Register
                  rows={rows}
                  total={total}
                  loading={loading}
                  selected={selected?.key ?? null}
                  visited={visited}
                  search={search}
                  severities={severities}
                  types={types}
                  onSearch={setSearch}
                  onToggleSeverity={(s) =>
                    setSeverities((prev) =>
                      prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s],
                    )
                  }
                  onClearAll={() => {
                    setTypes([])
                    setSeverities([])
                    setSearch('')
                  }}
                  onSelect={pick}
                  onMore={rows.length < total ? () => setLimit((l) => l + PAGE) : null}
                />

                <div className="flex flex-col gap-10 lg:sticky lg:top-4 lg:self-start">
                  <TypeBreakdown
                    summary={summary}
                    active={types}
                    onPick={(type) =>
                      setTypes((prev) =>
                        prev.includes(type) ? prev.filter((v) => v !== type) : [...prev, type],
                      )
                    }
                  />
                  <Brief />
                </div>
              </div>
            </>
          )
        )}
      </main>

      {selected && <ExhibitDetail row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
