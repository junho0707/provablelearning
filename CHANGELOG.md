# Changelog

Meaningful completed changes only (not a raw command log).

## 2026-07-10 — M0 scaffold

- **TASK-PROJECT-001 (app scaffold) done.** Cleared the entire v1 SAT app from `main` (v1
  preserved on the `v1-sat` branch): removed `src/app/(auth|dashboard)`, `src/app/api`,
  `src/app/{book,offerings}`, `src/components`, `src/lib`, `src/middleware.ts`, `src/__tests__`,
  and all 92 `supabase/migrations`. Rebuilt a clean v2 base: navy/gold + Inter design tokens
  ported into `globals.css` (SAT-landing-only CSS dropped), v2 metadata, minimal `SiteNav`, and a
  v2 landing (`/`) reflecting the PRD positioning (free ground-up math path + optional 1:1).
  Removed the v1 `ignoreBuildErrors` escape hatch so the build type-checks under `strict`.
  Verified: `next build` clean; prod server serves the landing (HTTP 200, design tokens present).
- **TASK-PROJECT-002 (Supabase wiring) done.** Ported the three Supabase clients
  (`src/lib/supabase/{server,client,admin}.ts`), added the schema baseline
  `supabase/migrations/0001_init.sql` (pgcrypto only; feature tables land per later task), created
  the `content/` directory. Env documented in `.env.local.example`; connectivity verified against
  the live Supabase project (`auth/v1/settings` → 200). **M0 complete.**

## 2026-07-10

- Started Provable Learning **v2** under a spec-driven workflow. Established `/spec` system:
  `00_README` (workflow rules + conflict authority + ID scheme), `01_PRD` (drafted), `02_GLOSSARY`.
- Added root `AGENTS.md` (agent operating rules), `STATUS.md` (resume-first state).
- PRD decisions locked: launch = free content + credit packs + 1:1 booking; accounts =
  parent-managed children **and** standalone adults; parent owns wallet & books for a child;
  children have their own logins; solo tutor = admin; AI tutor and group lectures out of launch
  (group lectures = named future capability); success = ship-quality/correctness gate; course
  roadmap = Geometry → Pre-Calc → Calculus; minors = parent-consent gate (detail deferred to
  auth ADR).
- Business-truth review (Lavish) refined the PRD: acquisition channel = cold organic search
  (new CON6, SEO as NFR-PERF concern); product wedge = curated structured Learning Path;
  positioning around math-anxious/beginner/supplementary/depth personas; adopted
  Dependent/Independent Student + Parent actor vocabulary (retired "Learner").
- Stage 2: wrote `spec/03_REQUIREMENTS.md` (40 `REQ-*`/`NFR-*` across 9 functional + 4 NFR
  areas). Resolved decisions: free-response = self-checked (D1); refunds admin-only (D3);
  cancel ≥24h → credit back, <24h forfeit (D4); Google Calendar + Meet per session (D5); email
  reminders 24h+1h, no SMS (D6). D2 (pack tiers) deferred to billing.
- Stages 3–4: wrote `spec/04_ACTORS.md` (Visitor, Independent/Dependent Student, Parent,
  Admin-Tutor + external systems + capability matrix) and `spec/05_FLOWS.md` (core launch arcs
  with explicit failure/concurrency paths for billing & booking).
- Stage 5: locked architecture forks — hybrid content model (**ADR-001**: MDX-in-repo +
  questions-in-DB), fresh app porting v1 modules, Next+Supabase SSR, single repo. Wrote
  `spec/06_ARCHITECTURE.md` (modules, trust boundaries, critical-path flows, failure boundaries)
  and `spec/07_DATA_MODEL.md` (entities, RLS, INV-1..7 invariants, RPC transaction boundaries).
- Stage 6: completed the spec tree — `08_API_CONTRACTS` (SA/RH/RPC contracts, error model),
  `11_ACCEPTANCE_TESTS` (AT-* Given/When/Then covering S1–S8, incl. concurrency/idempotency),
  `12_IMPLEMENTATION_PLAN` (M0–M5 TASK-* with DoD + dependency order), `13_COVERAGE_MATRIX`
  (requirement→flow→design→task→test trace), and light `09_FRONTEND`/`10_BACKEND`.
  **Specification phase complete; ready for implementation at M0.** Open blockers: ADR-002
  (before M2), D2 pack tiers (before BILLING-001).
