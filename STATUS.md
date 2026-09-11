# STATUS

**Project:** Provable Learning — 1:1 math tutoring. First Session ($25, per student) + credit packs.
**Branch:** `main`.
**Truth:** [`system/`](system/README.md), decided 2026-09-02 by **ADR-007**. `spec/` and `docs/` are
superseded and kept only as decision history.

## Where the build is

The reconciliation plan is [`system/08-BUILD-PLAN.md`](system/08-BUILD-PLAN.md), stages R0–R8.

| Stage | State |
|---|---|
| **R0** — truth alignment | ✅ done |
| **R1** — identity and consent | ✅ done |
| **R2** — money | ✅ done |
| **R3** — booking | ✅ done |
| **R4** — session work (pre/post-session) | ✅ done |
| **R5** — cancellation and credit-return cap | ✅ done |
| **R6** — messaging | ✅ done |
| **R7** — diagnostics skeleton | ✅ done |
| **R8** — launch | ⬜ **next** — not code |

**Every stage with a code deliverable is code-complete.** 325 tests passing, `next build` clean
(38 routes), `tsc --noEmit` clean.

**The stack now exists, but nothing has been live-verified.** Migrations `0017`–`0024` are applied
to `mlhlugfzzsigraqcxgmh`, and `npm run preflight` passes on every credential — Supabase, Stripe
test mode, Google, Resend, cron. What has *not* happened is anyone walking a flow through it: every
`[db]` and `[live]` check in [`system/07-VERIFY.md`](system/07-VERIFY.md) is still unproven,
including for code called "done" above. There is no Docker here, so the test suite still exercises
no Postgres.

## What R0–R7 changed

- **R0** — `src/lib/policy.ts` holds every policy number, with a drift test that reads
  `system/02-POLICIES.md` and fails CI if the two disagree. Content is unrouted (`/courses`,
  `/roadmap`, worksheets removed; pipeline and MDX kept). Sitemap/robots/nav reflect that.
- **R1** — migration `0017`: students get logins. Auth users are created **banned**, unbanned when a
  payment records consent; `login_active` mirrors it for RLS; `handle_new_user` no longer gives a
  student an `accounts` row, which is what keeps money and booking unreachable (INV-ACTOR-1).
  Student identities use the reserved `.invalid` TLD, so "no email ever reaches a student" is a
  property of the address. `/student/login`, `/student`, consent controls on `/account`,
  `/dashboard`.
- **R2** — migration `0018`: First Session is per student. `process_purchase` records consent in the
  same transaction as the purchase; the webhook then unbans that household's student logins. The
  separate "First Session flow" is gone — it is an ordinary booking that happens to be prepaid.
- **R3** — migration `0019`: bookings carry purpose/sub-purpose/specifics/topic-mode. 2-hour notice (`0024`)
  and free cancellation, 1-hour floor for slots freed by a cancellation (`released_slots`),
  Monday-stepped horizon. `/book` is the booking form; `/sessions` is the list.
- **R4** — migration `0020`: the product itself. `pre_session_submissions`, `session_uploads`,
  `post_session_materials`, `material_progress`, and a `student_sessions` **view** so a student can
  see their sessions without the `bookings` table ever being readable by them. Pre-session branching
  is a pure module (`sessions/pre-session-shape.ts`). Practice answers keep the column-grant secrecy
  of migration 0002. `/student/prepare/[id]`, `/student/materials/[id]`, the real `/student` home,
  the tutor's authoring form on `/admin/bookings/[id]`, and `/admin/materials`.
- **R5** — migration `0021`: credit returns capped at 2 per calendar month, per student, combined,
  enforced in the database at both request and approval. Allowance surfaced to buyer and operator.
- **R6** — migration `0022`: `messages`, one thread per buyer. `/messages` for the buyer,
  `/admin/messages` for the operator, and a reply email to the buyer only. No student policy on the
  table and no student entry point.
- **R7** — migration `0023`: `practice_tests` extended into diagnostics keyed by test slug **or**
  class level, published-gated, plus `diagnostic_responses`. `/admin/diagnostics` authors them as
  data; the pre-session flow serves one when it exists and falls through to the descriptive
  questions when it does not. **No diagnostics are authored yet, and none gate launch.**

## Next task

**Walk the flows against a real stack.** That is R8, and almost none of it is code. Read
[`HANDOFF.md`](HANDOFF.md) §2 — it is an ordered walkthrough, starting with applying migrations
`0017`–`0024` (**done** — Step 0 is complete), and it names which `system/07-VERIFY.md` check each
step proves. Start at Step 1, the buyer/student boundary.
