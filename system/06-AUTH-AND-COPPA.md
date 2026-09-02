# 06 — Auth and COPPA

> **This document is not legal advice.** It records product decisions and the compliance design they
> imply. The stack described here must be reviewed by a lawyer before launch. COPPA penalties are
> assessed per violation.

## 1. Two authentication paths

The system authenticates two different kinds of person with two different mechanisms, deliberately.

| | Buyer | Student |
|---|---|---|
| Mechanism | **Google OAuth** or **email magic link** | **Username + password**, set by the buyer |
| Password stored | Never | Yes, hashed |
| Reset path | N/A (passwordless) | **The buyer resets it** from their dashboard |
| Self-signup | Yes | **No** — only a buyer creates a student |
| Identity | Real email | Username, mapped to an internal email-shaped identity |

**Why students have passwords.** The rest of the system is deliberately passwordless — no reset
flow, no breach surface. Students are the exception because the design must work for a ten-year-old
who has no email inbox and cannot receive a magic link. A parent-set username and password is the
only mechanism that works for every age in a K–12 audience.

**Consequences accepted:** password hashing and storage enters the system; a reset flow exists but
runs **through the buyer**, never through email to the child; usernames need an internal
email-shaped identity because the auth provider keys on email. Students never receive auth email of
any kind.

`INV-AUTH-1`: a student credential can never be created, changed, or reset except by the buyer who
owns that student.
`INV-AUTH-2`: **no email of any kind is ever sent to a student, and no student email address is
collected.** Students are reached in-app only (`02-POLICIES.md` §11). This removes an entire category
of children's personal information from the system and eliminates any path by which the service
could contact a child directly.

## 2. Why COPPA applies

The product serves K–12 **including under-13**, and students **log in and submit information
themselves** — topics, descriptions, uploaded documents, diagnostic answers. That is collection of
personal information directly from a child, which triggers COPPA.

Two things that do **not** exempt us, and were considered:

- **Restricting students from billing does not help.** COPPA is about data collection, not spending
  authority. A child who can never touch a dollar but types their name and uploads homework is still
  a child the operator collects from.
- **Parent-entered profile data is not the trigger** — that is the parent supplying information about
  their own child. **The student's own login and submissions are the trigger.** This is why the
  consent gate sits at login activation rather than at profile creation.

## 3. The consent gate

**Verifiable Parental Consent (VPC) is established by the parent's card payment**, which is an
FTC-recognised mechanism when tied to a monetary transaction. The system already charges every buyer
before any student does anything, so the gate falls naturally in the existing flow.

Ordering, which is load-bearing:

1. Buyer creates a student, including credentials → **parent-supplied data only. Login is dormant.**
2. Buyer completes a paid purchase (First Session or a credit pack) → **VPC established**, recorded
   with a timestamp and the mechanism.
3. That buyer's students' logins **activate**. Only now can a student sign in and submit anything.
4. A student who signs in before step 2 is told their account is not active yet, and nothing is
   collected from them.

`INV-COPPA-1`: no row of student-submitted data may exist for an account with no recorded consent
event.

## 4. The obligations, and where each is met

| # | Obligation | Where it lives |
|---|---|---|
| 1 | **Kids-specific privacy disclosure** — what is collected from students, how it is used, who it is shared with, and the parent's rights | Published privacy policy, linked from every surface that collects from a student |
| 2 | **Direct notice to the parent** before collection | Presented at student creation and again at the consent-establishing checkout |
| 3 | **Verifiable Parental Consent** before collection | §3 — the card payment, recorded |
| 4 | **Parent review / delete / revoke** | F13 — account settings, per student |
| 5 | **Data minimisation** — only what the tutoring session needs | Student fields are limited to name, current math class, and purposes; pre-session capture is scoped to the session |
| 6 | **Vendor accountability** — every processor that touches student data is disclosed | Supabase (database, storage, auth), Stripe (payment — buyer only), Resend (email), Google (Calendar/Meet) |
| 7 | **Retention limits and secure deletion** | §5 |

## 5. Retention

- Student-submitted data — pre-session text, uploads, diagnostic answers, post-session progress — is
  retained **while the account is active and the material is still useful for continuity between
  sessions**, which is its stated purpose.
- **Deleted within 30 days** of any of: the buyer deleting the student, the buyer revoking consent,
  or the account being closed.
- Uploads are deleted from storage, not merely dereferenced.
- Consent records and ledger/financial rows are retained separately as business records; they contain
  no student-submitted content.

## 6. Data minimisation in practice

Collected from a student: their name (buyer-supplied), current math class, purposes, whatever they
type about a session's topic, files they upload for that session, diagnostic answers, and progress
through materials.

**Not collected:** **email address**, date of birth, home address, phone number, school name,
photographs, or any persistent identifier beyond what authenticating the session requires. Sessions
are **not recorded** — no video or audio of a child is captured or stored. Nothing is collected "in
case it's useful later" — if a field has no use in preparing or delivering a session, it does not
exist.

The absence of a student email address is load-bearing rather than incidental: it means the service
holds **no online contact information for any child**, and has no mechanism to contact one.

## 7. Open items before launch

- [ ] Lawyer review of the privacy policy, the direct-notice copy, and the VPC mechanism.
- [ ] Confirm the Stripe payment flow satisfies VPC as implemented, not just in principle.
- [ ] Write the kids-specific privacy disclosure (the existing `/privacy` page predates this model).
- [ ] Confirm each vendor's terms permit processing children's data for this purpose.
