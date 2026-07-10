# 08 — API Contracts

Status: **DRAFT** · Interfaces between the browser and the Next.js server, and the Supabase RPC
signatures they call. Auth via the Supabase client SDK (session cookies) is assumed; only
app-specific contracts are listed. Schema in `07_DATA_MODEL.md`; behavior in `05_FLOWS.md`.

Conventions: **SA** = React Server Action; **RH** = route handler; **RPC** = Postgres
`SECURITY DEFINER` function. Auth values: `public` (no session), `payer` (parent or independent
student), `student` (any student), `owner`, `admin`. All mutating money/booking contracts are
backed by an RPC (NFR-SEC-002). Validation is Zod at the server boundary.

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
  Auth `public`. Request `{ questionId, submitted }`. Response `{ isCorrect: boolean|null,
  explanation }` (`null` for `free` → treated as reveal). Validation: submitted shape matches
  question type; numeric parsed. Errors: 404 unknown question, 422 malformed. Idempotent per
  submission (re-submitting records another attempt by design). *(REQ-PRACTICE-001/003,
  REQ-PROGRESS-001, FLOW-PRACTICE-001)*

## Progress

- **`markLessonProgress` (SA)** — Auth `student`. Request `{ lessonSlug, status }`. Response
  `{ ok }`. Upserts on `(user_id, lessonSlug)`. *(REQ-PROGRESS-002)*
- **`getMyProgress()` / `getDependentProgress(dependentId)` (SA)** — Auth `student` / `parent`
  (must own the dependent). Returns progress + attempt summary. *(REQ-PROGRESS-003/004,
  NFR-SEC-001)*

## Accounts *(exact shapes pending ADR-002 consent mechanics)*

- **`createDependent` (SA)** — Auth `parent`. Request `{ email|name, ... }`. Creates/invites a
  `dependent_student` linked to this parent in `pending` consent. Response `{ dependentId }`.
  Errors: 409 email already linked to another parent (REQ-ACCT-007). *(REQ-ACCT-003/004)*
- **`grantConsent` (SA)** — Auth `parent`. Request `{ dependentId }`. Sets `consent_status
  = granted`. *(REQ-ACCT-004, CON3)*
- **`listDependents()` (SA)** — Auth `parent`. Returns the parent's dependents. *(REQ-ACCT-005)*

## Billing

- **`createCheckout` (SA)** — purpose: start a one-time credit-pack purchase. Auth `payer`.
  Request `{ packId }`. Response `{ checkoutUrl }`. Validation: `packId` is an `active`
  `credit_packs` row. Errors: 404 unknown/inactive pack. *(REQ-BILLING-001, FLOW-BILLING-001)*
- **`POST /api/webhooks/stripe` (RH)** — purpose: the trusted credit trigger. Auth `public` but
  **must verify the Stripe signature** (NFR-SEC-004). On `checkout.session.completed`, calls
  `process_purchase`. **Idempotent** via `stripe_events` (redelivery → 200 no-op). Responses:
  200 processed/duplicate; 400 bad signature. *(REQ-BILLING-002, NFR-REL-001)*
- **RPC `process_purchase(p_event_id, p_payer_id, p_credits, p_ref)`** — inserts `stripe_events`
  (unique) then a `purchase` ledger row; no-op if the event exists. *(INV-7)*

## Credits

- **`getBalance()` (SA)** — Auth `payer`. Returns `Σ credit_ledger.delta` for the caller.
  *(REQ-CREDIT-001)*
- *(No public spend endpoint — spend happens only inside `book_session`.)*

## Booking

- **`getOpenAvailability()` (SA/read)** — Auth `payer`. Returns `open` future slots. *(REQ-BOOK-001)*
- **`bookSession` (SA)** — purpose: reserve a slot + spend 1 credit atomically. Auth `payer`.
  Request `{ slotId, attendeeId }`. Response `{ bookingId, meetUrl }`. Validation: attendee is
  self (independent) or a linked dependent (parent, REQ-BOOK-004). Backed by **RPC
  `book_session(p_slot_id, p_attendee_id)`** (locks slot `FOR UPDATE`, checks open + balance ≥ 1,
  writes `spend`, marks slot booked, inserts booking — one tx). After commit, the SA creates the
  Calendar event + Meet link and sends confirmation (best-effort). Errors: **409 slot taken**
  (concurrency), **402 insufficient credits**, 403 invalid attendee. *(REQ-BOOK-002/003/004,
  REQ-CREDIT-003, NFR-REL-002, FLOW-BOOK-001)*
- **`cancelBooking` (SA)** — Auth `owner payer`. Request `{ bookingId }`. Response
  `{ refunded: boolean }`. Backed by **RPC `cancel_booking(p_booking_id)`**: set `cancelled`,
  reopen slot, insert `refund`(+1) iff ≥24h before start; idempotent. Also cancels the Calendar
  event. Errors: 409 already started/cancelled. *(REQ-BOOK-005, FLOW-BOOK-002)*

## Admin

- **`publishAvailability` / `closeAvailability` (SA)** — Auth `admin`. Create/close slots.
  Validation: no past times, no overlap. *(REQ-BOOK-001, FLOW-ADMIN-001)*
- **`issueRefund` (SA)** — Auth `admin`. Request `{ payerId, amount, note }`. Backed by RPC
  `refund_credit`; writes `refund` ledger + audit log. *(REQ-BILLING-005, FLOW-ADMIN-002)*
- **Question CRUD (SA)** — Auth `admin`. Create/edit/reorder questions for a `lessonSlug`
  (standard shape). *(REQ-PRACTICE-001, FLOW-ADMIN-003)*
- **`listUsers` / `viewUser` (SA)** — Auth `admin`. Read any user's data. *(NFR-SEC-001)*

## Cron

- **`GET /api/cron/session-reminders` (RH, secret-guarded)** — sends 24h/1h email reminders,
  sets `reminded_24h`/`reminded_1h`; idempotent. *(REQ-NOTIFY-001, FLOW-NOTIFY-001)*

## Error model

JSON `{ error: { code, message } }`; status codes as above. Money/booking conflicts use
409/402 so the client can react (retry slot / prompt purchase) rather than a generic 500.
