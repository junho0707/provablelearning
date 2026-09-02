# 08 — Build plan

**Approach: reconcile.** The existing codebase (migrations `0001`–`0016`, ~49 routes, ~181 tests) was
built against the previous product model. It is modified toward this tree rather than rewritten. Most
of the hard parts — atomic booking, the ledger, Stripe idempotency, Calendar resilience, DST-correct
slot maths — are model-independent and survive intact.

## 1. Disposition of what exists

| Module | Verdict | Why |
|---|---|---|
| `lib/billing/*`, `/api/webhooks/stripe` | **Keep, extend** | Idempotent purchase handling is correct. Add the consent event, login activation, and per-student entitlement. |
| `lib/credits/*`, `credit_ledger` | **Keep** | The ledger model is right and unaffected by every decision made here. |
| `lib/booking/{slots,timezone}.ts` | **Keep, retune** | DST-correct derivation is the most trustworthy code in the build. Only the window constants and release cadence change. |
| `lib/booking/book.ts`, `book_session` | **Change** | 6-hour floor, 1-hour floor for released slots, purpose capture, per-student First Session entitlement. |
| `lib/booking/manage.ts`, lifecycle RPCs | **Change** | 24h → 6h; cancellation must return the slot to the open pool. |
| `lib/booking/calendar.ts` | **Keep** | Post-commit, failure-tolerant by design. Exactly right. |
| `lib/notify/*` | **Keep, extend** | Add student recipients and the new events in `02-POLICIES.md` §11. |
| `lib/accounts/*` | **Change** | Add student credentials, activation state, math class fields, and the new purpose vocabulary. |
| `credit_return_requests` + admin queue | **Change** | Add the 2-per-calendar-month per-student cap in the database. Today there is no cap at all. |
| `lib/practice/*`, `questions` | **Keep** | The question engine and its column-level answer secrecy are reused by post-session materials. |
| `lib/assessment/{test-prep,first-session,session}.ts` | **Change** | Right shape, wrong scope — generalise from First-Session-only to every session. |
| `lib/assessment/probe.ts` | **Shelve** | The algorithmic probe-and-descend traversal is superseded by hand-authored diagnostics per class level. Keep the file; stop routing to it. Do not delete — it is the best implementation of an idea that may return. |
| `lib/content/*`, `/courses`, `/roadmap`, worksheets | **Keep, unroute** | Content is not public at launch. Remove the routes, nav, sitemap, and robots entries. The pipeline and authored lessons stay. |
| `lib/admin/*`, `/admin/**` | **Keep, extend** | Add diagnostics authoring, the materials queue, and the message inbox. |
| `src/app/page.tsx` | **Rewrite** | Written for the free-content model; its secondary CTA points into content that is no longer public. |
| Everything under `/student` | **New** | No student-facing surface exists today. |
| `messages`, pre/post-session tables | **New** | The substance of the product; nothing in the current schema covers it. |

## 2. Order of work

Each stage is verifiable on its own. `AT-*` references are to `07-VERIFY.md`.

**R0 — Truth alignment.** Unroute content (`AT-CONTENT-1..3`); rewrite the landing page; reconcile
`pricing.ts` and the policy constants (6h, 1h, 4 weeks, Monday, 2/month) into one config module with
a drift test. *Nothing structural — this makes the app stop asserting things that are no longer true.*

**R1 — Identity and consent.** Student credentials on `learner_profiles`, the `/student/login` path,
dormant-until-consent activation, `consent_events`, buyer-side password reset, and the consent
controls on `/account`. Enforce `INV-ACTOR-1` in RLS. *Gates everything student-facing.*
→ `AT-AUTH-*`, `AT-COPPA-*`, `AT-ACTOR-*`

**R2 — Money.** Move First Session enforcement from account to student; widen the goal vocabulary;
wire the webhook to record consent and activate logins.
→ `AT-MONEY-*`

**R3 — Booking.** 6-hour floor, 1-hour released-slot floor, Monday release cadence, slot return on
cancellation, and full purpose capture on the booking form.
→ `AT-BOOK-*`

**R4 — Session work.** `pre_session_submissions`, `session_uploads`, `post_session_materials`,
`material_progress`; the `/student` surfaces; the admin authoring form; the 24-hour overdue queue.
*This is the largest stage and the actual product.*
→ `AT-PRE-*`, `AT-POST-*`

**R5 — Cancellation and returns.** The 6-hour rule end to end, the per-student per-calendar-month
cap in the database, the remaining-allowance readout, the no-show path, and the hard stop at the
third miss.
→ `AT-CANCEL-*`

**R6 — Messaging.** `messages`, `/messages`, `/admin/messages`.
→ `AT-MSG-*`

**R7 — Diagnostics skeleton.** `/admin/diagnostics` plus the delivery and grading path, so adding a
diagnostic is data entry. **Ship the skeleton, not the content** — diagnostics are authored
afterwards, at whatever pace suits, and their absence degrades gracefully.
→ `AT-PRE-3`, `AT-PRE-4`, `AT-PRE-7`, `AT-OPS-5`

**R8 — Launch.** Legal pages including the kids disclosure, **lawyer review of the COPPA stack**,
live Stripe products, Resend DNS, analytics, apex cutover.
→ `AT-OPS-*`

## 3. Sequencing constraints

- **R1 gates R4.** No student-submitted data may exist before consent works (`INV-COPPA-1`).
- **R8's lawyer review gates launch, not R4.** Build against this design, but do not open to real
  under-13 users until it has been reviewed.
- **R7 does not gate anything, and neither does its content.** Missing diagnostics degrade
  gracefully by design (`AT-PRE-7`), so authoring runs in parallel and continues after launch.
- **Content authoring is off the critical path entirely** and stays deferred until it is worth
  shipping publicly — at which point it restores the organic acquisition channel
  (`00-BUSINESS.md` §3).

## 4. Standing caveat

Nothing in the existing codebase has been meaningfully verified against live Stripe, Google, or
Resend, and the environment has no Docker. Every `[live]` and `[db]` check in `07-VERIFY.md` is
genuinely unproven, including for code that was previously called "complete". Treat unit tests as
evidence about this codebase's own logic, never as evidence that an integration works.
