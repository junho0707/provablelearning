# ADR-004 — Course content is free; progress-saving replaces the paywall

- **Status:** Accepted (2026-08-14)
- **Deciders:** Owner (Admin-Tutor), agent
- **Related:** `spec/14_GROUND_TRUTH_INTERVIEW.md` §1–§3, §11, §13 (amended by this ADR)
- **Amends:** **ADR-003** — withdraws the $19.99 course SKU, the entitlement/paywall subsystem, and
  the `sample: true` frontmatter flag. Everything else in ADR-003 (credit prices, diagnosis price,
  solo tutor, auth, Calendar/Meet, Resend, refunds, domain) stands unchanged.
- **Effectively restores:** CON6 (free content is the funnel), which spec/14 had retired

## Context

ADR-003 priced the course at $19.99 and specced the paywall to ship at launch over a near-empty
shelf, with content authored afterward. Two problems surfaced immediately after it was accepted.

**A paid SKU creates a delivery obligation.** Selling "Math up to Geometry" while most of the arc is
unauthored is under-delivery, whatever the price. That obligation silently reinstates the very
constraint the empty-shelf plan existed to escape: the course must actually be finished before it
can honestly be sold. Free content carries no such obligation — a partial catalog is simply a
catalog that is still growing.

**The paywall works against the stated acquisition channel.** Acquisition is cold organic search
(spec/14 §3). Under ADR-003 the indexable surface was the roadmap plus 3–5 sample lessons; the rest
was gated. That is a very small footprint for an SEO-led business, and gating also pushes lesson
pages from static to per-user dynamic, degrading the Core Web Vitals and crawlability the content
pipeline was built for.

Against that, $19.99 × expected volume is immaterial next to credit packs, which ADR-003 already
established as effectively the entire revenue line.

## Decision

**1. All course content is free and public.** No purchase, no account required to read any lesson,
its examples, practice questions, solutions, or worksheets.

**2. The $19.99 course SKU is withdrawn.** Two products remain: tutoring credits and the $49 Math
Diagnosis.

**3. The entitlement/paywall subsystem is not built.** `TASK-ENTITLE-001` is removed from the plan —
no entitlements table, no gating, no buy prompts, no course Stripe product.

**4. Lead capture moves to "sign in to save your progress."** A free account with learner profiles,
backed by `TASK-PROGRESS-001` (already wanted independently). It captures the email without hiding
anything from crawlers or from visitors.

**5. The `sample: true` flag is dropped.** With every lesson public there is nothing to promote.

**6. Lesson pages stay fully static.** No per-user gating means the SSG/KaTeX/CWV design of
`TASK-CONTENT-001` is preserved intact.

## Consequences

- **Positive — authoring is decoupled from launch.** A half-built catalog is honest. Unbuilt roadmap
  nodes read "coming soon," which they already do. Nothing about content authoring gates shipping.
- **Positive — the SEO surface becomes the whole catalog** and compounds with every lesson authored,
  instead of being frozen at 3–5 samples.
- **Positive — scope falls off the critical path.** Entitlements, gating, buy prompts, a Stripe
  product, and the sample flag all disappear; booking, which carries the revenue, gets the attention.
- **Positive — pages stay static**, preserving CWV (NFR-PERF-002) and crawl behavior.
- **Trade-off — free content competes with Khan Academy**, which is free, vast, and established.
  Accepted knowingly: the differentiator is not lesson volume but the **roadmap skill tree**, which
  is strictly better when every node is clickable rather than mostly locked.
- **Trade-off — a weaker qualification signal.** A $19.99 buyer was marginally more likely to buy
  credits than an anonymous reader. Replaced by a softer but broader signal: account sign-up and
  saved progress, which reaches far more people.
- **Trade-off — reversal cost.** Introducing a paywall later means charging for something previously
  free, which invites backlash and would need grandfathering. This is a real one-way-ish door; it was
  chosen deliberately over the delivery-obligation risk in the other direction.
- **Risk — no content revenue at all.** Revenue is now credits plus a near-breakeven diagnosis. The
  **diagnosis → credit-pack conversion rate is the single number to instrument first** after launch;
  if it is weak, the model has no second leg to stand on.
