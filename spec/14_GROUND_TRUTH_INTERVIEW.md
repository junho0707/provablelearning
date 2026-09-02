# 14 — Ground Truth (v3 pivot) — DECIDED

Status: **DECIDED 2026-08-14** via interview; **pricing + operations resolved 2026-08-14** in a
second pass (§11–§12), recorded as **ADR-003**. This supersedes conflicting parts of `01_PRD.md`
(which must be rewritten against this). Nothing here is open.

---

## 1. What the business sells

> **AMENDED 2026-08-14 by ADR-004.** Course content is **no longer sold** — it is free. What was
> P1 is now the funnel, not a product. Two products remain.

| # | Product | Billing | Contains |
|---|---|---|---|
| ~~P1~~ | ~~Course content~~ | **Free — not sold** (ADR-004) | All lessons, examples, practice questions, solutions, worksheets — public to everyone |
| P2 | **Tutoring credits** | One-time credit-pack purchase | 1 credit = one **60-minute** 1:1 session, any reason (class quiz/test prep, SAT/ACT math, general learning) |
| P3 | **First Session** *(was "Math Diagnosis" — renamed by ADR-005)* | **Separate SKU**, $49, **one per customer** | A discounted first 60-min session shaped to the buyer's stated goal, plus a written plan. A pre-session assessment is included **only in some modes** — see §6. |

No subscriptions anywhere (CON4 holds). **Prices are now decided — see §11.** They remain
config-driven in code, but they are no longer placeholders.

## 2. Access model

> **AMENDED 2026-08-14 by ADR-004.** There is no paywall on content.

Public (no account) — **all of it**:
- The **full roadmap** — the whole arc Elementary → Algebra → Geometry → Pre-Calc → Calculus, with
  unbuilt regions rendered as **locked / coming soon**.
- **Every authored lesson**: explanation, examples, practice questions, solutions, worksheets. All
  statically rendered and indexable. The SEO surface is the whole catalog and grows with every
  lesson authored.

Signed in (free account):
- **Saved progress** per learner profile. This is the lead-capture mechanism that replaced the
  paywall — it costs the visitor nothing and does not hide anything from crawlers.

Paid (diagnosis SKU):
- The PDF report + study guide. The guide may draw on course content **and go beyond it** —
  it is bespoke, not merely a subset of the catalog.

## 3. Acquisition

> **AMENDED 2026-08-14 by ADR-004.** With content free again, **CON6 is effectively restored** —
> free content *is* the funnel — but now with a much larger indexable surface than the original
> plan, and paired with the roadmap as the differentiator.

Three channels, all in play: **SEO on the roadmap page + the entire free lesson catalog**, **paid
ads to the Diagnosis offer**, and **social content** (short-form explainers). Landing-page primary
CTA: **Book a Math Diagnosis**; secondary: explore the roadmap.

## 4. Accounts

- **One login per buyer.** The buyer owns the wallet, course access, and bookings.
- **Learner profiles under that account** (Netflix-style): each child is a switchable profile with
  its own progress, assigned path, and diagnosis results. **No child credentials** — therefore **no
  minors'-consent gate at launch**. CON3 / OQ2 are deferred, not resolved: they return only if
  profiles are ever upgraded to real logins (schema should keep owner identity separate from
  learner identity so that upgrade is additive).

## 5. Tutoring operations

- **Platform owns availability and booking.** Booking spends a credit atomically in one
  `SECURITY DEFINER` RPC with row locks (CON1/CON2 hold — reuse v1's reserve-slot pattern).
- Session length **60 minutes**, universally. (Supersedes the PRD's 45-minute credit unit.)
- **Cancellation:** free cancel 24h+ ahead returns the credit; later cancel or no-show burns it —
  but either may be appealed for the credit back (ADR-006).
- **Credits never expire.**
- **Venue:** a Google Meet link generated **per booking**.
- **Notifications:** **email only** from the system (confirmations + reminders).
- **SMS is manual.** Build an **admin reminder-queue page** listing, per upcoming session, the
  message to send, the recipient's number, and the time remaining ("send this to X in 3h 20m").
  The operator sends texts personally; the page is a worklist, not an integration.

## 6. First Session flow

> **AMENDED 2026-08-14 by ADR-005.** Was "Diagnosis flow". The product is now a **discounted first
> session** ($49 vs the $75 single credit, **one per customer, enforced**) that adapts to the
> buyer's stated goal. Diagnosis is one *mode* of it, not the whole product.

1. Purchase the **First Session** SKU and **state a goal**. The goal selects the mode.
2. **Pre-session assessment — conditional on mode:**

   | Mode | Pre-session assessment |
   |---|---|
   | **Strengths & weaknesses** | Student picks the math class they are taking **now**; questions are drawn from roadmap nodes **at or below** it (the node's transitive prerequisite closure). |
   | **Test prep** (SAT / ACT) | A **dedicated practice test authored per test**. Not generated from the roadmap. |
   | **Taking a class / year ahead** | **None.** A pre-test is useless here — go straight to the session. |

3. **One 60-minute live session.**
4. **Written plan delivered within 48 hours** of the session (a copy commitment, not enforced in code).

**Assessment algorithm (strengths & weaknesses mode) — "probe and descend".** Sparse at the bottom,
dense near the student's current level, so a strong student is not made to answer forty easy
questions:

- One **probe** question per major node in the prerequisite closure, foundational nodes first.
- Probe **correct** → treat that subtree as solid; do not drill into it.
- Probe **wrong** → **descend** into that node's own prerequisites to locate the true floor.
- **2–3 questions per node** at or near the current class, where the useful signal lives.
- **Hard cap ≈ 25 questions** so a session never runs long.

Built on the **existing practice-question engine**; questions are already tagged to roadmap nodes by
`lesson_slug` (ADR-001/002), and `src/lib/content/layout.ts` already computes transitive
prerequisite chains, so the node-selection traversal is largely in place.

**Schema consequence:** `roadmap/roadmap.json` needs **selectable course-level nodes** (e.g.
"Algebra 1", "Geometry") so a student can identify the class they are currently taking. Regions and
concepts exist today; an explicit course marker does not.

## 7. Roadmap visual

- **Skill tree / tech tree** rendering (Civ / Path-of-Exile flavour) driven by `roadmap/roadmap.json`.
- **Interactivity v1:** pan + zoom canvas; **click a node → detail panel** with its description,
  prerequisites, and a link to the lesson (or a buy prompt when gated).
- **Mobile:** pannable canvas on desktop; the same data as a **collapsible nested outline** on small
  screens.
- Shows the **full arc** with unbuilt regions locked.
- **Separate views:** the public marketing map and the logged-in learner's progress dashboard are
  **two distinct surfaces**, each optimized for its job — not one map with an overlay.
- Authoring stays hand-edited `roadmap/roadmap.json` in-repo.

## 8. Worksheets

**Generated from the question bank** attached to each lesson, rendered as a printable page/PDF.
No separate authoring; they stay in sync with the content automatically.

## 9. Build order

1. **Roadmap visual v2** (skill tree, public map) ← starting here
2. **Landing page** rebuilt around it (hero + three offers + Diagnosis CTA)
3. **Auth + learner profiles**
4. **Course purchase + content paywall**
5. **Credits + booking + admin SMS reminder queue**
6. **Diagnosis flow** (assessment → session → deliverable)

## 10. Disposition of existing work

- **Kept:** MDX content pipeline, practice questions + answer-secrecy design, SSG lesson pages,
  sitemap/robots. All still correct; the paywall wraps them rather than replacing them.
- **Archived:** `docs/` (the v1 SAT model — enrollment, waitlists, 13 journeys, 6 capabilities)
  moves to `docs/archive/v1-sat/`; the layered doc tree is rebuilt against this document.
- **Superseded in `01_PRD.md`:** free-content premise (§1, §4, C1), 45-min credit unit (C4),
  Parent/Dependent account shapes (C3, §2), CON6 acquisition, OQ1 framing.

---

## 11. Pricing — DECIDED (closes D2 / OQ1)

All prices USD, one-time, no subscriptions.

| SKU | Price | Notes |
|---|---|---|
| ~~Course — "Math up to Geometry"~~ | ~~$19.99~~ → **free** | **Withdrawn by ADR-004.** Content is not sold. |
| **Math Diagnosis** | **$49** | Deliberate **tripwire** — near-breakeven, priced to acquire buyers. |
| **Credits — 1** | **$75** | $75.00 / session |
| **Credits — 2** | **$120** | $60.00 / session |
| **Credits — 4** | **$200** | $50.00 / session |
| **Credits — 8** | **$350** | $43.75 / session |

**Consequence to hold onto:** with content free and diagnosis a $49 tripwire, **essentially all
revenue is credit packs.** The credits/booking system is the most commercially important thing in
the build; design effort should be allocated accordingly. Free content is the top of the funnel,
diagnosis is the qualifying offer, credits are the business.

Prices live in one config module and are used to create the Stripe products; they are never
duplicated in page copy.

## 12. Operations — DECIDED

**Tutor supply.** **Solo (the owner) at launch.** No tutor entity, no tutor logins, no per-tutor
availability — availability is one calendar. If a second tutor is ever added this becomes a
schema change; that is an accepted, deferred cost.

**Availability.** A **recurring weekly template plus exceptions** (one-off blackouts and extra
slots). Not Google-Calendar-derived — the calendar is written to, never read from, so a Google
outage cannot break the booking path.

**Time.** Slots stored in **UTC**, displayed in the **visitor's browser time zone**. DST is
handled by storing absolute instants.

**Meet links.** **Auto-generated per booking via the Google Calendar API** (event + unique Meet
link, both parties invited). Created **after** the booking transaction commits, so a Google
failure leaves a valid booking with a missing link rather than losing the booking (see
AT-BOOK-006). Missing links surface on the admin queue for manual repair.

**Email.** **Resend** for all transactional mail (booking confirmation, reminders, receipts).
Requires domain DNS verification in the launch checklist. Supabase's built-in mailer stays
responsible only for auth magic links.

**Auth.** **Google OAuth + email magic link.** No passwords — therefore no reset flow, no password
storage, no breach surface. One login per buyer; learner profiles beneath it (§4).

**Refunds.** **No self-serve refunds.** A short published policy; refunds issued case-by-case by
hand in the Stripe dashboard. Because credits are a ledger, a manual refund needs a matching
**admin credit-adjustment action** so the wallet and Stripe don't drift — that action is in scope,
the customer-facing refund flow is not.

**Sample lessons.** ~~A `sample: true` frontmatter flag.~~ **Dropped by ADR-004** — every lesson is
public, so there is nothing to flag.

**Domain.** Launch on the **apex**, cut over from the v1 SAT demo (closes OQ3). The DNS repoint is
a launch-checklist item, not a build task.

## 13. Launch scope (v1)

> **AMENDED 2026-08-14 by ADR-004** — the paywall skeleton is out; saved progress is in.

**In:** roadmap map · landing page · auth + learner profiles · **saved progress** · Stripe checkout
(diagnosis + credit packs) · credits + booking + cancellation · Google Calendar/Meet · Resend email
· admin reminder queue + admin surfaces.

**Deferred:** authoring the course content itself — but this **no longer gates anything**. Because
content is free, a partly-authored catalog is honest rather than an under-delivery: unbuilt nodes
simply read "coming soon" on the roadmap. Every lesson authored after launch adds indexable SEO
surface. The public surface at launch is the roadmap plus whatever lessons exist.

**Critical path:** credits + booking. It gates the diagnosis flow (which contains a 60-min
session) and carries essentially all revenue.

---

## 14. Market, audience, brand — DECIDED

- **Audience: K–12, the full arc.** Elementary through Calculus. Buyer is usually the parent;
  learner is usually the child — but **independent students** (buyer and learner are the same
  person) are a supported case, not an edge case.
- **Market: US only.** USD, US tax/Stripe setup, availability in the operator's own hours.
- **Brand: Provable Learning.**
- **Roadmap scope at launch: the full arc**, Elementary → Calculus, unbuilt regions marked
  "coming soon".

  **Known risk, accepted:** with ~20 lessons authored against a K–12 arc, the launch map reads
  roughly 5% built. A near-empty map can look like vaporware. **Mitigation is framing, not scope** —
  present growth as a feature ("new lessons weekly"), and make authored regions visually prominent
  rather than lost in a field of locked nodes.

### Landing hero (approved copy)

```
Provable Learning

Math help, whatever you need it for.

Your first session is $49 — normally $75.
Tell us what you're after and we'll shape the hour around it:

  • Taking a class, or prepping for the SAT/ACT?
      → a short assessment, then a written plan to follow

  • Not sure where the gaps are?
      → a full read on your strengths and weaknesses

  • Getting ahead, or starting a new school year?
      → where you stand now, and what to learn next

[ Book your first session — $49 ]      Explore the roadmap →
```

**Copy rule:** frame everything as **strengths and next steps**, never as deficits. "Diagnosis",
"behind", "struggling", and "what's wrong" language is excluded — it makes parents defensive and
makes teenagers refuse the assessment, and it wrongly excludes the accelerating and test-prep
buyers who are half the market.

## 15. Booking operations — DECIDED

- **Minimum notice: 24 hours.** Same number as the cancellation rule, so one policy governs both.
- **Booking horizon: 4 weeks** ahead.
- **Rescheduling: free when ≥24h ahead, and the credit is untouched** — the booking moves to another
  open slot without a ledger round trip. Distinct from cancellation.
- **No-show: 15 minutes late counts as a no-show and burns the credit** — but the parent or
  independent student can **submit a request to have the credit returned**, which lands in the admin
  queue for approval. A request/approve flow, not a silent admin fix.
- **Late cancellation: burns the credit, and is appealable the same way** (AMENDED 2026-08-18 by
  ADR-006). A cancel inside 24h still costs the credit by default; the buyer may request it back and
  the operator reviews **case by case**. Eligibility is "the credit was burned" — a `no_show`, or a
  `cancelled` booking with no `cancel_refund` ledger row — not a dedicated status. One live appeal
  per booking; a denied one may be resubmitted.

## 16. Accounts & progress — DECIDED

- **Learner profile fields: name, grade, current math class.** Nothing collected that isn't used —
  grade and current class drive assessment targeting and the roadmap's "you are here".
- **Lesson completion = all practice questions answered correctly.** Completion means demonstrated
  understanding, so the progress view is worth looking at. Accepted trade-off: a hard lesson can
  stall a learner at "incomplete".

## 17. Legal & measurement — DECIDED

- **Business entity and Stripe account already exist.** Remaining paperwork is content, not a
  blocker: **Terms of Service, Privacy Policy, and a refund policy** page, written and linked.
- **Analytics: Vercel Analytics + the Stripe dashboard.** Near-zero setup, privacy-friendly, no
  cookie banner.

  **Known limitation, accepted:** this gives traffic and revenue but **cannot report the First
  Session → credit-pack conversion rate**, which §11 identifies as the single number the model rests
  on. Upgrade path is PostHog (proper funnels) whenever that number is needed. Until then it must be
  reconstructed by hand from Stripe.
