import type { Severity } from './types'

export function money(value: string | number, currency: string | null = 'USD'): string {
  const amount = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function count(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function typeLabel(value: string): string {
  return value.replace(/_/g, ' ')
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export const SEVERITY_PLATE: Record<Severity, string> = {
  critical: 'bg-stamp text-paper-raised border-stamp',
  high: 'bg-transparent text-stamp border-stamp',
  medium: 'bg-transparent text-disputed border-disputed',
  low: 'bg-transparent text-ink-70 border-rule-strong',
  info: 'bg-transparent text-ink-45 border-rule',
}

// Severity is stamped, never carried by colour alone.
export const SEVERITY_MARK: Record<Severity, string> = {
  critical: '████',
  high: '███',
  medium: '██',
  low: '█',
  info: '·',
}

export function stamp(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
