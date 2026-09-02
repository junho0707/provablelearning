# HANDOFF — Provable Learning

Written 2026-09-02, at the R3/R4 boundary. Read `STATUS.md` for position and
[`system/README.md`](system/README.md) for the product. This file carries what neither can: **why**
the code is shaped as it is, what will bite you, and exactly what to do next.

---

## 1. Read these, in this order

1. `system/00-BUSINESS.md` — what is sold and how customers are acquired
2. `system/01-ACTORS.md` — the buyer/student boundary, which is the most important rule in the system
3. `system/02-POLICIES.md` — every number
4. `system/03-FLOWS.md` — F1–F13, what actually happens
5. `adr/007-v3-system-truth.md` — every decision with its cost

Then `system/08-BUILD-PLAN.md` for the stage you are on.

**`spec/` and `docs/` are superseded.** They describe the previous model (free public content, no
student logins, 24-hour policy, one First Session per customer). Do not update them, and do not
reason from them — several of their statements are now the exact opposite of the truth.

## 2. Your next task: R4 — session work

This is the largest remaining stage and **it is the actual product**. Everything before it was
plumbing so that this could exist.

### What to build

**Migration `0020_session_work.sql`:**

| Table | Purpose |
|---|---|
| `pre_session_submissions` | One row per booking: the student's typed inputs and completion state |
| `session_uploads` | Files on a booking. Keyed by `profile_id` in storage — see the trap in §4 |
| `post_session_materials` | The tutor's hand-authored deliverable, with `published_at` |
| `material_progress` | The student's progress through it, so a later session resumes |

**A `student_sessions` view.** The student's home needs their upcoming session and Meet link, but
`INV-ACTOR-1` says no student request may read the `bookings` table. Resolve it with a
**security-definer view** exposing only scheduling fields, scoped by
`where p.auth_user_id = auth.uid()`. Do **not** add a student policy to `bookings` — the invariant
is written the way it is on purpose, and a view keeps it literally true.

**Surfaces:** `/student/prepare/[bookingId]`, `/student/materials/[bookingId]`, the real
`/student` home (it is currently a shell with only an empty state), and the tutor's authoring form
on `/admin/bookings/[id]` plus an overdue queue.

**Pre-session branching** is driven entirely by the booking's `purpose` — the table in
`system/02-POLICIES.md` §7 is the specification. `assessmentKindFor()` in
`src/lib/accounts/purposes.ts` already encodes which purposes get an assessment.

### Rules that are easy to get wrong here

- **Pre-session work never blocks a session** (F6 step 4). A student who skips it still attends;
  they are told it will be less effective and the tutor sees it is missing.
- **A missing diagnostic degrades gracefully** (`AT-PRE-7`). If none is authored for that test or
  class level, ask the descriptive questions instead and flag the tutor. Never block.
- **`school` purposes get no assessment at all.** Not a shorter one — none. The goal is already
  known. Do not "complete the pattern".
- **Materials go to the student's account, and the student works them on the site**, because
  `material_progress` is what makes a later session resume rather than restart.

## 3. What is already true and should not be re-derived

- **Prices** live in `src/lib/pricing.ts`; **policy numbers** in `src/lib/policy.ts`. Both have
  drift tests that read the docs. Never retype a number into page copy — import it.
- **Every migration has a companion SQL-text integrity test.** They assert the migration *says*
  what a live database would enforce. They are a substitute for exercising Postgres, not a
  replacement — see §5.
- **Purpose vocabulary** is `src/lib/accounts/purposes.ts`. It is deliberately open: presets are
  suggestions and free text is allowed, so there is no CHECK constraint on purpose values.
- **`PurposePicker`** (`src/components/purpose-picker.tsx`) is shared by the First Session purchase
  and the booking form, because they ask the same question.

## 4. Traps

**The buyer/student boundary is structural, not cosmetic.** A student has **no `accounts` row**, so
every existing `account_id = auth.uid()` policy denies them without a single new check. If you ever
find yourself adding a student-specific policy to a money or booking table, you are about to break
`INV-ACTOR-1` — add a scoped view instead.

**Consent gates the login, not the profile.** A parent typing their own child's name is not
collection *from a child*; the child's own submissions are. That is why the gate sits at login
activation. It is also **Q3 to the lawyer** in the review brief, so it may yet be overturned — if it
is, consent has to move earlier, before a student record can be created at all.

**Two auth-layer flags, both needed.** `login_active` (database, read by RLS) and Supabase's
`ban_duration` (auth, blocks session minting). The database flag is the boundary; the ban is the
door. `record_consent` sets the first, `activateStudentLogins` lifts the second. Setting only one
leaves a student who can authenticate but reads nothing, or reads everything but cannot sign in.

**Uploads are keyed by `profile_id` in storage.** `deleteStudentUploads` in
`src/lib/accounts/consent.ts` relies on that prefix being exhaustive to satisfy `AT-COPPA-5`. If you
key them by booking instead, deletion silently stops working and the failure is invisible.

**`released_slots` is a table, not a flag.** The obvious implementation — a placeholder cancelled
booking marking the freed instant — puts a session in the buyer's own list that they never had.

**`listFirstSessionEligible` and `listUnusedFirstSessions` are opposite sets.** Eligible = has not
bought one, still being offered $49. Unused = bought, not yet booked. Confusing them either gives
away a paid session or hides one already paid for.

**The webhook must not throw.** `activateStudentLogins` is wrapped in try/catch on purpose: a
student left banned is recoverable by the next purchase, whereas a 500 makes Stripe retry a payment
that already succeeded.

**`probe.ts` is shelved, not dead.** ADR-007 replaced algorithmic probe-and-descend with
hand-authored diagnostics per class level. The file stays because it is a good implementation of an
idea that may return. Do not route to it; do not delete it.

## 5. The honesty problem

**Nothing in this codebase has been exercised against a real database, Stripe, Google, or Resend.**
There is no Docker in this environment. Migrations `0017`–`0019` **have not been applied anywhere**.

Treat the test suite accordingly:

- **Pure-logic tests** (`slots.ts` DST maths, `policy.ts`, `purposes.ts`, `plan.ts`) are trustworthy
  — they need no external service.
- **SQL-text integrity tests** prove the migration says the right thing. They cannot prove Postgres
  does it.
- **Mocked external-service tests** prove this codebase's error handling, not that the integration
  works.

`system/07-VERIFY.md` marks every check `[db]` or `[live]` accordingly. Work it top to bottom against
a real project before treating any of this as trustworthy.

## 6. Blocking, non-code work the owner must do

1. **Lawyer review of the COPPA stack.** The brief to hand over is at
   `https://claude.ai/code/artifact/a857afb1-c960-440a-a5e3-7af4385592a9` — facts, the proposed
   consent design, and twelve questions. **Do not open to real under-13 users before this.** Q2
   (does the card payment qualify as verifiable parental consent?) and Q3 (is parent-entered child
   data already collection?) can both change the build.
2. **Apply migrations 0017–0019** to the target Supabase project (`mlhlugfzzsigraqcxgmh`, which is
   *not* the ref the CLI links to by default).
3. **Live Stripe products**, Resend DNS, legal pages including the kids-specific disclosure, apex
   DNS cutover.

## 7. Accepted risks — argued already, do not re-litigate

- **No organic acquisition channel at launch.** Content is hidden, so paid ads and social carry
  everything and neither compounds. The $49 tripwire's economics depend on a CAC nobody has measured.
- **Post-session materials are hand-authored**, so throughput is capped by the owner's writing time.
  This is the first thing that breaks if the business works.
- **Under-13 support carries legal exposure** that a lawyer has not yet reviewed.
- **Revenue has one leg:** First Session → credit-pack conversion, and Vercel Analytics cannot
  measure it. It must be reconstructed by hand from Stripe.
