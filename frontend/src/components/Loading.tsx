import { useEffect, useState } from 'react'

const STEPS = [
  'Opening the case file',
  'Reading both exports',
  'Matching orders to payments',
  'Ranking findings by exposure',
]

const STEP_MS = 700

// The loader mounts twice on a cold start: once while the session is checked,
// again while the dashboard loads. Holding the sequence outside the component
// lets the second mount continue where the first left off instead of
// restarting the whole list.
let sequenceStart: number | null = null
let lastSeen = 0

function Tick() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3">
      <path
        d="M2.5 6.4 4.8 8.7 9.5 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LoadingScreen() {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const now = Date.now()
    if (sequenceStart === null || now - lastSeen > 1200) sequenceStart = now
    const timer = setInterval(() => setTick(Date.now()), 120)
    return () => {
      lastSeen = Date.now()
      clearInterval(timer)
    }
  }, [])

  const elapsed = tick - (sequenceStart ?? tick)
  const reached = Math.min(Math.floor(elapsed / STEP_MS), STEPS.length - 1)
  const progress = Math.min((elapsed / (STEP_MS * STEPS.length)) * 100, 100)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-6">
      <div className="w-full max-w-[19rem]">
        <p className="code text-[0.62rem] font-bold uppercase tracking-[0.34em] text-ink-45">
          Ledger
        </p>

        <ol className="mt-6">
          {STEPS.map((step, index) => {
            const done = index < reached
            const active = index === reached
            return (
              <li key={step} className="flex items-center gap-2.5 py-[0.3rem]">
                <span
                  aria-hidden="true"
                  className={`flex h-3 w-3 shrink-0 items-center justify-center ${
                    done ? 'text-ink-45' : active ? 'text-stamp' : 'text-rule'
                  }`}
                >
                  {done ? (
                    <Tick />
                  ) : (
                    <span
                      className="h-[5px] w-[5px] rounded-full bg-current"
                      style={active ? { animation: 'breathe 1.1s ease-in-out infinite' } : undefined}
                    />
                  )}
                </span>
                <span
                  className={`text-[0.82rem] leading-snug transition-colors duration-300 ${
                    done ? 'text-ink-45' : active ? 'text-ink' : 'text-rule-strong'
                  }`}
                >
                  {step}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="mt-6 h-px w-full bg-rule" aria-hidden="true">
          <div
            className="h-px bg-ink transition-[width] duration-200 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p role="status" className="sr-only">
          {STEPS[reached]}
        </p>
      </div>
    </div>
  )
}
