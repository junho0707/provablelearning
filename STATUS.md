# STATUS

Read this first when starting or resuming work. See `AGENTS.md` for the operating procedure.

**Project:** Provable Learning v2 — free math courses + credit-based 1:1 tutoring.
**Branch:** `main` (fresh v2 app; v1 SAT platform frozen on `v1-sat`).
**Phase:** Implementation — **M0 scaffold COMPLETE**. Starting **M1 (content — the free
product)**. Spec `spec/00`–`13` drafted, ADR-001 accepted.

## v3 pivot (2026-08-14) — READ FIRST

The product model changed. **`spec/14_GROUND_TRUTH_INTERVIEW.md` is the ground truth**; `spec/01_PRD.md`
is stale until rewritten against it. Headlines:

- Content is **paid** (one-time purchase per course), not free. Public = the **roadmap** + **3–5
  sample lessons** only. That retires CON6's "free content is the funnel".
- Three products: course purchase · tutoring credits (**60-min** sessions, was 45) · **Math
  Diagnosis** (separate SKU: assessment → 1hr session → PDF report + study guide).
- Accounts: one login per buyer, **learner profiles** under it (no child credentials → no consent
  gate at launch).
- Credits never expire; 24h free cancel; Google Meet per booking; **email only** from the system,
  SMS sent manually off an **admin reminder-queue page**.
- Build order: **roadmap visual → landing → auth/profiles → course purchase → credits/booking →
  diagnosis**.

`docs/` archived to `docs/archive/v1-sat/`.

## Pricing + ops decided (2026-08-14) — ADR-003

The second interview pass closed every open decision. See `spec/14` §11–§13 and `adr/003`.

- **Prices:** diagnosis **$49** (tripwire) · credits **1/$75 · 2/$120 · 4/$200 · 8/$350**. Closes
  D2/OQ1. *(The $19.99 course SKU was withdrawn hours later by ADR-004 — see below.)*
- **Consequence:** **credit packs are the whole revenue line**, so credits+booking is the critical
  path.
- **Solo tutor** (no tutor entity) · recurring weekly availability + exceptions · **UTC stored,
  browser-TZ displayed** · Meet link per booking via Calendar API **after commit** · **Resend**
  email · **Google OAuth + magic link**, no passwords · no self-serve refunds (manual Stripe +
  admin ledger adjustment) · samples via `sample: true` frontmatter · **apex domain** cutover
  (closes OQ3).

## Content is FREE (2026-08-14) — ADR-004, amends ADR-003

**There is no paywall.** The $19.99 course SKU is withdrawn; two products remain (credits +
diagnosis). Reasons: a paid SKU creates a delivery obligation that a partly-authored course can't
meet, and gating shrinks the SEO surface to a handful of samples when cold organic search *is* the
acquisition channel.

- **Every lesson is public and fully static** — max indexable surface, CWV preserved, and the
  catalog grows with every lesson authored.
- **Lead capture = "sign in to save your progress"** (`TASK-PROGRESS-001`), not a paywall.
- **Dropped from scope:** entitlements table, gating, buy prompts, the course Stripe product, and
  the `sample: true` frontmatter flag.
- **Authoring now gates nothing** — a partial free catalog is honest; unbuilt nodes read
  "coming soon".
- **Number to instrument first after launch:** diagnosis → credit-pack conversion. Revenue has no
  second leg if it's weak.

## Current task

**M2 (close out the pivot) in progress.** Done: ADR-003 + spec/14 §11–13, `spec/12` rewritten,
roadmap map committed (`9447849`). Next: **TASK-SPEC-002** — rewrite `spec/01_PRD.md` against
spec/14, then ripple into 03/04/05/07/11/13 and rebuild the `docs/` tree.

**No open blockers.** (The old "ADR-002 blocks M2" note was stale — spec/14 §4 removes child
credentials, so the consent gate is deferred, not pending.)

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

- **None.** D2 and OQ3 closed by ADR-003.

## Unresolved decisions

- **COPPA/consent mechanics** (CON3/OQ2) — **deferred, not resolved.** Learner profiles carry no
  credentials, so no consent gate is needed at launch. Returns only if profiles ever become real
  logins — keep owner identity separate from learner identity so that upgrade stays additive.

## Next task

**`TASK-SPEC-002`** — rewrite `spec/01_PRD.md` against `spec/14`, then `TASK-SPEC-003` (ripple into
03/04/05/07/11/13) and `TASK-SPEC-004` (rebuild `docs/`). Build work resumes at M3
(CONFIG-001 → LAND-001, AUTH-001 → ACCT-001). Follow the dependency order in
`spec/12_IMPLEMENTATION_PLAN.md`.

## Build / test status

- Build: **passing** (`next build`, Next 16, TS strict, no error-ignoring). Content pages
  prerendered (○ catalog, ● course + lessons); degrades gracefully when the questions table is
  absent on the target DB. Lint clean.
- Tests: **20 passing** across 3 files (`content.test.tsx` ×10; `practice/check.test.ts` ×7;
  `practice/integrity.test.ts` ×3 — answer-secrecy grants + slug integrity). Run with `npm test`.
- Last meaningful verification: 2026-07-11 — PRACTICE-001 against a local Supabase stack: migrations
  0001+0002 applied + seed loaded; anon **denied** the `answer` column (HTTP 401), service role
  reads it; built lesson HTML shows question prompts/choices with no answer/explanation leaked.
