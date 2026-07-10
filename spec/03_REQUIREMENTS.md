# 03 — Requirements

Status: **DRAFT** · Derived from `01_PRD.md`. Each requirement has a stable ID and traces to a
PRD capability (`C*`), success criterion (`S*`), or constraint (`CON*`). Requirements are
obligations of the system, phrased to be testable. Vague terms are avoided or defined.

Conventions: **MUST** = mandatory for launch. **SHOULD** = strong default, may defer with a
noted decision. Areas: AUTH, ACCT, CONTENT, PRACTICE, PROGRESS, CREDIT, BILLING, BOOK, NOTIFY;
NFR areas PERF, SEC, REL, OPS.

Decisions this stage surfaces (need your input before the affected task is *ready* — see §13)
are collected at the end.

---

## AUTH — authentication

- **REQ-AUTH-001** The system MUST support email + password registration and login. *(reuse v1)*
- **REQ-AUTH-002** The system MUST support Google OAuth login, linking a Google identity to an
  existing account with the same verified email rather than creating a duplicate. *(reuse v1)*
- **REQ-AUTH-003** The system MUST maintain an authenticated session and support explicit logout.
- **REQ-AUTH-004** The system MUST support password reset via a link sent to the account email.
- **REQ-AUTH-005** Admin-Tutor accounts MUST be provisioned by seed/back-office only; there is no
  public path to obtain the admin role. *(CON5)*

## ACCT — accounts, roles, relationships

- **REQ-ACCT-001** Every authenticated user MUST have exactly one role: `independent_student`,
  `parent`, `dependent_student`, or `admin`. *(C3)*
- **REQ-ACCT-002** An Independent Student MUST be able to self-register and immediately use the
  full learner experience (study, buy credits, book). *(C3, S4)*
- **REQ-ACCT-003** A Parent MUST be able to register and create/link one or more Dependent
  Students. *(C3, S4)*
- **REQ-ACCT-004** A Dependent Student account MUST be linked to a consenting Parent before it
  gains full use (the **parent-consent gate**). Until consent is recorded, the Dependent Student
  MUST NOT be able to act beyond a defined pre-consent state. Exact consent mechanics are set by
  the auth ADR. *(C3, CON3)*
- **REQ-ACCT-005** A Parent MUST be able to view and manage their linked Dependent Students
  (list, view progress, book for). *(C3)*
- **REQ-ACCT-006** A user's role MUST NOT change after creation. *(reuse v1 role-immutability
  trigger)* *(NFR-SEC-001 depends on this)*
- **REQ-ACCT-007** A Dependent Student and their Parent MUST be a many-to-one-or-more link
  (a Parent may have several dependents; a Dependent Student links to exactly one Parent at a
  time). *(C3)*

## CONTENT — free courses (the Learning Path)

- **REQ-CONTENT-001** The system MUST present a public catalog of Courses, readable with no
  account. *(C1, S1)*
- **REQ-CONTENT-002** Each Course MUST expose its Themes and each Theme its Lessons as an
  **ordered Learning Path** (deterministic ordering of Course → Theme → Lesson). *(C1, §4 wedge)*
- **REQ-CONTENT-003** A Lesson MUST render its authored explanation and examples, including
  mathematical notation, correctly. *(C1, S1)*
- **REQ-CONTENT-004** All Course/Theme/Lesson content MUST be readable by a Visitor with no login
  and no paywall. *(C1, S1, CON6)*
- **REQ-CONTENT-005** Adding a new Course (Pre-Calculus, Calculus) MUST NOT require schema
  changes — only new content + its Questions. Launch ships **"Math up to Geometry"**. *(§6)*

## PRACTICE — questions & answer checking

- **REQ-PRACTICE-001** A Lesson MAY carry ordered practice Questions. Supported types:
  **multiple-choice** and **numeric** MUST be auto-checkable. **Free-response** is
  **self-checked**: the learner attempts, then reveals the worked solution/explanation and
  self-assesses — no correct/incorrect is auto-graded or stored for free-response. *(C2, S2; D1)*
- **REQ-PRACTICE-002** A Visitor MUST be able to attempt a Question and see correctness + the
  Question's explanation, with no login and no saved state. *(C1, C2, S2)*
- **REQ-PRACTICE-003** Answer checking MUST be accurate for every auto-checkable type: a correct
  submission is marked correct and an incorrect one incorrect, per that type's defined rule
  (exact-match for choices; normalized numeric equality within a defined tolerance). *(S2)*

## PROGRESS — attempts & completion (logged-in only)

- **REQ-PROGRESS-001** For a logged-in Student, each Question Attempt MUST be recorded with the
  submitted answer, correctness, and timestamp. *(C2, S3)*
- **REQ-PROGRESS-002** For a logged-in Student, Lesson completion Progress MUST be tracked.
  *(C2, S3)*
- **REQ-PROGRESS-003** A Student's Attempts and Progress MUST persist and reload correctly across
  sessions. *(S3)*
- **REQ-PROGRESS-004** A Parent MUST be able to view the Progress of their linked Dependent
  Students. *(C3, S8)*

## CREDIT — the credit ledger

- **REQ-CREDIT-001** A Payer's credit balance MUST equal the sum of an **append-only** Credit
  Ledger of entries typed `purchase`, `spend`, or `refund`. *(C4)*
- **REQ-CREDIT-002** One credit MUST equal one 45-minute 1:1 session. *(C4)*
- **REQ-CREDIT-003** Credit spend MUST execute atomically in a `SECURITY DEFINER` Postgres RPC
  holding a `FOR UPDATE` row lock, MUST NOT allow the balance to go negative, and MUST NOT
  double-spend under concurrency. *(S6, CON2; port v1 `apply_credits`)*
- **REQ-CREDIT-004** A credit balance MUST be owned by a Payer — a Parent or an Independent
  Student. A Dependent Student MUST NOT own a balance. *(C3, C4)*
- **REQ-CREDIT-005** Credit Ledger entries MUST be immutable once written (corrections are new
  entries, e.g. a `refund`). *(C4, NFR-OPS-002)*

## BILLING — credit-pack purchase (Stripe)

- **REQ-BILLING-001** A Payer MUST be able to buy a Credit Pack via a Stripe one-time checkout.
  *(C4)*
- **REQ-BILLING-002** A completed purchase MUST credit the Payer's ledger **exactly once** with
  exactly the pack's credit amount; the webhook MUST be idempotent (a re-delivered event MUST NOT
  double-credit; a missed-then-retried event MUST still credit). *(S5, NFR-REL-001)*
- **REQ-BILLING-003** Credit Pack tiers (credits, price, Stripe price id) MUST be configuration,
  not hard-code. Base tier = 4 credits / $300; the full tier set is a surfaced decision (D2 /
  PRD OQ1). *(C4)*
- **REQ-BILLING-004** The system MUST NOT use subscriptions at launch — purchases are one-time
  only. *(CON4)*
- **REQ-BILLING-005** Issuing a credit refund/adjustment MUST be an **Admin-Tutor-only** action
  that writes a `refund` ledger entry. There is no learner self-serve refund of a purchase.
  *(C4; D3)*

## BOOK — availability & 1:1 booking

- **REQ-BOOK-001** The Admin-Tutor MUST be able to publish bookable Availability slots. *(C5)*
- **REQ-BOOK-002** A Payer MUST be able to book a 45-minute 1:1 Session against an open slot; the
  booking MUST reserve the slot and spend exactly 1 credit in a **single atomic transaction**
  (both succeed or both roll back). *(C5, S6, CON2; port v1 `reserve_seat`)*
- **REQ-BOOK-003** An Availability slot MUST be bookable by at most one Session; concurrent
  attempts on the same slot MUST NOT both succeed (no double-booking). *(S6, CON2)*
- **REQ-BOOK-004** When a Parent books, they MUST select one of their Dependent Students as the
  Session attendee. An Independent Student is their own attendee. *(C5)*
- **REQ-BOOK-005** A Payer MUST be able to cancel a booked Session. Cancelling **≥24h before**
  the Session start MUST return the credit to the wallet (a `refund` ledger entry); cancelling
  **<24h before** MUST forfeit the credit. Either way the Availability slot MUST reopen for
  booking. *(C5; D4)*
- **REQ-BOOK-006** Booking a Session MUST create a Google Calendar event with a Google Meet link
  (reuse v1's Google integration), surface it in-app to the Admin-Tutor and attendee, and include
  the link in the booking confirmation. The Session MUST be visible on the Admin-Tutor's calendar
  view. *(C5; D5)*

## NOTIFY — notifications

- **REQ-NOTIFY-001** The system MUST send **email** Session reminders **24 hours and 1 hour**
  before a booked Session, to the attendee (and additionally the Parent, if the attendee is a
  Dependent Student). No SMS at launch. *(C5, S7; D6; reuse v1 email)*
- **REQ-NOTIFY-002** The system MUST send a booking confirmation when a Session is booked. *(C5)*
- **REQ-NOTIFY-003** A purchase receipt SHOULD be provided (Stripe receipt is acceptable). *(C4)*

---

## NFR-PERF — performance & SEO *(CON6 — organic search is the acquisition channel)*

- **NFR-PERF-001** Course/Theme/Lesson pages MUST be server-rendered and publicly crawlable (no
  auth wall, no client-only rendering of primary content). *(CON6, C1)*
- **NFR-PERF-002** Public content pages MUST meet "good" Core Web Vitals on a mid-tier mobile
  device: LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms (lab-measured). *(CON6)*
- **NFR-PERF-003** The site MUST expose SEO essentials: per-page title/description/canonical
  metadata, semantic headings, a sitemap, and crawlable internal Learning-Path links. *(CON6)*

## NFR-SEC — security & authorization

- **NFR-SEC-001** RLS MUST enforce that a user reads/writes only their own data; a Parent
  additionally reads their linked Dependent Students' data; content and Questions are
  world-readable; the Admin-Tutor sees all. *(S8; reuse v1 RLS)*
- **NFR-SEC-002** Correctness-critical writes (credit spend, slot reservation) MUST occur only
  through `SECURITY DEFINER` RPCs with row locks — never as direct client writes. *(CON2, S5, S6)*
- **NFR-SEC-003** Minor-data handling and the parent-consent gate MUST comply with the direction
  set in the auth ADR (COPPA/age-of-consent). *(CON3, PRD OQ2)*
- **NFR-SEC-004** Stripe webhooks MUST verify the signature before acting. *(S5)*

## NFR-REL — reliability

- **NFR-REL-001** Purchase→credit MUST be idempotent end-to-end: no double-credit on redelivery,
  no lost credit on retry. *(S5)*
- **NFR-REL-002** Booking MUST be concurrency-safe: under simultaneous requests a slot is booked
  at most once and at most one credit is spent for it. *(S6)*

## NFR-OPS — operability *(solo operator — CON5)*

- **NFR-OPS-001** The system MUST be operable by one person: no step requires a second role.
- **NFR-OPS-002** Money and booking actions (purchases, spends, refunds, bookings, admin
  overrides) MUST be logged for audit. *(reuse v1 `admin_logs`)*
- **NFR-OPS-003** Data MUST be backed up on a schedule. *(reuse v1 backup cron)*

---

## Surfaced decisions

- **D1 — Free-response questions.** ✅ RESOLVED — self-checked (reveal solution, no auto-grade).
  → REQ-PRACTICE-001.
- **D2 — Credit-pack tiers.** ⏳ OPEN — exact tiers + discount curve beyond 4/$300 (= PRD OQ1);
  needed at the billing stage, not blocking. → REQ-BILLING-003.
- **D3 — Refund policy.** ✅ RESOLVED — Admin-Tutor-only refunds; no learner self-serve.
  → REQ-BILLING-005.
- **D4 — Cancellation policy.** ✅ RESOLVED — cancel ≥24h → credit returned; <24h → forfeit; slot
  reopens either way. → REQ-BOOK-005.
- **D5 — Session logistics.** ✅ RESOLVED — Google Calendar event + Meet link per Session (reuse
  v1 Google integration). → REQ-BOOK-006.
- **D6 — Reminders.** ✅ RESOLVED — email at 24h + 1h to attendee (+ parent); no SMS.
  → REQ-NOTIFY-001.

## Traceability

Every `REQ-*`/`NFR-*` above cites its PRD source. The reverse map (PRD → requirements → flows →
tasks → tests) is maintained in `13_COVERAGE_MATRIX.md` once flows and tasks exist.
