# ADR-005 — "Math Diagnosis" becomes "First Session"; assessment is conditional on goal

- **Status:** Accepted (2026-08-14)
- **Deciders:** Owner (Admin-Tutor), agent
- **Related:** `spec/14_GROUND_TRUTH_INTERVIEW.md` §1, §6, §14–§17 (amended/added by this ADR)
- **Amends:** **ADR-003** — renames the P3 SKU, adds a one-per-customer constraint, and replaces the
  unconditional placement assessment with a goal-dependent one. Prices are unchanged ($49).

## Context

ADR-003 specced P3 as a "Math Diagnosis": buy → online placement assessment → 60-minute session →
PDF report + study guide, in that order, for everyone.

Two problems surfaced when the landing copy was drafted against it.

**The name excludes most of the market.** "Diagnosis" presumes something is wrong. It fits a
struggling student and actively repels the other two audiences the product is meant to serve — the
student who wants to get *ahead*, and the SAT/ACT test-prep buyer. Deficit framing also makes
parents defensive and gives teenagers a reason to refuse the assessment.

**A universal pre-assessment is wrong for one of the three goals.** For a student who simply wants
help with the class they are currently taking, a pre-test produces nothing actionable — the goal is
already known, and the hour is better spent teaching. Requiring it would burn goodwill and build
time for no signal.

Separately, at $49 against a $75 single credit, the discount had no stated justification. Framing it
as a *first* session — the thing you buy before you buy a pack — explains the price and makes the
credit-pack upsell the natural next step.

## Decision

**1. The SKU is renamed "First Session."** $49, versus the $75 single credit. Diagnosis becomes one
*mode* of it, not the whole product.

**2. One per customer, enforced in billing.** A prior First Session blocks the SKU; repeat buyers
are routed to credit packs. Without enforcement, nobody would ever rationally pay $75 for one
session.

**3. The buyer states a goal at purchase, and the goal selects the mode:**

| Mode | Pre-session assessment |
|---|---|
| Strengths & weaknesses | Student picks their current math class; questions drawn from roadmap nodes at or below it |
| Test prep (SAT / ACT) | A dedicated practice test, authored per test |
| Taking a class / year ahead | **None** — straight to the session |

**4. Strengths & weaknesses uses "probe and descend."** One probe per major node in the prerequisite
closure, foundational first; a correct probe marks that subtree solid and skips it; a wrong probe
descends into that node's prerequisites to find the true floor; 2–3 questions near the current
class; hard cap ≈25 questions.

**5. Deliverable is a written plan within 48 hours** of the session (copy commitment, not enforced).

**6. Copy frames strengths and next steps, never deficits.**

## Consequences

- **Positive — one product serves three audiences** without pretending they are the same, and
  without building three SKUs.
- **Positive — the $49 price is now explicable** and the upsell path to credit packs is obvious.
- **Positive — the conditional assessment removes work**: the largest of the three modes by expected
  volume ("help me with my class") needs no assessment at all.
- **Positive — probe-and-descend is mostly existing code.** Questions are already tagged to roadmap
  nodes by `lesson_slug` (ADR-001/002), and `src/lib/content/layout.ts` already computes transitive
  prerequisite chains for the map's dimming behavior. The traversal is largely built.
- **Trade-off — adaptive logic is real work.** Probe-and-descend is more than a fixed question list:
  it branches on answers and needs its own tests. It was chosen over a flat 20-question set because a
  flat set either bores a strong student or under-covers a weak one across a K–12 span.
- **Trade-off — test-prep sets are hand-authored** per test and do not benefit from the roadmap
  generation. Accepted: SAT/ACT question style differs enough from curriculum questions that
  generating them from nodes would produce a bad practice test.
- **Schema consequence — `roadmap/roadmap.json` needs selectable course-level nodes** ("Algebra 1",
  "Geometry") so a student can name their current class. Regions and concepts exist; a course marker
  does not. This is additive.
- **Billing consequence** — purchases now carry a goal and a mode, and the one-per-customer rule
  needs a prior-purchase check in the checkout path.
