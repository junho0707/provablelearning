# STATUS

**Project:** Provable Learning — 1:1 math tutoring. First Session ($49, per student) + credit packs.
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
| **R6** — messaging | ⬜ **next** |
| **R7** — diagnostics skeleton | ⬜ |
| **R8** — launch | ⬜ (mostly not code) |

**305 tests passing, `next build` clean, `tsc --noEmit` clean.**

**Nothing has been live-verified.** This environment has no Docker and no real Stripe/Google/Resend
credentials, and **migrations 0017–0021 have not been applied to any database.** Every `[db]` and
`[live]` check in [`system/07-VERIFY.md`](system/07-VERIFY.md) is genuinely unproven.

## What R0–R5 changed

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
- **R3** — migration `0019`: bookings carry purpose/sub-purpose/specifics/topic-mode. 6-hour notice
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

## Next task

**R6 — messaging** (small), then **R7 — the diagnostics skeleton**. See the handoff for both.

Read [`HANDOFF.md`](HANDOFF.md) before starting. It carries what this file cannot: why the
decisions are what they are, the traps, and the specific shape the remaining stages should take.
