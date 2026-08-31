import { useEffect, useState } from 'react'
import { Mark } from '@/components/Mark'

const STEPS = [
  'Opening the case file',
  'Reading both exports',
  'Matching orders to payments',
  'Ranking findings by exposure',
]

const STEP_MS = 700

// The loader mounts twice on a cold start: once while the session is checked,
// again while the dashboard loads. Holding the sequence outside the component
// lets the second mount continue instead of restarting the list.
const DATA_HINT = 'ledger:reconciles'

// Whether this browser has previously seen a completed reconciliation for the
// signed in account. It only decides which loader to show, so a missing or
// stale value costs nothing.
export function expectsReconciliation(): boolean {
  try {
    return window.localStorage.getItem(DATA_HINT) === '1'
  } catch {
    return false
  }
}

export function rememberReconciliation(hasBothExports: boolean): void {
  try {
    if (hasBothExports) window.localStorage.setItem(DATA_HINT, '1')
    else window.localStorage.removeItem(DATA_HINT)
  } catch {
    /* private browsing; the hint is optional */
  }
}

let sequenceStart: number | null = null
let lastSeen = 0

function Tick() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M3 7.4 5.7 10 11 3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LoadingScreen({ variant = 'session' }: { variant?: 'session' | 'reconciling' }) {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const now = Date.now()
    if (sequenceStart === null || now - lastSeen > 1200) sequenceStart = now
    const timer = setInterval(() => setTick(Date.now()), 100)
    return () => {
      lastSeen = Date.now()
      clearInterval(timer)
    }
  }, [])

  const elapsed = tick - (sequenceStart ?? tick)
  const reached = Math.min(Math.floor(elapsed / STEP_MS), STEPS.length - 1)
  const progress = Math.min((elapsed / (STEP_MS * STEPS.length)) * 100, 100)

  // Opening a session is not reconciling anything. Claiming to read exports
  // before any file exists would be the interface stating something untrue.
  if (variant === 'session') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper px-6">
        <div className="w-full max-w-[34rem]">
          <div className="flex items-center gap-3">
            <Mark className="h-6 w-6" />
            <span className="code text-[0.75rem] font-bold uppercase tracking-[0.34em]">Ledger</span>
          </div>
          <h1 className="mt-10 font-display text-[clamp(1.6rem,3.4vw,2.3rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
            Opening the case file
            <span className="text-stamp">.</span>
          </h1>
          <div className="mt-7 h-[3px] w-full overflow-hidden rounded-full bg-paper-sunk">
            <div
              className="h-[3px] w-1/3 rounded-full bg-ink"
              style={{ animation: 'sweep 1.4s ease-in-out infinite' }}
            />
          </div>
          <p role="status" className="sr-only">
            Opening the case file
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-6">
      <div className="w-full max-w-[34rem]">
        <div className="flex items-center gap-3">
          <Mark className="h-6 w-6" />
          <span className="code text-[0.75rem] font-bold uppercase tracking-[0.34em]">Ledger</span>
        </div>

        <h1 className="mt-10 font-display text-[clamp(1.6rem,3.4vw,2.3rem)] leading-[1.15] font-semibold tracking-[-0.015em]">
          {STEPS[reached]}
          <span className="text-stamp">.</span>
        </h1>

        <div className="mt-7 flex items-center gap-4">
          <div className="h-[3px] flex-1 rounded-full bg-paper-sunk" aria-hidden="true">
            <div
              className="h-[3px] rounded-full bg-ink transition-[width] duration-200 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="code shrink-0 text-[0.68rem] tracking-[0.16em] text-ink-45">
            {reached + 1} / {STEPS.length}
          </span>
        </div>

        <ol className="mt-9 space-y-2.5">
          {STEPS.map((step, index) => {
            const done = index < reached
            const active = index === reached
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${
                    done ? 'text-ink-45' : active ? 'text-stamp' : 'text-rule'
                  }`}
                >
                  {done ? (
                    <Tick />
                  ) : (
                    <span
                      className="h-[6px] w-[6px] rounded-full bg-current"
                      style={active ? { animation: 'breathe 1.1s ease-in-out infinite' } : undefined}
                    />
                  )}
                </span>
                <span
                  className={`text-[0.9rem] leading-snug transition-colors duration-300 ${
                    done ? 'text-ink-45' : active ? 'text-ink' : 'text-rule-strong'
                  }`}
                >
                  {step}
                </span>
              </li>
            )
          })}
        </ol>

        <p role="status" className="sr-only">
          {STEPS[reached]}
        </p>
      </div>
    </div>
  )
}
