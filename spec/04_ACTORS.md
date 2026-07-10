# 04 — Actors

Status: **DRAFT** · Every person or external system that interacts with v2. Terms are defined in
`02_GLOSSARY.md`; permissions trace to requirements in `03_REQUIREMENTS.md`. Flows (`05_FLOWS.md`)
reference these actors by name.

## Human actors

### Visitor (anonymous)

- **Description:** an unauthenticated person on the site.
- **Goals:** read math content, try practice questions, decide whether to sign up or buy.
- **Permissions:** read all Courses/Themes/Lessons; attempt any Question and see correctness +
  explanation. *(REQ-CONTENT-004, REQ-PRACTICE-002)*
- **Restrictions:** no saved Progress/Attempts; cannot buy credits, book, or see any account
  data. *(REQ-PROGRESS-001, NFR-SEC-001)*
- **States:** stateless (may convert to any account type via signup).
- **Flows:** browse content, attempt question, sign up.

### Independent Student

- **Description:** a self-paying student (own account; no Parent above them). *(REQ-ACCT-002)*
- **Goals:** learn along the Learning Path, save progress, buy credits, book 1:1 help for
  themselves.
- **Permissions:** everything a Visitor can do **plus** saved Progress/Attempts; owns a credit
  wallet; buys Credit Packs; books/cancels their own Sessions; is their own Session attendee.
  *(REQ-PROGRESS-001..003, REQ-CREDIT-004, REQ-BILLING-001, REQ-BOOK-002/004/005)*
- **Restrictions:** sees only their own data; cannot manage other accounts or access admin.
  *(NFR-SEC-001)*
- **States:** `registered` → (`has_credits` ↔ `zero_credits`) → optionally `has_upcoming_session`.
- **Flows:** sign up, study & save progress, buy credits, book 1:1, cancel 1:1, attend session.

### Dependent Student

- **Description:** a student whose account is linked to and paid for by a **Parent**; has their
  own login. Typically a minor. *(REQ-ACCT-004, REQ-ACCT-007, CON3)*
- **Goals:** learn along the Learning Path and save progress; attend sessions the Parent booked.
- **Permissions (post-consent):** study with saved Progress/Attempts; view their own upcoming
  Sessions. *(REQ-PROGRESS-001..003)*
- **Restrictions:** does **not** own credits, cannot buy or book, cannot see the Parent's wallet
  or other dependents' data; before the parent-consent gate is satisfied, limited to a defined
  pre-consent state. *(REQ-CREDIT-004, REQ-ACCT-004, NFR-SEC-001, NFR-SEC-003)*
- **States:** `pending_consent` → `active` (consent recorded) → optionally `has_upcoming_session`.
- **Flows:** accept/complete link to Parent, study & save progress, attend session.

### Parent

- **Description:** an account that pays for and manages one or more Dependent Students.
  *(REQ-ACCT-003)*
- **Goals:** get structured help for their child(ren); buy credits and book 1:1 sessions for a
  chosen dependent; oversee progress.
- **Permissions:** create/link Dependent Students and record consent; view each linked
  dependent's Progress; owns the credit wallet; buys Credit Packs; books/cancels Sessions,
  selecting a dependent as attendee. *(REQ-ACCT-003/004/005, REQ-PROGRESS-004, REQ-CREDIT-004,
  REQ-BILLING-001, REQ-BOOK-002/004/005)*
- **Restrictions:** does not study (no personal Progress); sees only their own dependents' data,
  not other families'. *(NFR-SEC-001)*
- **States:** `registered` → `has_dependents` → (`has_credits` ↔ `zero_credits`) →
  optionally `has_upcoming_session`.
- **Flows:** sign up, add/link dependent (+consent), buy credits, book 1:1 for a dependent,
  cancel 1:1, view dependent progress.

### Admin-Tutor (the operator — you, solo)

- **Description:** the single operator; both content author/admin and the tutor who delivers all
  sessions. *(REQ-AUTH-005, CON5)*
- **Goals:** publish content and questions, offer availability, deliver sessions, keep the money
  ledger correct, run the business solo.
- **Permissions:** author Courses/Themes/Lessons/Questions; publish Availability; view all
  bookings on a calendar; issue credit refunds/adjustments (ledger `refund`); view all users and
  their data; access audit logs. *(REQ-CONTENT-*, REQ-PRACTICE-*, REQ-BOOK-001/006,
  REQ-BILLING-005, NFR-SEC-001, NFR-OPS-002)*
- **Restrictions:** the admin role is seed-provisioned only (no public path); still bound by the
  audit-logging requirement for money/booking actions. *(REQ-AUTH-005, NFR-OPS-002)*
- **States:** always active (single operator).
- **Flows:** author content/questions, publish availability, deliver session, issue refund,
  manage users.

## External systems

### Supabase (Auth + Postgres + RLS + RPC)

- Identity/session provider and the system of record. Enforces RLS (NFR-SEC-001) and hosts the
  `SECURITY DEFINER` RPCs for credit spend and slot reservation (NFR-SEC-002).

### Stripe

- One-time Credit Pack checkout + webhook. The webhook is the trusted trigger that credits the
  ledger (idempotent, signature-verified). *(REQ-BILLING-001/002, NFR-SEC-004, NFR-REL-001)*

### Google (OAuth + Calendar/Meet)

- OAuth login/identity linking (REQ-AUTH-002); Calendar event + Meet link creation per booked
  Session (REQ-BOOK-006).

### Email provider

- Transactional email: password reset, booking confirmation, session reminders (24h + 1h).
  *(REQ-AUTH-004, REQ-NOTIFY-001/002)*

## Actor → capability matrix

| Capability | Visitor | Indep. Student | Dep. Student | Parent | Admin-Tutor |
|---|:---:|:---:|:---:|:---:|:---:|
| Read content / attempt questions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Save progress & attempts | — | ✅ | ✅ | — | ✅ |
| Own a credit wallet | — | ✅ | — | ✅ | — |
| Buy credit packs | — | ✅ | — | ✅ | — |
| Book / cancel a 1:1 | — | ✅ (self) | — | ✅ (for a dependent) | — |
| Be a session attendee | — | ✅ | ✅ | — | — (delivers) |
| View a dependent's progress | — | — | — | ✅ | ✅ (all) |
| Author content & availability | — | — | — | — | ✅ |
| Issue refunds / see all data | — | — | — | — | ✅ |
