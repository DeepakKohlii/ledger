import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '@/lib/api'
import type { Discrepancy, Evidence, Explanation } from '@/lib/types'
import { money, typeLabel } from '@/lib/format'
import { Plate } from '@/components/Plate'
import { EvidenceRows } from '@/components/EvidenceRows'

type Tab = 'finding' | 'evidence' | 'explanation'
type Load = 'idle' | 'loading' | 'done' | 'error'

const TABS: { id: Tab; label: string }[] = [
  { id: 'finding', label: 'Finding' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'explanation', label: 'Explanation' },
]

function humanise(key: string): string {
  return key.replace(/_/g, ' ')
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function ExhibitDetail({ row, onClose }: { row: Discrepancy; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('finding')

  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [evidenceState, setEvidenceState] = useState<Load>('idle')

  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [explanationState, setExplanationState] = useState<Load>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTab('finding')
    setEvidence(null)
    setEvidenceState('idle')
    setExplanation(null)
    setExplanationState('idle')
    setError(null)
  }, [row.key])

  useEffect(() => {
    if (tab !== 'evidence' || evidenceState !== 'idle') return
    setEvidenceState('loading')
    api
      .get<Evidence>(`/reconciliation/discrepancies/${row.key}/evidence`)
      .then((value) => {
        setEvidence(value)
        setEvidenceState('done')
      })
      .catch(() => setEvidenceState('error'))
  }, [tab, evidenceState, row.key])

  const explain = useCallback(
    async (refresh = false) => {
      setExplanationState('loading')
      setError(null)
      try {
        setExplanation(
          await api.post<Explanation>(
            `/reconciliation/discrepancies/${row.key}/explain${refresh ? '?refresh=true' : ''}`,
          ),
        )
        setExplanationState('done')
      } catch (caught) {
        setError(
          caught instanceof ApiError && caught.status === 503
            ? 'The explanation service is unavailable. Every figure here still stands.'
            : caught instanceof ApiError
              ? caught.message
              : 'Could not write an explanation.',
        )
        setExplanationState('error')
      }
    },
    [row.key],
  )

  // Opening the tab is the request. Explanations are cached per finding, so
  // reopening one costs nothing.
  useEffect(() => {
    if (tab !== 'explanation' || explanationState !== 'idle') return
    void explain()
  }, [tab, explanationState, explain])

  const entries = Object.entries(row.details)

  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The sheet is modal: the page behind it must not scroll. Removing the
  // scrollbar would shift the layout, so its width is paid back as padding.
  useEffect(() => {
    const root = document.documentElement
    // The scrolling element is <html>, not <body>: locking only the body
    // leaves the page scrollable behind the sheet.
    const gap = window.innerWidth - root.clientWidth
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyPadding: document.body.style.paddingRight,
    }
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`
    return () => {
      root.style.overflow = previous.rootOverflow
      document.body.style.overflow = previous.bodyOverflow
      document.body.style.paddingRight = previous.bodyPadding
    }
  }, [])

  // Focus moves into the sheet on open and returns to whatever opened it.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [])

  // Tab stays inside the sheet while it is open.
  function trapFocus(event: React.KeyboardEvent) {
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close exhibit"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-ink/40"
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Exhibit ${row.key.slice(0, 8)}`}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[31rem] flex-col border-l border-ink bg-paper-raised outline-none"
      >
      <header className="flex items-start justify-between gap-3 border-b border-ink px-5 py-3">
        <div className="min-w-0">
          <p className="code text-[0.6rem] uppercase tracking-[0.16em] text-ink-45">
            Exhibit {row.key.slice(0, 8)}
          </p>
          <h2 className="mt-0.5 truncate font-display text-[1.05rem] font-semibold capitalize leading-tight tracking-[-0.005em]">
            {typeLabel(row.type)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close exhibit"
          className="code shrink-0 border border-rule-strong px-1.5 py-0.5 text-[0.7rem] leading-none text-ink-70 transition-colors hover:border-stamp hover:text-stamp"
        >
          ✕
        </button>
      </header>

      <div className="flex items-baseline gap-3 border-b border-rule px-5 py-3">
        <Plate severity={row.severity} />
        <span className="num text-[1.3rem] font-bold leading-none tracking-[-0.02em]">
          {Number(row.amount_at_risk) > 0 ? money(row.amount_at_risk, row.currency) : 'No exposure'}
        </span>
        <span className="code text-[0.58rem] uppercase tracking-[0.14em] text-ink-45">at risk</span>
      </div>

      <div className="flex border-b border-ink" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`code flex-1 border-r border-rule px-2 py-2 text-[0.6rem] font-bold uppercase tracking-[0.14em] transition-colors last:border-r-0 ${
              tab === t.id
                ? 'bg-ink text-paper-raised'
                : 'text-ink-70 hover:bg-paper-sunk hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'finding' && (
          <>
            <p className="text-[0.85rem] leading-relaxed">{row.summary}</p>
            <dl className="mt-3 border-t border-rule pt-1">
              {entries.length === 0 && (
                <p className="py-2 text-[0.78rem] text-ink-70">No supporting values recorded.</p>
              )}
              {entries.map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-[9rem_1fr] gap-3 border-b border-rule/60 py-1.5 last:border-b-0"
                >
                  <dt className="code text-[0.6rem] uppercase leading-relaxed tracking-[0.12em] text-ink-45">
                    {humanise(key)}
                  </dt>
                  <dd className="num break-words text-[0.76rem] leading-relaxed">
                    {renderValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {tab === 'evidence' && (
          <>
            {evidenceState === 'loading' && (
              <p className="code py-3 text-[0.68rem] uppercase tracking-[0.16em] text-ink-45">
                Pulling rows
              </p>
            )}
            {evidenceState === 'error' && (
              <p role="alert" className="border-l-2 border-stamp pl-3 text-[0.78rem] text-stamp">
                Could not pull the underlying rows.
              </p>
            )}
            {evidenceState === 'done' && evidence && <EvidenceRows evidence={evidence} />}
          </>
        )}

        {tab === 'explanation' && (
          <>
            {(explanationState === 'idle' || explanationState === 'loading') && (
              <p className="code flex items-center gap-2 py-3 text-[0.68rem] uppercase tracking-[0.16em] text-ink-70">
                <span className="inline-block h-2 w-2 animate-pulse bg-stamp" aria-hidden="true" />
                Writing explanation
              </p>
            )}

            {explanationState === 'error' && (
              <div role="alert" className="border-l-2 border-stamp pl-3">
                <p className="text-[0.78rem] leading-snug text-stamp">{error}</p>
                <button
                  type="button"
                  onClick={() => explain()}
                  className="code mt-2 text-[0.62rem] uppercase tracking-[0.14em] underline underline-offset-4 hover:text-stamp"
                >
                  Try again
                </button>
              </div>
            )}

            {explanationState === 'done' && explanation && (
              <div>
                <dl>
                  {[
                    ['What happened', explanation.explanation.what_happened],
                    ['Likely cause', explanation.explanation.likely_cause],
                    ['Recommended action', explanation.explanation.recommended_action],
                  ].map(([term, detail]) => (
                    <div key={term} className="border-b border-rule py-2 first:pt-0 last:border-b-0">
                      <dt className="code text-[0.58rem] uppercase tracking-[0.14em] text-ink-45">
                        {term}
                      </dt>
                      <dd className="mt-1 text-[0.8rem] leading-relaxed">{detail}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-rule pt-2">
                  <p className="code text-[0.55rem] uppercase tracking-[0.12em] text-ink-45">
                    {explanation.cached ? 'from record' : 'written now'} · {explanation.model}
                  </p>
                  <button
                    type="button"
                    onClick={() => explain(true)}
                    className="code text-[0.58rem] uppercase tracking-[0.14em] text-ink-70 underline underline-offset-4 hover:text-stamp"
                  >
                    Rewrite
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </section>
    </>
  )
}
