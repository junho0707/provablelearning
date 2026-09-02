# HANDOFF — Provable Learning

Written 2026-09-02, at the R5/R6 boundary. Read `STATUS.md` for position and
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

## 2. Your next task

**R0–R5 are done.** What remains is R6 (small), R7 (a skeleton), and R8 (mostly not code).

### R6 — messaging

The smallest remaining stage. `messages`: one thread per buyer, rows carrying sender
(`buyer` | `tutor`), body, and read state. RLS restricts a thread to its buyer and the admin.
**Students have no access at all** (`INV-ACTOR-1`) — do not add a student policy, and do not add a
messaging entry point to the `/student` shell.

Surfaces: `/messages` for the buyer, `/admin/messages` for the operator. Buyers are emailed when the
tutor replies (`system/02-POLICIES.md` §11); the tutor is not emailed, they work the inbox.

### R7 — diagnostics skeleton

**Ship the skeleton, not the content** (ADR-007 §14). The owner authors diagnostics afterwards, and
a purpose may be sold before its diagnostic exists.

- `/admin/diagnostics` — author a diagnostic per test (`psat`/`sat`/`act`) and per math class level,
  as data. `practice_tests` + `test_prep_questions` (migration 0012) already have the right shape;
  extend rather than inventing a parallel one, keyed by class level as well as test slug.
- Wire it into the student flow by replacing the hardcoded `assessmentUnavailable: true` in
  `src/lib/sessions/student.ts` with a real lookup. **That constant is the only thing standing
  between the current build and working diagnostics** — everything around it is built and tested.
- A missing diagnostic must still degrade to the descriptive questions (`AT-PRE-7`). Never block.

### R8 — launch

Legal pages including the kids-specific disclosure, **lawyer review of the COPPA stack**, live
Stripe products, Resend DNS, analytics, apex cutover. See §6.

### Rules that are easy to get wrong in what remains

- **`school` purposes get no assessment at all.** Not a shorter one — none. Do not "complete the
  pattern" when wiring R7.
- **Nothing blocks a session.** Missing preparation, missing diagnostic, missing materials — all
  degrade and are surfaced, never enforced.

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

**Students read `student_sessions`, never `bookings`.** The view (migration 0020) is what lets a
student see their session and Meet link while `INV-ACTOR-1` stays literally true. Adding a student
policy to `bookings` would collapse that distinction and is the single easiest way to break the
permission model.

**The credit-return cap counts by the session's month, not the approval's.** Counting by approval
date would make a slow review consume the buyer's next month. It is per student and combined across
late cancellations and no-shows.

**Post-session material is invisible to the student until published.** That is RLS, not UI, so a
half-written draft is safe to save.

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
There is no Docker in this environment. Migrations `0017`–`0021` **have not been applied anywhere**.

Treat the test suite accordingly:

- **Pure-logic tests** (`slots.ts` DST maths, `policy.ts`, `purposes.ts`, `pre-session-shape.ts`,
  `answer-check.ts`) are trustworthy — they need no external service.
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
2. **Apply migrations 0017–0021** to the target Supabase project (`mlhlugfzzsigraqcxgmh`, which is
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
