# 03 — Flows

End-to-end journeys, including failure paths. Each flow names the actor who drives it. Rules are not
restated here — they live in `02-POLICIES.md`; flows reference them.

---

## F1 — Discovery → buyer account

**Actor:** visitor → buyer.

1. Visitor arrives from a paid ad or social post, landing on the marketing page. The page presents
   the First Session offer at $49 (against $75), the purpose options in the buyer's own language, and
   how sessions work.
2. There is **no public roadmap or lesson catalog** to browse (`00-BUSINESS.md` §1). The only path
   forward is to sign up.
3. Visitor chooses **Continue with Google** or **email magic link**. No password is ever offered.
4. On first successful sign-in an account is provisioned automatically and the buyer lands on the
   **dashboard**, which is empty except for a single prompt: **add your first student**.

**Failure paths**
- OAuth popup blocked or abandoned → return to the sign-in page with the magic-link option intact.
- Magic link expired or reused → plain message, offer to resend.
- Same person signs in with Google and later with a magic link on the same email → **one account**,
  identities linked. Never two accounts.

---

## F2 — Add students

**Actor:** buyer.

1. From the dashboard prompt, the buyer creates a student: **name, current math class, primary
   purpose, secondary purpose**, and **a username and password** for that student.
2. Purposes are chosen from the presets in `02-POLICIES.md` §7, with free text permitted for
   anything not listed.
3. The buyer may add **as many students as they like**, at any time.
4. Once at least one student exists, the dashboard reveals the rest of the product: **credits &
   billing**, **booking**, **sessions**, **messages** — and, per student, the **First Session promo**.

**Consent gate.** Creating the record is buyer-supplied data and is permitted immediately. The
**student's login stays dormant** until consent clears (`06-AUTH-AND-COPPA.md`); a student who tries
to sign in before then is told their account is not active yet.

**Failure paths**
- Username already taken → rejected at entry with a suggestion.
- Buyer removes a student → all of that student's data is deleted per the retention rule; sessions
  already delivered are removed from the buyer's view.

---

## F3 — Buy credits

**Actor:** buyer.

1. Buyer opens **Credits & billing**, which shows the current balance, the four packs at the prices
   in `00-BUSINESS.md`, and the ledger history.
2. Buyer selects a pack → Stripe Checkout.
3. On payment, the Stripe webhook records the purchase and grants the credits **idempotently** — a
   replayed webhook never double-grants.
4. Balance and ledger update; a receipt is emailed.

**Failure paths**
- Payment fails or is abandoned → no purchase row, no credits, buyer returns to the tab unchanged.
- Webhook arrives late → credits appear when it lands; the UI states that a purchase is processing
  rather than showing a wrong balance.
- Webhook replayed → deduplicated on the Stripe event id.

---

## F4 — First Session

**Actor:** buyer.

1. Once a student exists, that student's **First Session promo** appears on the dashboard, and the
   same offer is claimable from **Credits & billing**. Both entry points lead to the same checkout.
2. The offer is **per student** — each student has their own, unclaimed until used. Adding a new
   student later unlocks a new one.
3. Buyer picks the student and the **purpose** for the session, then pays $49.
4. On payment, that student gains a **First Session entitlement** — not a wallet credit.
5. Buyer proceeds to booking (F5). Booking a First Session consumes the entitlement and **spends no
   credit**.
6. **Consent:** this payment is the verifiable-parental-consent event. On success, that student's
   login activates (`06-AUTH-AND-COPPA.md`).

**Failure paths**
- Buyer attempts a second First Session for the same student → blocked, with the credit packs
  offered instead. Enforced in the database, not just hidden in the UI.
- Payment fails → no entitlement, promo stays claimable.

---

## F5 — Book a session

**Actor:** buyer.

1. Buyer opens **Booking**. The calendar shows open slots **up to 4 weeks out**, in the buyer's
   browser time zone. A new week appears every Monday (`02-POLICIES.md` §2).
2. Buyer picks a slot, then completes the booking form:
   - **Which student** the session is for
   - **Purpose** — defaulted from that student's primary/secondary purpose, overridable
   - **Specifics** — free text: the unit or topic, the upcoming quiz or test, what they want to
     understand
   - **For a repeat session:** continue the **same topic** as last time, or start a **new topic**
   - Optional **file uploads** (`02-POLICIES.md` §10)
3. Buyer confirms. In **one atomic transaction** the slot is reserved and payment is taken from
   either the First Session entitlement or the credit wallet.
4. **After** the transaction commits, a Google Calendar event with a Meet link is created and both
   parties are invited.
5. A confirmation **email goes to the buyer**; the student sees the booking and its Meet link **in
   the app** (`02-POLICIES.md` §11). **Pre-session work is assigned to the student** (F6).

**Failure paths**
- Slot taken between load and confirm → clear "that time was just booked", no credit spent, buyer
  re-picks.
- Insufficient credits → checkout offered inline; no partial booking.
- **Google Calendar fails** → the booking still stands with **no Meet link**, and it lands on the
  admin repair queue. A Google outage must never roll back a paid booking.
- Booking inside the 6-hour minimum → rejected, unless the slot was released by a cancellation, in
  which case it is bookable until 1 hour before.

---

## F6 — Pre-session

**Actor:** student (buyer can see status).

1. Student signs in. **With no booked session there is nothing to do** — the account shows that
   plainly rather than presenting an empty tool.
2. Once a session is booked, the student is prompted with work matched to the session's purpose:

   | Purpose | What the student does |
   |---|---|
   | **Test prep** (PSAT/SAT/ACT), first time for that test | Takes the diagnostic for that test |
   | **Test prep**, repeat | Confirms focus; no repeat diagnostic |
   | **School — help understanding** | Enters the topic/unit; uploads relevant files |
   | **School — get ahead / review** | Enters the class and what they're currently learning; uploads files such as a syllabus |
   | **School — test/quiz prep** | Enters the topic/unit and what the test covers; uploads files |
   | **Math diagnostic** | Enters **current math class and previous class**, then takes the assessment covering everything up to that level |

3. Submissions and diagnostic results go to the **tutor**, who reviews them before the session and
   prepares accordingly.
4. **Never blocking.** A student who skips it is told the session will be less effective, and the
   session proceeds regardless. The tutor sees that preparation is missing.

**Failure paths**
- No diagnostic authored yet for a requested test or class level → the student is asked for the
  descriptive inputs instead, and the tutor is flagged. The session is never blocked on missing
  content.
- Student starts a diagnostic and abandons it → progress is saved; they resume where they left off.
- Upload rejected (wrong type or too large) → stated at upload time with the accepted formats.

---

## F7 — The session

**Actor:** tutor + student.

1. Both parties join the Meet link at the scheduled time. Reminders were sent to both.
2. The tutor works from the stated purpose, the specifics, uploaded files, and any diagnostic result.
3. **If the student has not appeared after 15 minutes**, the tutor marks a no-show and the session
   ends → F10.
4. After the session the tutor records notes, which seed the post-session materials (F8).

---

## F8 — Post-session

**Actor:** tutor → student.

1. Within **24 hours**, the tutor **hand-authors** the materials in the admin form, shaped by purpose
   (`02-POLICIES.md` §7): a roadmap of what to learn next, per-topic strengths, written explanations,
   and practice questions.
2. Materials are published to the **student's account**. The buyer is emailed; the student sees them
   waiting on their home screen at next sign-in.
3. The student **works through the material on the site** — reading explanations, answering the
   practice questions.
4. **Progress is tracked and persists.** A later session picks up from what was completed, and the
   tutor sees what was done before preparing the next one.

**Failure paths**
- 24 hours elapse with nothing published → the booking surfaces on the tutor's overdue queue.
- Student never opens the materials → visible to the tutor and reflected in the buyer's view of that
  student.

---

## F9 — Cancel / reschedule

**Actor:** buyer.

1. From the dashboard or the sessions list, the buyer cancels or reschedules a booking.
2. **≥6 hours before start:** self-serve and free. A cancellation **returns the credit immediately**;
   a reschedule **moves the booking and leaves the ledger untouched**.
3. **<6 hours before start:** the credit is **burned**. The buyer is shown how many credit returns
   remain this calendar month for that student and may submit a note → F10.
4. A cancelled slot **returns to the open pool** and may be re-booked by anyone **until 1 hour before**
   its start.
5. Both parties are notified, and the calendar event is removed.

**Failure paths**
- Reschedule target slot taken mid-flow → original booking is left intact, buyer re-picks.
- Buyer has already used both returns this month → no note is offered; they are told the credit is
  burned and why, at the moment of cancelling rather than afterwards.

---

## F10 — Missed session and credit return

**Actors:** buyer → tutor.

1. A late cancellation (F9) or a no-show (F7) burns a credit.
2. The buyer is **notified that the session was missed**, told they may submit a note to reclaim the
   credit, and shown **their remaining allowance** for that student this calendar month.
3. If they have returns remaining, the buyer **submits a note explaining what happened**.
4. The note lands in the tutor's **credit-return queue**. The tutor **reviews it and approves or
   denies**.
5. **Approved** → the credit is returned to the wallet and the student's monthly count increments.
   **Denied** → the credit stays burned. Either way the buyer is emailed the outcome.
6. **On the third miss in a calendar month** no note is offered at all: the credit is gone
   permanently, and the buyer is told this plainly rather than being allowed to appeal into a wall.

**Failure paths**
- Two requests for one booking → rejected; one live request per booking.
- Denied request resubmitted for the same booking → rejected.
- Approval that would exceed 2 in the month → refused at the database level, not just hidden in the
  admin UI.

---

## F11 — Message the tutor

**Actor:** buyer ↔ tutor.

1. Buyer opens **Messages** from the dashboard and writes to the tutor. One thread per buyer.
2. The tutor sees it in the admin inbox and replies; the reply appears in the same thread and the
   buyer is emailed.
3. **Students have no access to messaging at all.**

---

## F12 — Tutor operations

**Actor:** tutor.

1. **Availability** — set the recurring weekly template and one-off exceptions (blackouts, extra
   slots). Availability is written to Google Calendar, never read from it, so a Google outage cannot
   break booking.
2. **Session prep** — see every upcoming booking with its purpose, specifics, uploads, and diagnostic
   results.
3. **Post-session authoring** — write and publish materials (F8); overdue sessions are queued.
4. **Diagnostics authoring** — create and edit test-prep and math-by-class diagnostics **as data**.
   Adding a new one is never a code change.
5. **Credit returns** — review the queue, approve or deny (F10).
6. **Repair queue** — bookings whose Meet link failed to generate.
7. **Ledger adjustments** — match a manual Stripe refund with a ledger entry so the two cannot drift.
8. **Reminder worklist** — per upcoming session, the message to send, the recipient's number, and
   time remaining. The operator sends texts personally.

---

## F13 — Consent and data controls

**Actor:** buyer.

1. From account settings the buyer can, per student: **review what has been collected**, **delete
   that student's data**, and **revoke consent** — which deactivates that student's login and stops
   further collection without deleting the account.
2. Deleting a student removes their record, submissions, uploads, diagnostic results, and materials
   within the retention window in `06-AUTH-AND-COPPA.md`.
3. Consent state is recorded with a timestamp and the mechanism that established it.
