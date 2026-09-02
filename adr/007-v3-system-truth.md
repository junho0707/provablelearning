# ADR-007 — v3 system truth

**Date:** 2026-09-02
**Status:** Accepted
**Supersedes / amends:** ADR-003, ADR-004, ADR-005, ADR-006, and `spec/14_GROUND_TRUTH_INTERVIEW.md`
**Introduces:** the `system/` documentation tree, which replaces `spec/` and `docs/` as the source of
truth

---

## Context

`spec/14` plus ADR-003/004/005/006 defined a product built around free public content as the
acquisition channel, a single First Session per customer, credential-less learner profiles, and a
24-hour booking policy. Implementation reached M6 against that model.

A full re-interview on 2026-09-02 changed the product in ways that touch nearly every layer. Rather
than amend `spec/14` a fifth time, the definition is being rewritten in a layered tree (`system/`)
that separates business language, flows, and system contract — so that future changes land in one
identifiable place instead of accumulating as amendment notes on a single document.

## Decisions

### 1. Content is not public at launch

The roadmap and lesson catalog are hidden. Content remains in the repository and the pipeline stays
built, but no public route serves it.

**Why:** ~20 lessons against a K–12 arc reads as roughly 5% built. Showing a near-empty map to
every prospect was judged a worse first impression than showing none.

**Cost, accepted:** this removes the cold-organic-search channel that ADR-004 made the entire
acquisition strategy. Acquisition becomes **paid ads to the $49 First Session plus short-form social
content**, neither of which compounds. Restoring the organic leg later means shipping content.
The $49 tripwire's viability now depends on paid CAC landing below it, which is unproven.

### 2. Students get their own logins, at every age, and the COPPA stack is built

Students authenticate with a **username and password set by their parent**. This applies to under-13
students, which triggers COPPA in full.

**Why:** the pre-session and post-session experience is the product. A parent relaying every topic
description, upload, diagnostic, and worked practice question on their child's behalf is not the
product working — it is the product with its centre removed.

**Rejected alternatives:** 13+ logins with under-13 parent-mediated (two divergent experiences, and
the younger cohort gets the degraded one); 13+ only (abandons early middle school entirely).

**Consequences:** the six COPPA obligations in `system/06-AUTH-AND-COPPA.md`; verifiable parental
consent via the existing card payment, gating student login activation; a lawyer review before
launch; and password storage entering a system that ADR-003 deliberately kept passwordless. The
reset path runs through the parent, never through email to a child.

### 3. Money authority is buyer-only

Students cannot see or touch billing, credits, checkout, booking, or messaging. Enforced in RLS, not
in the UI.

**Why:** a child holding a credential must never be able to spend, refund, or tamper with a paid
asset. Note that this does **not** reduce COPPA exposure — that turns on data collection, not
spending — it is a separate safeguard against a separate risk.

### 4. First Session is per student, not per customer

Amends ADR-005's one-per-customer rule. Each student unlocks their own $49 First Session, including
students added later.

**Why:** the offer's job is to convert a *student* into an ongoing tutoring relationship. A second
child in the same household is a second relationship, and pricing their first hour at $75 to buy a
sibling's at $49 is arbitrary from the buyer's side.

### 5. Booking and cancellation move from 24 hours to 6

Minimum booking notice and the free-cancellation window are both **6 hours**. Additionally, a slot
released by a cancellation may be re-booked **until 1 hour before** it starts.

**Why:** 24 hours was inherited from a model with an unproven schedule. Six hours is more useful to
families and costs a solo operator little. The 1-hour rule exists because a slot freed by someone
else's cancellation is already on the calendar — refusing to let it be reclaimed wastes it.

### 6. Availability releases weekly, not daily

The 4-week horizon steps every **Monday** rather than creeping forward each day.

**Why:** a predictable release makes the calendar legible to returning buyers and lets the operator
plan a week at a time.

### 7. Credit returns are capped and operator-reviewed

Amends ADR-006. A late cancellation or no-show burns the credit; the buyer may submit a note; **the
operator reviews every note**; approvals are capped at **2 per calendar month, per student, combined**
across both causes. **The third miss in a month is permanent, with no appeal**, and the buyer is told
so rather than being allowed to appeal into a wall.

**Why:** ADR-006's uncapped case-by-case appeal had no ceiling on operator workload or on abuse.
A cap makes the policy statable in one sentence. Review is retained because auto-approval would make
the note meaningless and amount to two free misses a month regardless of reason.

### 8. Pre-session and post-session apply to every session

Amends ADR-005, under which only the First Session had preparation and a deliverable. Every session —
First Session or credit-redeemed — carries the same apparatus, selected by the session's stated
purpose.

**Why:** the tutor being prepared and the student leaving with material is what the customer is
buying. Restricting it to the first session made every subsequent session a blind hour, which is
what the buyer would notice most.

### 9. Post-session materials are hand-authored

The tutor writes each deliverable in an admin form. Nothing is generated, from the roadmap or by a
model.

**Why:** system-assembly is blocked on a content catalog that does not exist. AI generation adds
infrastructure and quality risk before there is any evidence of demand.

**Cost, accepted:** session throughput is capped by the operator's writing time. This is the first
constraint that binds if the business works.

### 10. Diagnostics are hand-authored data, not an algorithm

Amends ADR-005's probe-and-descend design. The operator authors a diagnostic per test (PSAT/SAT/ACT)
and per math class level, covering everything up to that level. The system provides an authoring
surface so this is data entry, not a code change.

**Why:** probe-and-descend needs a dense, authored question bank tagged across the roadmap. With the
catalog unbuilt, it would mostly traverse empty nodes. A hand-authored test per level works today.

**Consequence:** `src/lib/assessment/probe.ts` is shelved, not deleted. Missing diagnostics degrade
gracefully — the student is asked descriptive questions instead and the tutor is flagged. A session
is never blocked on missing content.

### 11. Buyer ↔ tutor messaging is added

Threaded, in-app, with tutor replies. Students have no messaging access.

### 12. Students are never emailed, and no student email address is collected

The buyer is reached by email. The student is reached **only in the app**, on their own home screen.

**Why:** a student authenticates with a parent-set username precisely because they may have no
inbox, so an email channel would have required collecting an address that many students do not have.

**Consequence, and it is a good one:** the service holds **no online contact information for any
child** and has no mechanism to contact one directly. That materially strengthens the data
minimisation position in `system/06-AUTH-AND-COPPA.md`. It also means the student's channel is
pull-not-push, so anything time-sensitive — session reminders above all — must reach the parent,
who is the one who can act on it.

### 13. No-shows are marked by hand

No automatic sweep. The operator marks a no-show from the admin booking page at the 15-minute mark.

**Why:** they are in the session and already know. A cron job to detect something a human has
already observed is machinery for its own sake.

### 14. Diagnostic content does not gate launch

The system ships the diagnostic **skeleton** — authoring surface, delivery, grading. Individual
diagnostics are authored afterwards. A purpose may be sold before its diagnostic exists; the student
answers descriptive questions instead and the tutor is flagged.

**Why:** the diagnostic sharpens a session, it does not constitute it. Gating a sellable purpose on
unwritten content would repeat the mistake ADR-004 was written to correct.

## Status of prior documents

`spec/00`–`spec/14` and `docs/` are superseded. They are retained as decision history and should not
be updated further. `CLAUDE.md` is updated to point at `system/`.

ADR-001 (hybrid content model) and ADR-002 (`roadmap/roadmap.json` as the curriculum source of
truth) are **unaffected** and still stand.
