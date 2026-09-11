# HANDOFF — Provable Learning

Written 2026-09-02, at the R7/R8 boundary. Read `STATUS.md` for position and
[`system/README.md`](system/README.md) for the product. This file carries what neither can: **why**
the code is shaped as it is, what will bite you, and exactly what to do next.

---

## 1. Read these, in this order

1. `system/00-BUSINESS.md` — what is sold and how customers are acquired
2. `system/01-ACTORS.md` — the buyer/student boundary, which is the most important rule in the system
3. `system/02-POLICIES.md` — every number
4. `system/03-FLOWS.md` — F1–F13, what actually happens
5. `adr/007-v3-system-truth.md` — every decision with its cost

**`spec/` and `docs/` are superseded.** They describe the previous model (free public content, no
student logins, 24-hour policy, one First Session per customer). Do not update them, and do not
reason from them — several of their statements are now the exact opposite of the truth. The root
`VERIFY.md` belongs to that era too; the live checklist that matters is `system/07-VERIFY.md`.

## 2. Your next task — walk the flows

**Every stage with a code deliverable is done.** What remains is proving it, and the non-code launch
work in §6. Nothing below is a code change; if one turns out to be needed, that is a finding, which
is the point of doing this.

Work `system/07-VERIFY.md` top to bottom and check a box **only when the expected result actually
happened**. The order below is the cheapest path through it — each step sets up the next, so a
failure stops you before you have wasted the setup after it.

### Step 0 — make a stack exist

1. ~~**Apply migrations `0017`–`0024`**~~ — **done.** `mlhlugfzzsigraqcxgmh` is at `0024`; the CLI
   is linked to it and `supabase db push` reaches it. `0024` only replaces functions, so preflight
   asks the database for the window rather than looking for a table.
2. ~~Fill `.env.local` per `SETUP.md` §3~~ — **done.** `npm run preflight` passes on all of it.
3. Give your own account `accounts.is_admin = true` — you are the tutor as well as the owner.
4. Set one weekly availability rule on `/admin/availability`, far enough ahead to be bookable.

### Step 1 — the boundary (`AT-ACTOR`, `AT-AUTH`, `AT-COPPA`)

Prove the permission model before anything is riding on it.

5. Sign in as a buyer with Google, then again with a magic link on the same address → **one**
   account (`AT-AUTH-1`, `AT-AUTH-2`).
6. Add a student and set their username and password from `/account`. Try to sign in as them at
   `/student/login` **before any purchase** → refused, the login is dormant (`AT-COPPA-1`).
7. With a student session, query `bookings`, `credit_ledger`, `purchases` and `messages` directly
   through the API → **denied on all four** (`AT-ACTOR-1`, `AT-MSG-2`). This is the check that
   matters most in the whole file. Do it at the database, not by looking for missing links.

### Step 2 — money (`AT-MONEY`)

8. Buy a First Session for that student with a test card. Confirm: credits granted, a
   `consent_events` row naming the mechanism, and the student's login now works (`AT-COPPA-2`).
9. Replay the same Stripe webhook → nothing granted twice (`AT-MONEY-2`).
10. Try to buy a second First Session for the same student → refused **by the database**
    (`AT-MONEY-3`); add a sibling and buy theirs → allowed (`AT-MONEY-4`).

### Step 3 — booking (`AT-BOOK`)

11. Book with a purpose, specifics, and continue-vs-new-topic. Check the Meet link arrives and the
    tutor's `/admin/bookings/[id]` shows all four (`AT-BOOK-8`).
12. Try a slot under 2 hours out → refused (`AT-BOOK-3`). Cancel a booking and confirm the freed
    slot reappears and stays bookable to the 1-hour floor (`AT-BOOK-4`).

### Step 4 — the session itself (`AT-PRE`, `AT-POST`)

13. As the student, open `/student/prepare/[id]`. With **no diagnostic authored**, you should be
    asked the descriptive questions and the tutor's page should say so in those words
    (`AT-PRE-7`). Confirm nothing is blocked.
14. Now author one on `/admin/diagnostics` — a test-prep set for whichever test you booked, or a
    class-level set matching what the student typed — add a question, publish, reload the prepare
    page. It should appear; answer it; the result should reach `/admin/bookings/[id]` (`AT-OPS-5`,
    `AT-PRE-3`, `AT-PRE-4`). Book a second session for the same student and same test → **no
    re-sit** (`AT-PRE-3`).
15. Upload a `.docx` and a Google Docs link; try a `.exe` → rejected with the accepted list shown
    (`AT-PRE-8`). Confirm the upload is visible to that student, their buyer, and you, and nobody
    else (`AT-PRE-9`).
16. Author and publish post-session material; confirm the student sees it in-app and the buyer is
    emailed, and that **the draft was invisible to the student before publishing** (`AT-POST-1/2`).

### Step 5 — the rest (`AT-CANCEL`, `AT-MSG`, `AT-CONTENT`)

17. Late-cancel and no-show a session, request returns, approve two in one calendar month, then try
    a third → refused at the database, not just hidden (`AT-CANCEL-*`).
18. Message the tutor from `/messages`, reply from `/admin/messages`, confirm the buyer is emailed
    and the reply lands in the same thread (`AT-MSG-1`).
19. Confirm `/courses`, `/roadmap` and the worksheet routes 404 and appear in neither nav nor
    sitemap (`AT-CONTENT-1..3`).

### Step 6 — the non-code launch work

Then §6 below: legal pages, the lawyer review, live Stripe, Resend DNS, apex cutover.

### Rules that are easy to get wrong while verifying

- **`school` purposes get no assessment at all.** Not a shorter one — none. If you see a diagnostic
  offered on a `school` booking, that is a bug, not a feature to complete.
- **Nothing blocks a session.** Missing preparation, missing diagnostic, missing materials — all
  degrade and are surfaced, never enforced. A step that blocks is a failed check.

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
- **No diagnostics are authored, and that is a shipped state, not a gap.** Authoring runs after
  launch at whatever pace suits (ADR-007 §14).

## 4. Traps

**The buyer/student boundary is structural, not cosmetic.** A student has **no `accounts` row**, so
every existing `account_id = auth.uid()` policy denies them without a single new check. If you ever
find yourself adding a student-specific policy to a money, booking, or messaging table, you are
about to break `INV-ACTOR-1` — add a scoped view instead.

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
half-written draft is safe to save. **An unpublished diagnostic works the same way** (migration
0023): the policy checks the set's `published_at`, so an unfinished one is safe to leave sitting
there, and withdrawing one stops it being served without destroying answers already given.

**`released_slots` is a table, not a flag.** The obvious implementation — a placeholder cancelled
booking marking the freed instant — puts a session in the buyer's own list that they never had.

**`listFirstSessionEligible` and `listUnusedFirstSessions` are opposite sets.** Eligible = has not
bought one, still being offered $25. Unused = bought, not yet booked. Confusing them either gives
away a paid session or hides one already paid for.

**The webhook must not throw.** `activateStudentLogins` is wrapped in try/catch on purpose: a
student left banned is recoverable by the next purchase, whereas a 500 makes Stripe retry a payment
that already succeeded.

**A diagnostic's class level matches on lowercased alphanumerics and nothing else.** "Algebra 1" and
"algebra1" are the same level; "Algebra I" is not. That is deliberate — a fuzzy match would serve a
Geometry student the Algebra 2 set and nobody would notice, whereas a miss falls through to the
descriptive questions, which is the safe direction to be wrong in. If students routinely miss, add
authored levels, don't loosen the match.

**"No diagnostic result" has three meanings** and the tutor's page distinguishes them: this purpose
never asks for one, none is authored, or the student didn't sit it. Collapsing them makes a gap in
the content look like a student who ignored their preparation.

**`probe.ts` is shelved, not dead.** ADR-007 replaced algorithmic probe-and-descend with
hand-authored diagnostics per class level. The file stays because it is a good implementation of an
idea that may return. Do not route to it; do not delete it.

## 5. The honesty problem

**Nothing in this codebase has been exercised against a real database, Stripe, Google, or Resend.**
There is no Docker in this environment, so **the test suite still touches no Postgres** — but the
hosted database is now real and current (`0024`), and every credential is live, so the checks below
are finally *runnable*. None has been run.

Treat the test suite accordingly:

- **Pure-logic tests** (`slots.ts` DST maths, `policy.ts`, `purposes.ts`, `pre-session-shape.ts`,
  `answer-check.ts`, `class-level.ts`) are trustworthy — they need no external service.
- **SQL-text integrity tests** prove the migration says the right thing. They cannot prove Postgres
  does it.
- **Mocked external-service tests** prove this codebase's error handling, not that the integration
  works.

`system/07-VERIFY.md` marks every check `[db]` or `[live]` accordingly. §2 above is the order to
work it in.

## 6. Blocking, non-code work the owner must do

1. **Lawyer review of the COPPA stack.** The brief to hand over is at
   `https://claude.ai/code/artifact/a857afb1-c960-440a-a5e3-7af4385592a9` — facts, the proposed
   consent design, and twelve questions. **Do not open to real under-13 users before this.** Q2
   (does the card payment qualify as verifiable parental consent?) and Q3 (is parent-entered child
   data already collection?) can both change the build.
2. ~~**Apply migrations 0017–0024**~~ — done. What remains here is the **live**-mode counterpart of
   the test-mode Stripe cutover: ADR-008's $25 price exists in test mode only.
3. **Live Stripe products**, Resend DNS, legal pages including the kids-specific disclosure, apex
   DNS cutover.

## 7. Accepted risks — argued already, do not re-litigate

- **No organic acquisition channel at launch.** Content is hidden, so paid ads and social carry
  everything and neither compounds. The $25 tripwire's economics depend on a CAC nobody has measured.
- **Post-session materials are hand-authored**, so throughput is capped by the owner's writing time.
  This is the first thing that breaks if the business works.
- **Under-13 support carries legal exposure** that a lawyer has not yet reviewed.
- **Revenue has one leg:** First Session → credit-pack conversion, and Vercel Analytics cannot
  measure it. It must be reconstructed by hand from Stripe.
- **Launching with no diagnostics authored** means every early student gets the descriptive
  questions. That is the designed fallback, but it does mean the diagnostic path is the least-worn
  code in the build on day one.
