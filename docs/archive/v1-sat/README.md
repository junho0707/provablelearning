# ProvableLearning Documentation

Layered, referenceable documentation for the SAT-tutoring platform. Each layer answers a different question and links to the layers above and below it.

## Layer model

| Layer | File / Dir | Answers | Audience |
|---|---|---|---|
| **L0** Business | [00-business.md](00-business.md) | What do we sell? What does the system promise? | Anyone |
| **L1** Context + glossary | [01-context.md](01-context.md) | Who uses the system? What does it depend on? What journeys does it support? | Anyone touching the system |
| **L1′** Invariants | [02-invariants.md](02-invariants.md) | What must always be true about the data? When does state transition? What enforces it? | Engineers + reviewers |
| **L2** Journeys | [journeys/](journeys/) | How does each user-intent arc actually work, end-to-end? | Engineers + product |
| **L3** Components | [components/](components/) | What does each code module / RPC / cron / webhook / page-group do? | Engineers |
| **L4** Verification | `tests/` | Do the journeys, components, and invariants actually hold? | CI + engineers |
| **ADRs** | [adr/](adr/) | Why was a load-bearing decision made? (append-only) | Anyone wanting "why" |

The layers form a chain: **L0 capabilities** are realized by **L2 journeys**, which cite **L1′ invariants** and link **L3 components**, all of which are verified by **L4 tests**.

## Build order

The doc system is being built in this order. Each step locks decisions that the next step depends on. **Don't skip ahead.**

```
1. Lock journey catalog                ← what journeys exist + who drives each
   (decisions live in this README)
        ↓
2. Lock capability list                ← 9 promises, derived from code
   (written into 00-business.md)
        ↓
3. Write L0 business doc               ← 00-business.md  [DONE]
        ↓
4. Update L1 context                   ← 01-context.md (catalog + glossary)
        ↓
5. Solidify L1′ invariants             ← 02-invariants.md (numbered, stable IDs)
        ↓
6. Write biz journey docs              ← journeys/<n>.md, plain English, one per
   (one per of 13 journeys)               of 13 journeys; opens with capability ref
        ↓
7. Write tech journey docs             ← same files (or split into journeys/tech/);
                                          domain language, cites invariant IDs,
                                          links L3 components
        ↓
8. Write L3 components                 ← components/*.md, one per code module
   (~10 already exist)
        ↓
9. Build L4 verification               ← tests/
   - E2E tests ← journey scenarios
   - integration tests ← component contracts
   - unit tests ← invariants
```

## Locked decisions

These are settled. If you want to change one, write an ADR.

### What counts as a journey

A journey is **an actor pursuing an intent that changes system state OR moves them between actors/roles.** Pure read-only flows are documented as components, except where the journey is specifically about authorization (e.g., *View my data* tests "the right person sees the right rows").

### Actor × journey rule

**Dependent students do logistics; parents own money.** Specifically:

- Dependent student CAN: view their data, message the tutor (via independent thread), cancel a session, book a makeup, cancel a makeup, redeem a credit.
- Dependent student CANNOT: enroll (commits money), end enrollment (refund implications), manage the family, book a consultation.

This is the line: **does this action create, end, or refund a payment commitment, or change family structure?** If yes → parent-only.

### Bundling rule for journeys

A multi-step user flow is **one journey doc** if all scenarios share the same **trigger** AND the same **terminal observable state-change category**. Otherwise split. Example: *Cancel a session* / *Cancel a makeup* / *Redeem a credit* are three journeys, not one "Manage attendance" bundle.

### Locked journey catalog (13)

| # | Journey | Actors | Capability |
|---|---|---|---|
| 1 | Discover & sign up | Visitor → Parent / Student (ind) | 5 |
| 2 | Family management | Parent | 3 |
| 3 | View my data | Parent / Student (dep) / Student (ind) | 2, 3 |
| 4 | Messaging | Parent / Student (ind) / Admin | 4 |
| 5 | Enroll | Parent / Student (ind) | 1 |
| 6 | Cancel a session | Parent / Student (dep) / Student (ind) | 1 |
| 7 | Cancel a makeup | Parent / Student (dep) / Student (ind) | 1 |
| 8 | Redeem a credit | Parent / Student (dep) / Student (ind) | 1 |
| 9 | End enrollment | Parent / Student (ind) | 1 |
| 10 | Book ad-hoc | Visitor / Parent | 5 |
| 11 | Run classes | Admin | 6 |
| 12 | Handle students | Admin | 2, 6 |
| 13 | Operate | Admin | 6 |

### Locked capability list (6)

See `00-business.md` for the full text. One-line summaries:

1. **Enrollment** — buy, wait-list, cancel session, makeup/credit, drop — full lifecycle of a standing slot
2. **Learning record** — attendance + homework per session, visible to family
3. **Family** — parent manages children + oversees their data
4. **Communication** — notifications + messaging
5. **Acquisition** — public site → consultation → signup → onboarding
6. **Operations** — admin manages supply, cases, and the paper trail

### Unit of value

A "standing tutoring appointment": one recurring weekly slot (or two, for SG / 1:1), paid month-by-month, with makeup logic to reclaim missed sessions. Pricing: LG $20, SG $300 (1–3 students per slot), 1:1 $600.

## Open questions

These are not yet locked. Resolve them before writing the journey docs.

- **Q4 — Journey doc template.** `journeys/enroll.md` is the working reference (Actors & trigger → Participants → Sequence → Touched entities → Scenarios). Open: should "Negative scenarios" be a mandatory separate subsection? Should "Invariants checked" be required per scenario?
- **Q5 — Cross-cutting concerns.** Where do side effects that touch every journey (notifications, audit logs, RLS) live — in each journey doc, or in dedicated component specs that every journey links? Current default: cross-cutting concerns are L3 components, linked from journeys as participants.
- **Biz vs tech split.** Should each journey have two files (biz / tech) or one file with both layers stacked? Current `enroll.md` is tech-only; the biz layer doesn't exist yet.

## Conventions

**Invariants are numbered.** `I-1`, `I-2`… global IDs. Journey scenarios cite them by ID under "Invariants checked". When you change an invariant, search for its ID across journeys.

**Triggers, not journeys, drive non-user state changes.** Crons (`vercel.json`) and Stripe webhooks are documented in `02-invariants.md` as transition triggers under the entity lifecycle they enforce — not as journey files.

**Scenarios are markdown prose.** Each scenario in a journey file is a `### heading` with: Preconditions / Actions / Expected / Invariants checked.

**L2 journey file structure:** Actors & trigger → Participants (links into `components/`) → Sequence → Touched entities → Scenarios.

**L3 component entry:** Purpose → Inputs / outputs / side effects → File paths → Journeys that use it.

## Reading order

- **New contributor:** `00-business.md` → `01-context.md` → `02-invariants.md` → `journeys/enroll.md`, then breadth-first.
- **Debugging a flow:** jump to the relevant journey; cross-reference invariants and components.
- **Considering a schema or RPC change:** check `02-invariants.md` first to see what depends on the current shape.

## Update rule

When code changes, the docs change in the same PR:

- New / changed RPC, cron, webhook, page route → update or add the matching `components/*.md`.
- Behavior change in a flow → update the journey file's scenario list.
- New constraint, transition, or trigger → update `02-invariants.md` and bump invariant numbers if needed.
- New external service or actor → update `01-context.md`.
- New capability or change to what the system sells → update `00-business.md` AND write an ADR.

CLAUDE.md at the repo root captures this rule for assistants.
