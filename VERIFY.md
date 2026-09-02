# VERIFY — developer live-verification checklist

This file exists because "code-complete" and "verified" are different claims. Everything below is
work that builds clean and passes its unit tests, but has **not been exercised against a real
Supabase/Google/Stripe stack** — this dev environment has no Docker, so nothing touching Auth, RLS,
or webhooks has actually run. See `HANDOFF.md` §7 and `STATUS.md` "Open follow-ups" for why.

**How to use this file:** work top to bottom. Each item is a manual action + an expected result +
an `AT-*` id it satisfies (see `spec/11_ACCEPTANCE_TESTS.md` for the full definition). Check the
box when the expected result actually happened — not when you believe it should. If an item fails,
leave it unchecked and write what happened underneath it; don't edit the expected result to match
reality.

When a section is fully checked, flip its `AT-*` refs to "✅ passing" in `spec/11_ACCEPTANCE_TESTS.md`
and update `STATUS.md`'s open-follow-ups list. New milestones get a new section appended here as
they go code-complete — don't pre-fill sections for unbuilt work.

---

## 0 — One-time environment setup

- [x] Apply every migration in `supabase/migrations/` in order (0001 through 0014 as of this
      writing) and `supabase/seed.sql`, to the target Supabase project (`supabase db push` or the
      dashboard SQL editor — verify the project ref first, the linked CLI defaults to prod:
      `vufizavpkjpybsknvyno`). Each section below names the specific migration it needs, but
      they're additive and safe to apply all at once up front.
      **2026-08-14:** target project is `mlhlugfzzsigraqcxgmh` (matches `.env.local`), NOT the
      `vufizavpkjpybsknvyno` ref the CLI links to by default. That project turned out to hold the
      old v1 SAT schema (`users`, `enrollments`, `waitlist`, `students`, `classes`, ...) under a
      coincidentally-matching migration numbering — the new repo's schema had never actually been
      applied. Ran `supabase db reset --linked` against `mlhlugfzzsigraqcxgmh` (destroys old v1
      data — confirmed with the user first) and 0001–0014 + seed.sql applied clean.
      `supabase migration list` now shows exactly 0001–0014, no drift.
- [ ] In the Supabase dashboard: Auth → Providers → Google is enabled, with the deployed
      origin's redirect URL registered. **Not yet re-checked after the DB reset — a schema reset
      doesn't touch Auth provider config, but this needs a manual look in the dashboard since the
      project's overall state was already surprising once.**
- [x] `.env.local` (or the deployed environment) has real Supabase URL/anon key/service-role key set.
      Confirmed 2026-08-14 — all keys present (Supabase, Stripe, Google, Twilio, Resend), pointing
      at `mlhlugfzzsigraqcxgmh`.
- [x] `npm run build && npm test` — 2026-08-14: build clean, 181/181 tests passing.

## 1 — M3: Landing + accounts

### TASK-CONFIG-001 — pricing config

- [ ] Open `/` — confirm the displayed First Session price reads **$49** and matches
      `src/lib/pricing.ts` (`priceCents: 4900`). *(AT-OPS-002 — drift is also caught by the unit
      test, but eyeball it once in rendered HTML.)*

### TASK-ROADMAP-002 — course-level nodes

- [ ] Confirm `courses()` (`src/lib/content/roadmap.ts`) returns the expected course list
      (algebra/geometry/precalculus/calculus) — run it in a scratch script or check
      `roadmap.test.ts` output. *(AT-ROADMAP-004)*

### TASK-LAND-001 — landing page

- [ ] Visit `/` on the deployed preview. Hero copy matches `spec/14` §14 **verbatim** — no
      paraphrasing drift.
- [ ] Primary CTA "Book your first session — $49" is present and links to `/login` (expected for
      now — BILLING-001/FIRST-001 don't exist yet, this is not a bug).
- [ ] Secondary CTA "Explore the roadmap →" links to `/roadmap` and the page loads.
- [ ] Run Lighthouse (or PageSpeed Insights) against the deployed URL. Record LCP/CLS/INP here:
      `LCP=___ CLS=___ INP=___` — structurally should be clean (static + server-rendered KaTeX, no
      layout-shifting math). *(NFR-PERF-002)*

### TASK-AUTH-001 — Google OAuth + magic link

- [ ] Visit `/login`. Click "Continue with Google" — a popup opens (not a full-page redirect).
      Complete the OAuth flow. You land back on the app signed in. *(AT-ACCT-001, half)*
- [ ] Sign out. On `/login`, submit your email to the magic-link form. Open the emailed link.
      You land signed in. *(AT-ACCT-001, other half)*
- [ ] Confirm no password field or "reset password" flow exists anywhere in `/login` or
      `/auth/*`. *(AT-ACCT-001 — no password path)*
- [ ] Sign in with Google using an email, sign out, then sign in with **magic link using the same
      email**. Confirm both sessions resolve to the same `accounts` row (same id in the dashboard
      Auth → Users table, one row, not two). *(AT-ACCT-002)*

### TASK-ACCT-001 — accounts + learner profiles

- [ ] After signing in, visit `/profiles`. Create a profile (name + optional grade + optional
      current class). It appears in the list. *(AT-ACCT-003)*
- [ ] Edit the profile's name/grade/current class. Change persists on reload.
- [ ] Create a second profile, switch the active profile between the two. Confirm the active
      profile persists across a page reload (the `active_profile_id` cookie). *(AT-ACCT-003)*
- [ ] Delete a profile. It disappears from the list and a stale reference to it (if any) doesn't
      crash the page.
- [ ] As a buyer with **no** learner profiles created, use the account as both buyer and learner
      (independent-student case) — confirm nothing in the profile flow assumes a second profile
      must exist. *(AT-ACCT-004)*
- [ ] Sign out while signed out, visit `/profiles` directly — confirm it redirects to `/login`
      rather than erroring.
- [ ] **Cross-account check (AT-SEC-001):** sign in as account A, create a profile, note its id.
      Sign in as a different account B (different email). Attempt to read/update/delete account
      A's profile id directly (e.g. via the browser console calling the server action with A's
      profile id, or a raw `supabase.from('learner_profiles').select().eq('id', <A's id>)` as
      B's session). Confirm it returns **empty / denied**, not A's row.

### Regression guard

- [ ] With no account signed in, visit at least three different lesson pages directly. Confirm
      full content renders (200, not a paywall or login redirect). *(AT-CONTENT-005 — the ADR-004
      regression guard; this should also be a permanent automated test per HANDOFF.md §6, not just
      a manual check — confirm `AT-CONTENT-005` exists in the test suite, not only here.)*

## 2 — M4: Money (credits + billing)

### TASK-CREDIT-001 — ledger + balance + spend RPC

- [ ] Apply `supabase/migrations/0004_credits.sql` to the target project.
- [ ] As a signed-in buyer with no purchases, visit `/wallet` — balance reads **0 credits**.
      *(AT-CREDIT-001)*
- [ ] In the SQL editor, run `select process_purchase('evt_test_1', '<your account id>',
      'credits_1', 7500, 1, null, 'cs_test_1');` then reload `/wallet` — balance reads **1
      credit**, and it appears under "Credit activity" as `Purchase +1`. *(AT-CREDIT-001)*
- [ ] Re-run the **same** `process_purchase` call with the same `p_event_id` — balance stays at
      **1**, no duplicate ledger row. *(INV-MONEY-3)*
- [ ] Run `select spend_credit('<your account id>', 'booking_spend');` twice in a row when balance
      is 1 — the second call raises `insufficient_credits` and the balance stays at whatever it
      was after the first spend, never negative. *(AT-CREDIT-002, INV-MONEY-1)*
- [ ] From two separate SQL editor tabs, fire `select spend_credit('<acct>', 'booking_spend');`
      as close to simultaneously as you can with balance = 1 — exactly one succeeds, the other
      raises `insufficient_credits`. *(INV-MONEY-1 under concurrency — the advisory-lock guard)*

### TASK-BILLING-001 — Stripe checkout + webhook

- [ ] Set real `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
      and one `STRIPE_PRICE_*` env var per SKU (test-mode keys are fine) in the deployed
      environment or `.env.local`.
- [ ] From `/wallet`, click a credit pack. You land on a real Stripe Checkout page, not an error.
      Complete it with Stripe's `4242 4242 4242 4242` test card.
- [ ] After returning to `/wallet?purchase=success`, the balance reflects the purchased credits
      and the purchase appears under "Purchases". *(AT-BILLING-001)*
- [ ] In the Stripe dashboard, resend the `checkout.session.completed` webhook event for that
      purchase. Confirm the balance does **not** change again. *(AT-BILLING-002, INV-MONEY-3)*
- [ ] From `/wallet`, start a First Session checkout, complete it, confirm the purchase appears
      with `goal` recorded correctly (check the `purchases` table).
- [ ] Attempt to start a **second** First Session checkout from the same account — confirm it is
      refused before reaching Stripe (`already_purchased`). *(AT-FIRST-001, INV-MONEY-2 — full
      booking-linkage behavior lands with TASK-FIRST-001, this only checks the purchase gate.)*
- [ ] Send a webhook request with a missing or garbled `stripe-signature` header (e.g. via `curl`)
      — confirm the endpoint returns 400 and writes nothing. *(AT-BILLING-003, NFR-SEC-004)*

### TASK-BILLING-002 — wallet UI

- [ ] Confirm all five prices shown on `/wallet` match `src/lib/pricing.ts` exactly.
- [ ] After the First Session purchase above, reload `/wallet` — the First Session purchase option
      disappears (already bought), credit packs remain purchasable.

## 3 — M5: Progress + booking (the critical path)

### TASK-PROGRESS-001 — saved progress

- [ ] Apply `supabase/migrations/0005_progress.sql`.
- [ ] Sign in, create a profile, open a lesson with practice questions. Answer one correctly.
      Reload the page — the lesson isn't marked complete yet (only one of several questions is
      right). *(AT-PROGRESS-002)*
- [ ] Answer every question on that lesson correctly. Check the `lesson_progress` table —
      `completed_at` is now set for that `(profile_id, lesson_slug)`. *(AT-PROGRESS-002)*
- [ ] Switch to a second profile (or sign in as a different account) and open the **same** lesson —
      it shows as not-yet-complete for that profile. *(AT-PROGRESS-001)*
- [ ] As an anonymous (signed-out) visitor, answer questions on any lesson — confirm no row appears
      in `question_attempts`. *(ADR-004 — anonymous practice records nothing)*
- [ ] **Cross-account check:** as account B, attempt to read account A's `question_attempts` or
      `lesson_progress` rows directly — confirm RLS returns empty. *(AT-SEC-001)*

### TASK-AVAIL-001 — recurring availability + exceptions

- [ ] Apply `supabase/migrations/0006_availability.sql`.
- [ ] As the admin account (`accounts.is_admin = true`), insert a few `availability_rules` rows
      (e.g. Mon–Fri 9am–5pm in `TUTOR_TIMEZONE`) directly in the SQL editor.
- [ ] As a signed-in non-admin buyer, call `getOpenAvailability()` (or visit `/book`) — confirm the
      returned slots are hourly, fall only on the configured weekdays/hours, and none are inside
      24h or beyond 4 weeks from now. *(AT-BOOK-003)*
- [ ] Insert a full-day `availability_exceptions` blackout row for a date that would otherwise have
      slots — confirm those slots disappear from `/book`.
- [ ] As a non-admin, attempt to insert/update a row in `availability_rules` directly — confirm RLS
      denies it. *(F11 admin-only write)*

### TASK-BOOK-001 — atomic booking RPC

- [ ] Apply `supabase/migrations/0007_bookings.sql`.
- [ ] With a balance ≥1 credit, book a session from `/book`. Confirm: a `bookings` row appears with
      `status = 'booked'`, the ledger shows a `-1 booking_spend` entry linked to that booking's id,
      and the balance dropped by exactly 1. *(AT-BOOK-001)*
- [ ] With a balance of 0, attempt to book — confirm it's refused (`insufficient_credits`) and no
      booking row is created. *(INV-MONEY-1)*
- [ ] **Concurrency check (AT-BOOK-002):** from two browser tabs/sessions (same or different
      accounts, both with credits), attempt to book the **same** slot as close to simultaneously as
      possible. Confirm exactly one booking exists for that `starts_at` and exactly one credit was
      spent — the other request gets `slot_taken` and is *not* charged.
- [ ] Attempt to book using a `profileId` that belongs to a different account — confirm
      `invalid_profile`, not a successful booking.

### TASK-BOOK-002 — cancel + reschedule (24h rule)

- [ ] Apply `supabase/migrations/0008_booking_lifecycle.sql`.
- [ ] Book a session ≥24h out, then cancel it from `/book` — confirm the credit is refunded
      (`+1 cancel_refund` in the ledger) and the booking shows `cancelled`. *(AT-BOOK-004)*
- [ ] Book a session (or adjust `starts_at` in the DB) to be **inside** 24h, then cancel — confirm
      **no** refund is issued and the booking is still marked `cancelled`. *(AT-BOOK-004, boundary)*
- [ ] Cancel the same booking a second time (replay) — confirm it's a no-op (`refunded: false`,
      no second ledger row), not an error.
- [ ] Book a session ≥24h out, then call `rescheduleBooking` to move it to a different open slot —
      confirm the booking's `starts_at` changed and the **credit balance is unchanged** (no ledger
      row was written at all). *(AT-BOOK-005)*
- [ ] Attempt to reschedule a booking that's inside the 24h window — confirm it's refused
      (`too_late`).

### TASK-BOOK-005 — no-show + credit-return requests

- [ ] As the admin account, call `mark_no_show` on a `booked` session — confirm its status becomes
      `no_show` and an `audit_log` row is written.
- [ ] As the buyer, call `requestCreditReturn` on that no-show booking — confirm a
      `credit_return_requests` row appears with `status = 'pending'`.
- [ ] As the admin, call `resolve_credit_return_request` with `decision: 'approved'` — confirm
      **exactly one** `+1 noshow_return` ledger row appears, the request's status becomes
      `approved`, and an `audit_log` row is written. *(AT-BOOK-008)*
- [ ] As a non-admin, attempt to call `mark_no_show` or `resolve_credit_return_request` directly —
      confirm both are denied.

### TASK-BOOK-003 — Google Calendar + Meet

- [ ] Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
      `GOOGLE_BOOKING_CALENDAR_ID` to real values (a one-time manual OAuth consent flow is needed
      to mint the refresh token for the operator's own Google account).
- [ ] Book a session — confirm a real Calendar event appears on the configured calendar, the buyer
      is invited, and the booking's `meet_url`/`calendar_event_id` are populated with a working
      Google Meet link. *(TASK-BOOK-003 DoD)*
- [ ] Temporarily break the Google credentials (e.g. wrong refresh token), then book a session —
      confirm the booking still succeeds (credit spent, row created) with `meet_url` left **null**,
      and nothing throws. Restore the credentials afterward. *(S10, AT-BOOK-006)*
- [ ] Cancel a booking that has a real Calendar event — confirm the Calendar event is deleted.
- [ ] Reschedule a booking that has a real Calendar event — confirm the Calendar event's time
      updates to match.

### TASK-NOTIFY-001 — Resend email + reminder cron

- [ ] Apply `supabase/migrations/0009_notifications.sql`. Set a real `RESEND_API_KEY` and
      `RESEND_FROM_EMAIL` (domain DNS-verified).
- [ ] Book a session — confirm a confirmation email arrives at the buyer's address.
- [ ] Complete a purchase (from the M4 checklist) — confirm a receipt email arrives.
- [ ] Set `CRON_SECRET`, then call `GET /api/cron/session-reminders` with
      `Authorization: Bearer <CRON_SECRET>` for a booking sitting in the ~24h-out window — confirm
      a reminder email arrives and `bookings.reminded_24h` flips to `true`.
- [ ] Call the same cron endpoint again immediately — confirm **no second email** is sent (the flag
      is already `true`, so that booking is excluded from the query). *(AT-NOTIFY-001)*
- [ ] Call the cron endpoint without the `Authorization` header — confirm 401.

### TASK-BOOK-004 — booking UI

- [ ] Open `/book` from a browser set to a non-UTC time zone (e.g. change your OS/browser
      timezone) — confirm the displayed slot times match that zone, not UTC, and that booking from
      it lands at the correct absolute instant (compare the stored `starts_at` in UTC against what
      you clicked). *(AT-BOOK-007)*
- [ ] Confirm upcoming and past sessions both list correctly, cancel only appears for future
      `booked` sessions, and "Request credit back" only appears for `no_show` sessions.

## 4 — M6: Admin + First Session

### TASK-ADMIN-001 — admin surfaces

- [ ] Apply `supabase/migrations/0010_admin.sql`. Set `accounts.is_admin = true` for your own row
      in the SQL editor (there's no UI for this — it's a one-time bootstrap).
- [ ] Sign in as that admin account, visit `/admin` — confirm you land on the dashboard, not a
      redirect. Sign in as a **different**, non-admin account and visit `/admin` — confirm it
      redirects to `/login`. *(AT-SEC-002)*
- [ ] `/admin/users` — confirm it lists **every** account, not just the admin's own. *(uses
      `accounts_admin_read` — the cross-account read policy added in 0010)*
- [ ] `/admin/availability` — add a weekly rule and a blackout exception; confirm they appear and
      that `/book` (as a non-admin) reflects the change.
- [ ] `/admin/bookings` — confirm it lists bookings across **all** accounts (not just the admin's).
      Book a session as a non-admin buyer, then as admin click "Mark no-show" — confirm the
      booking's status flips and a row appears in `audit_log`.
- [ ] As the buyer whose session was marked no-show, submit a credit-return request (via
      `requestCreditReturn` — no dedicated UI yet, call it directly or add one). Confirm it appears
      in `/admin/credit-returns`. Click Approve — confirm the buyer's balance goes up by exactly 1
      and the request's status becomes `approved`. *(AT-BOOK-008)*
- [ ] `/admin/questions` — pick a lesson, add a question, confirm it appears on the live lesson
      page's practice section immediately. Delete it — confirm it disappears.
- [ ] As a non-admin, attempt to call any `src/lib/admin/*` server action directly (e.g. via the
      browser console) — confirm every one returns `{ ok: false, message: "Admin only." }` rather
      than succeeding.

### TASK-ADMIN-002 — SMS reminder worklist

- [ ] Apply `supabase/migrations/0011_sms_worklist.sql`.
- [ ] As a buyer, set a phone number on `/profiles`.
- [ ] Book a session within the next 48h. Visit `/admin/reminders` — confirm it appears, ordered
      soonest-first, with the phone number and a "3h 20m"-style time remaining. *(AT-ADMIN-002)*
- [ ] Click "Mark sent" — confirm the entry disappears from the pending list and stays gone on
      reload (persists via `bookings.sms_sent`).

### TASK-FIRST-001/003/004 — First Session flow, probe-and-descend, test-prep

- [ ] Apply `supabase/migrations/0012_test_prep.sql`, `0013_first_session.sql`,
      `0014_session_notes.sql`.
- [ ] Buy a First Session with goal **`class_help`** — confirm `/first-session` goes straight to a
      slot picker, no assessment step. Book a slot — confirm the booking's `purchase_id` is set to
      that purchase and **no credit was spent** (check `credit_ledger` — no new row). *(REQ-FIRST-003)*
- [ ] Attempt a **second** First Session purchase on the same account — confirm it's refused before
      reaching Stripe. *(AT-FIRST-001, S8)*
- [ ] Buy a First Session with goal **`strengths`** on a profile with a `currentCourseNode` set.
      Confirm `/first-session` walks through probe questions **one at a time**, sourced from real
      lessons where they exist. Answer everything correctly — confirm it finishes quickly (few
      questions) rather than working through the whole closure. *(AT-FIRST-003)*
- [ ] Repeat with **deliberately wrong** answers on a node partway down the closure, then correct
      answers below it — confirm the assessment descends into that node's prerequisites and stops
      once it finds solid ground, and that the summary names roughly the right floor. *(AT-FIRST-004)*
- [ ] Confirm the probe count **never exceeds 25**, even if you answer everything wrong.
      *(AT-FIRST-005)*
- [ ] Buy a First Session with goal **`test_prep`**, pick SAT — confirm the fixed SAT set is served
      (or the graceful "not authored yet" state if no questions exist for that test). Click "I'm
      done" — confirm it proceeds to booking. *(AT-FIRST-002)*
- [ ] After any mode's booking completes, as admin visit `/admin/bookings/<id>` — confirm the plan
      preview reflects real assessment results (strengths: named gaps; test_prep: which test) or,
      for `class_help`, renders correctly from session notes **alone** once you add some.
      *(REQ-FIRST-006/007)*

## 5 — M7: Launch checklist (TASK-OPS-001)

Everything above is code this session wrote and can only unit-test. Everything below is **not
code** — business/ops steps only a human with the real accounts can do. Nothing in the codebase
blocks on these being incomplete (the app degrades gracefully — e.g. `getLessonQuestions` returns
`[]` if `0002` isn't applied), but the product isn't actually *live* until they're done.

- [ ] **Remote migrations applied** — the §0 checklist above, run against the real prod/dev
      Supabase project (not just verified locally).
- [ ] **Live-mode Stripe products created** from `src/lib/pricing.ts` — one Stripe Price per SKU,
      and the five `STRIPE_PRICE_*` env vars (plus `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
      point at them, not test-mode ids. *(AT-OPS-001, AT-OPS-002 — the pricing-drift test only
      catches a mismatch in `pricing.ts` itself, not a stale Stripe-side price.)*
- [ ] **Resend domain DNS verified** — SPF/DKIM records added, `RESEND_FROM_EMAIL` sends from a
      verified domain (unverified-domain sends get spam-filtered or blocked).
- [ ] **`GOOGLE_REFRESH_TOKEN` minted** for the operator's real Google account (one-time manual
      OAuth consent flow — see the note in `.env.local.example`), `GOOGLE_BOOKING_CALENDAR_ID` set
      to the real calendar.
- [ ] **Terms of Service, Privacy Policy, and Refund Policy pages are complete.** `/terms`,
      `/privacy`, `/refund-policy` exist and are linked from the landing footer, but every
      `[BRACKETED]` field (legal entity name, address, contact email, governing jurisdiction,
      last-updated date) is a placeholder — this codebase has no source of truth for those facts
      and didn't invent them. Fill them in before treating these pages as binding.
- [ ] **Vercel Analytics enabled** — `@vercel/analytics` is wired into `src/app/layout.tsx`; confirm
      it's actually collecting on the Vercel project dashboard once deployed (it only activates on
      Vercel's own hosting).
- [ ] **Apex DNS cutover** from the v1 SAT demo to this app (closes OQ3, spec/14 §1).
- [ ] **Backups and audit logging confirmed** — Supabase's own backup schedule for the project, and
      spot-check that `audit_log` is actually accumulating rows as admin actions happen (not just
      that the schema exists).
- [ ] **NFR-PERF-002 Core Web Vitals lab run** — Lighthouse against the deployed preview. Content
      pages are static + server-rendered KaTeX so they meet CWV structurally, but this is the
      honest confirmation.
- [ ] **Money paths tested end-to-end with real cards** (not just Stripe test-mode) — one real
      credit-pack purchase and one real First Session purchase, in production, before calling
      launch done. *(AT-OPS-001's explicit DoD.)*

**Not part of this checklist, by design:** `TASK-WORKSHEET-001` (printable worksheets) is built —
every authored lesson with questions has a worksheet at `/courses/<slug>/worksheet`. `TASK-CONTENT-002`
(authoring "Math up to Geometry") is **continuous, ongoing content work**, explicitly scoped to run
after launch and gate nothing (ADR-004) — there is no code deliverable for it to reach "done."

---

## Sign-off log

| Date | Verified by | Sections passed | Notes |
|---|---|---|---|
| | | | |

*(Append a row each time a verification pass is run, even a partial one — this is the record that
`STATUS.md`'s "live-verification pass" follow-up is closed.)*
