# Changelog

Meaningful completed changes only (not a raw command log).

## 2026-07-11 — M1: practice questions (TASK-PRACTICE-001)

- **Questions schema + answer secrecy.** Migration `0002_questions.sql`: `questions` table keyed to
  in-repo lessons by `lesson_slug` (ADR-001), with per-type shape constraints (mcq/numeric/free).
  Rows are world-readable, but **column-level grants** withhold `answer`/`tolerance`/`explanation`
  from the `anon`/`authenticated` roles — the auto-check secret is readable only by trusted server
  code via the service role, so it never reaches the client (AT-PRACTICE-005). `supabase/seed.sql`
  seeds 5 questions across the two Geometry lessons.
- **Answer-checking (`src/lib/practice/*`).** Pure `checkSubmission` — mcq exact-match, numeric
  equality within tolerance, free-response reveal (no grade); non-numeric input throws
  `MalformedSubmissionError` (REQ-PRACTICE-003). `getLessonQuestions` reads presentational columns
  via a cookieless anon client (safe in static generation; returns `[]` on error so lessons still
  render). `checkAnswer` server action reads the full row via the service role, checks, and returns
  a discriminated `{ ok, isCorrect, explanation } | { ok:false, code, message }`. Anonymous in M1 —
  no attempt recorded (that's TASK-PROGRESS-001).
- **UI.** Interactive `PracticeQuestions` client component under each lesson: MCQ radios, numeric
  input with inline validation, free-response reveal; accessible (fieldset/legend, aria-live), navy/
  gold styling.
- **Verification.** 10 new tests (pure checking ×7; answer-secrecy grant + slug-integrity ×3).
  Against a local Supabase stack: anon is denied the `answer` column (HTTP 401) while service role
  reads it; served lesson HTML shows prompts/choices with no answer/explanation leaked. `next build`
  clean and degrades gracefully when the table is absent. **Follow-up:** migration 0002 + seed still
  need applying to the remote Supabase projects (see STATUS) — verified locally only.
- **Docs.** Updated `08_API_CONTRACTS` (checkAnswer return shape + M1 anonymous scope) and
  `13_COVERAGE_MATRIX`.

## 2026-07-10 — M1: content pipeline (TASK-CONTENT-001)

- **MDX + KaTeX pipeline + Learning Path.** Added `src/lib/content/*`: a filesystem-driven catalog
  builder (`getCatalog/getCourse/getTheme/getLesson/...`) that reads in-repo MDX + `_meta.json`
  into an ordered Course→Theme→Lesson tree (ADR-001), validating slug uniqueness and
  slug/filename match at build; and a server-side MDX renderer (`@mdx-js/mdx` + `remark-math` +
  `rehype-katex`) that emits math as static HTML — no client JS for primary content
  (NFR-PERF-001).
- **Routes (all SSG/SSR, public).** `src/app/(content)/courses` catalog, `/courses/[course]`
  themes+lessons, `/courses/[course]/[theme]/[lesson]` lesson with prev/next path navigation;
  shared `(content)/layout.tsx`. Global `not-found.tsx` returns 404 with links back into the
  Learning Path (AT-CONTENT-002).
- **SEO (NFR-PERF-003).** Per-page title/description/canonical metadata + `metadataBase`;
  `sitemap.ts` (landing, catalog, every course + lesson) and `robots.ts`; semantic-heading lesson
  prose styling.
- **Seed content.** A real 2-lesson Geometry slice (`content/geometry/foundations/*`) to prove the
  pipeline end-to-end; the full slice is authored in TASK-CONTENT-002.
- **Verification.** 10 unit/integration tests (`content.test.tsx`); `next build` clean with content
  pages prerendered; served HTML confirmed to carry prose + KaTeX + SEO metadata; unknown slug →
  404. **Open:** NFR-PERF-002 Lighthouse lab run pending a deployed preview (met structurally).
- **Docs.** Recorded the course/theme `_meta.json` metadata convention as an ADR-001 follow-up;
  updated `13_COVERAGE_MATRIX.md`.

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
