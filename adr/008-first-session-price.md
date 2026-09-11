# ADR-008 — The First Session is $25

- **Status:** accepted
- **Date:** 2026-09-03
- **Amends:** ADR-003 (which set the price), ADR-005 (which named the SKU), ADR-007 (which made it
  per student). Everything else in those decisions stands.

## Context

ADR-003 priced the First Session at **$49** against a $75 single credit, and ADR-005 kept that price
while renaming the SKU. The discount was justified as a tripwire: a cheap, low-commitment first
purchase whose job is to convert into a credit pack, not to make money on its own.

`system/00-BUSINESS.md` §4 has recorded the standing risk since: **the tripwire only works if paid
CAC lands well under the price**, and no CAC has ever been measured. At $49 the offer is only a
mild discount on $75 — a 35% saving. That is small enough that a buyer weighing it is still making
a "is this worth $49" decision rather than a "why not" decision, which is the whole point of a
tripwire.

Nothing has launched, so nothing has been sold at $49. The cost of changing the number is a config
edit and a new Stripe price; the cost of discovering after launch that $49 was too high is a cohort
of visitors who bounced.

## Decision

**The First Session is $25.** One per student, unchanged in every other respect: still a 60-minute
1:1 session shaped to a stated purpose, still with pre-session preparation and post-session
materials, still the event that records parental consent (ADR-007 §4).

Credit-pack pricing is **unchanged** — 1/$75 · 2/$120 · 4/$200 · 8/$350.

## Consequences

**The discount becomes the offer.** $25 against $75 is a two-thirds saving, which reads as an
obvious yes rather than a small discount. That is what a tripwire is supposed to feel like.

**The margin on a First Session is now clearly negative once CAC is counted**, and that is
deliberate — it was already the intent at $49, just less starkly. It sharpens the risk in
`00-BUSINESS.md` §4 rather than resolving it: revenue still has exactly one leg, First Session →
credit-pack conversion, and that conversion rate is still unmeasured. **If conversion is weak, a
lower price loses money faster.** This decision buys funnel volume at the cost of a shorter runway
to find out.

**It widens the gap the buyer must cross on the second purchase**, from $49→$75 to $25→$75. A buyer
anchored at $25 may find $75 steeper than one anchored at $49. This is the strongest argument
against the change and it is accepted, not answered: the bet is that a session that went well
re-anchors the buyer on the value of the session, not on the previous price.

**Operationally**, Stripe prices are immutable, so this requires a **new price object** in both test
and live mode and a new `STRIPE_PRICE_FIRST_SESSION` in `.env.local` and in Vercel. The preflight
check asserts the price the code expects matches the price Stripe holds, so a half-done cutover
fails loudly rather than charging the wrong amount.

**No code path changes.** The number lives in `src/lib/pricing.ts` and reaches every surface —
landing page, checkout, legal pages — by import, so nothing had to be retyped and the drift test
continues to bind the code to `00-BUSINESS.md` §1.
