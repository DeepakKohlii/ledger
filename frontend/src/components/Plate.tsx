import type { Severity } from '@/lib/types'
import { SEVERITY_PLATE } from '@/lib/format'

export function Plate({ severity, className = '' }: { severity: Severity; className?: string }) {
  return (
    <span
      className={`code inline-block border px-1.5 py-0.5 text-[0.6rem] font-bold uppercase leading-none tracking-[0.14em] ${SEVERITY_PLATE[severity]} ${className}`}
    >
      {severity}
    </span>
  )
}
