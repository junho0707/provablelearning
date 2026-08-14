# 14 — Ground Truth (v3 pivot) — DECIDED

Status: **DECIDED 2026-08-14** via interview; **pricing + operations resolved 2026-08-14** in a
second pass (§11–§12), recorded as **ADR-003**. This supersedes conflicting parts of `01_PRD.md`
(which must be rewritten against this). Nothing here is open.

---

## 1. What the business sells

Three products:

| # | Product | Billing | Contains |
|---|---|---|---|
| P1 | **Course content** (e.g. "Math up to Geometry") | **One-time purchase per course**, own it forever | All lesson explanations, worked examples, practice questions, solutions, generated worksheets |
| P2 | **Tutoring credits** | One-time credit-pack purchase | 1 credit = one **60-minute** 1:1 session, any reason (class quiz/test prep, SAT/ACT math, general learning) |
| P3 | **Math Diagnosis** | **Separate SKU**, own price | Online placement assessment → one 60-min live session → **PDF report + PDF study guide** |

No subscriptions anywhere (CON4 holds). **Prices are now decided — see §11.** They remain
config-driven in code, but they are no longer placeholders.

## 2. Access model

Public (no account):
- The **full roadmap** — the whole arc Elementary → Algebra → Geometry → Pre-Calc → Calculus, with
  unbuilt regions rendered as **locked / coming soon**.
- **3–5 hand-picked sample lessons**, fully readable. These plus the roadmap page are the entire
  indexable SEO surface.

Paid (course purchase):
- Every other lesson: explanation, examples, practice questions, solutions, worksheets.

Paid (diagnosis SKU):
- The PDF report + study guide. The guide may draw on course content **and go beyond it** —
  it is bespoke, not merely a subset of the catalog.

## 3. Acquisition

No longer "cold organic search on free content" (CON6 is retired in its old form). Three channels,
all in play: **SEO on the roadmap page + sample lessons**, **paid ads to the Diagnosis offer**, and
**social content** (short-form explainers). Landing-page primary CTA: **Book a Math Diagnosis**;
secondary: explore the roadmap.

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
- **Cancellation:** free cancel 24h+ ahead returns the credit; later cancel or no-show burns it.
- **Credits never expire.**
- **Venue:** a Google Meet link generated **per booking**.
- **Notifications:** **email only** from the system (confirmations + reminders).
- **SMS is manual.** Build an **admin reminder-queue page** listing, per upcoming session, the
  message to send, the recipient's number, and the time remaining ("send this to X in 3h 20m").
  The operator sends texts personally; the page is a worklist, not an integration.

## 6. Diagnosis flow

1. Purchase the Diagnosis SKU.
2. **Online placement assessment** — built on the **existing practice-question engine**, with
   questions **tagged to roadmap nodes**, so results identify weak nodes directly.
3. **One 60-minute live session** where the operator confirms and plans.
4. **PDF report + PDF study guide** delivered (turnaround commitment TBD in copy, not code).

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
| **Course** — "Math up to Geometry" | **$19.99** | **One SKU for the whole course.** Not split per region. |
| **Math Diagnosis** | **$49** | Deliberate **tripwire** — near-breakeven, priced to acquire buyers. |
| **Credits — 1** | **$75** | $75.00 / session |
| **Credits — 2** | **$120** | $60.00 / session |
| **Credits — 4** | **$200** | $50.00 / session |
| **Credits — 8** | **$350** | $43.75 / session |

**Consequence to hold onto:** at $19.99 and $49, content and diagnosis are *both* tripwires.
**Essentially all revenue is credit packs.** The paywall is therefore a lead-capture and
qualification mechanism, not a revenue line — and the credits/booking system is the most
commercially important thing in the build. Design effort should be allocated accordingly.

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

**Sample lessons.** Not hardcoded. A **`sample: true` flag in lesson frontmatter** promotes any
lesson to the public SEO surface, so the sample set changes without a code change.

**Domain.** Launch on the **apex**, cut over from the v1 SAT demo (closes OQ3). The DNS repoint is
a launch-checklist item, not a build task.

## 13. Launch scope (v1)

**In:** roadmap map · landing page · auth + learner profiles · Stripe checkout · credits + booking
+ cancellation · Google Calendar/Meet · Resend email · admin reminder queue + admin surfaces ·
**the course-purchase and paywall skeleton**.

**Deferred:** authoring the course content itself. The paywall ships **fully built over a
near-empty shelf** — lessons are authored *after* the site is live, and doing so is then pure
content work requiring no code change. The public surface at launch is the roadmap plus the
flagged sample lessons.

**Critical path:** credits + booking. It gates the diagnosis flow (which contains a 60-min
session) and carries essentially all revenue.
