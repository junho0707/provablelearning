# Changelog

Meaningful completed changes only (not a raw command log).

## 2026-08-14 — content is free; the paywall is cut (ADR-004)

- **The $19.99 course SKU is withdrawn.** All course content is free and public; two products remain
  (tutoring credits, $49 Math Diagnosis). Amends ADR-003 hours after it was accepted, before
  anything was built against it.
- **Why:** a paid course creates a **delivery obligation** — selling "Math up to Geometry" with most
  of the arc unauthored is under-delivery, which silently reinstated the constraint the empty-shelf
  plan existed to escape. And gating capped the indexable surface at 3–5 sample lessons while cold
  organic search *is* the acquisition channel. At $19.99 the forgone revenue is immaterial next to
  credit packs.
- **Lead capture moves to "sign in to save your progress"** (`TASK-PROGRESS-001`) — captures the
  email without hiding anything from crawlers.
- **Cut from scope:** entitlements table, gating, buy prompts, the course Stripe product, and the
  `sample: true` flag. Lesson pages stay **fully static**, preserving the SSG/KaTeX/CWV design.
- **CON6 is effectively restored** (free content is the funnel) — but with the whole catalog
  indexable rather than a handful of samples, and the roadmap skill tree as the differentiator.
- Authoring now **gates nothing**: a partial free catalog is honest, and every lesson added is new
  SEO surface. Trade-offs recorded in `adr/004-free-content.md`, including the one-way-door risk of
  charging later and the reliance on diagnosis → credit-pack conversion.

## 2026-08-14 — pricing + operations decided (ADR-003)

- **Every open decision closed.** Course **$19.99** (one SKU for the whole course) · Math Diagnosis
  **$49** (deliberate tripwire) · credits **1/$75 · 2/$120 · 4/$200 · 8/$350**. Closes **D2/OQ1**.
  Recorded in `spec/14` §11 and `adr/003-v3-product-model.md`.
- **Consequence made explicit:** with content and diagnosis both priced as tripwires, **credit packs
  carry essentially all revenue** — so credits+booking is the critical path and the paywall is lead
  capture, not a revenue line.
- **Operations decided:** solo tutor (no tutor entity) · recurring weekly availability + exceptions ·
  slots stored **UTC**, shown in browser TZ · Meet link per booking via Calendar API, created
  **after** the booking commits so a Google outage can't lose a booking · **Resend** transactional
  email · **Google OAuth + magic link**, no passwords · no self-serve refunds (manual Stripe paired
  with an admin ledger adjustment) · samples via `sample: true` frontmatter · **apex domain** cutover
  (closes **OQ3**).
- **v1 ships the paywall over an empty shelf** — course content is authored *after* launch, making
  authoring pure content work with no code change.
- **`spec/12_IMPLEMENTATION_PLAN.md` rewritten** against all of the above: M2 (close out the pivot)
  → M3 accounts → M4 money → M5 booking → M6 admin+diagnosis → M7 launch. No open blockers.
  CON3/OQ2 (consent) is deferred, not resolved.

## 2026-08-14 — v3 ground truth + the public roadmap map

- **Ground truth re-decided** (`spec/14_GROUND_TRUTH_INTERVIEW.md`). Content becomes a **one-time
  paid purchase per course**; public = the roadmap plus 3–5 sample lessons. Three products (course ·
  credits · **Math Diagnosis** SKU). Sessions **60 min**. One buyer login with **learner profiles**
  (no child credentials, so no consent gate at launch). Credits never expire; 24h free cancel;
  Meet link per booking; email-only notifications with a manual **admin SMS reminder queue**.
  Supersedes the free-content premise and the 45-minute credit unit in `spec/01_PRD.md`.
- **`docs/` archived** to `docs/archive/v1-sat/` (it described the frozen v1 SAT model). `CLAUDE.md`
  now points at spec/14.
- **`/roadmap` — the public skill-tree map.** Build-time layout (`src/lib/content/layout.ts`, pure)
  turns the curriculum into positioned nodes plus two visually distinct edge kinds: solid
  **containment** and dashed gold **prerequisites**. Regions are laid out as **clusters packed into
  rows**, and any region too wide to read is split into its sub-concepts — which took the map from a
  8652×980 strip (ratio 8.8) to 3320×2082 (ratio 1.6) and keeps it screen-shaped as the curriculum
  grows. Client component pans, zooms, and on select dims everything outside the node's transitive
  prerequisite chain. Phones get the same data as a `<details>` outline (`outline.tsx`), since a tree
  is unreadable at that width.
- **`status: "planned"`** added to the roadmap schema and inherited by descendants; Algebra,
  Geometry, Pre-Calculus, and Calculus are seeded as locked regions so the full arc is visible.
- Verified: 30 tests pass (9 new layout tests — overlap, region packing, containment, orphan
  prereqs), lint clean, `next build` clean with `/roadmap` prerendered static.

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
