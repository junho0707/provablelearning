# 07 — Verification

How you know it works. Each check names the flow it proves. **Check a box only when the expected
result actually happened** — not when you believe it should. If a check fails, leave it unchecked and
write what happened underneath; never edit the expected result to match reality.

Checks marked **[db]** must be proven against a real database, not a unit test. Checks marked
**[live]** need real Stripe/Google/Resend credentials.

## AT-AUTH — identity (F1, F2)

- [ ] `AT-AUTH-1` Buyer signs in with Google; account row is auto-provisioned; lands on the dashboard. **[live]**
- [ ] `AT-AUTH-2` Buyer signs in with a magic link on the same email as their Google identity → **one** account, not two. **[live]**
- [ ] `AT-AUTH-3` No password field exists anywhere in the buyer sign-in path.
- [ ] `AT-AUTH-4` Buyer sets a student's username and password; the student signs in at `/student/login`. **[db]**
- [ ] `AT-AUTH-5` A student cannot reset their own password; the buyer can, from their dashboard. **[db]**
- [ ] `AT-AUTH-6` **No email of any kind is sent to a student, and no student email address exists anywhere in the schema** (`INV-AUTH-2`). **[live]**

## AT-COPPA — consent (F2, F4, F13)

- [ ] `AT-COPPA-1` A student created before any purchase **cannot sign in** — the login is dormant. **[db]**
- [ ] `AT-COPPA-2` After the buyer's first successful payment, that account's student logins activate and a `consent_events` row exists naming the mechanism and timestamp. **[live]**
- [ ] `AT-COPPA-3` No student-submitted row can be written for an account with no consent event (`INV-COPPA-1`). **[db]**
- [ ] `AT-COPPA-4` Buyer revokes consent → the student login deactivates immediately, and no further submission is accepted. **[db]**
- [ ] `AT-COPPA-5` Buyer deletes a student → record, submissions, uploads, diagnostic results, and materials are gone within the retention window, including files removed from storage. **[db]**
- [ ] `AT-COPPA-6` The privacy policy carries the kids-specific disclosure and is linked from every surface that collects from a student.

## AT-ACTOR — the permission boundary (01-ACTORS)

- [ ] `AT-ACTOR-1` A student-authenticated request is **denied** on every billing, credit, booking, and messaging table — proven at the database, not by the absence of a UI link (`INV-ACTOR-1`). **[db]**
- [ ] `AT-ACTOR-2` A student cannot read any other student's data, including a sibling's. **[db]**
- [ ] `AT-ACTOR-3` A buyer cannot read another account's data. **[db]**

## AT-MONEY — purchases and credits (F3, F4)

- [ ] `AT-MONEY-1` Buying a pack grants exactly the right number of credits; balance equals the ledger sum. **[live]**
- [ ] `AT-MONEY-2` A replayed Stripe webhook grants nothing twice (`INV-MONEY-3`). **[live]**
- [ ] `AT-MONEY-3` Each student can buy a First Session **once**; a second attempt for the same student is refused **by the database** (`INV-FIRST-1`). **[db]**
- [ ] `AT-MONEY-4` A second student on the same account **can** buy their own First Session. **[db]**
- [ ] `AT-MONEY-5` A student added later unlocks a First Session at that point.
- [ ] `AT-MONEY-6` Prices rendered on every surface match `src/lib/pricing.ts` and `00-BUSINESS.md`.

## AT-BOOK — booking (F5)

- [ ] `AT-BOOK-1` Booking spends a credit and reserves the slot atomically; neither can happen alone (`INV-MONEY-1`). **[db]**
- [ ] `AT-BOOK-2` Two simultaneous bookings for one slot → exactly one succeeds, the other is told the slot was taken and **spends no credit** (`INV-BOOK-1`). **[db]**
- [ ] `AT-BOOK-3` A booking starting in less than 6 hours is refused (`INV-BOOK-3`). **[db]**
- [ ] `AT-BOOK-4` A slot released by a cancellation is bookable until **1 hour** before start, and refused after (`INV-BOOK-3`). **[db]**
- [ ] `AT-BOOK-5` The horizon is 4 weeks and a new week appears on Monday, not daily.
- [ ] `AT-BOOK-6` Slots display in the viewer's browser time zone and survive a DST boundary correctly.
- [ ] `AT-BOOK-7` A Calendar API failure leaves a **valid booking with a null `meet_url`** on the repair queue — never a rolled-back booking (`INV-BOOK-2`). **[live]**
- [ ] `AT-BOOK-8` Booking captures student, purpose, specifics, and continue-vs-new-topic, and all four reach the tutor's view.
- [ ] `AT-BOOK-9` A First Session booking consumes the entitlement and spends **no** wallet credit. **[db]**

## AT-PRE — pre-session (F6)

- [ ] `AT-PRE-1` A student with no booked session sees a clear empty state, not a broken tool.
- [ ] `AT-PRE-2` Once booked, the student is prompted with work matching that booking's purpose — all six rows of `02-POLICIES.md` §7.
- [ ] `AT-PRE-3` A first-time test-prep booking offers the diagnostic; a repeat booking for the same test does not.
- [ ] `AT-PRE-4` The math diagnostic asks for current **and previous** class, then serves an assessment covering up to that level.
- [ ] `AT-PRE-5` A student who skips preparation is still able to attend; they are warned it will be less effective, and the tutor sees it is missing.
- [ ] `AT-PRE-6` An abandoned diagnostic resumes where it left off. **[db]**
- [ ] `AT-PRE-7` With **no diagnostic authored** for a requested test or level, the student is asked descriptive questions instead and the tutor is flagged. Nothing is blocked.
- [ ] `AT-PRE-8` Uploads accept `.doc`, `.docx`, PDF, and Google Docs links, and reject everything else with the accepted list shown.
- [ ] `AT-PRE-9` An upload is visible to that student, their buyer, and the tutor — and to nobody else. **[db]**

## AT-POST — post-session (F8)

- [ ] `AT-POST-1` The tutor authors and publishes materials; they appear in the student's account.
- [ ] `AT-POST-2` The buyer is emailed; the student sees the material waiting **in-app**, with no email sent to them. **[live]**
- [ ] `AT-POST-3` The student works the practice questions on the site and progress persists across sessions. **[db]**
- [ ] `AT-POST-4` A session with nothing published after 24 hours appears on the overdue queue.
- [ ] `AT-POST-5` The buyer can see everything delivered to each of their students.

## AT-CANCEL — cancellation and returns (F9, F10)

- [ ] `AT-CANCEL-1` Cancelling ≥6h ahead returns the credit immediately, with no note and no review. **[db]**
- [ ] `AT-CANCEL-2` Rescheduling ≥6h ahead moves the booking and writes **no ledger rows at all**. **[db]**
- [ ] `AT-CANCEL-3` Cancelling <6h burns the credit and offers the note path.
- [ ] `AT-CANCEL-4` A cancelled slot returns to the open pool. **[db]**
- [ ] `AT-CANCEL-5` The tutor marks a no-show **by hand** at the 15-minute mark; the credit burns and the buyer is emailed the note prompt **and the remaining allowance**. There is no automatic sweep.
- [ ] `AT-CANCEL-6` A submitted note reaches the tutor's queue and is not self-approving. **[db]**
- [ ] `AT-CANCEL-7` Approval returns the credit; denial does not; both email the buyer. **[live]**
- [ ] `AT-CANCEL-8` The **third** miss in a calendar month offers no note at all and says why.
- [ ] `AT-CANCEL-9` An approval that would exceed 2 in a calendar month is refused **by the database** (`INV-CREDIT-2`). **[db]**
- [ ] `AT-CANCEL-10` The cap is **per student and combined** — a sibling's misses do not consume it, and late cancels and no-shows share one allowance. **[db]**
- [ ] `AT-CANCEL-11` The allowance resets on the first of the calendar month. **[db]**
- [ ] `AT-CANCEL-12` One live request per booking; a denied request cannot be resubmitted for that booking. **[db]**

## AT-MSG — messaging (F11)

- [ ] `AT-MSG-1` Buyer sends a message; the tutor sees it and replies in the same thread.
- [ ] `AT-MSG-2` A student has no messaging surface and is denied at the database. **[db]**

## AT-CONTENT — content is not public (00-BUSINESS §1)

- [ ] `AT-CONTENT-1` No public route serves lesson or roadmap content.
- [ ] `AT-CONTENT-2` `sitemap.ts` and `robots.ts` reference no content routes.
- [ ] `AT-CONTENT-3` Site navigation offers no path into content.

## AT-OPS — launch readiness

- [ ] `AT-OPS-1` Live Stripe products exist for all five SKUs, matching `src/lib/pricing.ts`. **[live]**
- [ ] `AT-OPS-2` Resend domain DNS is verified and mail is delivered, not spam-filed. **[live]**
- [ ] `AT-OPS-3` Terms, privacy (with the kids disclosure), and refund policy are published and linked.
- [ ] `AT-OPS-4` Lawyer review of the COPPA stack is complete.
- [ ] `AT-OPS-5` The diagnostic authoring surface works end to end — author one, a student is served it, results reach the tutor. Individual diagnostics may be authored after launch and do not gate it.
- [ ] `AT-OPS-6` Lighthouse run on a deployed preview: LCP ___ CLS ___ INP ___.
- [ ] `AT-OPS-7` Apex domain cutover complete.

## Sign-off

| Section | Verified by | Date | Notes |
|---|---|---|---|
| AT-AUTH | | | |
| AT-COPPA | | | |
| AT-ACTOR | | | |
| AT-MONEY | | | |
| AT-BOOK | | | |
| AT-PRE | | | |
| AT-POST | | | |
| AT-CANCEL | | | |
| AT-MSG | | | |
| AT-CONTENT | | | |
| AT-OPS | | | |
