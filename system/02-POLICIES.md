# 02 — Policies

The rules that bind behaviour. Every number here is load-bearing; changing one requires an ADR and
an update to the flow it governs.

## 1. Credits

- 1 credit = one **60-minute** 1:1 session, for any purpose.
- Credits **never expire**.
- Credits are a **ledger**, not a counter. Balance is always the sum of ledger rows, so every grant,
  spend, return, and manual adjustment is auditable.
- A First Session purchase does **not** grant a credit. It entitles that student to one session that
  is booked without spending from the wallet.

## 2. Booking

- **Availability horizon: 4 weeks.**
- **Release cadence: weekly batch.** Every **Monday**, the fifth week out unlocks. The horizon does
  not creep forward daily — it steps.
- **Minimum notice: 6 hours.** A session may not be booked to start sooner than 6 hours from now.
- **Exception — released slots:** when a booking is cancelled, its slot returns to the open pool and
  may be re-booked **until 1 hour before** the session start. This is the only case where the 6-hour
  minimum does not apply; the slot already exists on the calendar, so the operator loses nothing by
  letting it be reclaimed late.
- Booking **spends a credit atomically** in a single database transaction with the slot reservation.
  A slot can never be double-booked, and a credit can never be spent without a booking.
- Every booking captures a **purpose** and **specifics** before it is confirmed (`03-FLOWS.md` F5).
- Slots are stored in **UTC** and displayed in the **viewer's browser time zone**.

## 3. Cancellation

| When | Credit | Path |
|---|---|---|
| **≥6 hours before** | **Returned immediately** | Self-serve, no note, no review, no cap. |
| **<6 hours before** | **Burned** | Buyer may submit a note; operator reviews; counts against the cap. |

Rescheduling ≥6 hours ahead **moves the booking and leaves the ledger untouched** — it is not a
cancel-and-rebook pair. Implementing it as refund + respend would show up in the ledger and could be
used to dodge the notice rule.

## 4. No-show

- A session is **cancelled at the 15-minute mark** if the student has not appeared. The credit is
  **burned**.
- The **buyer is notified** that the session was missed, told they may submit a note to reclaim the
  credit, and shown **how many returns remain this month**.
- The note follows the same review path as a late cancellation.

## 5. Credit returns

- A late cancellation or a no-show may be appealed by **submitting a note explaining what happened**.
- **The operator reviews every note** and approves or denies it. Submitting is not self-approving.
- **Cap: 2 per calendar month, per student, combined** across late cancellations and no-shows. Not
  2 of each; not pooled across siblings.
- The cap resets on the **first day of each calendar month**.
- **The third miss in a month burns the credit permanently. There is no appeal**, and the buyer is
  told so at the point they would otherwise submit a note.
- One live request per booking. A denied request may not be resubmitted for the same booking.

`INV-CREDIT-1`: a booking's credit can be returned at most once.
`INV-CREDIT-2`: approved returns for a student within one calendar month never exceed 2.

## 6. Refunds

No self-serve refunds. Money is refunded by hand in the Stripe dashboard, **always paired with an
admin credit-ledger adjustment** so the wallet and Stripe cannot drift. A short refund policy is
published.

## 7. Purpose taxonomy

Every session has exactly one purpose. The purpose selects the pre-session and post-session
behaviour (`03-FLOWS.md` F6, F8).

| Purpose | Sub-purpose | Pre-session | Post-session |
|---|---|---|---|
| **Test prep** | PSAT / SAT / ACT | Diagnostic test (first time for that test) | Roadmap, per-topic strengths, explanations, practice questions |
| **School math help** | Help understanding | Topic/unit + file uploads. No diagnostic. | Explanations + questions for that topic |
| | Get ahead | Class + what they're currently learning + files (e.g. syllabus) | Roadmap, explanations, questions |
| | Review learned material | Class + what they're currently learning + files | Roadmap, explanations, questions |
| | Test / quiz prep | Topic/unit + files | Explanations + questions |
| **Math diagnostic** | — | Current math class **and previous class**, then an assessment covering everything **up to that level** | Math roadmap, explanations, questions |

A student's record carries a **primary and secondary purpose** chosen from these presets, with free
text allowed for anything not listed. Those become the default suggestions at booking; the buyer may
override per booking.

**First Session and credit sessions are the same session.** They share the entire pre-session and
post-session apparatus. The only differences are how they were paid for and that a student's first
session is where a first-time diagnostic naturally falls.

## 8. Pre-session preparation

- Pre-session work is **assigned to the student's account** when the buyer books, and the student is
  notified.
- It is **strongly encouraged but never blocking.** A student who arrives without it still gets the
  session; they are told plainly that the session will be less effective without it.
- **Repeat sessions:** the buyer chooses at booking between **continuing the same topic** and
  **starting a new one**. Continuing carries the existing context forward; a new topic triggers fresh
  pre-session capture.
- A diagnostic is taken **once per test or per class level**, not once per session.

## 9. Post-session materials

- **Hand-authored by the tutor** in an admin form. Nothing is generated.
- **Delivered within 24 hours** of the session. (This target shortens once a reusable content
  library exists and authoring becomes customisation rather than composition.)
- **Delivered to the student's account**, where the student works through them **on the site** —
  progress is tracked so a later session can pick up where they left off.
- The buyer can see everything delivered to each of their students.

## 10. File uploads

- **Accepted:** Word documents (`.doc`, `.docx`), PDFs, and links to Google Docs.
- Uploaded by the student as part of pre-session preparation, or by the buyer at booking.
- Visible to the uploading student, that student's buyer, and the tutor. Nobody else.
- **Uploads from a student under 13 are COPPA-governed personal information** and fall under the
  retention and deletion rules in `06-AUTH-AND-COPPA.md`.

## 11. Notifications

**Two channels, split by actor.** The buyer is reached by **email** (Resend). The student is reached
**only in the app**, on their own home screen.

**No email is ever sent to a student, and no student email address is collected.** A student may
have no inbox at all, and not collecting an address they don't need is both simpler and better under
`06-AUTH-AND-COPPA.md`. Anything a student needs to know waits for them when they sign in; anything
that needs to travel outside the app goes to their parent.

| Event | Buyer (email) | Student (in-app) |
|---|---|---|
| Purchase receipt | ✅ | — |
| Booking confirmed | ✅ (with Meet link) | ✅ (with Meet link) |
| Pre-session work assigned | ✅ (informational) | ✅ (actionable) |
| Session reminder | ✅ | ✅ |
| Cancellation / reschedule | ✅ | ✅ |
| No-show recorded | ✅ (with note prompt + remaining allowance) | — |
| Credit return approved / denied | ✅ | — |
| Post-session materials ready | ✅ (informational) | ✅ (actionable) |
| Tutor message reply | ✅ | — |

Because the student channel is in-app only, **time-sensitive items must also reach the parent** — a
student who does not sign in before a session sees nothing. The session reminder is the case that
matters, and it is the parent's to act on.

SMS is **not** integrated. The operator sends texts by hand from an admin worklist.

## 12. Messaging

- **Buyer ↔ tutor only.** Students cannot message.
- **Threaded and in-app**, with tutor replies visible in the same thread.
- No response-time guarantee is published.
