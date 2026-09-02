# 01 — Actors

Three actors. The boundary between the first two is the most important structural rule in the
system.

## Buyer (parent, or independent student)

The account holder. Signs in with **Google OAuth or an email magic link — never a password.**

Owns: the wallet (credits), the student records, every booking, the payment relationship, and the
conversation with the tutor.

Can:
- Create, edit, and remove students; set and reset each student's password
- Purchase credit packs and First Sessions
- Book, cancel, and reschedule sessions — **choosing which student each session is for**
- See every student's sessions, progress, and post-session materials
- Submit a credit-return note after a late cancellation or no-show
- Message the tutor
- Exercise consent controls: review and delete a student's data, revoke consent

**Independent students** are the same actor. An older student may hold the buyer account under their
own Google login and pay with a parent's card. In that case the buyer creates a student record for
themselves, and holds both a buyer login and a student login. This is supported, not an edge case.

## Student

A person the buyer created. Signs in with a **username and password set by the buyer** — see
`06-AUTH-AND-COPPA.md` for why this exists and how it is gated.

Fields on the record: name, current math class, primary purpose, secondary purpose.

Can:
- Complete **pre-session** preparation for a booked session (a diagnostic, a topic description, file uploads)
- View and work through **post-session** materials, with progress tracked

Cannot — and this list is a hard boundary, not a UI default:
- See or touch billing, credits, prices, or checkout
- Book, cancel, or reschedule a session
- Message the tutor
- See any other student's data
- Change their own password (the buyer resets it)

**Rationale.** Money authority belongs to the buyer alone, so a student can never spend, refund, or
tamper with a paid asset. Everything the student *can* do is session work — the material the tutor
needs to prepare, and the material the tutor produces. That split is what makes student logins safe
to hand to a child.

## Tutor / Admin

The operator, solo. No separate tutor entity, no tutor login system — admin access is an attribute
of the operator's own buyer account.

Can:
- Set recurring availability and one-off exceptions
- See every booking, its stated purpose, the student's pre-session submissions and uploads, and
  diagnostic results
- Author and deliver post-session materials
- Author diagnostics (test-prep and math-by-class) as data, not code
- Review credit-return notes and approve or deny them
- Adjust the credit ledger by hand to match a manual Stripe refund
- Repair bookings with a missing Meet link
- Reply to buyer messages
- Work the manual SMS reminder worklist

## Capability matrix

| | Buyer | Student | Tutor |
|---|---|---|---|
| Purchase / checkout | ✅ | ❌ | ❌ |
| Spend a credit (book) | ✅ | ❌ | ✅ (on their behalf) |
| Cancel / reschedule | ✅ | ❌ | ✅ |
| Submit credit-return note | ✅ | ❌ | — |
| Approve credit return | ❌ | ❌ | ✅ |
| Choose session purpose | ✅ | ❌ | — |
| Complete pre-session work | ❌ | ✅ | — |
| View post-session materials | ✅ | ✅ | ✅ |
| Complete post-session work | ❌ | ✅ | — |
| Message the tutor | ✅ | ❌ | ✅ |
| Manage students / passwords | ✅ | ❌ | ❌ |
| Consent controls | ✅ | ❌ | ❌ |
| Availability, diagnostics, ledger | ❌ | ❌ | ✅ |

`INV-ACTOR-1`: no student-authenticated request may read or write any billing, credit, booking, or
messaging row. Enforced in the database by RLS, not in the application layer.
