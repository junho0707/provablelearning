# 00 — Business

**Status: DECIDED 2026-09-02 (ADR-007).**

## 1. What the business sells

| # | Product | Price | Billing | What the customer gets |
|---|---|---|---|---|
| **P1** | **First Session** | **$25** | One-time, **one per student** | A discounted first 60-minute 1:1 session, shaped to a stated purpose, plus pre-session preparation and post-session materials. |
| **P2** | **Credit packs** | 1 / **$75** · 2 / **$120** · 4 / **$200** · 8 / **$350** | One-time | Credits. 1 credit = one 60-minute 1:1 session. Credits **never expire**. |

No subscriptions. No other SKU. Prices live in one config module (`src/lib/pricing.ts`) and are
never retyped into page copy; a drift test asserts they match this table.

**First Session is per student, not per account** (overrides the previous one-per-customer rule —
ADR-007). A household with three students unlocks three First Sessions. A student added a year
later unlocks their own at that point. It is the offer that explains $25 against the $75 single
credit: it is the session you buy *before* a pack.

### Not sold

**Course content and the math roadmap are not a product and are not public at launch.** They are
work in progress, hidden until the catalog is substantial enough to be worth showing. This is a
reversal of the previous model, where free public content was the entire acquisition channel — see
§3 and ADR-007.

## 2. Market

- **Audience: K–12, the full arc**, elementary through calculus. **Including under-13**, which is a
  deliberate choice that carries a compliance cost — see `06-AUTH-AND-COPPA.md`.
- **Buyer is usually the parent; learner is usually the child.** Independent students are supported:
  an older student may hold the buyer account under their own Google login and pay with a parent's
  card.
- **US only.** USD, US tax and Stripe setup, availability in the operator's own hours.
- **Brand:** Provable Learning.

## 3. Acquisition

**Paid ads to the $25 First Session** and **short-form social content** (math explainers funnelling
to the same offer).

This is the whole channel list. It is worth being blunt about what changed: the previous model
rested on cold organic search into a large free lesson catalog. Hiding the content removes that
channel entirely, so **acquisition is now a paid/attention motion with no compounding organic leg
until content ships.** The two consequences to hold onto:

1. **The $25 tripwire only works if CAC lands well under it**, and that is unproven. If paid CAC
   exceeds ~$25, First Session stops being an acquisition offer and becomes a loss leader that only
   pays back through pack conversion.
2. **Content authoring is now a growth dependency, not just a delivery one.** Shipping the public
   catalog later restores the organic channel; until then there is no free traffic.

## 4. Where the money is

**Credit packs carry essentially all revenue.** First Session is priced as a near-breakeven
tripwire to acquire buyers. Therefore:

- **The critical path is credits + booking**, and design effort is allocated accordingly.
- **The single number the model rests on is First Session → credit-pack conversion.** Vercel
  Analytics cannot report it; it must be reconstructed by hand from Stripe until PostHog or
  equivalent is adopted.

## 5. Launch scope (v1)

**In:** buyer accounts · student accounts with their own logins · COPPA consent stack · credits &
billing · First Session promo per student · booking with purpose capture · pre-session preparation ·
post-session materials delivered in-app · cancellation / no-show / credit-return handling · buyer ↔
tutor messaging · parent dashboard · admin/tutor surfaces · email notifications.

**Out (deferred, deliberately):** the public roadmap page · the public lesson catalog · SEO surface ·
self-serve refunds · SMS integration · a second tutor · subscriptions.

**Content dependency:** the diagnostics (PSAT/SAT/ACT and math-by-class) are **authored by the
operator**. The system ships the **skeleton** — an authoring surface plus the delivery and grading
path — so that adding a diagnostic is data entry, not a code change.

**Authored diagnostics do not gate launch.** A purpose may be sold before its diagnostic exists: the
student is asked the descriptive questions instead and the tutor is flagged (`03-FLOWS.md` F6). This
is a deliberate trade — the diagnostic sharpens a session, it does not constitute it.

## 6. Operating model

- **Solo tutor** (the owner). No tutor entity, no tutor logins, one availability calendar.
- **60-minute sessions**, universally.
- **Google Meet** link generated per booking via the Calendar API, after the booking commits.
- **Resend** for transactional email. Supabase's mailer handles buyer magic links only.
- **Stripe** for all payment, and the card charge doubles as the verifiable-parental-consent
  mechanism (`06-AUTH-AND-COPPA.md`).
- **No self-serve refunds.** Case-by-case by hand in Stripe, always paired with an admin ledger
  adjustment.
- **Analytics:** Vercel Analytics + the Stripe dashboard.

## 7. Copy rule

Frame everything as **strengths and next steps, never deficits.** "Behind", "struggling", and
"what's wrong" language is excluded from all user-facing copy: it makes parents defensive, makes
teenagers refuse the assessment, and wrongly excludes the getting-ahead and test-prep buyers who are
half the market. The word "diagnostic" is permitted as the *name of an assessment purpose*, because
the buyer chooses it deliberately — it is never used to describe a student.

## 8. Accepted risks

- **No organic channel at launch.** Paid ads and social carry everything; both stop the moment
  spending or posting stops.
- **Revenue has one leg:** First Session → pack conversion, and it is not directly measurable yet.
- **Post-session materials are hand-authored**, so session throughput is capped by the operator's
  writing time. This is the first thing that breaks if the business works.
- **Under-13 support carries legal exposure.** The COPPA stack must be reviewed by a lawyer before
  launch; this document is not legal advice.
- **Solo-tutor schema** requires a migration if a second tutor is ever hired.
