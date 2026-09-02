# L1′ — Invariants

*What must always be true, and what actually enforces it — not application code alone unless
noted. Source: `spec/04_ACTORS.md`, `spec/07_DATA_MODEL.md`, `spec/06_ARCHITECTURE.md`, `HANDOFF.md`.*

Read this before touching identity, money, or booking code. Several of these look like they could
be simplified — they can't, and the "why not" is the point of this file.

## INV-ACTOR-1 — Owner identity ≠ learner identity

**A buyer is never stored as "the learner," even when they are the same person.**
`accounts` and `learner_profiles` are separate tables; an independent student is a buyer with one
profile representing themselves, not a collapsed record.

- **Enforced by:** schema separation + RLS scoping both tables to `auth.uid()`.
- **Why it exists:** learner profiles carry no credentials, which is *why there is no minors'
  consent gate*. Collapsing the tables would either reintroduce the consent problem or make a
  future profile→login upgrade a migration instead of an additive change.
- **Trap:** don't "simplify" by merging buyer and learner fields onto one row when they're the same
  person. It looks redundant for the independent-student case; it isn't.

## INV-MONEY-1 — Balance never negative

`credit_ledger` is append-only; **balance = Σ delta**, never a stored counter.

- **Enforced by:** a row lock inside the spend RPC (`SECURITY DEFINER`, `FOR UPDATE`), not by
  application-level balance checks.
- **Why it exists:** concurrent booking attempts must not both succeed off a stale balance read.
- **Trap:** don't add a cached `balance` column "for performance" — it can drift from the ledger
  under concurrency, which is exactly the bug the row lock exists to prevent.

## INV-MONEY-2 — At most one First Session per account

- **Enforced by:** a **partial unique index** on `purchases` (`sku = 'first_session'`) plus a
  pre-checkout check.
- **Why the index matters, not just the pre-check:** the pre-checkout check alone would race under
  concurrent checkout attempts; the index is what makes the guarantee true under concurrency.
- **Trap:** don't rely on the application-level check alone as "good enough" — it isn't the thing
  making this true.

## INV-MONEY-3 — Webhook redelivery is a no-op

- **Enforced by:** `stripe_events` insert-first (unique key on Stripe's event id).
- **Why it exists:** Stripe retries webhooks; a missed event is safely re-credited on retry, but a
  *received* event must never be applied twice.
- **Trap:** the browser redirect after checkout is **never** trusted to grant credits — only the
  signature-verified webhook is (`spec/06_ARCHITECTURE.md` §Boundaries & trust).

## INV-BOOK-1 — At most one live booking per slot

- **Enforced by:** a row lock inside `book_session`, in the **same transaction** as the credit
  spend.
- **Why it exists:** concurrency must yield exactly one booking and one spend for a given slot, not
  a double-booked slot or a spent-but-unbooked credit.

## INV-BOOK-2 — `meet_url` is nullable, on purpose

The Google Calendar event + Meet link are created **after** the booking transaction commits.

- **Why it exists:** a Google outage must leave a valid booking with a missing link — surfaced on
  the admin queue for repair — never a rolled-back booking. `AT-BOOK-006` tests exactly this.
- **Trap:** don't "fix" this by making Calendar creation part of the booking transaction. That
  would let a third-party outage take down bookings entirely.

## Rescheduling is not cancel-and-rebook

At 24h+ notice, rescheduling **moves the slot and leaves the ledger untouched** — no refund/respend
pair.

- **Why it exists:** implementing reschedule as cancel+rebook would create a ledger entry that
  could be used to dodge the 24h cancellation rule (cancel late, immediately "rebook" as a fresh
  reschedule to avoid the burned credit).
- **Trap:** don't "simplify" reschedule into existing cancel+book code paths.

## `class_help` has no assessment — not a shorter one, none

When a First Session buyer states the `class_help` goal, there is **no pre-session assessment at
all**.

- **Why it exists:** a pre-test tells you nothing when the goal is already known (help with the
  current class). Adding one "to complete the pattern" contradicts the reason it's absent for this
  mode.
- **Trap:** don't add a minimal/quick assessment for `class_help` to make the three goal modes look
  symmetric.

## Answer secrecy is enforced by column-level grants, not application code

`answer`, `tolerance`, and `explanation` on `questions` are withheld from `anon`/`authenticated` at
the **Postgres grant** level; only the service role reads them.

- **Trap:** don't route question reads through a client that would need those columns — the
  guarantee is that no such client exists, not that application code remembers to filter them out.

## Deliberate absences (not gaps — do not "fix")

| Absence | Why |
|---|---|
| No `entitlements` table, no paywall, no course SKU | Content is free (ADR-004) |
| No `sample: true` frontmatter flag | Every lesson is public; nothing to promote |
| No tutor entity in the schema | Operator is solo (ADR-003); a second tutor is a known future migration |
| No self-serve refunds | Manual Stripe refund + an **admin ledger adjustment**, so wallet and Stripe can't drift |
| No SMS integration | The reminder queue is a manual **worklist**, not an integration — email only |
| No password auth | Google OAuth + magic link only — no reset flow, no breach surface |
| No minors' consent gate | Learner profiles have no credentials (INV-ACTOR-1) — COPPA doesn't bite |
| No cached `credit_ledger.balance` column | See INV-MONEY-1 |
| No expiry column on credits | Credits never expire, by design |

Full requirement/flow/test references for each: `spec/13_COVERAGE_MATRIX.md` → "Gaps and known
holes."

## Downstream

`journeys/` — each journey doc names which invariants it depends on. `spec/07_DATA_MODEL.md` is the
schema-level backing store for all of the above.
