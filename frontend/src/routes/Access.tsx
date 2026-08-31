import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/state/auth'
import { Mark } from '@/components/Mark'
import { EyeIcon, LockIcon } from '@/components/Icons'

const SPECIMEN = [
  ['critical', 'Failed payment', 'ORD-2001', '$310.00', 'Completed order, charge failed'],
  ['critical', 'Missing payment', 'ORD-1204', '$157.13', 'Completed order, no payment record'],
  ['high', 'Duplicate payment', 'ORD-1502', '$128.74', 'Charged twice, 29 minutes apart'],
  ['high', 'Currency mismatch', 'ORD-1601', '$210.00', 'Placed in USD, charged in EUR'],
]

const SPECS = [
  ['Classifications', 'Fifteen discrepancy types across five severity levels'],
  ['Matching', 'Deterministic. The same two files always produce the same findings'],
  ['Tolerances', 'Cent-level variance is recorded, never counted as exposure'],
  ['Explanations', 'Written on request, never used to decide a match'],
]

export default function Access() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [unregistered, setUnregistered] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setUnregistered(false)
    setBusy(true)
    try {
      if (mode === 'in') await signIn(email, password)
      else await signUp(email, password)
    } catch (caught) {
      // A 404 on sign in means the address has no account, so the recovery is
      // to create one rather than to retype the password.
      setUnregistered(caught instanceof ApiError && caught.status === 404)
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-[0.95rem] outline-none transition-colors placeholder:text-ink-45 focus:border-stamp focus:outline-none'

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-ink">
        <div className="flex items-center justify-between px-6 py-3.5 sm:px-10 lg:px-14">
          <div className="flex items-center gap-3">
            <Mark className="h-5 w-5" />
            <span className="code text-[0.72rem] font-bold uppercase tracking-[0.34em]">Ledger</span>
          </div>
          <span className="code text-[0.6rem] uppercase tracking-[0.2em] text-ink-45">
            Order &amp; settlement reconciliation
          </span>
        </div>
      </header>

      <div className="grid min-h-[calc(100dvh-3.6rem)] grid-cols-1 lg:grid-cols-[minmax(0,2.45fr)_minmax(23rem,1fr)]">
        <section className="border-rule px-6 py-12 sm:px-10 lg:border-r lg:px-14 lg:py-16">
          <h1 className="max-w-[16ch] font-display text-[clamp(2.5rem,4.2vw,4.15rem)] leading-[1.06] font-bold tracking-[-0.02em]">
            Two exports. One of them <span className="text-stamp">is wrong.</span>
          </h1>
          <p className="mt-6 max-w-[58ch] text-[1rem] leading-[1.7] text-ink-70">
            The order system records what the store believes it sold. The processor records what
            actually moved. Ledger matches them line by line, classifies every disagreement, and
            ranks them by the money behind each one.
          </p>

          <div className="mt-12">
            <div className="flex items-baseline justify-between border-b border-ink pb-2">
              <h2 className="font-display text-[1.08rem] font-semibold tracking-[-0.005em]">
                What a finding looks like
              </h2>
              <span className="code text-[0.56rem] uppercase tracking-[0.16em] text-ink-45">
                Specimen
              </span>
            </div>
            <table className="w-full border-collapse text-left">
              <tbody>
                {SPECIMEN.map(([severity, type, order, amount, note]) => (
                  <tr key={order} className="border-b border-rule align-top">
                    <td className="py-3.5 pr-3">
                      <span
                        className={`code inline-block border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase leading-none tracking-[0.12em] ${
                          severity === 'critical'
                            ? 'border-stamp bg-stamp text-paper-raised'
                            : 'border-stamp text-stamp'
                        }`}
                      >
                        {severity}
                      </span>
                    </td>
                    <td className="py-3.5 pr-3">
                      <span className="block text-[0.85rem] font-semibold leading-tight">{type}</span>
                      <span className="mt-0.5 block text-[0.72rem] leading-snug text-ink-70">
                        {note}
                      </span>
                    </td>
                    <td className="code hidden py-3.5 pr-8 text-right text-[0.72rem] text-ink-45 sm:table-cell">
                      {order}
                    </td>
                    <td className="num py-3.5 text-right text-[0.9rem] font-semibold whitespace-nowrap">
                      {amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.72rem] leading-snug text-ink-45">
              Illustrative rows. Your own figures appear once both exports are loaded.
            </p>
          </div>

          <dl className="mt-12 border-t border-ink pt-1">
            {SPECS.map(([term, detail]) => (
              <div
                key={term}
                className="grid grid-cols-[11rem_1fr] gap-4 border-b border-rule py-2.5 last:border-b-0"
              >
                <dt className="code text-[0.6rem] uppercase leading-relaxed tracking-[0.14em] text-ink-45">
                  {term}
                </dt>
                <dd className="text-[0.86rem] leading-relaxed text-ink-70">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bg-paper-raised px-6 py-12 sm:px-10 lg:px-12 lg:py-16">
          <div className="lg:sticky lg:top-12">
            <form onSubmit={submit} className="max-w-[24rem]">
              <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.01em]">
                {mode === 'in' ? 'Open the case file' : 'Create credentials'}
              </h2>
              <p className="mt-1.5 text-[0.8rem] leading-snug text-ink-70">
                {mode === 'in'
                  ? 'You will only ever see the exports you loaded yourself.'
                  : 'A new file, visible to nobody else.'}
              </p>

              <label className="mt-8 block">
                <span className="code text-[0.6rem] uppercase tracking-[0.16em] text-ink-45">
                  Email
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={field}
                  placeholder="analyst@example.com"
                />
              </label>

              <label className="mt-6 block">
                <span className="code text-[0.6rem] uppercase tracking-[0.16em] text-ink-45">
                  Password
                </span>
                <div className="relative">
                  <input
                    type={reveal ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${field} pr-8`}
                    placeholder={mode === 'up' ? 'At least 8 characters' : '••••••••'}
                  />
                  <button
                    type="button"
                    onClick={() => setReveal(!reveal)}
                    aria-label={reveal ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-0 -translate-y-1/2 p-1 text-ink-45 transition-colors hover:text-ink"
                  >
                    <EyeIcon off={reveal} className="h-4 w-4" />
                  </button>
                </div>
              </label>

              {error && (
                <div role="alert" className="mt-5 border-l-2 border-stamp pl-3">
                  <p className="text-[0.8rem] leading-snug text-stamp">{error}</p>
                  {unregistered && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('up')
                        setError(null)
                        setUnregistered(false)
                      }}
                      className="mt-1.5 text-[0.8rem] leading-snug text-ink underline decoration-rule-strong underline-offset-4 transition-colors hover:text-stamp hover:decoration-stamp"
                    >
                      Create an account for {email}
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-8 w-full bg-ink px-4 py-3 text-[0.76rem] font-semibold uppercase tracking-[0.18em] text-paper-raised transition-colors hover:bg-stamp disabled:cursor-not-allowed disabled:bg-ink-45"
              >
                {busy ? 'Working' : mode === 'in' ? 'Sign in' : 'Create account'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'in' ? 'up' : 'in')
                  setError(null)
                  setUnregistered(false)
                }}
                className="code mt-5 text-[0.66rem] tracking-[0.04em] text-ink-70 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-stamp hover:decoration-stamp"
              >
                {mode === 'in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
              </button>

              <p className="mt-8 flex gap-2.5 border-t border-rule pt-4 text-[0.74rem] leading-snug text-ink-70">
                <LockIcon className="mt-px h-3.5 w-3.5 shrink-0 text-ink-45" />
                <span>
                  Your exports are stored against your account so the reconciliation survives a
                  reload. Nobody else can read them.
                </span>
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
