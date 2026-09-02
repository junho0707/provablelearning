# 08 — API Contracts

Status: **REWRITTEN 2026-08-14** against `14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005,
`04_ACTORS.md` + `05_FLOWS.md`. Interfaces between the browser and the Next.js server, and the
Supabase RPC signatures they call. Auth via the Supabase client SDK (session cookies) is assumed;
only app-specific contracts are listed. Schema in `07_DATA_MODEL.md`; behavior in `05_FLOWS.md`.

Conventions: **SA** = React Server Action; **RH** = route handler; **RPC** = Postgres
`SECURITY DEFINER` function. Auth values: `public` (no session), `buyer` (the one login per
account — `04_ACTORS.md` A2, includes the independent-student case), `admin` (the solo Admin-Tutor,
A4), `system` (webhook/cron, A5). There is no `student`/`payer`/`parent`/`owner` role — a learner
profile has no credentials (INV-ACTOR-1), so every profile-scoped action is performed *by* the
buyer, naming a `profileId`; RLS is what stops it reaching another buyer's profile. All mutating
money/booking contracts are backed by an RPC (NFR-SEC-002). Validation is Zod at the server
boundary.

---

## Content (server-rendered reads — not public APIs)

- **`getCatalog()` / `getCourse(courseSlug)` / `getLesson(lessonSlug)`** *(server fns)* — read
  in-repo MDX + frontmatter to build the Learning Path and render a lesson. Auth `public`.
  *(REQ-CONTENT-001..004)*
- **`getLessonQuestions(lessonSlug)`** *(server fn)* — returns questions for a lesson **without
  the correct answer field** for auto-checkable types (answers are server-side only). Auth
  `public`. *(REQ-PRACTICE-002, NFR-SEC-001)*

## Practice

- **`checkAnswer` (SA)** — purpose: check a submitted answer + record attempt if logged in.
  Auth `public`. Request `{ questionId, submitted }`. Returns a discriminated result:
  `{ ok: true, isCorrect: boolean|null, explanation }` (`null` for `free` → reveal) or
  `{ ok: false, code: 'not_found'|'malformed', message }` — the SA equivalent of the 404/422 in the
  error model, so the client renders states inline. The answer secret is read server-side only via
  the service-role key (never sent to the client — AT-PRACTICE-005). Validation: Zod on the input;
  numeric parsed (non-numeric → `malformed`). *(REQ-PRACTICE-001/003, REQ-PROGRESS-001, F1)*
  **Current scope: anonymous — no attempt is recorded; attempt recording is added by
  TASK-PROGRESS-001, keyed to the active learner profile (ACCT-001 is done; PROGRESS-001 is next).**

## Progress *(TASK-PROGRESS-001 — not yet built)*

- **`markLessonProgress` (SA)** — Auth `buyer`. Request `{ profileId, lessonSlug }`. Response
  `{ ok }`. Upserts `lesson_progress (profile_id, lesson_slug)`; RLS requires `profileId` belong to
  the caller. Called when every question on a lesson has been answered correctly (spec/14 §16).
  *(REQ-PROGRESS-002)*
- **`getProfileProgress(profileId)` (SA)** — Auth `buyer`, RLS-scoped to profiles the caller owns.
  Returns progress + attempt summary for one learner profile. *(REQ-PROGRESS-003/004, NFR-SEC-001)*

## Accounts — TASK-ACCT-001

No consent flow: learner profiles have no credentials, so there is nothing to grant (spec/14 §2,
INV-ACTOR-1). `accounts` rows are provisioned automatically by a DB trigger on `auth.users` insert
(migration `0003_accounts.sql`) — no signup SA is needed.

- **`listProfiles()` (SA)** — Auth `buyer`. Returns the caller's learner profiles, RLS-scoped.
  *(REQ-ACCT-001)*
- **`createProfile` (SA)** — Auth `buyer`. Request `{ name, grade?, currentCourseNode? }`.
  Response: discriminated `{ ok: true, profile }` | `{ ok: false, code: 'malformed'|'denied',
  message }`. `currentCourseNode`, if given, must be a roadmap node with `course: true`
  (ADR-005, TASK-ROADMAP-002) — validated in `src/lib/accounts/types.ts#validCourseNode` before any
  DB call. *(REQ-ACCT-001)*
- **`updateProfile(profileId, input)` (SA)** — Auth `buyer`, RLS-scoped (a cross-account id resolves
  to `not_found`, not `denied` — RLS makes the row invisible rather than surfacing whose it is).
  Same response shape as `createProfile`. *(REQ-ACCT-001)*
- **`deleteProfile(profileId)` (SA)** — Auth `buyer`. Response `{ ok: boolean }` — `false` if the
  row didn't exist or wasn't the caller's (RLS-scoped delete affects 0 rows rather than erroring).
  *(REQ-ACCT-001)*
- **`getActiveProfileId()` / `setActiveProfile(profileId)` (SA)** — the "switching profiles" UI
  state (spec/05_FLOWS). Not a data-model fact — stored in a cookie, not a DB column.
  `setActiveProfile` re-reads the profile row (RLS-scoped) before setting the cookie, so a
  cross-account profile id is silently refused. *(REQ-ACCT-001)*

## Billing *(TASK-BILLING-001 — not yet built)*

Two SKU families (07_DATA_MODEL `purchases.sku`), not one generic checkout — ADR-005's one-per-
customer rule only applies to `first_session`:

- **`createCreditsCheckout` (SA)** — start a one-time credit-pack purchase. Auth `buyer`.
  Request `{ sku: 'credits_1'|'credits_2'|'credits_4'|'credits_8' }`. Response `{ checkoutUrl }`.
  Prices/SKUs come from `src/lib/pricing.ts` (`TASK-CONFIG-001`), not retyped here.
  *(REQ-BILLING-001, F7)*
- **`createFirstSessionCheckout` (SA)** — Auth `buyer`. Request `{ profileId, goal:
  'strengths'|'test_prep'|'class_help' }`. Response `{ checkoutUrl }`. Errors: **409** if this
  account already has a `sku = 'first_session'` purchase (INV-MONEY-2) — checked before creating the
  Stripe session, since the partial unique index is the backstop, not the first line of defense.
  *(REQ-FIRST-001, F5)*
- **`POST /api/webhooks/stripe` (RH)** — purpose: the trusted credit/purchase trigger. Auth `public`
  but **must verify the Stripe signature** (NFR-SEC-004). On `checkout.session.completed`, calls
  `process_purchase`. **Idempotent** via `stripe_events` (redelivery → 200 no-op). Responses:
  200 processed/duplicate; 400 bad signature. *(REQ-BILLING-002, NFR-REL-001)*
- **RPC `process_purchase(p_event_id, p_account_id, p_sku, p_amount_cents, p_goal, p_ref)`** —
  inserts `stripe_events` (unique), then a `purchases` row, then — if `p_sku` is a credit pack — a
  `credit_ledger` row (`reason = 'purchase'`); no-op if the event exists. `p_goal` is set only for
  `first_session`. Exact signature finalized when `TASK-BILLING-001` lands. *(INV-MONEY-2/3)*

## Credits

- **`getBalance()` (SA)** — Auth `buyer`. Returns `Σ credit_ledger.delta` for the caller.
  *(REQ-CREDIT-001)*
- *(No public spend endpoint — spend happens only inside `book_session`.)*

## Booking *(TASK-AVAIL-001/BOOK-001..005 — not yet built)*

- **`getOpenAvailability()` (SA/read)** — Auth `buyer`. Returns `open` future slots (**≥24h out,
  ≤4 weeks ahead**), in UTC — the client renders them in the visitor's browser time zone.
  *(REQ-BOOK-001)*
- **`bookSession` (SA)** — reserve a slot + spend 1 credit atomically. Auth `buyer`.
  Request `{ slotId, profileId }`. Response `{ bookingId, meetUrl }`. Validation: `profileId` is one
  of the caller's learner profiles (RLS-checked, REQ-BOOK-004). Backed by **RPC
  `book_session(p_slot_id, p_profile_id)`** (locks slot `FOR UPDATE`, checks open + balance ≥ 1,
  writes `spend`, marks slot booked, inserts the `bookings` row — one tx). After commit, the SA
  creates the Calendar event + Meet link and sends confirmation (best-effort — `meet_url` stays
  null on Google failure, INV-BOOK-2). Errors: **409 slot taken** (concurrency), **402 insufficient
  credits**, 403 invalid profile. *(REQ-BOOK-002/003/004, REQ-CREDIT-003, NFR-REL-002, F8)*
- **`cancelBooking` (SA)** — Auth `buyer`. Request `{ bookingId }`. Response
  `{ refunded: boolean }`. Backed by **RPC `cancel_booking(p_booking_id)`**: set `cancelled`,
  reopen slot, insert `refund`(+1) iff ≥24h before start (else the credit burns); idempotent. Also
  cancels the Calendar event. Errors: 409 already started/cancelled. *(REQ-BOOK-005, F9)*
- **`rescheduleBooking` (SA)** — Auth `buyer`, **only offered ≥24h before the current start**
  (F9 — otherwise the client should show cancel instead). Request `{ bookingId, newSlotId }`.
  Response `{ ok: boolean }`. Backed by **RPC `reschedule_booking(p_booking_id, p_new_slot_id)`**:
  reopens the old slot, reserves the new one — **does not touch `credit_ledger`** (this is the
  point: not a cancel-and-rebook round trip, so it can't be used to dodge the 24h rule). Updates the
  Calendar event. Errors: 409 new slot taken / booking not ≥24h out. *(REQ-BOOK-003, F9)*
- **`requestCreditReturn` (SA)** — Auth `buyer`. Request `{ bookingId, reason }`. Inserts a
  `credit_return_requests` row (`status = 'pending'`) for a booking whose credit was burned: a
  `no_show`, **or a `cancelled` booking with no `cancel_refund` ledger row** (a cancel inside 24h —
  ADR-006). One live appeal per booking: a `pending` or `approved` request blocks another, a
  `denied` one may be resubmitted. Errors: not eligible / already requested.
  *(REQ-BOOK-005, F10)*

## Admin *(TASK-ADMIN-001/002 — not yet built)*

- **`publishAvailability` / `closeAvailability` (SA)** — Auth `admin`. Create/close slots
  (`availability_rules`/`availability_exceptions`). Validation: no past times, no overlap.
  *(REQ-BOOK-001, F11)*
- **`markNoShow` (SA)** — Auth `admin`. Request `{ bookingId }`. Sets `status = 'no_show'`; the
  credit stays spent (burned) unless a later `resolveCreditReturnRequest` returns it. *(F10, F12)*
- **`resolveCreditReturnRequest` (SA)** — Auth `admin`. Request `{ requestId, decision:
  'approved'|'denied' }`. **Approve** writes exactly one `credit_ledger` row (`reason =
  'noshow_return'`) and sets `status = 'approved'`; both branches are audited. *(REQ-BOOK-005, F10)*
- **`issueRefund` (SA)** — Auth `admin`. Request `{ accountId, amount, note }`. Backed by RPC
  `refund_credit`; writes a `credit_ledger` row (`reason = 'admin_adjust'`) + `audit_log` entry —
  pairs with a manual Stripe refund so wallet and Stripe can't drift (no self-serve refund path,
  F13). *(REQ-BILLING-005)*
- **Question CRUD (SA)** — Auth `admin`. Create/edit/reorder questions for a `lessonSlug`
  (standard shape). *(REQ-PRACTICE-001)*
- **`listUsers` / `viewUser` (SA)** — Auth `admin`. Read any account's data. *(NFR-SEC-001)*

## Cron

- **`GET /api/cron/session-reminders` (RH, secret-guarded)** — sends 24h/1h email reminders,
  sets `reminded_24h`/`reminded_1h`; idempotent. *(REQ-NOTIFY-001, F8)*

## Error model

JSON `{ error: { code, message } }`; status codes as above. Money/booking conflicts use
409/402 so the client can react (retry slot / prompt purchase) rather than a generic 500.
