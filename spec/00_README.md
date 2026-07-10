# Specification System — Read Me First

This `/spec` tree is the **source of truth** for Provable Learning **v2**. Code is downstream
of these documents, not the other way around. If code and a higher-authority document
disagree, the document wins and the conflict is reported — never silently reconciled by
editing the document to match the code.

> v2 is a fresh math-courses platform replacing the frozen v1 SAT ops platform (archived on
> branch `v1-sat`; `docs/v2-plan.md` is a pre-spec sketch, **superseded by this tree**).

## Purpose

Keep six things consistent and traceable: product intent → requirements → design →
implementation tasks → code → tests. Each artifact has ONE responsibility. Information lives
in exactly one place and is referenced elsewhere by **stable ID**, never duplicated.

## Reading / build order

| # | File | Responsibility |
|---|------|----------------|
| 00 | `00_README.md` | This file — how the system works |
| 01 | `01_PRD.md` | Product purpose, users, scope, success criteria (high-level, no tech) |
| 02 | `02_GLOSSARY.md` | Canonical domain terms; used consistently everywhere |
| 03 | `03_REQUIREMENTS.md` | Precise, testable system obligations (`REQ-*`, `NFR-*`) |
| 04 | `04_ACTORS.md` | Every person/system that interacts; goals, permissions, restrictions |
| 05 | `05_FLOWS.md` | End-to-end actor behavior incl. failure paths (`FLOW-*`) |
| 06 | `06_ARCHITECTURE.md` | System context, modules, boundaries, deployment, observability |
| 07 | `07_DATA_MODEL.md` | Entities, relationships, constraints, invariants, lifecycles |
| 08 | `08_API_CONTRACTS.md` | Interfaces (FE↔BE, module↔module, external) |
| 09 | `09_FRONTEND.md` | Routes, pages, components, states, validation, a11y |
| 10 | `10_BACKEND.md` | Modules, use cases, services, transactions, integrations |
| 11 | `11_ACCEPTANCE_TESTS.md` | Observable Given/When/Then tests (`AT-*`) |
| 12 | `12_IMPLEMENTATION_PLAN.md` | Small ordered tasks with a definition of done (`TASK-*`) |
| 13 | `13_COVERAGE_MATRIX.md` | Audit: requirement → flow → design → task → test → status |

Root companions: `../STATUS.md` (read first when resuming), `../CHANGELOG.md` (meaningful
changes), `../AGENTS.md` (agent operating rules), `../adr/NNN-*.md` (architecture decisions).

## How IDs and references work

- Stable ID prefixes: `REQ-<AREA>-NNN`, `NFR-<AREA>-NNN`, `FLOW-<AREA>-NNN`, `AT-<AREA>-NNN`,
  `TASK-<AREA>-NNN`, `ADR-NNN`. Areas in use: `AUTH`, `ACCT`, `CONTENT`, `PRACTICE`,
  `PROGRESS`, `CREDIT`, `BILLING`, `BOOK`, `NOTIFY`, plus NFR areas `PERF`, `SEC`, `REL`, `OPS`.
- IDs are **stable and never reused**. To retire one, mark it `DEPRECATED`, don't delete the number.
- Cross-reference by ID (e.g. "satisfies REQ-CREDIT-003, FLOW-BOOK-001"). Do not restate the
  referenced content.

## Conflict authority order

When documents disagree, higher wins:
1. Latest explicit user instruction
2. `01_PRD.md`
3. `03_REQUIREMENTS.md`
4. `11_ACCEPTANCE_TESTS.md`
5. `06_ARCHITECTURE.md` / `07_DATA_MODEL.md` / `08_API_CONTRACTS.md`
6. `09_FRONTEND.md` / `10_BACKEND.md`
7. `12_IMPLEMENTATION_PLAN.md`
8. Existing code

Existing code is **not** automatically correct. Surface conflicts up the chain; propose the
smallest correct fix; get confirmation when product behavior materially changes.

## From specification to implementation

Artifacts are built in the order above. A task in `12_IMPLEMENTATION_PLAN.md` is **ready**
only once the requirements, flows, contracts, and acceptance tests it references exist. A task
is **done** only when its definition of done is met (impl + tests passing + acceptance behavior
satisfied + coverage matrix + STATUS updated). See `../AGENTS.md` for the full procedure.

## Status

`01`, `02` drafted. `03`–`13` and `adr/` are created as each stage is reached. Current
position is tracked in `../STATUS.md`.
