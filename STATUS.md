# STATUS

Read this first when starting or resuming work. See `AGENTS.md` for the operating procedure.

**Project:** Provable Learning v2 — free math courses + credit-based 1:1 tutoring.
**Branch:** `main` (fresh v2 app; v1 SAT platform frozen on `v1-sat`).
**Phase:** Implementation — **M0 scaffold COMPLETE**. Starting **M1 (content — the free
product)**. Spec `spec/00`–`13` drafted, ADR-001 accepted.

## Current task

Begin **TASK-CONTENT-001** (M1: MDX pipeline + Learning Path — render `content/**` MDX+KaTeX;
catalog → course → theme → lesson, SSR/SSG, SEO + sitemap). Refs: REQ-CONTENT-001..004,
NFR-PERF-001..003, ADR-001; AT-CONTENT-001/002/003. **Blockers to watch:** ADR-002
(auth/consent) before M2; D2 (pack tiers) before TASK-BILLING-001. Neither blocks M1.

## Completed

- Cleaned/archived agent memory; v2-focused index. v1 memory under `memory/archive/v1-sat/`.
- Ran the PRD interview; locked launch scope, account model, credits/booking model, tutor
  model, AI/lectures scope, success-criteria lens, course roadmap, minors stance.
- Wrote `spec/00_README.md`, `spec/01_PRD.md`, `spec/02_GLOSSARY.md`, `AGENTS.md`, this file,
  `CHANGELOG.md`.
- Ran a **business-truth review** (Lavish surface `.lavish/business-truth.html`). Outcomes fed
  into the PRD: acquisition = **cold organic search** (added CON6, SEO an `NFR-PERF` concern);
  wedge = **curated structured Learning Path** (not 1:1 help); positioning = math-anxious/
  beginner/supplementary/depth personas; actor terms switched to **Dependent/Independent
  Student + Parent**. No structural decisions reopened.

- **M0 scaffold (2026-07-10).** Cleared all v1 SAT code from `main` (preserved on `v1-sat`).
  Clean v2 base: ported navy/gold + Inter tokens, v2 landing + `SiteNav`, strict-mode build (no
  `ignoreBuildErrors`). Supabase clients (server/browser/admin) ported; baseline migration
  `0001_init.sql`; `content/` created; connectivity verified. See CHANGELOG.

## In progress

- M1 content pipeline (TASK-CONTENT-001) — not yet started.

## Blockers

- None for M1. ADR-002 blocks M2; D2 blocks BILLING-001 seed.

## Unresolved decisions

- **Credit-pack tiers** (OQ1 / D2) — 4/$300 base set; 8/12/16 prices + discount curve TBD before billing.
- **COPPA/consent mechanics** (CON3/OQ2) — direction = parent-consent gate; exact flow → auth ADR.
- **Domain cutover** (OQ3) — repoint apex DNS from v1 demo to v2 when launch build is ready.

## Next task

M1: `TASK-CONTENT-001` (MDX pipeline + Learning Path) → `TASK-CONTENT-002` (author the first
Geometry slice) + `TASK-PRACTICE-001` (questions + answer checking). Ship M1 to the public first.
Follow the dependency order in `spec/12_IMPLEMENTATION_PLAN.md`.

## Build / test status

- Build: **passing** (`next build`, Next 16, TS strict, no error-ignoring). Landing serves 200.
- Tests: none yet (v1 tests removed with v1 code; v2 tests land per task starting M1).
- Last meaningful verification: 2026-07-10 — M0 scaffold: build clean, prod server 200,
  Supabase `auth/v1/settings` reachable.
