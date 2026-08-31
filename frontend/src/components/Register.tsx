import { useEffect, useMemo, useRef, useState } from 'react'
import type { Discrepancy, Severity } from '@/lib/types'
import { SEVERITY_ORDER, money, typeLabel } from '@/lib/format'
import { Plate } from '@/components/Plate'
import { SearchIcon } from '@/components/Icons'

type SortKey = 'engine' | 'amount' | 'type'

interface Props {
  rows: Discrepancy[]
  total: number
  loading: boolean
  selected: string | null
  visited: Set<string>
  search: string
  severities: Severity[]
  types: string[]
  onSearch: (value: string) => void
  onToggleSeverity: (value: Severity) => void
  onClearAll: () => void
  onSelect: (row: Discrepancy) => void
  onMore: (() => void) | null
}

function Skeleton() {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-rule">
          <td className="py-3" colSpan={6}>
            <span
              className="block h-3 bg-paper-sunk"
              style={{ width: `${88 - i * 7}%`, opacity: 1 - i * 0.13 }}
            />
          </td>
        </tr>
      ))}
    </tbody>
  )
}

export function Register(props: Props) {
  const { rows, total, loading, selected, visited } = props
  const [sort, setSort] = useState<SortKey>('engine')
  const searchRef = useRef<HTMLInputElement>(null)
  const filtering = props.severities.length > 0 || props.types.length > 0 || props.search !== ''

  const sorted = useMemo(() => {
    if (sort === 'engine') return rows
    const copy = [...rows]
    if (sort === 'amount') {
      copy.sort((a, b) => Number(b.amount_at_risk) - Number(a.amount_at_risk))
    } else {
      copy.sort((a, b) => a.type.localeCompare(b.type) || Number(b.amount_at_risk) - Number(a.amount_at_risk))
    }
    return copy
  }, [rows, sort])

  // "/" focuses search the way it does in every tool an analyst already uses.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if (event.key === '/' && !typing) {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.key === 'Escape' && typing) (target as HTMLInputElement).blur()
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !typing && sorted.length > 0) {
        event.preventDefault()
        const index = sorted.findIndex((r) => r.key === selected)
        const next =
          event.key === 'ArrowDown'
            ? Math.min(index + 1, sorted.length - 1)
            : Math.max(index - 1, 0)
        props.onSelect(sorted[index === -1 ? 0 : next])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sorted, selected, props])

  const columns: { label: string; key?: SortKey; className: string }[] = [
    { label: '', className: 'w-4' },
    { label: 'Exhibit', className: '' },
    { label: 'Classification', key: 'type', className: '' },
    { label: 'Order', className: 'hidden sm:table-cell' },
    { label: 'Transaction', className: 'hidden md:table-cell' },
    { label: 'At risk', key: 'amount', className: 'text-right' },
  ]

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-display text-[1rem] font-semibold tracking-[-0.005em]">Exhibit register</h2>
        <p className="code flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.16em] text-ink-45">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full bg-stamp transition-opacity duration-200 ${
              loading ? 'opacity-100' : 'opacity-0'
            }`}
            style={loading ? { animation: 'breathe 1.1s ease-in-out infinite' } : undefined}
          />
          {sorted.length} of {total} shown
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[15rem] flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-45" />
          <input
            ref={searchRef}
            type="search"
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="Search order, transaction or wording"
            className="w-full rounded-md border border-rule bg-paper-raised py-2 pr-9 pl-9 text-[0.8rem] outline-none transition-colors placeholder:text-ink-45 focus:border-ink"
          />
          <kbd className="code pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[0.62rem] text-ink-45">
            /
          </kbd>
        </div>
        <div className="flex flex-wrap gap-1">
          {SEVERITY_ORDER.map((s) => {
            const on = props.severities.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => props.onToggleSeverity(s)}
                aria-pressed={on}
                className={`code rounded-md border px-2.5 py-1.5 text-[0.58rem] font-bold uppercase tracking-[0.12em] transition-colors ${
                  on
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule text-ink-70 hover:border-ink hover:text-ink'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {filtering && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="code text-[0.58rem] uppercase tracking-[0.14em] text-ink-45">
            Filtered by
          </span>
          {props.types.map((t) => (
            <span key={t} className="code text-[0.66rem] capitalize">
              {typeLabel(t)}
            </span>
          ))}
          {props.severities.map((s) => (
            <span key={s} className="code text-[0.66rem]">
              {s}
            </span>
          ))}
          {props.search && <span className="code text-[0.66rem]">“{props.search}”</span>}
          <button
            type="button"
            onClick={props.onClearAll}
            className="code text-[0.58rem] uppercase tracking-[0.14em] text-stamp underline underline-offset-4"
          >
            Clear all
          </button>
        </div>
      )}

      <table className="mt-4 w-full border-collapse text-left">
        <caption className="sr-only">
          Discrepancies. Use arrow keys to move between exhibits.
        </caption>
        <thead className="sticky top-0 z-10 bg-paper">
          <tr className="border-b border-rule">
            {columns.map((column, i) => (
              <th
                key={column.label || i}
                scope="col"
                className={`code bg-paper py-2 text-[0.56rem] font-bold uppercase tracking-[0.16em] text-ink-45 ${column.className}`}
              >
                {column.key ? (
                  <button
                    type="button"
                    onClick={() => setSort(sort === column.key ? 'engine' : column.key!)}
                    className={`transition-colors hover:text-ink ${
                      sort === column.key ? 'text-stamp' : ''
                    }`}
                  >
                    {column.label}
                    {sort === column.key ? ' ▾' : ''}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>

        {loading && sorted.length === 0 ? (
          <Skeleton />
        ) : (
          <tbody
            className={`transition-opacity duration-200 ${loading ? 'opacity-45' : 'opacity-100'}`}
          >
            {sorted.map((row) => {
              const isSelected = selected === row.key
              return (
                <tr
                  key={row.key}
                  onClick={() => props.onSelect(row)}
                  className={`cursor-pointer border-b border-rule align-top transition-colors ${
                    isSelected ? 'bg-paper-sunk' : 'hover:bg-paper-raised'
                  }`}
                >
                  <td className="w-4 py-2.5">
                    <span
                      aria-hidden="true"
                      className={`code block text-[0.6rem] leading-none ${
                        visited.has(row.key) ? 'text-stamp' : 'text-transparent'
                      }`}
                    >
                      ×
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="code block text-[0.66rem] text-ink-70">
                      {row.key.slice(0, 8)}
                    </span>
                    <Plate severity={row.severity} className="mt-1" />
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="block text-[0.82rem] font-medium capitalize leading-tight">
                      {typeLabel(row.type)}
                    </span>
                    <span className="mt-0.5 block max-w-[52ch] text-[0.74rem] leading-snug text-ink-70">
                      {row.summary}
                    </span>
                  </td>
                  <td className="code hidden py-2.5 pr-3 text-[0.68rem] text-ink-70 sm:table-cell">
                    {row.order_id || '—'}
                  </td>
                  <td className="code hidden py-2.5 pr-3 text-[0.68rem] text-ink-70 md:table-cell">
                    {row.transaction_ref || '—'}
                  </td>
                  <td className="num py-2.5 text-right text-[0.85rem] font-semibold whitespace-nowrap">
                    {Number(row.amount_at_risk) > 0 ? (
                      money(row.amount_at_risk, row.currency)
                    ) : (
                      <span className="text-ink-45">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        )}
      </table>

      {!loading && sorted.length === 0 && (
        <p className="border-b border-rule py-10 text-center text-[0.85rem] text-ink-70">
          {filtering
            ? 'No exhibit matches these filters.'
            : 'No disagreement found between the two exports.'}
        </p>
      )}

      {props.onMore && (
        <button
          type="button"
          onClick={props.onMore}
          disabled={loading}
          className="mt-3 w-full border border-rule-strong py-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-70 transition-colors hover:border-ink hover:text-ink"
        >
          {loading ? 'Reading' : 'Show more exhibits'}
        </button>
      )}
    </section>
  )
}
