# AGENTS.md — Operating rules for coding agents

Provable Learning **v2** is built spec-first. `/spec` is the source of truth; code is
downstream. Read this before doing any work.

**Ground truth is `spec/14_GROUND_TRUTH_INTERVIEW.md`, as amended by ADR-003/004/005.** The rest of
`spec/` was rewritten against it on 2026-08-14 and is current.

## Start of every work session

1. Read this file.
2. Read `HANDOFF.md` — decision history, deliberate absences, and traps. Read it before touching
   anything; several things that look like gaps are decisions.
3. Read `STATUS.md` — it holds the current position, blockers, and next task.
4. Read the current task in `spec/12_IMPLEMENTATION_PLAN.md`.
5. Read every `REQ-*`, `FLOW-*`, contract, `AT-*`, and design section that task references.
6. Inspect the existing code before proposing changes.
7. Identify inconsistencies or missing information **before** implementing.

## While implementing

1. One implementation task at a time.
2. Follow the existing architecture and dependency direction.
3. Do **not** silently change requirements.
4. Do **not** weaken acceptance tests to make an implementation pass.
5. Do **not** invent business rules without documenting them (add a `REQ-*`, get confirmation
   if product behavior materially changes).
6. Keep changes scoped to the current task unless a dependency forces otherwise.
7. Add/update automated tests with the implementation.
8. Run the relevant tests.
9. Report any tests not run, and why.

## Finishing a task

A task is **not** done because code exists. Done requires:
1. Implementation complete.
2. Relevant unit + integration tests passing.
3. Acceptance behavior (`AT-*`) satisfied.
4. Contracts updated if the interface changed.
5. `spec/13_COVERAGE_MATRIX.md` updated.
6. `STATUS.md` updated.
7. `CHANGELOG.md` updated if the change is meaningful.
8. An ADR created/updated if a significant architectural decision was made.

Never mark a task complete while relevant tests are failing or skipped without explicit approval.

## Conflict authority order

Latest user instruction > PRD > Requirements > Acceptance tests > Architecture / Data model /
API contracts > Frontend / Backend design > Implementation plan > Existing code.

Existing code is not automatically source of truth. If lower conflicts with higher, report it
and propose the correct resolution. Do not silently edit a higher-authority doc to match code.

## Change propagation

**Requirement changes** → update `03_REQUIREMENTS.md` → affected actors/flows →
architecture/data-model/contracts/frontend/backend → acceptance tests → implementation tasks →
coverage matrix → CHANGELOG.

**API contract changes** → `08_API_CONTRACTS.md` → affected frontend/backend →
acceptance tests → implementation tasks → coverage matrix.

**Missing spec discovered during implementation** → do not guess. Name the missing decision,
recommend the smallest necessary spec update, get confirmation when it materially affects
product behavior.

## When to write an ADR

Create `adr/NNN-*.md` when a decision affects multiple modules, introduces an external
dependency, is expensive to reverse, has multiple reasonable alternatives, or sets a major
architectural rule. Not for trivial implementation details. Each ADR: title, status, context,
decision, alternatives considered, consequences.

## Writing standards

Use stable IDs, explicit references, precise/testable statements, concrete success and failure
conditions. Avoid duplicated requirements, vague language ("fast", "secure", "easy" unless
defined), oversized multi-responsibility documents, undocumented assumptions, and progress
notes scattered through permanent design docs (those go in `STATUS.md` / `CHANGELOG.md`).

## Project coding guidelines

The repo's `CLAUDE.md` coding guidelines (think before coding, simplicity first, surgical
changes, goal-driven execution) apply to all implementation work.
