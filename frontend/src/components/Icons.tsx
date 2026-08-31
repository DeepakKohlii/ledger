const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const }

export function EyeIcon({ off = false, className = '' }: { off?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className} {...base}>
      <path d="M1.8 10S4.7 4.8 10 4.8 18.2 10 18.2 10 15.3 15.2 10 15.2 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.6" />
      {off && <path d="M3.5 3.5 16.5 16.5" />}
    </svg>
  )
}

export function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className} {...base}>
      <rect x="4.2" y="8.6" width="11.6" height="7.4" />
      <path d="M6.9 8.6V6.4a3.1 3.1 0 0 1 6.2 0v2.2" />
    </svg>
  )
}

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className} {...base}>
      <circle cx="9" cy="9" r="5.4" />
      <path d="M13.2 13.2 17 17" />
    </svg>
  )
}
