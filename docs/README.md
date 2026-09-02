# Provable Learning v2 — Documentation

This is the **layered documentation tree** (`TASK-SPEC-004`). It does not compete with `/spec` —
`/spec` stays the single source of truth for requirements, contracts, and acceptance criteria
(`spec/00_README.md`'s rule: information lives in exactly one place). This tree is the **narrative
and navigation layer on top of it**: it exists to make onboarding, refinement, and extension fast
by walking a reader through *how the system actually behaves*, in the order a new engineer would
need to learn it, citing spec IDs (`REQ-*`, `F*`, `AT-*`, `ADR-*`) instead of restating them.

If a journey or component doc here ever disagrees with `/spec`, `/spec` wins — fix this tree, not
the other way around (see `spec/00_README.md`'s conflict authority order).

## Layer model

| Layer | File / dir | Answers | Audience |
|---|---|---|---|
| **L0** Business | [00-business.md](00-business.md) | What do we sell? What promises does the system make? | Anyone |
| **L1** Context | [01-context.md](01-context.md) | Who uses the system? What does it depend on? What journeys exist? | Anyone touching the system |
| **L1′** Invariants | [02-invariants.md](02-invariants.md) | What must always be true, and what enforces it? | Engineers + reviewers |
| **L2** Journeys | [journeys/](journeys/) | How does each actor-intent arc work end-to-end, including failure paths? | Engineers + product |
| **L3** Components | [components/](components/) | What does each built code module actually do? | Engineers |
| **L4** Verification | `src/**/*.test.ts` | Do the invariants and components actually hold? | CI + engineers |
| **ADRs** | [../adr/](../adr/) | Why was a load-bearing decision made? (append-only) | Anyone wanting "why" |

The chain reads top to bottom: **L0 capabilities** are realized by **L2 journeys**, which depend on
**L1′ invariants** and are implemented by **L3 components**, verified by **L4 tests**. `spec/` is
the detailed backing store for every layer above L3; this tree is how you find your way into it.

## Reading order for onboarding

1. `00-business.md` — what the system sells and to whom (5 min).
2. `01-context.md` — actors, external dependencies, the full journey catalog with build status.
3. `02-invariants.md` — the handful of facts that must never break, and the traps that look like
   bugs but are deliberate.
4. Pick the journey you're touching from `journeys/` — each cites the `REQ-*`/`AT-*` IDs and the
   `components/` file(s) that implement it.
5. Read the linked `components/*.md` for the actual module, then the code itself.
6. For "why is it built this way," check `../adr/` before assuming it's an accident.

For an audit view (what's built vs. not, per capability), use `spec/13_COVERAGE_MATRIX.md` — this
tree explains *how things work*, the coverage matrix tracks *what's done*.

## Journey catalog (status)

A journey is an actor pursuing an intent, including read-only ones (this project's journeys are
few enough — 13 — that splitting "read" from "write" journeys added lookup cost without adding
value; unlike the archived v1 doc system, which drew that line).

| # | Journey | Actor | Status |
|---|---|---|---|
| F1 | [Read a lesson](journeys/f1-read-a-lesson.md) | Visitor | ✅ built |
| F2 | [Explore the roadmap](journeys/f2-explore-the-roadmap.md) | Visitor | ✅ built |
| F3 | [Sign in](journeys/f3-sign-in.md) | Visitor → Buyer | 🟡 code-complete, not live-verified |
| F4 | [Saved progress](journeys/f4-saved-progress.md) | Buyer | 🟡 code-complete, not live-verified |
| F5 | [Buy the First Session](journeys/f5-buy-the-first-session.md) | Buyer | 🟡 code-complete, not live-verified |
| F6 | [Strengths & weaknesses assessment](journeys/f6-assessment.md) | Learner (alone) | 🟡 code-complete, not live-verified |
| F7 | [Buy credit packs](journeys/f7-buy-credit-packs.md) | Buyer | 🟡 code-complete, not live-verified |
| F8 | [Book a session](journeys/f8-book-a-session.md) | Buyer | 🟡 code-complete, not live-verified |
| F9 | [Cancel or reschedule](journeys/f9-cancel-or-reschedule.md) | Buyer | 🟡 code-complete, not live-verified |
| F10 | [No-show & credit return](journeys/f10-no-show-and-credit-return.md) | Buyer + Admin-Tutor | 🟡 code-complete, not live-verified |
| F11 | [Operator: availability](journeys/f11-operator-availability.md) | Admin-Tutor | 🟡 code-complete, not live-verified |
| F12 | [Operator: session day](journeys/f12-operator-session-day.md) | Admin-Tutor | 🟡 code-complete, not live-verified |
| F13 | [Operator: refunds](journeys/f13-operator-refunds.md) | Admin-Tutor | 🟡 code-complete, not live-verified |

Status mirrors `spec/13_COVERAGE_MATRIX.md` as of 2026-08-14; re-check that file for the current
truth rather than trusting this table blindly if it's been a while.

## Component catalog (built only)

Only modules that actually exist get a component doc — a doc for an unbuilt module would be
speculative design, which belongs in `spec/10_BACKEND.md` / `spec/12_IMPLEMENTATION_PLAN.md`, not
here. As modules land, add a file here.

| Component | Code | Journeys it serves |
|---|---|---|
| [Content pipeline](components/content-pipeline.md) | `src/lib/content/*`, `src/app/(content)/**` | F1, F2 |
| [Practice questions](components/practice.md) | `src/lib/practice/*` | F1 |
| [Roadmap viewer](components/roadmap-viewer.md) | `src/components/roadmap/*`, `src/app/roadmap/*` | F2 |
| [Auth](components/auth.md) | `src/lib/auth/*`, `src/app/(auth)/**`, `src/proxy.ts` | F3 |
| [Accounts & profiles](components/accounts.md) | `src/lib/accounts/*`, `src/app/(account)/**` | F3, F4 |
| [Pricing config](components/pricing.md) | `src/lib/pricing.ts` | F5, F7 |
| [Supabase clients](components/supabase-clients.md) | `src/lib/supabase/*` | all of the above |
| [Credits & wallet](components/credits.md) | `src/lib/credits/*` | F7 |
| [Billing](components/billing.md) | `src/lib/billing/*` | F5, F7 |
| [Booking](components/booking.md) | `src/lib/booking/*` | F8, F9, F10 |
| [Notify](components/notify.md) | `src/lib/notify/*` | F5, F7, F8 |
| [Admin](components/admin.md) | `src/lib/admin/*` | F11, F12, F13 |
| [Assessment](components/assessment.md) | `src/lib/assessment/*` | F5, F6 |

## Extending this tree

- **New journey** (new user-facing capability): add a row to `spec/05_FLOWS.md` with the next
  `F<n>` id, then a matching `journeys/f<n>-*.md` here, then link it into the table above.
- **New component** (new built module): add a `components/*.md` once the module exists — not
  before, and keep it describing what the code does, not what it should do.
- **Changed invariant or trap**: update `02-invariants.md` in the same change that touches the
  behavior. This file rotting is the single most expensive failure mode of a doc tree like this —
  a stale invariant doc is worse than none, because it's trusted.
