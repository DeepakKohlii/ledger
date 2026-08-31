import { useState } from 'react'

import type { Severity, Summary } from '@/lib/types'
import { money, typeLabel } from '@/lib/format'

const BAR: Record<Severity, string> = {
  critical: 'fill-stamp',
  high: 'fill-stamp/55',
  medium: 'fill-disputed/70',
  low: 'fill-ink-45/50',
  info: 'fill-ink-45/25',
}

interface Props {
  summary: Summary
  active: string[]
  onPick: (type: string) => void
}

export function TypeBreakdown({ summary, active, onPick }: Props) {
  const rows = Object.entries(summary.by_type)
    .map(([type, bucket]) => ({ type, ...bucket, value: Number(bucket.value_at_risk) }))
    .sort((a, b) => b.value - a.value || b.count - a.count)

  const peak = Math.max(...rows.map((r) => r.value), 1)
  const [showAll, setShowAll] = useState(false)
  // Classes carrying money come first, so the tail is the part worth collapsing.
  const visible = showAll ? rows : rows.slice(0, 8)

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[1rem] font-semibold tracking-[-0.005em]">Exposure by type</h2>
        <span className="code text-[0.6rem] uppercase tracking-[0.16em] text-ink-45">
          {rows.length} classes
        </span>
      </div>

      <ul className="mt-3">
        {visible.map((row) => {
          const selected = active.includes(row.type)
          const width = (row.value / peak) * 100
          return (
            <li key={row.type}>
              <button
                type="button"
                onClick={() => onPick(row.type)}
                aria-pressed={selected}
                className={`group -mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-2.5 text-left transition-colors ${
                  selected ? 'bg-paper-sunk' : 'hover:bg-paper-raised'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 px-1">
                  <span
                    className={`text-[0.78rem] leading-none capitalize ${
                      selected ? 'font-semibold text-ink' : 'text-ink-70'
                    }`}
                  >
                    {typeLabel(row.type)}
                  </span>
                  <span className="num shrink-0 text-[0.78rem] leading-none tabular-nums">
                    {row.value > 0 ? money(row.value) : '—'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 px-1">
                  <svg
                    viewBox="0 0 100 4"
                    preserveAspectRatio="none"
                    className="h-[6px] flex-1 rounded-full"
                    aria-hidden="true"
                  >
                    <rect x="0" y="0" width="100" height="4" rx="2" className="fill-paper-sunk" />
                    <rect
                      x="0"
                      y="0"
                      width={Math.max(width, row.value > 0 ? 0.6 : 0)}
                      height="4"
                      rx="2"
                      className={BAR[row.severity]}
                    />
                  </svg>
                  <span className="code w-8 shrink-0 text-right text-[0.62rem] text-ink-45">
                    ×{row.count}
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="code mt-3 text-[0.62rem] uppercase tracking-[0.14em] text-ink-70 underline underline-offset-4 transition-colors hover:text-stamp"
        >
          {showAll ? 'Show top 8 only' : `Show all ${rows.length} classes`}
        </button>
      )}
      <p className="mt-3 text-[0.72rem] leading-snug text-ink-45">
        Bars are money at risk. Classes worth nothing are recorded but carry no exposure.
      </p>
    </section>
  )
}
