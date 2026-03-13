# ProvableLearning — Implementation Progress

## Status: All 14 Phases Complete + Core Features Phase 1-2 Done + Calendar Blocks + 3 Audits + Makeup System + 3-Phase Drop + Independent Students + Migration Resilience + 104 Tests Passing

**Last updated:** 2026-02-24
**TypeScript:** Clean (`npx tsc --noEmit` — 0 errors)
**Tests:** 104 passing (`npm test` — 10 test files, 0 failures)
**Files:** 100+ TypeScript/TSX + 46 SQL migrations + 10 test files

---

## Phase Completion

| Phase | Name | Status | Files | Notes |
|-------|------|--------|-------|-------|
| 0 | Project Scaffold | Done | 15 | Next.js 15 App Router, Supabase SSR, Stripe SDK, Tailwind, middleware |
| 1 | Database Schema & Migrations | Done | 27 SQL | All tables, enums, constraints, RPC, triggers, RLS, pg_cron + hardening + safe cleanup |
| 2 | Authentication & Role-Based Access | Done | 7 | Google OAuth only (all users), callback auto-link, onboarding (role selection + grade for students) |
| 3 | Admin Module & Cohort CRUD | Done | 12 | Full CRUD with Zod validation, parent-student linking |
| 4 | Enrollment Flow | Done | 10 | Browse → agree → ownership check → reserve_seat RPC → credits/Stripe (with rollback + credit reversal on failure) |
| 5 | Stripe Webhooks | Done | 3 | checkout.session.completed/expired/payment_failed, daily reconciliation cron (now catches expired pending) |
| 6 | Waitlist System | Done | 4 | FIFO queue, 24hr claim window, auto-expiry, cascading notification, claim consumed AFTER reservation |
| 7 | Credits & Refunds | Done | 6 | Lesson-type credits (per group_size_type), atomic FIFO deduction RPC, payment-method-aware refund options, credit reversal on expiry |
| 8 | Dashboards | Done | 10 | Parent (+ add-child)/Student/Admin dashboards with full data views |
| 9 | Makeup Logic | Done | 5+7 | Student request form, admin review workflow (approve/deny), max 2 per small group. **Alternate session booking** for group cancellations (same course/group size/week) + auto-credit cron for small/medium/1:1 |
| 10 | Admin Guardrails & Audit | Done | 1 SQL | Module delete protection, capacity floor, performance audit trail |
| 11 | Legal & Agreements | Done | 1 SQL | Agreement field immutability trigger on active enrollments |
| 12 | Google Workspace Integration | Done | 2 | Drive folder path generation, weekly CSV backup cron |
| 13 | Scalability & Polish | Done | 3 | CSV export API, monthly report cron, admin export page |

---

## What's Built

### Database (41 migrations)

**Tables:** `users`, `students`, `courses`, `classes`, `enrollments`, `waitlist`, `performance_logs`, `credits`, `admin_logs`, `session_cancellations`, `makeup_bookings`, `waitlist_notify_queue`, `makeup_waitlist`, `notifications`, `messages`, `office_hours`, `bookings`

**Critical RPC:**
- `reserve_seat` — atomic seat reservation with `SELECT ... FOR UPDATE` row lock. Validates capacity, module start date, re-enrollment limit, agreement NOT NULL, cohort-module match, and cohort active status inside a single transaction.
- `release_seat` — deletes pending enrollment on Stripe expiry. Includes authorization check (owner/parent/admin only).
- `apply_credits` — atomic FIFO credit deduction with `FOR UPDATE` row locks. Deducts 1 lesson of matching `group_size_type`. Logs consumption to admin_logs.
- `reverse_credits` — restores 1 lesson credit of matching `group_size_type` when enrollment fails or Stripe session expires. Logs reversal to admin_logs.
- `cleanup_stale_pending` — safe pending enrollment cleanup that reverses credits before deleting. Uses `FOR UPDATE SKIP LOCKED` for concurrency safety. Replaces raw DELETE cron job.
- `admin_set_role_parent` — admin-only role change using `SET LOCAL` session variable (transaction-safe, no DISABLE TRIGGER). Checks for active enrollments before proceeding.
- `cancel_session` — cancels a class session. Sets credit deadline to end-of-week Sunday 11:59:59 PM ET for small/medium/one_on_one; large=no credit (NULL). Auth checks ownership.
- `book_makeup_session` — atomic makeup booking for group cancellations. Validates same course/group size/week, capacity (active enrollments + booked makeups), future date. Locks cancellation + class rows.
- `cancel_makeup_booking` — reverts makeup booking, sets cancellation back to 'cancelled' (credit deadline still ticking). Auth checks ownership.

**Constraints enforced at DB level:**
- Module date overlap → `btree_gist` EXCLUDE constraint
- Cohort capacity matches group_size_type → CHECK constraints (1:1=1, small=2-4, medium=5-9, large=10-30)
- No duplicate active enrollments → partial UNIQUE index `uq_student_module_active` (excludes refunded/canceled, allows re-enrollment)
- No duplicate student+cohort → UNIQUE constraint
- No duplicate active waitlist → partial UNIQUE index (excludes expired/converted, allows re-joining)
- Re-enrollment limit → BEFORE INSERT trigger on enrollments
- Role immutability → BEFORE UPDATE trigger on users (supports `SET LOCAL` bypass for admin RPC)
- Phone required for parents → BEFORE INSERT/UPDATE trigger on users (INSERT skipped for onboarding)
- Phone required for independent students → BEFORE INSERT/UPDATE trigger on students (INSERT skipped for onboarding)
- Module delete protection → BEFORE DELETE trigger (blocks if active enrollments exist)
- Cohort capacity floor → BEFORE UPDATE trigger (blocks if new capacity < active count)
- Agreement immutability → BEFORE UPDATE trigger on active enrollments
- Performance log audit → AFTER UPDATE trigger logs old/new values to admin_logs

**RLS policies:** Users see own data (parents can see children's users rows), parents see children's data, admins see everything. Enrollment INSERT goes through `SECURITY DEFINER` RPC only — no direct insert policy for regular users.

**pg_cron jobs:** Safe pending cleanup every 5 min via `cleanup_stale_pending()` RPC (reverses credits, `SKIP LOCKED`), expire waitlist notifications (>24hr), cancel-credits cron (auto-issue credits for small/medium/1:1 past Sunday end-of-week deadline; expire large after 7d; mark makeup no-shows and revert cancellation status).

### Authentication

- **All users:** Google OAuth only (no email/password). Single "Sign in with Google" on login + signup pages.
- **Parents:** Sign up → onboarding (choose Parent) → collect name + phone → dashboard. Add children via name + grade + Google email.
- **Independent students:** Sign up → onboarding (choose Student) → collect name + phone + grade → creates `users` + `students` rows → can self-enroll.
- **Parent-linked students:** Parent adds child with Google email → pending `students` row (user_id NULL). On first Google login, callback auto-links via email match → student dashboard (view-only, parent manages enrollment).
- **Admins:** Created via seed/dashboard only — self-signup blocked by DB trigger.
- **Onboarding:** Post-OAuth page collects role (Parent/Student), name, phone (required for all), grade (students only). Handles re-entry: detects existing `users` row, locks role, pre-fills fields, creates missing `students` row.
- **Middleware:** Refreshes Supabase session, redirects unauthenticated users, enforces role-based route access. Students without phone or `students` row redirected to onboarding. `/enroll` accessible by parents + students.
- **Security:** Open redirect prevention on both callback (whitelist) and login page (sanitizeRedirect). Timing-safe CRON_SECRET comparison.

### Enrollment Flow (Critical Path)

1. User browses `/enroll` → sees upcoming modules with cohort cards
2. Selects cohort → sees detail page with seat count, price, and agreement checkboxes
3. If no students on account → shown "Add a Child First" link (parents) instead of broken form
4. Both agreement checkboxes required before proceeding
5. **Server-side ownership validation** — verifies authenticated user is the student or student's parent before proceeding
6. Server action validates eligibility (no duplicates, under re-enroll limit, module not started, no time conflicts, cohort-module match, cohort active)
7. Calls `reserve_seat` RPC → atomic row lock + enrollment INSERT (validates agreement NOT NULL)
8. **Waitlist entry consumed AFTER successful reservation** (`notified` → `converted`) — prevents losing waitlist spot if reservation fails
9. Checks lesson credit balance for the cohort's `group_size_type`
10. If matching credit available → deduct 1 lesson (atomic RPC) → activate directly → **if activation fails, credits reversed + enrollment deleted**
11. If no credit + `STRIPE_ENABLED=false` → activate directly (test mode)
12. If no credit + Stripe enabled → create Stripe Checkout Session (try/catch; on failure, delete pending enrollment)
13. **Store `stripe_session_id` BEFORE redirecting** (prevents webhook race condition)
14. If `stripe_session_id` storage fails → abort and delete enrollment
15. Returns redirect URL to client (client-side navigation preserves session cookies)

### Stripe Webhooks

- `checkout.session.completed` → enrollment status = `active` (triple-match: enrollment_id + stripe_session_id + status=pending)
- `checkout.session.expired` → **reverse credits if any were applied** → DELETE pending enrollment → notify next waitlisted student
- `checkout.session.async_payment_failed` → log to admin_logs for admin visibility
- Daily reconciliation cron:
  - Checks active enrollments vs Stripe payment status (logs mismatches)
  - **Catches pending enrollments with expired Stripe sessions** (webhook missed) — reverses credits, deletes enrollment, notifies waitlist
  - **Catches pending enrollments where payment succeeded but webhook missed** — activates enrollment
  - Detects orphaned pending enrollments without stripe_session_id

### Waitlist

- When cohort is full → student selects which child/self → **ownership validated** → joins waitlist via server action (FIFO)
- Partial UNIQUE index allows re-joining after expiry (not blocked by old expired entries)
- When seat opens (payment expired/refund) → first waiting student notified (shared `notifyNextOnWaitlist` function with optimistic locking)
- Claim window defined by `WAITLIST_CLAIM_WINDOW_HOURS` constant (24 hours)
- If unclaimed → marked expired, next student notified
- Vercel cron runs every 15 minutes to expire stale notifications
- **When student enrolls from waitlist offer, entry is consumed AFTER successful seat reservation**

### Credits & Refunds

- **Lesson-type credits:** Each credit is tied to a `group_size_type` (1-on-1, small, medium, large). `amount`/`remaining_amount` = number of lessons (not cents). 1 credit = 1 enrollment of that type.
- Admin issues credits: selects group size type + lesson count + optional expiry
- Parent dashboard shows per-type credit balances (e.g., "2 large, 1 small")
- Credits deducted atomically via `apply_credits` RPC — finds earliest-expiring credit of matching type, deducts 1 lesson. Uses `FOR UPDATE` row lock. Logs to admin_logs.
- Credit application with error recovery:
  - Matching credit available → deduct 1 lesson → activate enrollment
  - **If enrollment activation fails → credit reversed via `reverse_credits` RPC, enrollment deleted, user notified**
  - No matching credit → proceed to Stripe (or direct activation if `STRIPE_ENABLED=false`)
- **Credit reversal on Stripe expiry:** `reverse_credits` RPC issues a new 1-lesson credit of the matching type. Logged to admin_logs.
- **Safe pg_cron cleanup:** `cleanup_stale_pending()` RPC checks `credits_applied` and reverses credits before deleting stale pending enrollments. Uses `FOR UPDATE SKIP LOCKED`.
- **Payment-method-aware refund options:**
  - Credit-paid enrollments → "Restore Credit" (calls `reverse_credits` RPC)
  - Stripe-paid enrollments → "Stripe Refund" or "Issue Credit Instead"
  - No payment → "Cancel (No Payment Found)"
  - Always available → "Cancel Without Refund"
- Stripe refund attempted BEFORE enrollment status update (fail-safe ordering)
- If Stripe refund fails → error returned to admin, enrollment status unchanged
- **After refund, next waitlisted student is notified** for the freed seat
- All credit/refund actions logged to `admin_logs`

### Dashboards

- **Parent:** Student cards showing active modules, cohort schedule, credit balance, attendance/homework stats, enrollment history. "Add Child" button and page (name + grade form). Empty state directs to add-child.
- **Student:** Active enrollments with schedule, Google Meet link, 8-session attendance grid, homework status, makeup request button. Shows both pending and active enrollments.
- **Admin:** Stats overview (active/pending enrollments, student count, module count), navigation to all management pages (including Export and Makeups)

### Admin Tools

- Module CRUD (create/edit/delete with overlap validation, **update schema validates start < end date**)
- Cohort CRUD (capacity validated against group_size_type, **update schema validates capacity range**)
- Parent↔Student linking
- Bulk performance logging (attendance + homework per session per cohort, **logged to admin_logs**)
- Credit issuance
- **Payment-method-aware refund processing** (shows correct options based on credits vs Stripe)
- **Makeup review workflow** (`/admin/makeups`) — approve/deny student makeup requests
- CSV export (enrollments, performance_logs, credits, students)
- Audit log viewer

---

## Test Suite (104 tests)

| Test File | Tests | Covers |
|-----------|-------|--------|
| `check-eligibility.test.ts` | 9 | All 5 eligibility checks + cohort-module mismatch + time conflicts + happy path |
| `reserve.test.ts` | 6 | Seat reservation success + all RPC error paths (full, started, agreement, cohort mismatch, re-enroll limit) |
| `credits.test.ts` | 8 | Balance aggregation by type + FIFO apply + error handling + edge cases (null, empty, unknown types) |
| `waitlist.test.ts` | 3 | Dedup check + successful join + insert failure |
| `enrollment-flow.test.ts` | 5 | **Proves bug fixes:** waitlist consumed AFTER reservation (not before), ownership validation before reservation, credit reversal on activation failure |
| `webhook-handlers.test.ts` | 21 | Checkout completed (triple-match) + expired (credit reversal + cleanup + waitlist notify) + payment failed + reconciliation (expired pending, paid pending, orphaned) |
| `refund-flow.test.ts` | 13 | Payment-method-aware options + credit_reversal handler + Stripe-before-status ordering + waitlist notification |
| `pg-cron-safety.test.ts` | 22 | Safe cleanup RPC (credit reversal before delete, SKIP LOCKED, logging) + all hardening migration constraints (agreement validation, FOR UPDATE locks, RLS, partial indexes) |
| `constants.test.ts` | 6 | Prices match north star doc + group size ranges + TTL alignment + price formatting |
| `makeup-booking.test.ts` | 11 | Alternate session discovery (same course/group/week, capacity), full class exclusion, different-week exclusion, 1:1 rejection, status validation, error message parsing, no-show logic |

---

## Audit #3: Core Flow Verification (2026-02-21)

Systematic verification of all 6 core flows identified and fixed 6 bugs:

### Bugs Fixed

| # | Severity | Bug | Fix | File |
|---|----------|-----|-----|------|
| 1 | CRITICAL | Waitlist entry consumed BEFORE seat reservation — if reservation fails, student loses waitlist spot | Moved waitlist `'converted'` update AFTER `reserveSeat()` succeeds | `enroll/[cohortId]/actions.ts` |
| 2 | CRITICAL | No server-side student ownership validation — `enrollAction` and `joinWaitlistAction` accept arbitrary `student_id` from form data (privilege escalation) | Added `verifyStudentOwnership()` checking `user_id` or `parent_id` match before all operations | `enroll/[cohortId]/actions.ts` |
| 3 | CRITICAL | Credits consumed but enrollment activation unchecked — if `.update({ status: 'active' })` fails, credit is lost (pg_cron deletes pending enrollment without reversal) | Check update result; on failure, call `reverse_credits` RPC + delete enrollment + return error | `enroll/[cohortId]/actions.ts` |
| 4 | CRITICAL | pg_cron cleanup does raw `DELETE` without reversing credits — any pending enrollment with `credits_applied > 0` loses credits permanently | New `cleanup_stale_pending()` RPC with `FOR UPDATE SKIP LOCKED`, credit reversal check, logging. Replaces raw DELETE cron job | `00027_safe_pending_cleanup.sql` |
| 5 | MEDIUM | Refund form shows options based on group_size_type, not payment method — admin could Stripe-refund a credit-paid enrollment or "no refund" a credit-paid one | Form now checks `creditsApplied` and `stripeSessionId` to determine payment method. Added `credit_reversal` refund type that calls `reverse_credits` RPC | `admin/refunds/refund-form.tsx`, `actions.ts`, `page.tsx` |
| 6 | MEDIUM | Reconciliation misses pending enrollments with expired Stripe sessions — if webhook never arrives, enrollment sits pending forever | Added check for pending+stripe_session_id enrollments; retrieves Stripe session status; cleans up expired (with credit reversal + waitlist notify) and activates paid-but-pending | `webhook-handlers.ts` |

---

## What Requires External Configuration Before Testing

1. **Supabase project** — Create project, get URL + anon key + service role key, enable Google OAuth provider
2. **Stripe account** — Get test API keys, configure webhook endpoint (needs `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`)
3. **Google OAuth credentials** — Configure in Supabase Auth dashboard
4. **Environment variables** — Copy `.env.local.example` → `.env.local` and fill in values
5. **Database** — Run `npx supabase db push` or apply migrations manually (00001-00034)
6. **pg_cron extension** — Enable in Supabase dashboard (Database > Extensions)
7. **btree_gist extension** — Migration 00004 enables it, but may need dashboard confirmation

## Core Features Build (2026-02-21)

### Phase 1 — Core UI (No External Deps) ✅ COMPLETE

| # | Feature | Files |
|---|---------|-------|
| 1 | Landing page (hero, philosophy, pricing, credentials, CTA) | `src/app/page.tsx` |
| 2 | Public offerings page (modules + seats remaining, no login) | `src/app/offerings/page.tsx` |
| 3 | Student notifications + upcoming classes | `student/page.tsx`, `mark-read-button.tsx` |
| 4 | Student-tutor messaging | `student/message-form.tsx`, `admin/messages/` |
| 5 | Student relevant links (Meet, Classroom, office hours) | integrated into student dashboard |
| 6 | Office hours display (parent + student dashboards) | `office_hours` table, schedule-aware Join button |
| 7 | Parent refund → consultation link to `/book` | `parent/refund/page.tsx` |

**Migration:** `00028_phase1_tables.sql` — `notifications`, `messages`, `office_hours`, `refund_requests` tables + RLS

### Phase 2 — Google APIs ✅ COMPLETE

| # | Feature | Files |
|---|---------|-------|
| 8 | Google OAuth setup (one-time tutor auth) | `src/lib/google/auth.ts`, `api/auth/google-setup/` |
| 9 | Post-enrollment: Calendar invite to parent | `src/lib/google/calendar.ts`, hooked in `webhook-handlers.ts` |
| 10 | Post-enrollment: Classroom invite | `src/lib/google/classroom.ts`, hooked in `webhook-handlers.ts` |
| 11 | Booking page (Calendly-style free/busy) | `src/app/book/`, `api/bookings/` |

**Migration:** `00029_google_integration.sql` — `google_tokens`, `bookings` tables + `cohorts.google_classroom_id`
**Setup:** Admin visits `/api/auth/google-setup` once to authorize Google account.

### Alternate Session Makeup System ✅ COMPLETE (2026-02-22)

When students cancel a group class session, they can join an alternate class (same course, same group size) teaching the same session content that week. Credit auto-issuance acts as a fallback for smaller groups.

| Feature | Details |
|---------|---------|
| `makeup_bookings` table | Tracks guest attendance in alternate classes. UNIQUE per cancellation + per student/class/session |
| `book_makeup_session` RPC | Atomic SECURITY DEFINER: validates same course/group/week, capacity (enrollments + booked makeups), future date, auth |
| `cancel_makeup_booking` RPC | Reverts booking + cancellation status. Credit deadline keeps ticking |
| Alternate session picker UI | Client component showing available classes with seat counts + book/cancel buttons |
| Credit deadline policy | small/medium/one_on_one: end-of-week Sunday 11:59:59 PM ET → auto-credit (1:1 non-expiring). large: no credit (alternate only) |
| Cancel-credits cron update | Issues credits for small+medium+1:1 past Sunday deadline, expires large, marks makeup no-shows + reverts cancellation status |
| Updated cancel form | Success state shows "Find Alternate Session" button for group types. Preview text updated for medium policy change |
| Cancellation history | Shows makeup booking info (day, time, date) when status is 'rescheduled' |

**Migration:** `00033_makeup_system.sql`
**Files:** 7 new (migration, 3 server actions, picker component, 2 alternate pages) + 5 modified (types, cron, cancel form, parent/student cancel pages)

### Auto Calendar Blocks on Cohort Creation ✅ COMPLETE

When admin creates a cohort, a recurring weekly Google Calendar event is automatically created to block off class time slots. This prevents the booking widget from offering those times and gives the admin a visual schedule.

| Feature | Details |
|---------|---------|
| Create cohort → calendar block | `createCohortCalendarBlock()` in `calendar.ts`, called from `createCohort()` action |
| Update cohort schedule → recreate block | Old event deleted + new event created when `meeting_day` or `meeting_time` changes |
| Event ID stored on cohort | `google_calendar_event_id` column (migration 00030) |
| Non-blocking | Calendar failures logged but don't prevent cohort creation |
| Event format | `[Module Name] — [GroupSize] ([Day] [Time])`, weekly recurrence for module duration |

**Migration:** `00030_cohort_calendar_event_id.sql` — adds `google_calendar_event_id text` to cohorts

### Phase 3 — Slack + Twilio ⏳ NEXT

| # | Feature | Status | What's Needed |
|---|---------|--------|---------------|
| 12 | Slack incoming webhook | ⏳ | `SLACK_WEBHOOK_URL` env var |
| 13 | Booking → Slack notification | ⏳ | Post to Slack when parent books |
| 14 | Twilio setup | ⏳ | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` env vars |
| 15 | Booking → SMS confirmation + 24hr reminder | ⏳ | Twilio send + scheduled message |
| 16 | Student message → Slack notification | ⏳ | Notify tutor in Slack |

**Deps needed:** `twilio` (Slack uses plain webhook fetch)

### Phase 4 — Cancellation & Makeup Policy Engine ✅ MOSTLY COMPLETE

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 17 | `session_cancellations` table + migration | ✅ | Migration 00031 (pre-rename) + 00032 (rename) |
| 18 | Cancel attendance page `/parent/cancel` + `/student/cancel` | ✅ | 24hr notice for small groups, ownership checks |
| 19 | Makeup policy logic (per group size) | ✅ | 1:1=reschedule (Google Cal), sm/med=alt session or 7d auto-credit, lg=alt session only |
| 20 | Class credit issuance + expiry (cron) | ✅ | Auto-credit: small/medium/1:1 at end-of-week Sunday (1:1 non-expiring), large expires with no credit |
| 21 | Alternate makeup session booking | ✅ | `makeup_bookings` table (migration 00033), `book_makeup_session` RPC, alternate session picker UI, capacity checks |
| 22 | Google Calendar cleanup on cancel | ⏳ | Remove attendee from recurring event |

**Migrations:** 00031 (cancel/attendance), 00032 (rename modules→courses, cohorts→classes), 00033 (makeup booking system), 00034 (policy updates: end-of-week deadline)

### Phase 5 — 3-Phase Drop Class System ✅ COMPLETE (2026-02-23)

Payment-timeline-aware drop class flow replacing the old binary (>7 days / ≤7 days) system. Ties drop policy to where the student is relative to first session, with server-side RPC enforcement.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 23 | Phase 1: self-serve drop (>7 days before start) | ✅ | Existing flow, re-enrollment allowed |
| 24 | Phase 2: note drop (≤7 days → 7 days post-first-session) | ✅ | `NoteDropForm`, `class_blocked=true`, re-enrollment blocked for that class |
| 25 | Phase 3: refund consultation (>7 days post-first-session) | ✅ | Links to `/book?student=&class=` with context banner |
| 26 | RPC 3-phase enforcement | ✅ | `p_phase` param, `compute_session_date` for boundary, admin bypass |
| 27 | Eligibility guard for class_blocked | ✅ | `check-eligibility.ts` blocks re-enrollment into blocked class |
| 28 | Booking context pass-through | ✅ | `/book` page, widget, API, calendar event all carry student/class context |

**Migration:** 00041 (`class_blocked` on enrollments, `student_name`/`class_name` on bookings, 3-phase `drop_enrollment` RPC)

### Phase 6 — Independent Student Support ✅ COMPLETE (2026-02-24)

Independent students (no parent) can now sign up, enroll, cancel sessions, book makeups, and drop classes — the same capabilities as parents but for themselves.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 29 | Independent student onboarding | ✅ | Role selection (Parent/Student), grade level + phone collected, students row created. Re-entry handles missing students row. |
| 30 | Self-enrollment | ✅ | Middleware + enroll pages allow `student` role. `verifyStudentOwnership` checks `user_id` OR `parent_id`. Parent-linked students shown "parent manages" message. |
| 31 | Student cancel session | ✅ | `/student/cancel-session` — same as parent flow but queries own record via `user_id`. Shared `CancelSessionForm` component. |
| 32 | Student alternate/makeup session | ✅ | `/student/cancel-session/alternate` + `/student/cancel-session/reschedule` — ownership via `user_id` or `parent_id`. |
| 33 | Student drop class | ✅ | `/student/drop-class` — all 3 phases, own actions with `/student` redirect. No student picker (only self). |
| 34 | Student refund page | ✅ | `/student/refund` — static consultation link to `/book`. |
| 35 | Student dashboard quick actions | ✅ | "Browse Courses", "Cancel a Session", "Drop a Class", "Refunds" links for independent students. |
| 36 | Notification routing | ✅ | `book-makeup`, `auto-book-makeup`, `reschedule` API — notify `parent_id` if exists, else `user_id`. |
| 37 | Middleware completeness check | ✅ | Students without phone → onboarding. Students without `students` row → onboarding. |

**Files created (10):**
- `student/cancel-session/page.tsx`, `student/cancel-session/alternate/page.tsx`, `student/cancel-session/reschedule/page.tsx`
- `student/drop-class/page.tsx`, `student/drop-class/actions.ts`, `student/drop-class/drop-class-form.tsx`, `student/drop-class/note-drop-form.tsx`
- `student/refund/page.tsx`

**Files modified (10):**
- `middleware.ts` — student access to `/enroll`, students row completeness check
- `onboarding/page.tsx` — grade level, re-entry support, fallback insert without migration 00046 columns
- `enroll/page.tsx`, `enroll/[classId]/page.tsx`, `enroll/[classId]/actions.ts` — student enrollment support
- `student/page.tsx` — quick action links, independent detection
- `book-makeup.ts`, `auto-book-makeup.ts` — notify independent students
- `api/cancellations/reschedule/route.ts` — notify independent students

**DB RPCs already compatible:** `cancel_session`, `drop_enrollment`, `release_seat` all check both `user_id` and `parent_id`. No migration needed.

### Migration 00046 Resilience ✅ COMPLETE (2026-02-24)

Migration 00046 adds `email` and `full_name` columns to the `students` table. Until applied to Supabase, all code gracefully degrades — queries fall back to selecting without those columns, inserts retry without them, and names are resolved from the joined `users` table instead.

| File | Fix |
|------|-----|
| `parent/page.tsx` | Students query tries `email, full_name` first, falls back to `id, user_id, grade_level, active_status`. Name resolution: `users.full_name` → `students.full_name` → `'Unknown'`. |
| `parent/add-child/actions.ts` | Email duplicate check skips if column missing. Name duplicate check skips if column missing. Insert retries without `email`/`full_name`. |
| `onboarding/page.tsx` | Student insert retries without `email`/`full_name` columns. |
| `callback/route.ts` | Email auto-link query fails gracefully (no match → onboarding). |
| `enroll/[classId]/page.tsx` | Removed direct `full_name` from students select; uses joined `users` table. |
| `student/cancel-session/alternate/page.tsx` | Same — name from `users` table, not `students.full_name`. |

**Progress: 28/37 complete (Phase 1-2 done, Phase 3 pending, Phase 4 mostly done, Phase 5-6 done)**

---

## What's Left as TODOs in Code

| Area | TODO | Priority |
|------|------|----------|
| Slack + Twilio | Booking notifications, SMS confirmation/reminders | High (Phase 3) |
| Google Calendar cleanup | Remove attendee from recurring event on cancel | Medium (Phase 4 remaining) |
| Google Classroom | Auto-create courses, expand scopes, coursework UI | Medium (Phase C) |
| Google Forms | Forms API, templates admin, response sync cron | Medium (Phase D) |
| Google Drive API | Folder creation (structure defined, API not wired) | Medium |
| PDF reports | Monthly performance summary generation | Medium |
| Rate limiting | API route protection | Low |
| Error tracking | Sentry or similar integration | Low |

---

## File Inventory

### Source (80+ files)

```
src/
├── __tests__/
│   ├── check-eligibility.test.ts     # 9 tests — eligibility validation
│   ├── reserve.test.ts               # 6 tests — seat reservation
│   ├── credits.test.ts               # 8 tests — credit balance + application
│   ├── waitlist.test.ts              # 3 tests — waitlist join
│   ├── enrollment-flow.test.ts       # 5 tests — operation ordering proof
│   ├── webhook-handlers.test.ts      # 21 tests — webhook + reconciliation
│   ├── refund-flow.test.ts           # 13 tests — payment-method-aware refunds
│   ├── pg-cron-safety.test.ts        # 22 tests — safe cleanup + hardening
│   ├── constants.test.ts             # 6 tests — business rules
│   └── makeup-booking.test.ts        # 11 tests — alternate session booking
├── lib/
│   ├── constants.ts                    # Prices, group sizes, limits
│   ├── types.ts                        # All TypeScript interfaces
│   ├── supabase/
│   │   ├── client.ts                   # Browser client
│   │   ├── server.ts                   # Server component client
│   │   └── admin.ts                    # Service role client
│   ├── stripe/
│   │   ├── client.ts                   # Stripe SDK instance
│   │   ├── prices.ts                   # Price helpers
│   │   ├── create-checkout.ts          # Stripe Checkout Session creation
│   │   └── webhook-handlers.ts         # Webhook event handlers + reconciliation + credit reversal
│   ├── auth/
│   │   ├── get-user-role.ts
│   │   ├── google-oauth.ts
│   │   └── verify-cron-secret.ts       # Timing-safe CRON_SECRET comparison
│   ├── enrollment/
│   │   ├── check-eligibility.ts        # 6-point eligibility validation
│   │   └── reserve.ts                  # RPC wrapper
│   ├── cancellation/
│   │   ├── cancel-session.ts            # Cancel a class session (RPC wrapper)
│   │   ├── book-makeup.ts               # Book alternate session (RPC wrapper)
│   │   ├── cancel-makeup.ts             # Cancel makeup booking (RPC wrapper)
│   │   └── find-alternate-sessions.ts   # Query available alternate classes
│   ├── credits/
│   │   ├── get-balance.ts
│   │   └── apply-credits.ts            # Atomic FIFO via apply_credits RPC
│   ├── waitlist/
│   │   ├── join.ts
│   │   └── notify-next.ts             # FIFO notification + expiry + optimistic locking
│   ├── validators/
│   │   ├── module.ts                   # Zod schemas (create + update with date validation)
│   │   └── cohort.ts                   # Zod schemas (create + update with capacity validation)
│   └── google/
│       ├── auth.ts                      # OAuth2 client + token refresh
│       ├── calendar.ts                  # Calendar events + free/busy + cohort blocks
│       ├── classroom.ts                 # Classroom student invites
│       └── drive-folders.ts             # Folder path generation
├── app/
│   ├── layout.tsx
│   ├── page.tsx                        # Landing page
│   ├── (auth)/
│   │   ├── login/page.tsx              # + sanitizeRedirect for open redirect prevention
│   │   ├── signup/page.tsx + actions.ts
│   │   ├── callback/route.ts           # + sanitizeRedirect whitelist
│   │   └── onboarding/page.tsx         # + phone format validation
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # Auth header + sign out
│   │   ├── parent/page.tsx             # + Add Child + Refund Request + Office Hours
│   │   ├── parent/add-child/          # Add child form + server action
│   │   ├── parent/cancel-session/     # Cancel session + alternate picker
│   │   ├── parent/refund/             # Consultation link to /book (simplified from form)
│   │   ├── student/page.tsx            # + Notifications + Messages + Office Hours + Links
│   │   ├── student/message-form.tsx   # Send message to tutor
│   │   ├── student/mark-read-button.tsx # Dismiss notifications
│   │   ├── student/cancel-session/     # Cancel session + alternate picker
│   │   ├── student/makeup/page.tsx + actions.ts
│   │   ├── admin/page.tsx              # Stats + nav (includes Makeups)
│   │   ├── admin/modules/              # List, new, [id] edit
│   │   ├── admin/cohorts/              # List, new, [id] edit
│   │   ├── admin/students/             # List + parent linking
│   │   ├── admin/performance/          # Bulk logging form + admin_logs audit
│   │   ├── admin/credits/              # Issue + list
│   │   ├── admin/refunds/              # Payment-method-aware refund processing
│   │   ├── admin/makeups/              # Makeup review workflow (approve/deny)
│   │   ├── admin/messages/            # Student message inbox + reply
│   │   ├── admin/refund-requests/     # Parent refund request review (approve/deny)
│   │   ├── admin/logs/                 # Audit log viewer
│   │   ├── admin/export/               # CSV export
│   │   ├── enroll/
│   │       ├── page.tsx                # Browse modules
│   │       ├── [cohortId]/             # Detail + enroll form + ownership check
│   │       ├── success/page.tsx
│   │       ├── cancel/page.tsx
│   │       └── waitlist-offer/[waitlistId]/
│   ├── offerings/page.tsx              # Public course browsing
│   ├── book/                          # Calendly-style booking (page + widget)
│   └── api/
│       ├── auth/signout/route.ts
│       ├── auth/google-setup/         # OAuth setup + callback (one-time)
│       ├── bookings/available-slots/  # Free/busy slot generation
│       ├── bookings/create/           # Create booking + calendar event
│       ├── webhooks/stripe/route.ts   # + payment_failed + Google integrations
│       ├── export/route.ts
│       └── cron/
│           ├── reconcile/route.ts      # + expired pending detection
│           ├── waitlist-notify/route.ts
│           ├── cancel-credits/route.ts # Auto-credit issuance + no-show revert
│           ├── backup/route.ts
│           └── reports/route.ts
```

### Migrations (34 files)

```
supabase/migrations/
├── 00001_create_enums.sql
├── 00002_create_users_table.sql          # + role immutability trigger (session var bypass)
├── 00003_create_students_table.sql       # + parent role validation trigger
├── 00004_create_modules_table.sql        # + btree_gist exclusion constraint
├── 00005_create_cohorts_table.sql        # + capacity CHECK constraints
├── 00006_create_enrollments_table.sql    # + partial unique index + credits_applied column
├── 00007_create_waitlist_table.sql       # + partial unique index (allows re-join)
├── 00008_create_performance_logs_table.sql
├── 00009_create_credits_table.sql        # + remaining_amount CHECK
├── 00010_create_admin_logs_table.sql
├── 00011_create_rpc_reserve_seat.sql     # ★ Atomic seat lock + agreement/cohort/active validation
├── 00012_create_rpc_release_seat.sql     # + authorization check
├── 00013_create_module_overlap_trigger.sql
├── 00014_create_reenroll_limit_trigger.sql
├── 00015_create_phone_enforcement_trigger.sql  # INSERT skip for onboarding
├── 00016_create_indexes.sql              # 17 indexes
├── 00017_enable_rls.sql
├── 00018_create_rls_policies.sql         # Parents can SELECT child's users row
├── 00019_create_pg_cron_jobs.sql         # Replaced by 00027
├── 00020_create_auth_trigger.sql         # OAuth users skip profile creation
├── 00021_create_guardrail_triggers.sql   # Delete/capacity/audit protection
├── 00022_create_agreement_immutability_trigger.sql
├── 00023_create_rpc_apply_credits.sql    # ★ Atomic FIFO (INTEGER, search_path, audit log)
├── 00024_create_rpc_admin_set_role_parent.sql  # SET LOCAL session var (safe)
├── 00025_hardening_fixes.sql             # ★ All hardening as ALTER/CREATE OR REPLACE
├── 00026_credits_lesson_type.sql         # ★ Credits → lesson-type (group_size_type, new RPCs)
├── 00027_safe_pending_cleanup.sql        # ★ Credit-safe cleanup RPC (replaces raw DELETE cron)
├── 00028_phase1_tables.sql              # ★ notifications, messages, office_hours, refund_requests + RLS
├── 00029_google_integration.sql         # ★ google_tokens, bookings + cohorts.google_classroom_id
├── 00030_cohort_calendar_event_id.sql   # ★ cohorts.google_calendar_event_id for schedule blocks
├── 00031_cancel_attendance.sql         # ★ session_cancellations table, cancel_session RPC, compute_session_date, RLS
├── 00032_rename_modules_cohorts.sql    # ★ Comprehensive rename: modules→courses, cohorts→classes, all FKs/constraints/RPCs/triggers/RLS
├── 00033_makeup_system.sql             # ★ makeup_bookings table, updated cancel_session RPC (medium+1:1 deadlines), book_makeup_session/cancel_makeup_booking RPCs, RLS
├── 00034_policy_updates.sql            # ★ cancel_session credit deadline → end-of-week Sunday 11:59:59 PM ET (replaces fixed 7d/14d)
├── 00035–00040                         # waitlist queue, drop RPC, makeup waitlist, auto-enroll, student login, auto-book
└── 00041_three_phase_drop.sql          # ★ class_blocked column, booking context columns, 3-phase drop_enrollment RPC
```

### Config Files

```
.env.local.example
vitest.config.ts                # Test configuration with @ alias
middleware.ts                   # Narrowed public paths
vercel.json                     # 4 cron jobs: reconcile, waitlist, backup, reports
next.config.ts
tailwind.config.ts
```

---

## All Audits Summary

### Audit #1 & #2: Comprehensive Hardening (2026-02-21)
24 issues fixed (11 critical, 13 gaps). Covered auth, enrollment, payments, credits, dashboards, admin tools. See "Hardening Audit Summary" section in previous version for full details.

### Audit #3: Core Flow Verification (2026-02-21)
6 bugs fixed (4 critical, 2 medium). Systematic verification of all 6 core flows (enrollment, payment, credits, waitlist, refund, makeup). 93 tests written proving correctness.

**Critical fixes:** Waitlist ordering, student ownership validation, credit-path error recovery, safe pg_cron cleanup.
**Medium fixes:** Payment-method-aware refunds, reconciliation of expired pending Stripe sessions.

### Makeup System (2026-02-22)
Alternate session booking for group cancellations + auto-credit policy. 11 new tests.

### Policy Updates (2026-02-22)
Credit deadline changed from fixed 7d/14d to end-of-week Sunday 11:59:59 PM ET (migration 00034). Makeup no-shows now revert cancellation status so credit deadline fires. Parent refund page simplified to consultation booking link (`/book`).

---

## Quality Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| TypeScript Strictness | Excellent | Strict mode, no `any` abuse, proper type casting |
| Database Constraints | Excellent | 15+ triggers, 17 indexes, RLS, 6 atomic RPCs, partial unique indexes |
| Security | Excellent | RLS enforced, ownership validation, open redirect prevention, timing-safe cron auth, authorization on RPCs, Stripe signature verification |
| Error Handling | Excellent | Credit reversal on all failure paths, Stripe rollback, safe pg_cron cleanup, reconciliation catches missed webhooks |
| Financial Integrity | Excellent | Atomic credit deduction, credit reversal on all failure/expiry paths, payment-method-aware refunds, reconciliation, full audit trail |
| Testing | Strong | 104 tests across 10 files covering all core flows + edge cases + bug fix proofs + makeup booking |
| State Management | Excellent | Mostly server components + server actions |
| UI/UX | Functional | Tailwind utility classes, clean but not polished |
| Code Organization | Excellent | Clear file structure, single responsibility |

---

## Deployment Setup Progress

### Supabase — COMPLETE (2026-02-21)
- [x] Supabase project created
- [x] All config done (URL, keys, OAuth, extensions)
- [x] Migrations 00001-00023 pushed
- [ ] **Migration 00025 (hardening) needs to be applied** — run in Supabase SQL Editor
- [ ] **Migration 00026 (lesson-type credits) needs to be applied** — run in Supabase SQL Editor
- [ ] **Migration 00027 (safe pending cleanup) needs to be applied** — run in Supabase SQL Editor

### Stripe — PENDING
- [ ] Stripe account created
- [ ] Webhook endpoint configured for: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`
- [ ] API keys copied to `.env.local`

### Vercel / Local Dev — PENDING
- [ ] Environment variables set
- [ ] `npm install` + `npm run dev` tested
- [ ] Admin user seeded

### Google OAuth — COMPLETE (2026-02-21)
- [x] Google Cloud project with Calendar + Classroom APIs enabled
- [x] OAuth client ID + secret (shared with Supabase Auth)
- [x] `GOOGLE_CALENDAR_ID` set in `.env.local`
- [ ] **Run one-time auth:** Admin visits `/api/auth/google-setup` to authorize Google account
- [ ] **Apply migrations 00028-00030** to Supabase

### Next Steps
1. **Apply migrations 00025-00046** to Supabase SQL Editor (00046 adds `email`/`full_name` to students — code works without it but with degraded functionality)
2. **Run Google OAuth setup** — admin visits `/api/auth/google-setup`
3. **Set up Stripe** — create account, configure webhook endpoint
4. **Set `STRIPE_ENABLED=true`** in `.env.local` when Stripe is configured
5. **Phase 3:** Slack webhook + Twilio SMS (needs accounts + env vars)
6. **Google Calendar cleanup on cancel** (Phase 4 remaining item)
7. **Google Classroom + Forms integration** (Phase C+D)
8. **QA: test 3-phase drop flow** — see `specs/09_qa_core_logic_test_flow.md` Flow 14
9. **Test full enrollment flow** — with credits, without credits, Stripe disabled/enabled
10. **Test cancel + makeup flow** — cancel session, find alternate, book makeup, verify cron credits
