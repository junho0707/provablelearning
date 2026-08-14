# ADR-003 — v3 product model: paid content, tripwire pricing, solo tutoring

- **Status:** Accepted (2026-08-14)
- **Deciders:** Owner (Admin-Tutor), agent
- **Related:** `spec/14_GROUND_TRUTH_INTERVIEW.md` (ground truth this records), ADR-001 (content
  model — unchanged), ADR-002 (roadmap-driven structure — unchanged)
- **Supersedes:** the free-content premise, 45-minute credit unit, Parent/Dependent account shapes,
  and CON6 acquisition story in `spec/01_PRD.md`; closes **D2/OQ1** (pricing) and **OQ3** (domain);
  **defers** CON3/OQ2 (minors' consent)

## Context

`spec/01_PRD.md` described a business that gave content away to acquire cold organic search traffic
and monetized 45-minute tutoring credits, with separate Parent and Dependent logins. A ground-truth
interview on 2026-08-14 established that this is not the business being built. A second interview
pass the same day resolved the pricing and operational questions that the first pass had left as
placeholders, which is what makes the model buildable rather than merely decided.

The first pass left one hard blocker (**D2**, credit-pack tiers) that gated every payment task, and
several operational unknowns — tutor supply, availability mechanics, email transport, refund
policy — each of which changes the data model or the integration surface.

## Decision

**1. Three one-time SKUs, priced as a tripwire funnel.**

| SKU | Price | Per session |
|---|---|---|
| Course "Math up to Geometry" (single SKU, not per-region) | $19.99 | — |
| Math Diagnosis | $49 | — |
| 1 credit | $75 | $75.00 |
| 2 credits | $120 | $60.00 |
| 4 credits | $200 | $50.00 |
| 8 credits | $350 | $43.75 |

**2. Credit packs are the entire revenue line.** At $19.99 and $49, content and diagnosis are both
deliberately near-breakeven acquisition offers. The paywall is lead capture; the booking system is
the business.

**3. Solo tutor.** No tutor entity in the schema. Availability is a single recurring weekly template
plus exceptions. Slots stored UTC, rendered in the visitor's browser time zone.

**4. Passwordless auth.** Google OAuth + email magic link only.

**5. Google Calendar is written to, never read from.** Meet links are generated per booking *after*
the booking transaction commits.

**6. Resend** for transactional email; Supabase's mailer retained only for auth links.

**7. No self-serve refunds.** Manual Stripe refunds paired with an admin credit-adjustment action so
the ledger cannot drift from Stripe.

**8. Sample lessons are frontmatter-flagged** (`sample: true`), not hardcoded.

**9. v1 ships the paywall over an empty shelf.** Course-purchase and gating infrastructure is built
at launch; the lessons behind it are authored afterward as pure content work.

## Consequences

- **Positive.** D2 is closed, unblocking every payment and booking task. Dropping the tutor entity,
  passwords, and self-serve refunds removes three subsystems from the launch build. Writing to
  Google Calendar without reading from it keeps an external outage off the critical booking path.
  Shipping the paywall before the content means the long authoring pole no longer gates launch.
- **Trade-off — solo tutor.** Adding a second tutor later is a genuine schema migration
  (availability and bookings both gain a tutor dimension). Accepted knowingly: paying for that
  flexibility now would cost more than the migration will.
- **Trade-off — margin.** A $19.99 course and a $49 diagnosis will not cover paid-ad spend on their
  own. The model only works if diagnosis buyers convert to credit packs; that conversion rate is the
  single number to instrument first after launch.
- **Trade-off — no self-serve refunds.** Cold paid traffic to a $49 offer with a manual refund path
  raises chargeback exposure. Mitigated by a clearly published policy, not by code.
- **Risk — unearned-credit liability.** Credits never expire (§5 of spec/14) and an 8-pack is $350
  paid up front. This is deferred revenue against future hours of the owner's own time; it needs
  watching, not code.
- **Deferred, not resolved.** CON3/OQ2 (minors' consent) stays deferred because learner profiles
  carry no credentials. It returns the moment a profile becomes a real login — so the schema keeps
  owner identity separate from learner identity, making that upgrade additive.
