export function Mark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center bg-stamp ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none">
        <path d="M12 5.5 20 18.5H4Z" fill="var(--color-paper-raised)" />
      </svg>
    </span>
  )
}
