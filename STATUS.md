# STATUS

Read this first when starting or resuming work. See `AGENTS.md` for the operating procedure.

**Project:** Provable Learning v2 — free math courses + credit-based 1:1 tutoring.
**Branch:** `main` (fresh v2 app; v1 SAT platform frozen on `v1-sat`).
**Phase:** Implementation — **M0 scaffold COMPLETE**. Starting **M1 (content — the free
product)**. Spec `spec/00`–`13` drafted, ADR-001 accepted.

## Current task

**M1 in progress.** Done: **TASK-CONTENT-001** (MDX pipeline + Learning Path), **TASK-PRACTICE-001**
(questions + answer checking, anonymous). Next up: **TASK-CONTENT-002** (author the full Geometry
slice). **Blockers to watch:** ADR-002 (auth/consent) before M2; D2 (pack tiers) before
TASK-BILLING-001. Neither blocks M1.

**Open follow-ups (do not lose):**
1. **NFR-PERF-002 Core Web Vitals lab run** — pages are static + KaTeX-rendered server-side (no math
   CLS, next/font, minimal JS) so they meet CWV structurally, but a Lighthouse run on a deployed
   preview is the honest confirmation; not done in this environment. Run at first Vercel preview.
2. **Apply migration `0002_questions.sql` + `seed.sql` to the remote Supabase projects.** They were
   verified against a **local** stack only. The linked CLI points at the *prod* project ref
   (`vufizavpkjpybsknvyno`) and I don't have the dev project's DB password, so I did **not** push DDL
   remotely. Until applied, `getLessonQuestions` returns `[]` on remote (pages still build/render —
   graceful) and no questions show. Apply via `supabase db push` (verify the target ref first) or the
   dashboard SQL editor, then re-run the seed.

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

- **TASK-PRACTICE-001 (questions + answer checking, anonymous) — done (2026-07-11).** Added
  migration `0002_questions.sql` (`questions` table keyed by `lesson_slug`; per-type shape checks;
  world-readable rows but **column-level grants** hide `answer`/`tolerance`/`explanation` from
  anon/authenticated — the answer secret is read only server-side via service role) and
  `supabase/seed.sql` (5 questions across the 2 Geometry lessons, all three types). Added
  `src/lib/practice/*`: pure `checkSubmission` (mcq exact-match / numeric tolerance / free reveal;
  throws on non-numeric), `getLessonQuestions` (cookieless anon client, presentational columns
  only), and the `checkAnswer` server action (service-role read → check → `{ok,...}` result; no
  attempt recorded — that's PROGRESS-001). Added an interactive `PracticeQuestions` client component
  under the lesson page. Verified: 10 practice tests (pure logic + security-shape + slug-integrity);
  against a **local** Supabase stack, anon is denied the `answer` column (HTTP 401) while service
  role reads it, and the served lesson HTML shows question prompts/choices with **no answer or
  explanation leaked**. See open follow-up #2 re: applying the migration to remote.
- **TASK-CONTENT-001 (MDX pipeline + Learning Path) — pipeline done (2026-07-10).** Added
  `src/lib/content/*` (catalog build from in-repo MDX, ordered Course→Theme→Lesson, slug-integrity
  validation; MDX+KaTeX server render), `src/app/(content)/courses/**` routes (catalog / course /
  lesson, all SSG), global 404 with links back into the path, `sitemap.ts` + `robots.ts`, and
  per-page SEO metadata (title/description/canonical, `metadataBase`). Seeded a real 2-lesson
  Geometry slice to prove the pipeline (CONTENT-002 authors the full slice). AT-CONTENT-001/002/003
  verified in served HTML; 10 unit/integration tests pass; `next build` clean (content pages
  prerendered). Content/theme metadata convention recorded as an ADR-001 follow-up. Remaining:
  NFR-PERF-002 Lighthouse lab run (see Current task).

## Blockers

- None for M1. ADR-002 blocks M2; D2 blocks BILLING-001 seed.

## Unresolved decisions

- **Credit-pack tiers** (OQ1 / D2) — 4/$300 base set; 8/12/16 prices + discount curve TBD before billing.
- **COPPA/consent mechanics** (CON3/OQ2) — direction = parent-consent gate; exact flow → auth ADR.
- **Domain cutover** (OQ3) — repoint apex DNS from v1 demo to v2 when launch build is ready.

## Next task

M1: **`TASK-CONTENT-002`** (author the full "Math up to Geometry" slice — more themes/lessons +
their questions) is the remaining M1 build task. Then apply the questions migration to remote
(follow-up #2) and run the CWV lab (#1) before shipping M1 to the public. Follow the dependency
order in `spec/12_IMPLEMENTATION_PLAN.md`.

## Build / test status

- Build: **passing** (`next build`, Next 16, TS strict, no error-ignoring). Content pages
  prerendered (○ catalog, ● course + lessons); degrades gracefully when the questions table is
  absent on the target DB. Lint clean.
- Tests: **20 passing** across 3 files (`content.test.tsx` ×10; `practice/check.test.ts` ×7;
  `practice/integrity.test.ts` ×3 — answer-secrecy grants + slug integrity). Run with `npm test`.
- Last meaningful verification: 2026-07-11 — PRACTICE-001 against a local Supabase stack: migrations
  0001+0002 applied + seed loaded; anon **denied** the `answer` column (HTTP 401), service role
  reads it; built lesson HTML shows question prompts/choices with no answer/explanation leaked.
