# Ledger

A reconciliation dashboard for order and payment exports.

Two systems that should agree with each other often do not. The order system
records what a store believes it sold; the payment processor records what was
actually charged, refunded or settled. Ledger ingests both exports, matches them
deterministically, classifies every disagreement, and ranks the results by the
money behind them.

On the supplied fixtures it finds **28 discrepancies across 15 classes**, with
**$2,178.43** at risk out of **$42,269.65** of order value.

## Live

| | |
| --- | --- |
| Application | https://ledger-wheat-iota.vercel.app |
| API | https://ledger-api-uxhm.onrender.com |
| API docs | https://ledger-api-uxhm.onrender.com/docs |

Sign in with `demo@example.com` / `reconcile-2025`, which already has both
exports loaded. Signing up works too; a new account starts empty and prompts for
the two files, which are in [`data/`](data).

The API is on a free tier that idles after ~15 minutes. A scheduled workflow
pings it, but the very first request after a long quiet spell may take a few
seconds to wake.

## Running locally

Requires Python 3.12+ and Node 22+.

### Backend

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env          # then fill in DATABASE_URL, JWT_SECRET, GROQ_API_KEYS
./.venv/bin/alembic upgrade head
./.venv/bin/uvicorn app.main:app --reload --port 8000
```

`JWT_SECRET` can be generated with `openssl rand -hex 32`. Any PostgreSQL
database works; the connection string is normalised in `app/core/config.py`, so
a provider's `postgresql://...` string can be pasted in unedited.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server proxies `/api` to `http://127.0.0.1:8000`. If the backend is on a
different port, set `VITE_API_PROXY_TARGET` in `frontend/.env`.

### Tests

```bash
cd backend && ./.venv/bin/pytest
```

59 tests. They cover password hashing and tokens, the rate limiter, the LLM
client against a mocked transport, and the reconciliation engine against the
real fixture files.

## Architecture

```
frontend/          React 19 + Vite + TypeScript + Tailwind      -> Vercel
  src/lib          API client, formatting, types
  src/routes       Access (sign in / sign up), CaseView (dashboard)
  src/components   register, exhibit sheet, evidence, chart, intake, loading

backend/           FastAPI + SQLAlchemy 2 + Alembic             -> Render
  app/core         settings, database, security, rate limiting
  app/models       User, Upload, Order, Payment, ExplanationCache
  app/services     parsing, ingestion, reconciliation, llm, explaining
  app/api          routes and dependencies

                   PostgreSQL                                   -> Neon
```

**The reconciliation engine is a pure module.** `services/reconciliation.py`
takes two sequences of records and returns findings. It touches no database, no
network and no model. That is what makes it testable directly against the CSV
fixtures and trivially repeatable.

**The frontend reaches the API same-origin.** A rewrite in `frontend/vercel.json`
maps `/api/*` to the API host, and the Vite dev server does the same locally.
Without it the session cookie would be third-party across two different sites
(`vercel.app` and `onrender.com` are separate registrable domains), which Safari
blocks outright and other browsers increasingly restrict. The rewrite keeps the
cookie first-party in both environments, so cookie behaviour is identical in
development and production.

**Auth** is email and password: bcrypt hashing, a JWT in an `httpOnly`,
`SameSite=Lax`, `Secure`-in-production cookie. Every data route depends on
`get_current_user`, which loads the account from the database rather than
trusting the token's claim, and every query is filtered by that user's id.
Login and signup are rate limited by address (6 per 15 min) and by client
(25 per 15 min).

**One request paints the dashboard.** `/reconciliation/overview` returns the
summary, the upload list and the first page of findings from a single engine
run. Filter changes then hit `/reconciliation/discrepancies` alone.

## Reconciliation logic

### How records are matched

Orders and payments are joined on `orders.order_id` ↔ `payments.order_reference`,
after normalising the reference by **trimming whitespace and upper-casing**.
Nothing fuzzier: no edit distance, no amount-and-date guessing. A match is either
an exact identifier or it is not a match.

Normalisation is not cosmetic. Two payments in the fixtures reference
`' ord-1801 '` and `'ord-1802'`. Joining on the raw string would report each of
those orders as *missing a payment* and each payment as *orphaned* — four
fabricated findings worth $218 that do not exist.

Order rows are deduplicated by `order_id` before matching, for the same reason:
`ORD-1004` appears twice, byte-identical. Counting it twice would inflate revenue
by $27.34 and invent a missing payment.

Dates are parsed with a fixed format list, day-first before ISO. Both are
unambiguous in that order, so parsing is deterministic.

### Discrepancy types

Fifteen classes across five severities. Severity answers "what do I open first";
`amount at risk` answers "how much is actually in question".

| Class | Severity | Rule |
| --- | --- | --- |
| `missing_payment` | critical | Order is completed or refunded and has no payment row at all |
| `failed_payment` | critical | A charge exists but its status is `failed` |
| `paid_cancelled_order` | critical | Order is cancelled and a charge settled anyway |
| `orphan_payment` | high | Payment references an order that is not in the order export |
| `duplicate_payment` | high | More than one settled charge against one order |
| `currency_mismatch` | high | Order currency and charge currency differ |
| `overpayment` | high | Charge exceeds order net by more than the rounding tolerance |
| `underpayment` | high | Charge falls short of order net by more than the tolerance |
| `refund_mismatch` | high / medium | Order marked refunded but only partly refunded, or refunded while still marked completed |
| `pending_payment` | medium | Charge has not settled |
| `duplicate_order` | low / high | Same `order_id` twice; high only when the rows disagree |
| `late_settlement` | low | Charge settled more than the settlement window after the order |
| `missing_field` | low | A required field is blank on either side |
| `rounding_variance` | info | Amounts differ by no more than the rounding tolerance |
| `reference_format` | info | Reference only matched after normalisation |

An order with no payment is only flagged when its status implies it should have
been paid. A cancelled order with no payment is correct, not a discrepancy.
Similarly, `missing_payment` fires only when there is no payment row at all: if a
row exists but failed or is pending, that is the more specific finding, so the
same money is never counted twice.

### Tolerances, and why

**Amount: exact to the cent, with a $0.05 rounding band.** Differences inside the
band are recorded as `rounding_variance` and carry no exposure.

The data makes this easy to defend. Observed cent-level noise is at most $0.02
(`ORD-1901` +0.01, `ORD-1902` −0.02, `ORD-1903` +0.01). The smallest genuine
mismatch is $18.50 (`ORD-1402`). Any threshold between $0.03 and $18 produces an
identical result, so the exact value is not load-bearing — which is the point.
A test pins this: setting the tolerance to zero reclassifies those three as real
over- and underpayments, proving the band is doing what it claims.

**Settlement window: 2 days.** Across 181 charges the median lag between order
and settlement is **41 minutes**, p95 is **87 minutes**, and the slowest normal
case is **90 minutes**. There is exactly one outlier, at **29 days**. Two days is
roughly 33× the p95 and still catches it, with a very wide margin for a
processor having a slow day.

**No fuzzy matching, and no tolerance on identity.** Amounts have tolerances;
identifiers do not.

### Determinism

The engine is a pure function over its inputs, sorts its output by a total
ordering (severity, then amount, then identifiers), and uses `Decimal`
throughout — no floats touch money. A test runs the same input twice and asserts
the results are identical.

## What is in the data

Both files parse cleanly: **185 order rows** (184 unique) and **187 payment
rows**, zero rejected. The problems are in what the rows *say*.

| Class | Count | At risk | Affected |
| --- | --- | --- | --- |
| Missing payment | 4 | $392.35 | ORD-1201 – ORD-1204 |
| Currency mismatch | 2 | $355.00 | ORD-1601, ORD-1602 |
| Failed payment | 1 | $310.00 | ORD-2001 |
| Orphan payment | 3 | $308.00 | ORD-1301 – ORD-1303 |
| Duplicate payment | 2 | $248.58 | ORD-1501, ORD-1502 |
| Refund mismatch | 2 | $219.00 | ORD-1702, ORD-1703 |
| Paid cancelled order | 1 | $175.00 | ORD-1701 |
| Overpayment | 2 | $85.00 | ORD-1401, ORD-1403 |
| Pending payment | 1 | $67.00 | ORD-2002 |
| Underpayment | 1 | $18.50 | ORD-1402 |
| Duplicate order | 1 | — | ORD-1004 |
| Late settlement | 1 | — | ORD-2101 |
| Missing field | 2 | — | ORD-2201, ORD-2202 |
| Reference format | 2 | — | ORD-1801, ORD-1802 |
| Rounding variance | 3 | — | ORD-1901 – ORD-1903 |

**Headline figures**

```
order value        $42,269.65   184 orders
settled charges    $42,123.38   187 payments
reconciled clean   $39,963.28   168 orders
in dispute         $ 2,306.37    16 orders
money at risk      $ 2,178.43    28 findings
```

*In dispute* and *at risk* are deliberately different numbers. In dispute is the
order value of everything that failed to reconcile — how much of the book cannot
be trusted end to end. At risk is the exposure each finding actually carries.
`ORD-1403` is a $199.01 order overcharged by $60: the whole order is in dispute,
but only $60 is at stake. Conversely the three orphan payments contribute $308
to at-risk with no order value at all, because no order exists.

### What it means commercially

- **$310 shipped and never collected.** `ORD-2001` is marked completed while its
  only charge failed. Goods out, no money in. The single worst row.
- **$392.35 of completed orders never charged at all.** Straight revenue leak.
- **$248.58 double-charged.** `ORD-1501` and `ORD-1502` were each charged twice,
  29 minutes apart, identical amounts. This is refund liability and, unhandled, a
  chargeback and a customer complaint.
- **$175 taken on a cancelled order.** Owed back.
- **$355 exposed to currency error.** `ORD-1601` was placed in USD and charged in
  EUR; `ORD-1602` the reverse. The *numbers* match, so a naive amount comparison
  passes them. Only comparing currency catches it, and the real loss is the FX
  difference in both directions.
- **$308 of unattributable receipts.** Money arrived against orders that do not
  exist in the export. Either the order export is incomplete or these are
  misattributed — both worth knowing before anyone reconciles the bank.

### A finding that is not a finding

**Processor fees are exactly `2.9% + $0.30`, on all 185 charges, with zero
exceptions to the cent.** Refunds carry no fee. Fees are therefore *not* a source
of discrepancy here, and the engine does not flag them. This is stated explicitly
because avoiding invented problems matters as much as finding real ones.

**Payment dates are day-first, and that is proven rather than assumed.** The
largest first component across all payment timestamps is **30**, which cannot be
a month; the largest second component is **5**. Reading them as `MM/DD` would
silently corrupt 70 rows and shift the entire settlement-lag analysis.

## LLM approach

The model **explains and never decides**. Every number, match and classification
on screen comes from the deterministic engine. If the LLM is unavailable the
dashboard is unaffected — it just cannot write prose about it.

**Provider and model.** Groq, `openai/gpt-oss-120b`. Chosen by testing: the
account's available chat models were each given a real finding and asked for
structured JSON; all returned valid JSON, and this one produced the most specific
explanations, at about 1.2 seconds.

**Parameters.**

- `temperature: 0.2` — low enough that the same finding yields a stable
  explanation on repeat calls, high enough to avoid the stilted repetition that
  greedy decoding produces. Correctness never depends on it, because the model is
  not deciding anything; the value only affects how the prose reads.
- `seed: 7` and `top_p: 1` for further repeatability.
- `max_tokens: 700` caps a runaway response.
- `response_format: {"type": "json_object"}`.

**Prompting.** The system prompt states that a deterministic engine has already
decided the match and the classification, that the model must not re-decide or
invent figures, and that everything inside the `FINDING` block is data rather
than instructions. Findings are wrapped in explicit `FINDING` / `END FINDING`
delimiters. This matters because the content is user-uploaded CSV: an order's
`customer_email` could contain text aimed at the model. A test asserts the
delimiters and the instruction are present.

**Handling bad responses.** The reply is stripped of markdown fences, parsed as
JSON, then validated against a Pydantic model — `priority` is a
`Literal["high","medium","low"]`, so an invented value like `"catastrophic"` is
rejected. On any failure the client makes **one repair attempt**, feeding the bad
output back with the required keys, then gives up cleanly with a 503 the frontend
renders as "the explanation service is unavailable; every figure here still
stands", with a retry.

**Key rotation.** `GROQ_API_KEYS` takes a comma-separated list. The pool
round-robins, honours `Retry-After` on 429, fails over to the next healthy key,
and applies exponential backoff capped at five minutes. Authentication failures
cool a key for the full period rather than retrying a configuration error. It is
module-level so cooldowns survive across requests.

**Caching.** Every explanation is stored in Postgres keyed by a hash of the
finding's content and scoped to the user, so a given finding costs one call ever.
Fifteen tests cover the client against a mocked transport — rotation, cooldown,
failover, fenced JSON, the repair attempt, missing fields, invalid enums and the
no-keys case — so the suite makes no paid calls.

## API

All routes except `/health` require the session cookie, and every query is scoped
to the signed-in user. Interactive docs are at `/docs` on the API host.

| Method | Route | What it does |
| --- | --- | --- |
| `GET` | `/health` | Liveness check. The only unauthenticated route, and the target of the keep-alive ping. |
| `POST` | `/auth/signup` | Creates an account and sets the session cookie. `409` if the address is taken. |
| `POST` | `/auth/login` | Signs in and sets the cookie. `404` if the address has no account, `401` if the password is wrong. |
| `POST` | `/auth/logout` | Clears the session cookie. |
| `GET` | `/auth/me` | Returns the signed-in account, or `401`. Used on boot to restore a session. |
| `POST` | `/uploads/{kind}` | Uploads one CSV, where `kind` is `orders` or `payments`. Parses and stores it, replacing any previous file of that kind, and returns the row count plus any rejected rows. |
| `GET` | `/uploads` | Lists what the user has loaded: filename, row count and when. |
| `GET` | `/reconciliation/overview` | Everything the dashboard needs for its first paint — summary, uploads and the first page of findings — from a single engine run. |
| `GET` | `/reconciliation/summary` | The headline figures alone, without the findings list. |
| `GET` | `/reconciliation/discrepancies` | The findings list, filterable by `type` and `severity`, searchable across order id, transaction ref, classification and wording, with `limit` and `offset`. |
| `GET` | `/reconciliation/discrepancies/{key}/evidence` | The raw order and payment rows behind one finding, with their line numbers in the source CSV. |
| `POST` | `/reconciliation/discrepancies/{key}/explain` | A written explanation of one finding. Cached per user; `?refresh=true` forces a new call. `503` if the model is unavailable. |
| `POST` | `/reconciliation/summary/explain` | A written read of the whole reconciliation rather than one finding. Cached the same way. |
| `GET` | `/reconciliation/llm/status` | Reports the model in use and the health of each API key in the pool, without revealing the keys. |

Findings are addressed by `key`, a stable hash of the finding's content. The same
finding always produces the same key, which is what lets explanations be cached
and lets a row be linked to.

## What I would do next

1. **Persist reconciliation runs.** The engine currently runs per request. That
   is fine at this size (about 3ms for 372 rows) but means no history: you cannot
   show that missing payments went from 6 to 4 this week, and re-running is the
   only way to see a past result.
2. **Triage state.** Findings are read-only. An analyst working a list of 28
   wants to mark one investigated, assign it, or snooze it — with an audit trail.
3. **Streamed ingestion.** Files are read into memory. Fine for thousands of
   rows, wrong for millions; this should stream and batch.
4. **Configurable tolerances in the UI.** They are constants with a documented
   rationale. A finance team will want to set them, and see what changes when
   they do.
5. **Shared rate-limit store.** The limiter is in-process, so multiple instances
   each keep their own count.
6. **Currency conversion.** Currency mismatches are flagged but not quantified in
   a single reporting currency; that needs an FX rate source.
7. **CI.** Tests, type check and the build should run on every push.
