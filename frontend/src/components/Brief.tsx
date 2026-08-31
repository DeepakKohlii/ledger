import { useState } from 'react'
import { ApiError, api } from '@/lib/api'
import type { PortfolioExplanation } from '@/lib/types'

export function Brief() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [brief, setBrief] = useState<PortfolioExplanation | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setState('loading')
    setError(null)
    try {
      setBrief(await api.post<PortfolioExplanation>('/reconciliation/summary/explain'))
      setState('done')
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 503
          ? 'The explanation service is unavailable. Every figure on this page still stands.'
          : caught instanceof ApiError
            ? caught.message
            : 'Could not write the brief.',
      )
      setState('error')
    }
  }

  return (
    <section className="border-t border-ink pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[1rem] font-semibold tracking-[-0.005em]">Case brief</h2>
        {state === 'done' && (
          <span className="code text-[0.58rem] uppercase tracking-[0.14em] text-ink-45">
            {brief?.cached ? 'from record' : 'written now'}
          </span>
        )}
      </div>

      {state === 'idle' && (
        <>
          <p className="mt-2 max-w-[52ch] text-[0.82rem] leading-relaxed text-ink-70">
            A written read of the whole file, generated from the figures above. It never changes a
            number and never decides whether two records match.
          </p>
          <dl className="mt-4">
            {[
              ['Headline', 'What the exposure amounts to across every class'],
              ['Biggest risk', 'Which class carries the most money, and why'],
              ['Where to start', 'The finding to open first'],
              ['Watch-outs', 'Up to three things worth checking next'],
            ].map(([term, detail]) => (
              <div
                key={term}
                className="grid grid-cols-[7.5rem_1fr] gap-4 border-t border-rule py-2 last:border-b last:border-rule"
              >
                <dt className="code text-[0.6rem] uppercase leading-relaxed tracking-[0.14em] text-ink-45">
                  {term}
                </dt>
                <dd className="text-[0.78rem] leading-relaxed text-ink-70">{detail}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={run}
            className="mt-5 border border-ink px-5 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-paper"
          >
            Write the brief
          </button>
        </>
      )}

      {state === 'loading' && (
        <p className="code mt-3 flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.16em] text-ink-70">
          <span className="inline-block h-2 w-2 animate-pulse bg-stamp" aria-hidden="true" />
          Writing brief
        </p>
      )}

      {state === 'error' && (
        <div role="alert" className="mt-3 border-l-2 border-stamp pl-3">
          <p className="text-[0.78rem] leading-snug text-stamp">{error}</p>
          <button
            type="button"
            onClick={run}
            className="code mt-2 text-[0.62rem] uppercase tracking-[0.14em] text-ink underline underline-offset-4 hover:text-stamp"
          >
            Try again
          </button>
        </div>
      )}

      {state === 'done' && brief && (
        <div className="mt-2">
          <p className="text-[0.86rem] leading-relaxed">{brief.explanation.headline}</p>
          <dl className="mt-3">
            {[
              ['Biggest risk', brief.explanation.biggest_risk],
              ['Where to start', brief.explanation.where_to_start],
            ].map(([term, detail]) => (
              <div key={term} className="border-t border-rule py-2.5">
                <dt className="code text-[0.6rem] uppercase tracking-[0.14em] text-ink-45">
                  {term}
                </dt>
                <dd className="mt-1 text-[0.8rem] leading-relaxed">{detail}</dd>
              </div>
            ))}
          </dl>
          {brief.explanation.watch_outs.length > 0 && (
            <ul className="border-t border-rule pt-2.5">
              {brief.explanation.watch_outs.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 py-0.5 text-[0.78rem] leading-snug text-ink-70"
                >
                  <span aria-hidden="true" className="text-stamp">
                    —
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
