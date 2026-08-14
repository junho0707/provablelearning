# 05 — Flows

Status: **REWRITTEN 2026-08-14** against `01_PRD.md`, `03_REQUIREMENTS.md`, `04_ACTORS.md` +
ADR-003/004/005.

> **Removed by ADR-004:** the purchase-course and paywall-unlock flows. Nothing gates a lesson.

---

## F1 — Read a lesson (Visitor, anonymous)

1. Arrives from search or the roadmap.
2. Reads the lesson in full — prose, math, worked examples.
3. Attempts practice questions; each submission is checked **server-side** and returns
   correct/incorrect plus the explanation.
4. Nothing is recorded. A "sign in to save your progress" prompt is offered but never blocks.

**Critical:** there is no branch here for signed-in vs anonymous *access*. Only *recording* differs.
That is what keeps the page static (REQ-CONTENT-004).

## F2 — Explore the roadmap (Visitor)

1. Opens `/roadmap`; sees the full arc with unbuilt regions locked.
2. Pans/zooms (or, on mobile, expands the nested outline).
3. Selects a node → detail panel with description, prerequisites, and a link to the lesson; the
   transitive prerequisite chain highlights.
4. Unbuilt node → "coming soon", never a 404.

## F3 — Sign in (Visitor → Buyer)

1. Chooses Google OAuth or email magic link. **No password anywhere.**
2. Same email via either method resolves to one account (REQ-AUTH-002).
3. First sign-in prompts creating a first **learner profile** (`name`, `grade`,
   `current math class`) — which may be themselves (independent student).

## F4 — Saved progress (Buyer)

1. Signed in, with an active profile selected.
2. Each attempt records against that profile.
3. A lesson flips to **complete only when every question has been answered correctly**.
4. Switching profiles switches the progress view. Progress persists across sessions.

---

## F5 — Buy the First Session (Buyer) — the entry flow

1. Clicks **"Book your first session — $49"**.
2. **States a goal:** catching up / not sure where the gaps are (`strengths`) · SAT-ACT prep
   (`test_prep`) · help with my current class or the year ahead (`class_help`).
3. Picks (or creates) the learner profile.
4. **Guard:** if this account already bought a First Session, the purchase is **refused** and they
   are routed to credit packs (REQ-FIRST-001).
5. Stripe checkout → webhook (idempotent) records the purchase with its `goal`.
6. **Branch on mode:**

   | Goal | Next step |
   |---|---|
   | `strengths` | → **F6** (assessment), then booking |
   | `test_prep` | → authored practice test for that test, then booking |
   | `class_help` | → **straight to booking**, no assessment (ADR-005) |

7. Books a slot (F8), attends, and receives a **written plan within 48 hours**.

## F6 — Strengths & weaknesses assessment (student, alone, before the session)

Set up by the buyer; **completed by the student alone** (REQ-FIRST-005).

1. Start from the learner's `current_course_node`; compute its **transitive prerequisite closure**.
2. **Probe** one question per major node, foundational first.
3. **Correct** → mark that subtree solid, **skip it**. *(This is what stops a strong student
   answering forty easy questions.)*
4. **Wrong** → **descend** into that node's prerequisites and probe again, recording `depth`.
5. Ask **2–3 questions** at or near the current class.
6. Stop at the **≈25-question cap** or when the closure is covered.
7. Results name the weak nodes; the operator arrives at the session already knowing them.

## F7 — Buy credit packs (Buyer)

1. From the wallet or the post-session prompt, picks 1/2/4/8 credits.
2. Stripe checkout → **idempotent** webhook → ledger credited **exactly once**.
3. Balance = Σ deltas. **Credits never expire.**

## F8 — Book a session (Buyer)

1. Picks a learner profile and an open slot, shown in **their own browser time zone**.
2. Only slots **≥24h out** and **≤4 weeks** ahead are offered.
3. `book_session` RPC, **one transaction**: row-lock the slot → verify open → verify balance →
   spend one credit → reserve. Concurrency yields exactly one booking and one spend.
4. **After commit**, the system creates the Calendar event + **Meet link** and sends the Resend
   confirmation.
5. **If Google fails:** the booking stands with a null `meet_url`, surfaced on the admin queue.
   *Never* rolled back (REQ-BOOK-006).
6. Reminders fire at **24h** and **1h**, idempotently.

## F9 — Cancel or reschedule (Buyer)

| Action | ≥24h ahead | <24h ahead |
|---|---|---|
| **Cancel** | slot reopens, **credit returned** | slot reopens, **credit burns** |
| **Reschedule** | moves to another open slot, **ledger untouched** | not offered — cancel instead |

Rescheduling is deliberately *not* cancel-and-rebook: no refund/respend round trip, and it cannot be
used to dodge the 24h rule.

## F10 — No-show and credit-return request

1. Student is **15+ minutes late** → operator marks `no_show`; the credit burns.
2. The buyer may **submit a credit-return request** with a reason.
3. It appears in the operator's queue; approve or deny.
4. **Approve** → writes **exactly one** ledger row (`noshow_return`), audited.

---

## F11 — Operator: availability

Edits the **recurring weekly template**, adds blackouts and one-off extra slots. Bookable slots are
derived and materialized in **UTC**.

## F12 — Operator: session day

1. Works the **manual SMS reminder queue** — per session: the message, the number, time remaining.
   Sends the texts personally.
2. Delivers the 60-minute session over the per-booking Meet link.
3. Marks completed or no-show.
4. Writes and sends the plan **within 48 hours** where one is owed.

## F13 — Operator: refunds

No self-serve path. Refund in the **Stripe dashboard**, then apply the matching **admin ledger
adjustment** so wallet and Stripe cannot drift. Audited (REQ-BILLING-003).

---

## Flow → requirement map

| Flow | Requirements |
|---|---|
| F1, F2 | REQ-CONTENT-001..004, REQ-ROADMAP-001..006, REQ-PRACTICE-001..004 |
| F3, F4 | REQ-AUTH-001..002, REQ-ACCT-001..004, REQ-PROGRESS-001..003 |
| F5, F6 | REQ-FIRST-001..007, REQ-BILLING-001..002 |
| F7 | REQ-CREDIT-001..004, REQ-BILLING-001..002 |
| F8 | REQ-BOOK-001, 002, 006, REQ-NOTIFY-001 |
| F9 | REQ-BOOK-003, 004 |
| F10 | REQ-BOOK-005, REQ-ADMIN-003 |
| F11–F13 | REQ-ADMIN-001..006, REQ-BILLING-003 |
